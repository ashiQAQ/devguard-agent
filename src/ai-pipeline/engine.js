/**
 * AI Pipeline 核心引擎
 * 全链路：需求分析 → 代码检索 → 差距分析 → 任务下发 → 代码建议 → 测试生成 → 合并风险评估
 */
const fs = require('fs');
const path = require('path');
const { Embedder, VectorStore } = require('./embedder');
const { chunkFile, scanDir } = require('./chunker');
const ai = require('../ai-provider');

const DATA_DIR = path.join(__dirname, '../../data/ai-pipeline');
const VECTOR_DB = path.join(DATA_DIR, 'vectors.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'index-progress.json');

// ─── Prompt 模板 ─────────────────────────────────────────────────────────────
const SYSTEM = `你是一位自动驾驶公司资深架构师，专注于自动驾驶感知/预测/规划/控制模块的代码分析。`;

// ─── 辅助函数 ────────────────────────────────────────────────────────────────
function tag(level, label, message) {
  const icons = { block: '🔴', crit: '🟠', major: '🟡', minor: '🔵', info: '⚪' };
  return `**${icons[level] || '⚪'} ${label}**: ${message}`;
}

function ensureDir(p) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch {}
}

// ─── Pipeline 主类 ───────────────────────────────────────────────────────────
class AIPipeline {
  constructor() {
    this.embedder = new Embedder(ai);
    this.store = new VectorStore(VECTOR_DB);
    this._indexedRepos = new Set();
  }

  // ── 知识库索引 ─────────────────────────────────────────────────────────────

  /** 为仓库建立/更新向量索引 */
  async indexRepo(repoId, repoPath, opts = {}) {
    const {
      extensions = ['.cpp', '.cc', '.h', '.hpp', '.py', '.js', '.ts', '.md'],
      excludeDirs = ['node_modules', 'build', 'dist', '.git', 'test', 'tests', 'docs', 'third_party', '__pycache__', 'venv', '.cache'],
      onProgress,
    } = opts;

    ensureDir(DATA_DIR);

    // 扫描文件
    const allChunks = await scanDir(repoPath, { extensions, excludeDirs, onProgress: (done, total) => {
      if (onProgress) onProgress({ phase: 'scan', done, total });
    }});

    // 过滤掉已索引的 chunk（按 repoId + file + line 去重）
    const existing = new Set(
      this.store.metadata
        .filter(m => m.repoId === repoId)
        .map(m => `${m.file}:${m.line}`)
    );

    const newChunks = allChunks.filter(c => !existing.has(`${c.file}:${c.line}`));
    if (newChunks.length === 0) {
      return { status: 'up_to_date', repoId, total: this.store.size };
    }

    // 批量 embedding
    const texts = newChunks.map(c => c.semantic);
    const embeddings = await this.embedder.embedBatch(texts, ({ done, total }) => {
      if (onProgress) onProgress({ phase: 'embed', done, total });
    });

    // 写入向量库
    newChunks.forEach((c, i) => {
      c.repoId = repoId;
      c.indexedAt = new Date().toISOString();
    });
    this.store.addBatch(embeddings, newChunks);
    this._indexedRepos.add(repoId);

    return {
      status: 'indexed',
      repoId,
      newChunks: newChunks.length,
      total: this.store.size,
      byType: newChunks.reduce((acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc; }, {}),
    };
  }

  /** 检查是否已索引 */
  isIndexed(repoId) { return this._indexedRepos.has(repoId); }
  getIndexStats(repoId) {
    const metas = this.store.metadata.filter(m => m.repoId === repoId);
    return { repoId, total: metas.length, byFile: [...new Set(metas.map(m => m.file))].length };
  }

  // ── 需求分析 ────────────────────────────────────────────────────────────────

