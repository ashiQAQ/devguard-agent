/**
 * DevGuard Agent v2.1 — Express Server
 * 全链路自动化：配置 → 监控 → 分析 → 通知
 * MySQL 持久化存储
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { initDB } = require('./db');        // MySQL 初始化
const db = require('./db');                // 连接池
const agent = require('./modules/agent');
const { handleGitHubWebhook, handleGitLabWebhook, getWebhookHistory } = require('./modules/webhook');
const baselineRouter    = require('./baseline/api');
const configRouter      = require('./config-api');
const featureRouter     = require('./feature-analysis-api');
const historyRouter     = require('./history-api');  // 新增：历史查询 API

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 注入 db 给 history-api 用
app.set('db', db);

// ─── 启动 ───────────────────────────────────────────────────────────────────

async function start() {
  // 初始化 MySQL（建表）
  try {
    await initDB();
    console.log('🗄️  MySQL connected');
  } catch (e) {
    console.error('❌ MySQL init failed:', e.message);
    console.warn('⚠️  服务将以有限功能启动（部分 API 需要 MySQL）');
  }

  // 注册路由
  // 历史/对比 API（精确路由在前，避免被 /:id 吞掉）
  app.use('/api', historyRouter);   // /api/history, /api/req-changes, /api/summary
  // 配置和基线
  app.use('/api', configRouter);     // /api/config/...
  app.use('/api/baselines', baselineRouter);
  // /api/align（前端直接调用）
  app.post('/api/align', async (req, res) => {
    try {
      const { alignRequirement } = require('./baseline/aligner');
      const { BaselineStore } = require('./db-store');
      const { buildDefaultADModules } = require('./baseline/schema');
      const { baselineId, requirement, prdContent, modulePriority } = req.body;
      if (!requirement) return res.status(400).json({ success: false, error: 'requirement is required' });
      let baseline = null;
      if (baselineId) {
        baseline = await BaselineStore.get(baselineId);
        if (!baseline) return res.status(404).json({ success: false, error: 'Baseline not found' });
        baseline = { ...baseline, modules: baseline.schema_data?.modules || {} };
      } else {
        baseline = { modules: buildDefaultADModules('cpp'), techDebts: [] };
      }
      const result = await alignRequirement({ baseline, requirement, prdContent, modulePriority });
      res.json({ success: true, baselineId: baseline.id, baselineName: baseline.name, ...result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  // 功能分析（限定在 /api/repos 下，不影响其他路由）
  app.use('/api/repos', featureRouter);  // /api/history, /api/req-changes, /api/summary ...

  // ─── Routes ────────────────────────────────────────────────────────────────

  app.get('/api/health', (req, res) => {
    const hasKey = !!( (process.env.AI_PROVIDER === 'deepseek' && process.env.DEEPSEEK_API_KEY) ||
                       (process.env.AI_PROVIDER !== 'deepseek' && process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your-key')) ||
                       (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('your-key')) );
    res.json({
      status: 'ok',
      version: '2.1',
      mode: hasKey ? 'ai' : 'demo',
      provider: process.env.AI_PROVIDER || 'openai',
      aiReady: hasKey,
      dbReady: true,
      uptime: Math.floor(process.uptime()),
      features: ['baseline', 'align', 'review', 'history', 'compare-branch'],
    });
  });

  // ── Agent ─────────────────────────────────────────────────────────────────
  app.post('/api/analyze/requirement', async (req, res) => {
    try { res.json({ success: true, result: await agent.analyzeRequirement(req.body) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  app.post('/api/analyze/requirement-vs-code', async (req, res) => {
    try { res.json({ success: true, result: await agent.compareRequirementWithCode(req.body) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  app.post('/api/analyze/review', async (req, res) => {
    try { res.json({ success: true, result: await agent.reviewCode(req.body) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  app.post('/api/analyze/tests', async (req, res) => {
    try { res.json({ success: true, result: await agent.generateTests(req.body) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  app.post('/api/analyze/deploy', async (req, res) => {
    try { res.json({ success: true, result: await agent.checkDeployment(req.body) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  app.post('/api/analyze/monitoring', async (req, res) => {
    try { res.json({ success: true, result: await agent.generateMonitoring(req.body) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  app.post('/api/analyze/full-cycle', async (req, res) => {
    try { res.json({ success: true, result: await agent.fullCycleAnalysis(req.body) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // ── Webhooks ──────────────────────────────────────────────────────────────
  app.get('/api/webhooks', (req, res) => {
    res.json({ success: true, history: getWebhookHistory() });
  });
  app.post('/webhook/github', handleGitHubWebhook);
  app.post('/webhook/gitlab', handleGitLabWebhook);

  // ── SPA ───────────────────────────────────────────────────────────────────
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // ─── Listen ───────────────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`\n🛡️  DevGuard Agent v2.1`);
    console.log(`   🌐 http://localhost:${PORT}`);
    console.log(`   📦 Baseline:  /api/baselines`);
    console.log(`   ⚙️  Config:    /api/config`);
    console.log(`   📜 History:   /api/history`);
    console.log(`   🔀 Compare:   /api/req-changes/compare-branch`);
    const hasKey = !!( (process.env.AI_PROVIDER === 'deepseek' && process.env.DEEPSEEK_API_KEY) ||
                       (process.env.AI_PROVIDER !== 'deepseek' && process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your-key')) ||
                       (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('your-key')) );
    console.log(hasKey ? `   🤖 Mode: AI (${process.env.AI_PROVIDER || 'openai'})` : '   ⚡ Mode: Demo\n');
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} in use. Kill with: lsof -ti:${PORT} | xargs kill`);
      process.exit(1);
    }
    throw err;
  });
}

start().catch(e => {
  console.error('❌ Startup error:', e);
  process.exit(1);
});
