/**
 * config-api.js — 配置管理 API（MySQL 版）
 * DevGuard Agent v2.1
 *
 * 所有配置、基线、分析结果全部写入 MySQL。
 * 保留原有 API 签名，前端无感知。
 */

'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const path    = require('path');
const { ProjectStore, BaselineStore, AnalysisStore, ConfigStore } = require('./db-store');
const pipeline = require('./baseline/pipeline');

function uuid() { return crypto.randomUUID(); }
const ok  = (res, d) => res.json({ success: true, ...d });
const err = (res, msg, code = 500) => res.status(code).json({ success: false, error: msg });

// ─── AI 配置（写入 dg_configs）───────────────────────────────────────────────

router.post('/config/ai', async (req, res) => {
  try {
    const { provider, apiKey, model } = req.body;
    if (!apiKey) return err(res, 'apiKey is required', 400);

    await ConfigStore.set('ai', { provider: provider || 'openai', apiKey, model });

    // 同时更新当前进程环境变量
    process.env.AI_PROVIDER = provider || 'openai';
    if (provider === 'deepseek') {
      process.env.DEEPSEEK_API_KEY = apiKey;
      if (model) process.env.DEEPSEEK_MODEL = model;
    } else if (provider === 'anthropic') {
      process.env.ANTHROPIC_API_KEY = apiKey;
      if (model) process.env.ANTHROPIC_MODEL = model;
    } else {
      process.env.OPENAI_API_KEY = apiKey;
      if (model) process.env.OPENAI_MODEL = model;
    }

    ok(res, { message: 'AI 配置已更新并保存到数据库' });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 项目管理 ────────────────────────────────────────────────────────────────

router.get('/config/projects', async (req, res) => {
  try {
    const projects = await ProjectStore.list();
    ok(res, { projects });
  } catch (e) {
    err(res, e.message);
  }
});

router.post('/config/projects', async (req, res) => {
  try {
    const { name, type, url, token, language, branch, autoAnalyzers } = req.body;
    if (!name) return err(res, 'name is required', 400);
    if (type !== 'local' && !url) return err(res, 'url is required for non-local projects', 400);
    if (type !== 'local' && !token) return err(res, 'token is required for non-local projects', 400);

    const project = await ProjectStore.create({
      name, type, url, token,
      language: language || 'cpp',
      branch: branch || 'main',
      autoAnalyzers: autoAnalyzers || ['align', 'review'],
    });
    ok(res, { project });
  } catch (e) {
    err(res, e.message);
  }
});

router.put('/config/projects/:id', async (req, res) => {
  try {
    const project = await ProjectStore.update(req.params.id, req.body);
    if (!project) return err(res, 'Project not found', 404);
    ok(res, { project });
  } catch (e) {
    err(res, e.message);
  }
});

router.delete('/config/projects/:id', async (req, res) => {
  try {
    await ProjectStore.remove(req.params.id);
    ok(res, { message: '项目已删除' });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 触发器 / Pipeline 配置（写入 dg_configs）───────────────────────────────

router.get('/config/triggers', async (req, res) => {
  try {
    const triggers = (await ConfigStore.get('triggers')) || {
      onPRCreate: true, onPRUpdate: true, onCommit: false, onSchedule: false,
      scheduleCron: '0 2 * * *',
    };
    const pipeline = (await ConfigStore.get('pipeline')) || {
      autoBaseline: true, autoAlign: true, autoReview: true,
      autoTest: false, autoComment: true, autoAssign: false,
    };
    ok(res, { triggers, pipeline });
  } catch (e) {
    err(res, e.message);
  }
});

router.put('/config/triggers', async (req, res) => {
  try {
    const { triggers, pipeline: p } = req.body;
    if (triggers) await ConfigStore.set('triggers', triggers);
    if (p)        await ConfigStore.set('pipeline', p);
    ok(res, { triggers: await ConfigStore.get('triggers'), pipeline: await ConfigStore.get('pipeline') });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 通知配置 ──────────────────────────────────────────────────────────────

router.get('/config/notifications', async (req, res) => {
  try {
    const n = (await ConfigStore.get('notifications')) || {};
    ok(res, {
      notifications: {
        ...n,
        slack:   n.slack   ? '******' + n.slack.slice(-8)   : null,
        webhook: n.webhook ? '******' + n.webhook.slice(-8) : null,
      },
    });
  } catch (e) {
    err(res, e.message);
  }
});

router.post('/config/notifications', async (req, res) => {
  try {
    const { slack, webhook, notifyOnCritical, notifyOnAll } = req.body;
    const n = (await ConfigStore.get('notifications')) || {};
    if (slack             != null) n.slack             = slack;
    if (webhook           != null) n.webhook           = webhook;
    if (notifyOnCritical  != null) n.notifyOnCritical  = notifyOnCritical;
    if (notifyOnAll       != null) n.notifyOnAll       = notifyOnAll;
    await ConfigStore.set('notifications', n);
    ok(res, { message: '通知配置已更新' });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── Webhook 自动分析 ──────────────────────────────────────────────────────

router.post('/webhook/auto/:projectId', async (req, res) => {
  const { projectId } = req.params;
  try {
    const project = await ProjectStore.get(projectId);
    if (!project) return err(res, 'Project not found', 404);

    const githubEvent = req.headers['x-github-event'];
    const event = {
      type:        githubEvent === 'pull_request' ? 'pr_create' : 'pr_update',
      prNumber:    req.body.pull_request?.number || req.body.issue?.number,
      platform:    'github',
      pull_request: req.body.pull_request || null,
      repository:   req.body.repository || null,
    };

    // 记录分析历史
    const record = await AnalysisStore.create({
      projectId,
      repoUrl:    req.body.repository?.html_url,
      repoName:   req.body.repository?.full_name,
      branch:     req.body.pull_request?.head?.ref || 'main',
      analysisType: 'pr_review',
      triggerEvent: event.type === 'pr_create' ? 'pr_create' : 'pr_update',
      prNumber:   event.prNumber,
      prTitle:    req.body.pull_request?.title,
      prAuthor:   req.body.pull_request?.user?.login,
      status:     'running',
    });

    res.json({ status: 'accepted', analysisId: record.id, message: '分析任务已接收，正在处理...' });

    // 异步处理
    setImmediate(async () => {
      const start = Date.now();
      try {
        const result = await pipeline.handleEvent(event, projectId);
        await AnalysisStore.update(record.id, {
          status:       'done',
          riskLevel:    result.riskLevel,
          canMerge:     result.canMerge,
          resultSummary: result.summary,
          resultDetail: result,
          durationMs:   Date.now() - start,
          completedAt:  new Date(),
        });
        console.log(`✅ Analysis ${record.id} done: ${result.riskLevel || 'ok'}`);
      } catch (e) {
        await AnalysisStore.update(record.id, {
          status: 'failed',
          resultSummary: e.message,
          durationMs: Date.now() - start,
          completedAt: new Date(),
        });
        console.error(`❌ Analysis ${record.id} failed: ${e.message}`);
      }
    });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 手动触发 ─────────────────────────────────────────────────────────────

router.post('/config/analyze/:projectId', async (req, res) => {
  try {
    const { prNumber } = req.body;
    if (!prNumber) return err(res, 'prNumber is required', 400);

    const project = await ProjectStore.get(req.params.projectId);
    if (!project) return err(res, 'Project not found', 404);

    const record = await AnalysisStore.create({
      projectId: req.params.projectId,
      repoUrl:   project.url,
      repoName:  project.name,
      branch:    project.branch,
      analysisType: 'pr_review',
      triggerEvent: 'manual',
      prNumber:  parseInt(prNumber),
      status:    'running',
    });

    const start = Date.now();
    try {
      const result = await pipeline.handleEvent({ type: 'manual', prNumber: parseInt(prNumber) }, req.params.projectId);
      await AnalysisStore.update(record.id, {
        status: 'done', riskLevel: result.riskLevel, canMerge: result.canMerge,
        resultSummary: result.summary, resultDetail: result,
        durationMs: Date.now() - start, completedAt: new Date(),
      });
      ok(res, { analysisId: record.id, ...result });
    } catch (e) {
      await AnalysisStore.update(record.id, {
        status: 'failed', resultSummary: e.message,
        durationMs: Date.now() - start, completedAt: new Date(),
      });
      err(res, e.message);
    }
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 历史 ─────────────────────────────────────────────────────────────────

router.get('/config/history/:projectId', async (req, res) => {
  try {
    const records = await AnalysisStore.latest(req.params.projectId, 50);
    ok(res, { history: records });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 配置验证 / 读取 ───────────────────────────────────────────────────────

router.get('/config/validate', async (req, res) => {
  try {
    const ai = await ConfigStore.get('ai');
    const projects = await ProjectStore.list();
    ok(res, {
      valid: !!(ai?.apiKey),
      hasProjects: projects.length > 0,
      aiConfigured: !!ai?.apiKey,
      dbConnected: true,
    });
  } catch (e) {
    err(res, e.message);
  }
});

router.get('/config', async (req, res) => {
  try {
    const [ai, triggers, pipeline, notifications, projects] = await Promise.all([
      ConfigStore.get('ai'),
      ConfigStore.get('triggers'),
      ConfigStore.get('pipeline'),
      ConfigStore.get('notifications'),
      ProjectStore.list(),
    ]);
    ok(res, {
      version: '2.1',
      triggers: triggers || {},
      pipeline: pipeline || {},
      notifications: notifications || {},
      projects: projects.map(p => ({ ...p, token: p.token ? '******' : '' })),
      ai: ai ? { provider: ai.provider, model: ai.model } : null,
    });
  } catch (e) {
    err(res, e.message);
  }
});

module.exports = router;
