/**
 * 配置 API 路由 — 全自动化管理
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const config = require('./config');
const pipeline = require('./baseline/pipeline');
const { saveBaseline, loadBaseline, listBaselines } = require('./baseline/schema');

// ─── 辅助 ─────────────────────────────────────────────────────────────────
const ok = (res, data) => res.json({ success: true, ...data });
const err = (res, msg, code = 500) => res.status(code).json({ success: false, error: msg });

// ─── AI 配置 ──────────────────────────────────────────────────────────────
router.post('/config/ai', (req, res) => {
  const { provider, apiKey, model } = req.body;
  if (!apiKey) return err(res, 'apiKey is required', 400);

  // 保存到 .env
  const fs = require('fs');
  const envPath = require('path').resolve(__dirname, '../../.env');
  let envContent = '';
  if (fs.existsSync(envPath)) envContent = fs.readFileSync(envPath, 'utf-8');

  const lines = envContent.split('\n').filter(l => !l.startsWith('OPENAI') && !l.startsWith('ANTHROPIC') && !l.startsWith('AI_PROVIDER'));
  lines.push(`AI_PROVIDER=${provider || 'openai'}`);
  if (provider === 'anthropic') {
    lines.push(`ANTHROPIC_API_KEY=${apiKey}`);
    if (model) lines.push(`ANTHROPIC_MODEL=${model}`);
  } else {
    lines.push(`OPENAI_API_KEY=${apiKey}`);
    if (model) lines.push(`OPENAI_MODEL=${model}`);
  }
  fs.writeFileSync(envPath, lines.join('\n'));

  // 更新内存配置
  process.env.AI_PROVIDER = provider || 'openai';
  if (provider === 'anthropic') {
    process.env.ANTHROPIC_API_KEY = apiKey;
    if (model) process.env.ANTHROPIC_MODEL = model;
  } else {
    process.env.OPENAI_API_KEY = apiKey;
    if (model) process.env.OPENAI_MODEL = model;
  }

  ok(res, { message: 'AI 配置已更新，请重启服务以完全生效' });
});

// ─── 项目管理 ─────────────────────────────────────────────────────────────
router.get('/config/projects', (req, res) => {
  const projects = config.getProjects().map(p => ({
    ...p,
    webhookURL: config.getWebhookURL(p.id),
    baseline: p.baselineId ? (() => {
      const b = loadBaseline(p.baselineId);
      return b ? { id: b.id, name: b.name, version: b.version } : null;
    })() : null,
  }));
  ok(res, { projects });
});

router.post('/config/projects', (req, res) => {
  const { name, type, url, token, language, branch, autoAnalyzers } = req.body;
  if (!name) return err(res, 'name is required', 400);
  if (type !== 'local' && !url) return err(res, 'url is required for non-local projects', 400);
  if (type !== 'local' && !token) return err(res, 'token is required for non-local projects', 400);

  const project = config.addProject({
    name, type, url, token,
    language: language || 'cpp',
    branch: branch || 'main',
    autoAnalyzers: autoAnalyzers || ['align', 'review'],
  });

  ok(res, { project: { ...project, token: '***' } });
});

router.put('/config/projects/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  delete updates.id;
  delete updates.webhookSecret; // 不允许改 secret
  config.updateProject(id, updates);
  ok(res, { project: config.getProject(id) });
});

router.delete('/config/projects/:id', (req, res) => {
  config.removeProject(req.params.id);
  ok(res, { message: '项目已删除' });
});

// ─── 触发器配置 ──────────────────────────────────────────────────────────
router.get('/config/triggers', (req, res) => {
  ok(res, { triggers: config.get('triggers'), pipeline: config.get('pipeline') });
});

router.put('/config/triggers', (req, res) => {
  const { triggers, pipeline } = req.body;
  if (triggers) config.set('triggers', { ...config.get('triggers'), ...triggers });
  if (pipeline) config.set('pipeline', { ...config.get('pipeline'), ...pipeline });
  ok(res, { triggers: config.get('triggers'), pipeline: config.get('pipeline') });
});

// ─── 通知配置 ────────────────────────────────────────────────────────────
router.get('/config/notifications', (req, res) => {
  const n = config.get('notifications') || {};
  ok(res, {
    notifications: {
      ...n,
      slack: n.slack ? '******' + n.slack.slice(-8) : null,
      webhook: n.webhook ? '******' + n.webhook.slice(-8) : null,
    },
  });
});

router.post('/config/notifications', (req, res) => {
  const { slack, webhook, notifyOnCritical, notifyOnAll } = req.body;
  if (slack) config.set('notifications.slack', slack);
  if (webhook) config.set('notifications.webhook', webhook);
  if (typeof notifyOnCritical === 'boolean') config.set('notifications.notifyOnCritical', notifyOnCritical);
  if (typeof notifyOnAll === 'boolean') config.set('notifications.notifyOnAll', notifyOnAll);
  ok(res, { message: '通知配置已更新' });
});

// ─── 自动化 Webhook ──────────────────────────────────────────────────────
router.post('/webhook/auto/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const project = config.getProject(projectId);

  if (!project) return err(res, 'Project not found', 404);

  // 验证 webhook secret
  const providedSecret = req.headers['x-devguard-secret'];
  if (project.webhookSecret && providedSecret !== project.webhookSecret) {
    return err(res, 'Invalid secret', 401);
  }

  // 解析事件类型
  const githubEvent = req.headers['x-github-event'];
  const event = {
    type: githubEvent === 'pull_request' ? 'pr_create' : 'pr_update',
    prNumber: req.body.pull_request?.number || req.body.issue?.number,
    platform: 'github',
    // 传递完整 payload 给 pipeline
    pull_request: req.body.pull_request || null,
    repository: req.body.repository || null,
  };

  // 异步处理，不阻塞响应
  res.json({ status: 'accepted', message: '分析任务已接收，正在处理...' });

  try {
    const result = await pipeline.handleEvent(event, projectId);
    console.log(`✅ Pipeline result:`, JSON.stringify(result));
  } catch (e) {
    console.error('Pipeline error:', e.message);
  }
});

// ─── 手动触发分析 ────────────────────────────────────────────────────────
router.post('/config/analyze/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { prNumber } = req.body;

  if (!prNumber) return err(res, 'prNumber is required', 400);

  const project = config.getProject(projectId);
  if (!project) return err(res, 'Project not found', 404);

  try {
    const result = await pipeline.handleEvent(
      { type: 'manual', prNumber: parseInt(prNumber) },
      projectId
    );
    ok(res, result);
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 批量手动触发 ───────────────────────────────────────────────────────
router.post('/config/reanalyze/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const project = config.getProject(projectId);
  if (!project) return err(res, 'Project not found', 404);

  res.json({ status: 'accepted', message: '批量分析已启动，请稍候查看 PR 评论' });

  // 异步执行
  setImmediate(async () => {
    try {
      const { default: GitClient } = require('./baseline/git-client');
      const git = new GitClient();
      const { owner, repo } = GitClient.parseGitHubURL(project.url);
      const prs = await git.getPR(owner, repo, null, project.token);

      if (Array.isArray(prs)) {
        for (const pr of prs.slice(0, 5)) {
          await pipeline.handleEvent({ type: 'pr_create', prNumber: pr.number }, projectId);
        }
      }
    } catch (e) {
      console.error('Batch analyze error:', e.message);
    }
  });
});

// ─── 获取分析历史 ────────────────────────────────────────────────────────
router.get('/config/history/:projectId', (req, res) => {
  const history = pipeline.getHistory(req.params.projectId);
  ok(res, { history });
});

// ─── 配置验证 ─────────────────────────────────────────────────────────────
router.get('/config/validate', (req, res) => {
  const validation = config.validate();
  ok(res, validation);
});

// ─── 获取完整配置（脱敏）─────────────────────────────────────────────────
router.get('/config', (req, res) => {
  const all = config.all;
  const safe = {
    version: all.version,
    triggers: all.triggers,
    pipeline: all.pipeline,
    notifications: all.notifications,
    projects: all.projects.map(p => ({
      ...p,
      token: p.token ? '******' + p.token.slice(-4) : '',
      webhookSecret: p.webhookSecret ? '******' : '',
    })),
    ai: config.getAIConfig(),
  };
  ok(res, safe);
});

module.exports = router;
