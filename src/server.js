/**
 * DevGuard Agent v2.1 — Express Server
 * 全链路自动化：配置 → 监控 → 分析 → 通知
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const agent = require('./modules/agent');
const aiPipelineRouter = require('./ai-pipeline/api');
const { handleGitLabWebhookAI } = require('./modules/webhook-ai');
const { handleGitHubWebhook, handleGitLabWebhook, getWebhookHistory } = require('./modules/webhook');
const baselineRouter = require('./baseline/api');
const configRouter = require('./config-api');
const featureRouter = require('./feature-analysis-api');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const hasKey = !!( (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your-key')) ||
                     (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('your-key')) );
  res.json({
    status: 'ok', version: '2.1', mode: hasKey ? 'ai' : 'demo',
    provider: process.env.AI_PROVIDER || 'openai',
    uptime: Math.floor(process.uptime()),
    features: ['baseline', 'align', 'review', 'auto-pipeline'],
  });
});

// ── Agent (existing) ────────────────────────────────────────────────────────
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

// ── Baseline ────────────────────────────────────────────────────────────────
app.use('/api', baselineRouter);

// ── Feature Analysis (config-driven) ──────────────────────────────────────
app.use('/api/repos', featureRouter);

// ── Config & Automation ────────────────────────────────────────────────────
app.use('/api', configRouter);

// ── AI Pipeline ─────────────────────────────────────────────────────────────
app.use('/api/ai-pipeline', aiPipelineRouter);

// ── Webhooks ────────────────────────────────────────────────────────────────
app.get('/api/webhooks', (req, res) => {
  res.json({ success: true, history: getWebhookHistory() });
});
app.post('/webhook/github', handleGitHubWebhook);
app.post('/webhook/gitlab', handleGitLabWebhook);
// AI 增强版 GitLab Webhook（支持合并风险评估）
app.post('/webhook/gitlab-ai', handleGitLabWebhookAI);

// ── SPA ──────────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛡️  DevGuard Agent v2.1`);
  console.log(`   🌐 http://localhost:${PORT}`);
  console.log(`   📦 Baseline: /api/baselines`);
  console.log(`   ⚙️  Config:   /api/config`);
  console.log(`   🤖 Pipeline: /api/webhook/auto/:projectId`);
  const hasKey = !!( (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your-key')) ||
                     (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('your-key')) );
  console.log(hasKey ? `   🤖 Mode: AI (${process.env.AI_PROVIDER || 'openai'})` : '   ⚡ Mode: Demo (set API key in .env)\n');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} in use. Kill with: lsof -ti:${PORT} | xargs kill`);
    process.exit(1);
  }
  throw err;
});
