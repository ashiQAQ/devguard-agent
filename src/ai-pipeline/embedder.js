/**
 * AI Pipeline — 向量嵌入与语义搜索
 * 支持 OpenAI embedding / 本地模型 / Mock
 */
const crypto = require('crypto');

// ─── 嵌入向量维度映射 ───────────────────────────────────────────────────────
const DIM_MAP = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

const DEFAULT_MODEL = 'text-embedding-3-small';

// ─── Mock 嵌入（无 API Key 时使用）─────────────────────────────────────────
function mockEmbed(text) {
  // 用文本内容的哈希生成伪向量，保证相同文本得到相同结果
  const hash = crypto.createHash('sha256').update(text).digest();
  const dim = DIM_MAP[DEFAULT_MODEL];
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < Math.min(hash.length, dim); i++) {
    vec[i] = (hash[i] / 255) * 2 - 1;
  }
  // 归一化
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map(v => v / norm);
}

function cosineSim(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

// ─── Embedder ──────────────────────────────────────────────────────────────
class Embedder {
  constructor(aiProvider) {
    this.ai = aiProvider;
    this.model = process.env.EMBEDDING_MODEL || DEFAULT_MODEL;
    this.dimension = DIM_MAP[this.model] || 1536;
  }

  async embed(text) {
    const key = this.ai.openaiKey;
    if (!key || key.includes('your-key')) {
      return mockEmbed(text);
    }
    try {
      const { default: fetch } = await import('node-fetch');
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: this.model, input: text.substring(0, 8000) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || r.statusText);
      return d.data?.[0]?.embedding;
    } catch (e) {
      console.error('[Embedder] embed failed, falling back to mock:', e.message);
      return mockEmbed(text);
    }
  }

  /** 批量嵌入（自动分批） */
  async embedBatch(texts, { onProgress } = {}) {
    const BATCH = 100;
    const results = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const embeds = await Promise.all(batch.map(t => this.embed(t)));
      results.push(...embeds);
      if (onProgress) onProgress(Math.min(i + BATCH, texts.length), texts.length);
    }
    return results;
  }
}

// ─── VectorStore（内存版，持久化到 JSON）──────────────────────────────────
class VectorStore {
  constructor(dbPath) {
    this.dbPath = dbPath || './data/ai-pipeline/vectors.json';
    this.vectors = [];
    this.metadata = [];
    this._load();
  }

  _load() {
    try {
      const fs = require('fs');
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf-8'));
        this.vectors = data.vectors || [];
        this.metadata = data.metadata || [];
      }
    } catch (e) {
      console.warn('[VectorStore] load failed:', e.message);
    }
  }

  _persist() {
    try {
      const fs = require('fs');
      const dir = require('path').dirname(this.dbPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dbPath, JSON.stringify({ vectors: this.vectors, metadata: this.metadata }));
    } catch (e) {
      console.error('[VectorStore] persist failed:', e.message);
    }
  }

  add(vector, meta) {
    this.vectors.push(vector);
    this.metadata.push(meta);
  }

  addBatch(vectors, metas) {
    vectors.forEach((v, i) => this.add(v, metas[i]));
    this._persist();
  }

  search(queryVector, { topK = 10, minScore = 0.5, filter } = {}) {
    const scored = this.vectors
      .map((v, i) => ({ idx: i, score: cosineSim(queryVector, v), meta: this.metadata[i] }))
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (filter) return scored.filter(r => filter(r.meta));
    return scored;
  }

  /** 语义搜索：直接传文本，自动 embedding */
  async semanticSearch(embedder, query, opts = {}) {
    const qv = await embedder.embed(query);
    return this.search(qv, opts);
  }

  /** 获取指定 repo 的所有 chunk */
  byRepo(repoId) {
    return this.metadata
      .map((m, i) => ({ vector: this.vectors[i], meta: m, idx: i }))
      .filter(r => r.meta.repoId === repoId);
  }

  clear() {
    this.vectors = [];
    this.metadata = [];
    this._persist();
  }

  get size() { return this.vectors.length; }
}

module.exports = { Embedder, VectorStore, cosineSim };
