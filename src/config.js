/**
 * 配置管理 — 自动化核心
 * 所有配置集中管理，支持 GitHub/GitLab 自动触发
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_FILE = path.resolve(__dirname, '../config.json');

const DEFAULT_CONFIG = {
  version: '2.1',
  createdAt: new Date().toISOString(),

  // ─── AI 配置 ───────────────────────────────────────────────────────────
  ai: {
    provider: 'openai',          // openai | anthropic
    model: 'gpt-4o',
    temperature: 0.2,
  },

  // ─── 仓库配置（支持多个项目）────────────────────────────────────────────
  projects: [],

  // ─── 触发器配置 ───────────────────────────────────────────────────────
  triggers: {
    onPRCreate: true,    // PR 创建时自动分析
    onPRUpdate: true,    // PR 更新时自动分析
    onCommit: false,      // Commit 时自动分析（谨慎开启）
    onSchedule: false,    // 定时基线更新
    scheduleCron: '0 2 * * *', // 每天凌晨2点更新基线
  },

  // ─── 自动化流程配置 ───────────────────────────────────────────────────
  pipeline: {
    autoBaseline: true,       // 自动生成/更新基线
    autoAlign: true,          // 需求自动对齐
    autoReview: true,         // 代码自动评审
    autoTest: false,          // 自动生成测试用例
    autoComment: true,        // 自动在 PR 下评论结果
    autoAssign: false,        // 自动分配 Reviewer
  },

  // ─── 通知配置 ─────────────────────────────────────────────────────────
  notifications: {
    slack: null,              // Slack Webhook URL
    webhook: null,            // 自定义 Webhook URL
    notifyOnCritical: true,    // 只通知关键风险
    notifyOnAll: false,       // 通知所有分析
  },

  // ─── 基线配置 ─────────────────────────────────────────────────────────
  baseline: {
    autoUpdate: true,         // 每次 PR 合入后自动更新基线
    updateThreshold: 10,      // 超过 N 个 PR 后强制更新基线
  },
};

class Config {
  constructor() {
    this._data = null;
    this._load();
  }

  _load() {
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        this._data = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } catch (e) {
        console.warn('Config parse failed, using defaults:', e.message);
        this._data = { ...DEFAULT_CONFIG };
      }
    } else {
      this._data = { ...DEFAULT_CONFIG };
    }
    // Ensure arrays exist
    if (!this._data.projects) this._data.projects = [];
  }

  _save() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this._data, null, 2));
  }

  get(key) {
    const keys = key.split('.');
    let val = this._data;
    for (const k of keys) val = val?.[k];
    return val;
  }

  set(key, value) {
    const keys = key.split('.');
    let obj = this._data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._save();
  }

  get all() { return this._data; }

  // ─── 项目管理 ─────────────────────────────────────────────────────────

  addProject(project) {
    const p = {
      id: crypto.randomUUID(),
      name: project.name || 'Unnamed Project',
      type: project.type || 'github',        // github | gitlab | local
      url: project.url || '',
      branch: project.branch || 'main',
      token: project.token || '',            // GitHub PAT / GitLab Token
      webhookSecret: project.webhookSecret || crypto.randomUUID().substring(0, 16),
      language: project.language || 'cpp',   // cpp | python
      autoAnalyzers: project.autoAnalyzers || ['align', 'review'],
      enabled: true,
      createdAt: new Date().toISOString(),
      lastTrigger: null,
      baselineId: null,
    };
    this._data.projects.push(p);
    this._save();
    return p;
  }

  removeProject(id) {
    this._data.projects = this._data.projects.filter(p => p.id !== id);
    this._save();
  }

  updateProject(id, updates) {
    const idx = this._data.projects.findIndex(p => p.id === id);
    if (idx >= 0) {
      this._data.projects[idx] = { ...this._data.projects[idx], ...updates };
      this._save();
    }
  }

  getProjects() {
    return this._data.projects;
  }

  getProject(id) {
    return this._data.projects.find(p => p.id === id);
  }

  getProjectByRepo(url) {
    return this._data.projects.find(p => p.url === url && p.enabled);
  }

  // ─── AI 配置 ───────────────────────────────────────────────────────────

  setAI(provider, key, model) {
    this.set('ai.provider', provider);
    if (provider === 'anthropic') {
      this.set('ANTHROPIC_API_KEY', key);
      if (model) this.set('ai.model', model);
    } else {
      this.set('OPENAI_API_KEY', key);
      if (model) this.set('ai.model', model);
    }
  }

  getAIConfig() {
    return {
      provider: this._data.ai?.provider || 'openai',
      model: this._data.ai?.model || 'gpt-4o',
      hasKey: !!(this.get('OPENAI_API_KEY') || this.get('ANTHROPIC_API_KEY')),
    };
  }

  // ─── Webhook Secret ────────────────────────────────────────────────────

  getWebhookSecret(projectId) {
    const p = this.getProject(projectId);
    return p?.webhookSecret;
  }

  // ─── 触发器 ────────────────────────────────────────────────────────────

  shouldAutoAnalyze(event, projectId) {
    const project = this.getProject(projectId);
    if (!project?.enabled) return false;

    const triggers = this._data.triggers;
    const autoAnalyzers = project.autoAnalyzers || [];

    if (event === 'pr_create' && triggers.onPRCreate) return true;
    if (event === 'pr_update' && triggers.onPRUpdate) return true;
    if (event === 'schedule' && triggers.onSchedule) return true;

    return false;
  }

  shouldAutoPipeline(stage, projectId) {
    const project = this.getProject(projectId);
    const pipeline = this._data.pipeline;
    const analyzers = project?.autoAnalyzers || [];

    if (stage === 'baseline' && pipeline.autoBaseline) return true;
    if (stage === 'align' && pipeline.autoAlign && analyzers.includes('align')) return true;
    if (stage === 'review' && pipeline.autoReview && analyzers.includes('review')) return true;
    if (stage === 'test' && pipeline.autoTest && analyzers.includes('test')) return true;
    if (stage === 'comment' && pipeline.autoComment) return true;

    return false;
  }

  // ─── Webhook URL ───────────────────────────────────────────────────────

  getWebhookURL(projectId) {
    return `/webhook/auto/${projectId}`;
  }

  // ─── 配置验证 ─────────────────────────────────────────────────────────

  validate() {
    const errors = [];
    const ai = this.getAIConfig();

    if (!ai.hasKey) {
      errors.push({ field: 'ai', message: '请配置 AI API Key' });
    }

    if (this._data.projects.length === 0) {
      errors.push({ field: 'projects', message: '请至少配置一个项目' });
    }

    for (const p of this._data.projects) {
      if (!p.url && p.type !== 'local') {
        errors.push({ field: `project.${p.id}`, message: `项目 "${p.name}" 缺少仓库地址` });
      }
      if (p.type !== 'local' && !p.token) {
        errors.push({ field: `project.${p.id}`, message: `项目 "${p.name}" 缺少访问令牌` });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = new Config();