  /** 分析需求，返回功能点 + 检索到的相关代码 */
  async analyzeRequirement({ title, description, content, repoIds = [], opts = {} }) {
    const {
      maxFeatures = 15,
      searchTopK = 10,
      asilAware = true,
    } = opts;

    // Step 1: AI 提取功能点
    const featurePrompt = `## 任务
你是一个自动驾驶需求分析师。请从以下需求中提取功能点列表，输出 JSON 数组。

## 输出格式
[
  {
    "id": "FEAT-1",
    "name": "功能名称",
    "description": "一句话描述",
    "type": "BUSINESS|TECH|INTERFACE|SAFETY",
    "priority": "P0|P1|P2",
    "keywords": ["关键词1", "关键词2"],
    "acceptance_criteria": ["验收标准1", "验收标准2"],
    "asil_level": "A|B|C|D|NONE",
    "related_modules": ["感知", "规划", "控制"],
    "estimated_complexity": "LOW|MEDIUM|HIGH"
  }
]

${asilAware ? '## 安全要求\n涉及安全关键路径（制动、转向、加速）时，ASIL 等级至少为 B。\n' : ''}
## 需求信息
**标题**: ${title || ''}
**描述**: ${description || ''}
${content ? `**完整内容**:\n${content}` : ''}

请提取 ${maxFeatures} 个以内最重要的功能点。`;

    const raw = await ai.chat(SYSTEM, featurePrompt);
    let features = [];
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) features = JSON.parse(match[0]);
    } catch {
      // 解析失败，尝试行级提取
      features = this._extractFeaturesFallback(raw);
    }

    // Step 2: 语义检索相关代码
    const relevantCode = {};
    for (const feat of features) {
      const query = `${feat.name} ${feat.keywords?.join(' ')} ${feat.description}`;
      const results = await this.store.semanticSearch(this.embedder, query, { topK: searchTopK, minScore: 0.45 });
      relevantCode[feat.id] = results.map(r => ({
        ...r.meta,
        score: r.score,
        matchType: r.score >= 0.75 ? 'HIGH' : r.score >= 0.6 ? 'MEDIUM' : 'LOW',
      }));
    }

    // Step 3: 差距分析
    const gapAnalysis = features.map(feat => {
      const hits = relevantCode[feat.id] || [];
      const covered = hits.filter(h => h.score >= 0.6);
      const type = covered.length === 0 ? 'NEW' : covered.some(h => h.score >= 0.75) ? 'COVERED' : 'PARTIAL';
      return { ...feat, gapType: type, relatedCode: hits };
    });

    const stats = {
      total: gapAnalysis.length,
      new: gapAnalysis.filter(f => f.gapType === 'NEW').length,
      partial: gapAnalysis.filter(f => f.gapType === 'PARTIAL').length,
      covered: gapAnalysis.filter(f => f.gapType === 'COVERED').length,
    };

    return { features, gapAnalysis, stats, relevantCode };
  }

  _extractFeaturesFallback(text) {
    const features = [];
    const lines = text.split('\n');
    let id = 1;
    for (const line of lines) {
      const m = line.match(/[-*]\s*\*\*(.+?)\*\*[:\s—]*(.+)/);
      if (m) {
        features.push({ id: `FEAT-${id++}`, name: m[1].trim(), description: m[2].trim(), type: 'BUSINESS', priority: 'P1', gapType: 'UNKNOWN' });
      }
    }
    return features.slice(0, 15);
  }

  // ── 任务下发 ────────────────────────────────────────────────────────────────

  /** 基于需求差距生成可执行任务卡 */
  async generateTasks({ features, gapAnalysis, repoId, opts = {} }) {
    const tasksPrompt = `你是一个自动驾驶项目经理。请将以下需求功能点拆解为可执行的开发任务，输出 JSON 数组。

## 规则
- 每个任务对应一个 PR 粒度
- 必须关联到具体的自动驾驶模块（感知/预测/规划/控制/定位/地图/安全）
- 涉及安全关键路径（制动/转向/加速）需标注 ASIL 等级
- 输出 JSON 数组

## 格式
[
  {
    "task_id": "T-001",
    "title": "任务标题",
    "module": "感知|预测|规划|控制|定位|地图|安全|通用",
    "type": "new|modify|fix|test",
    "description": "详细描述",
    "acceptance_criteria": ["验收标准"],
    "ASIL": "A|B|C|D|NONE",
    "difficulty": "LOW|MEDIUM|HIGH",
    "estimated_hours": 8,
    "depends_on": [],
    "related_features": ["FEAT-1"],
    "code_suggestion": true,
    "test_required": true
  }
]

## 需求功能点
${JSON.stringify(gapAnalysis.filter(f => f.gapType !== 'COVERED').map(f => ({
  id: f.id, name: f.name, description: f.description,
  priority: f.priority, asil: f.asil_level || 'NONE', complexity: f.estimated_complexity
})), null, 2)}`;

    const raw = await ai.chat(SYSTEM, tasksPrompt);
    let tasks = [];
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) tasks = JSON.parse(match[0]);
    } catch { tasks = this._extractTasksFallback(raw); }

    return tasks;
  }

  _extractTasksFallback(text) {
    const tasks = [];
    const lines = text.split('\n');
    let id = 1;
    for (const line of lines) {
      if (line.match(/^[-*]\s+\[.?\]\s+/) || line.match(/^T-\d+/)) {
        const title = line.replace(/^[-*]\s*/, '').replace(/^\[.?\]\s*/, '').trim();
        if (title) tasks.push({ task_id: `T-${String(id++).padStart(3, '0')}`, title, type: 'new', module: '通用', difficulty: 'MEDIUM' });
      }
    }
    return tasks;
  }

  // ── 代码建议生成 ────────────────────────────────────────────────────────────

  /** 为任务生成代码实现建议 */
  async generateCode({ task, relatedCode, codeStyle = 'cpp17' }) {
    const relevant = (relatedCode || []).slice(0, 5)
      .map(r => `// 相关代码: ${r.file}:${r.line}\n\`\`\`\n${r.chunk?.substring(0, 1500) || ''}\n\`\`\``)
      .join('\n\n');

    const prompt = `你是自动驾驶 C++ 专家。请基于以下信息生成代码实现建议。

## 语言规范
- 语言: ${codeStyle === 'cpp17' ? 'C++17' : codeStyle}
- 自动驾驶代码规范：异常处理要谨慎，优先返回错误码；禁止裸 new，必须使用智能指针；线程安全要标注

## 任务信息
- 标题: ${task.title}
- 模块: ${task.module}
- 描述: ${task.description}
- 验收标准: ${task.acceptance_criteria?.join('; ') || '无'}
- ASIL: ${task.ASIL || 'NONE'}

## 相关现有代码（如有）
${relevant || '无现有代码参考，请基于任务描述自行设计'}

## 输出格式
\`\`\`cpp
// TODO: ${task.title}
// ASIL: ${task.ASIL || 'NONE'}
// 验收标准: ${task.acceptance_criteria?.map(c => `✓ ${c}`).join(', ') || '无'}

[代码实现]
\`\`\`

同时输出：
1. 设计说明（3-5 条）
2. 关键注意事项
3. 潜在风险点`;

    const code = await ai.chat(SYSTEM, prompt);
    return { taskId: task.task_id || task.id, suggestion: code, model: ai.ai?.model || 'unknown' };
  }

  // ── 测试用例生成 ────────────────────────────────────────────────────────────

  /** 为任务生成测试用例 */
  async generateTests({ task, codeSuggestion, language = 'cpp' }) {
    const prompt = `你是资深自动驾驶测试工程师。请为以下任务生成测试用例。

## 任务
- 标题: ${task.title}
- 模块: ${task.module}
- 描述: ${task.description}
- ASIL: ${task.ASIL || 'NONE'}

## 代码建议（如有）
${codeSuggestion ? `\`\`\`${language === 'cpp' ? 'cpp' : language}\n${codeSuggestion.substring(0, 2000)}\n\`\`\`` : '无代码建议'}

## 要求
1. 自动驾驶测试分层：单元测试（功能） + 边界测试（异常输入/极端值） + 集成测试（模块接口）
2. 安全关键功能（ASIL B+）必须包含故障注入测试
3. 实时性测试：验证处理延迟 < 要求的最大延迟
4. 输出格式：GTest（G++）测试代码

## 输出 JSON
{
  "unit_tests": [{"name": "测试名", "input": "输入", "expected": "期望", "code": "测试代码"}],
  "boundary_tests": [...],
  "integration_tests": [...],
  "coverage_notes": "覆盖率建议"
}`;

    const raw = await ai.chat(SYSTEM, prompt);
    let tests = { unit_tests: [], boundary_tests: [], integration_tests: [] };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) tests = JSON.parse(match[0]);
    } catch {}
    return { taskId: task.task_id || task.id, tests, rawNotes: raw };
  }

  // ── 合并风险评估（PR/MR 对比）────────────────────────────────────────────────

  /** 对比代码建议与实际提交，给出风险评估 */
  async assessMergeRisk({ task, codeSuggestion, actualDiff, language = 'cpp' }) {
    if (!codeSuggestion) {
      return { riskLevel: '🟡', message: '无代码建议，无法对比', risks: [] };
    }

    const prompt = `你是自动驾驶代码合并审查专家。请对比"AI 代码建议"与"开发者实际提交的代码"，评估合入风险。

## 任务信息
- 标题: ${task.title}
- ASIL: ${task.ASIL || 'NONE'}

## AI 代码建议
${codeSuggestion.substring(0, 3000)}

## 开发者实际提交（Diff）
\`\`\`diff
${actualDiff || '无 diff 内容'}
\`\`\`

## 评估维度

### 1. 语义偏离
实际代码 vs 建议代码的意图变化点（忽略格式差异）

### 2. 风险点标注
| 风险类型 | 描述 | 级别 |
|---------|------|------|
| 安全关键路径修改 | 涉及安全功能 | 🔴 |
| 接口变更 | 影响下游模块 | 🟠 |
| 性能劣化 | 引入阻塞/锁竞争 | 🟠 |
| 硬编码 | 未参数化配置 | 🟡 |
| 测试缺失 | 安全功能无测试 | 🔴 |

### 3. 合入建议
给出：✅建议合入 / ⚠️需关注 / 🚫阻断
说明每处偏离的原因和风险等级。

### 4. 影响域分析
变更影响哪些模块、哪些测试用例需要重新运行。`;

    const assessment = await ai.chat(SYSTEM, prompt);
    const riskLevel = this._parseRiskLevel(assessment);
    return { riskLevel, assessment, taskId: task.task_id || task.id };
  }

  _parseRiskLevel(text) {
    if (text.includes('🚫') || text.includes('阻断')) return '🔴 高风险';
    if (text.includes('⚠️') || text.includes('需关注')) return '🟡 中风险';
    return '🟢 低风险';
  }

  // ── 全链路分析 ──────────────────────────────────────────────────────────────

  /** 从需求到合入建议的完整链路 */
  async fullPipeline({ title, description, content, repoIds = [], outputLevel = 'verbose' }) {
    const start = Date.now();
    const steps = [];

    // Step 1: 需求分析
    const analysis = await this.analyzeRequirement({ title, description, content, repoIds });
    steps.push({ step: '需求分析', time: Date.now() - start, ...analysis });

    // Step 2: 任务下发
    const tasks = await this.generateTasks({ features: analysis.features, gapAnalysis: analysis.gapAnalysis, repoIds });
    steps.push({ step: '任务下发', time: Date.now() - start, tasks });

    // Step 3: 代码建议（仅高优先级/新功能）
    const codeSuggestions = {};
    const taskPromises = tasks
      .filter(t => t.code_suggestion && ['NEW', 'PARTIAL'].includes(analysis.gapAnalysis.find(g => g.id === t.related_features?.[0])?.gapType))
      .slice(0, 5)
      .map(async task => {
        const feat = analysis.gapAnalysis.find(g => g.related_features?.includes(task.related_features?.[0]));
        codeSuggestions[task.task_id] = await this.generateCode({ task, relatedCode: feat?.relatedCode || [] });
      });
    await Promise.all(taskPromises);
    steps.push({ step: '代码生成', time: Date.now() - start, count: Object.keys(codeSuggestions).length });

    // Step 4: 测试用例生成
    const tests = {};
    const testPromises = Object.entries(codeSuggestions).slice(0, 3).map(async ([taskId, sug]) => {
      const task = tasks.find(t => t.task_id === taskId);
      tests[taskId] = await this.generateTests({ task, codeSuggestion: sug?.suggestion });
    });
    await Promise.all(testPromises);
    steps.push({ step: '测试用例生成', time: Date.now() - start, count: Object.keys(tests).length });

    return {
      status: 'success',
      totalTimeMs: Date.now() - start,
      steps,
      features: analysis.features,
      gapAnalysis: analysis.gapAnalysis,
      stats: analysis.stats,
      tasks,
      codeSuggestions,
      tests,
    };
  }
}

module.exports = { AIPipeline };
