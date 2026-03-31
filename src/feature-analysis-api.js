/**
 * feature-analysis-api.js
 * ─────────────────────────────────────────────────────────────────────────────
 * 功能分析 API — repos.config 驱动
 *
 * 端点：
 *   GET  /api/repos                    — 列出配置的所有仓库
 *   GET  /api/repos/:id/baseline       — 扫描/获取仓库的功能基线
 *   POST /api/repos/:id/analyze        — 分析需求文档（对接基线）
 *   POST /api/repos/:id/analyze-text   — 直接分析文本需求
 *   GET  /api/repos/:id/report        — 获取最新分析报告
 *
 * 完整流程：
 *   repos.config.json
 *       ↓
 *   code-scanner.js   → 识别现有功能基线
 *       ↓
 *   req-parser.js     → 拆解需求文档
 *       ↓
 *   feature-aligner.js → 功能 vs 基线 对齐
 *       ↓
 *   输出对齐报告
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const express = require('express');

const { CodeScanner }  = require('./baseline/code-scanner');
const { ReqParser }    = require('./baseline/req-parser');
const { FeatureAligner } = require('./baseline/feature-aligner');

const router = express.Router();

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

/**
 * 加载 repos.config.json
 */
function loadReposConfig() {
  const cfgPath = process.env.DEVGUARD_CONFIG ||
    path.resolve(__dirname, '../repos.config.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error(`repos.config.json not found at: ${cfgPath}`);
  }
  return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
}

/**
 * 获取单个仓库配置
 */
function getRepoConfig(reposConfig, repoId) {
  const repo = reposConfig.repos?.find(r => r.id === repoId);
  if (!repo) {
    throw new Error(`Repo not found: ${repoId}`);
  }
  return repo;
}

/**
 * 持久化基线到磁盘
 */
function saveBaseline(repoId, baseline) {
  const cfg = loadReposConfig();
  const repo = getRepoConfig(cfg, repoId);
  const snapDir = path.resolve(
    __dirname, '../..',
    repo.baseline?.snapshotDir || `./data/baselines/${repoId}`
  );
  fs.mkdirSync(snapDir, { recursive: true });
  const file = path.join(snapDir, `baseline-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2));
  // 保存软链接指向最新基线
  const latest = path.join(snapDir, 'baseline-latest.json');
  fs.writeFileSync(latest, JSON.stringify(baseline, null, 2));
  baseline._snapshotFile = file;
  return baseline;
}

/**
 * 加载最新基线
 */
function loadLatestBaseline(repoId) {
  const cfg = loadReposConfig();
  const repo = getRepoConfig(cfg, repoId);
  const snapDir = path.resolve(__dirname, '../..', repo.baseline?.snapshotDir || `./data/baselines/${repoId}`);
  const latest = path.join(snapDir, 'baseline-latest.json');
  if (!fs.existsSync(latest)) return null;
  return JSON.parse(fs.readFileSync(latest, 'utf-8'));
}

/**
 * 保存分析报告
 */
function saveReport(repoId, report) {
  const cfg = loadReposConfig();
  const repo = getRepoConfig(cfg, repoId);
  const reportDir = path.resolve(__dirname, '../..', cfg.output?.reportDir || './data/reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const file = path.join(reportDir, `${repoId}-report-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  return file;
}

// ─── API 路由 ─────────────────────────────────────────────────────────────────

/**
 * GET /api/repos
 * 列出所有配置的仓库
 */
router.get('/', (req, res) => {
  try {
    const cfg = loadReposConfig();
    const summaries = (cfg.repos || []).map(r => ({
      id:         r.id,
      name:       r.name,
      enabled:    r.enabled,
      gitUrl:     r.git?.url,
      localPath:  r.git?.localPath,
      hasBaseline: fs.existsSync(
        path.resolve(__dirname, '../..', r.baseline?.snapshotDir || `./data/baselines/${r.id}/baseline-latest.json`)
      ),
    }));
    res.json({ success: true, repos: summaries });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/repos/:id
 * 获取单个仓库配置
 */
router.get('/:id', (req, res) => {
  try {
    const cfg = loadReposConfig();
    const repo = getRepoConfig(cfg, req.params.id);
    // 脱敏 token
    const safe = { ...repo };
    if (safe.git?.token) safe.git.token = '***';
    res.json({ success: true, repo: safe });
  } catch (e) {
    res.status(404).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/repos/:id/baseline
 * 扫描仓库，生成功能基线
 * Query: ?force=true 强制重新扫描
 */
router.get('/:id/baseline', async (req, res) => {
  try {
    const cfg  = loadReposConfig();
    const repo = getRepoConfig(cfg, req.params.id);

    if (!repo.enabled) {
      return res.status(400).json({ success: false, error: 'Repo is disabled' });
    }

    // 检查本地路径是否存在
    const repoPath = repo.git?.localPath;
    if (!repoPath || !fs.existsSync(repoPath)) {
      return res.status(400).json({
        success: false,
        error: `Local path not found: ${repoPath}`,
        hint: 'Set git.localPath in repos.config.json or clone the repo first',
      });
    }

    // 强制/增量扫描
    const existing = !req.query.force ? loadLatestBaseline(req.params.id) : null;
    if (existing) {
      return res.json({
        success: true,
        baseline: existing,
        cached: true,
        hint: 'Use ?force=true to rescan',
      });
    }

    console.log(`[FeatureScan] Starting scan for ${repo.name}...`);
    const scanner = new CodeScanner(repo);
    const baseline = await scanner.scan();

    // 持久化
    const saved = saveBaseline(req.params.id, baseline);

    console.log(`[FeatureScan] Done: ${baseline.stats.files} files, ${baseline.stats.features} features`);

    res.json({
      success: true,
      baseline: saved,
      stats: baseline.stats,
    });
  } catch (e) {
    console.error('[FeatureScan] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/repos/:id/analyze
 * 分析需求文档（对接基线）
 * Body: {
 *   files?: string[],     // 需求文件路径列表
 *   dir?: string,         // 或者指定目录（自动扫描）
 *   config?: object       // 可选对齐配置
 * }
 */
router.post('/:id/analyze', async (req, res) => {
  try {
    const repoId = req.params.id;
    const { files, dir, config: alignConfig } = req.body || {};

    // 1. 获取基线
    let baseline = loadLatestBaseline(repoId);
    if (!baseline) {
      // 自动扫描
      const cfg  = loadReposConfig();
      const repo = getRepoConfig(cfg, repoId);
      if (!repo.git?.localPath || !fs.existsSync(repo.git.localPath)) {
        return res.status(400).json({
          success: false,
          error: 'No baseline available. Please scan repo first: GET /api/repos/:id/baseline',
        });
      }
      const scanner = new CodeScanner(repo);
      baseline = await scanner.scan();
      saveBaseline(repoId, baseline);
    }

    // 2. 解析需求文档
    const parser = new ReqParser(alignConfig);
    let parsed;

    if (dir) {
      parsed = await parser.parseDir(dir);
    } else if (files && files.length > 0) {
      parsed = await parser.parseFiles(files);
    } else if (req.body.content) {
      // 直接传入文本
      const features = parser.parseContent(req.body.content, req.body.format || 'md');
      parsed = [{ file: 'inline', features }];
    } else {
      return res.status(400).json({
        success: false,
        error: 'Provide files[], dir, or content in request body',
      });
    }

    // 3. 合并所有功能点
    const allFeatures = parsed.flatMap(p =>
      (p.features || []).map(f => ({ ...f, source: p.file }))
    );

    if (allFeatures.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No features extracted. Check document format.',
        hint: 'Supported formats: .md, .txt, .json, .yaml',
        parsed: parsed,
      });
    }

    // 4. 对齐分析
    const aligner = new FeatureAligner(baseline, alignConfig || {});
    const result = aligner.align(allFeatures);

    // 5. 保存报告
    const reportFile = saveReport(repoId, {
      timestamp: new Date().toISOString(),
      repoId,
      baselineId: baseline.id,
      featuresCount: allFeatures.length,
      ...result,
    });

    console.log(`[Align] ${allFeatures.length} features aligned, report saved to ${reportFile}`);

    res.json({
      success: true,
      repoId,
      featuresExtracted: allFeatures.length,
      summary: result.summary,
      moduleImpact: result.moduleImpact,
      recommendations: result.recommendations,
      report: result.report,
      reportFile,
    });
  } catch (e) {
    console.error('[Align] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/repos/:id/analyze-text
 * 直接分析文本需求（最简接口）
 * Body: { text: "...", format?: "md" }
 */
router.post('/:id/analyze-text', async (req, res) => {
  try {
    const repoId = req.params.id;
    const { text, format = 'md' } = req.body || {};

    if (!text || text.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'text too short (< 10 chars)' });
    }

    // 1. 获取基线
    let baseline = loadLatestBaseline(repoId);
    if (!baseline) {
      return res.status(400).json({
        success: false,
        error: `No baseline for repo "${repoId}". Scan first: GET /api/repos/${repoId}/baseline`,
      });
    }

    // 2. 解析文本
    const parser = new ReqParser();
    const features = parser.parseContent(text, format);

    if (features.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No features extracted from text',
      });
    }

    // 3. 对齐
    const aligner = new FeatureAligner(baseline);
    const result = aligner.align(features);

    res.json({
      success: true,
      repoId,
      featuresExtracted: features.length,
      summary: result.summary,
      alignmentMatrix: result.alignmentMatrix.map(m => ({
        id:           m.featureId,
        name:         m.featureName,
        featureName:  m.featureName,
        featureDesc:  m.featureDesc,
        priority:     m.priority,
        matchType:   m.matchType,
        type:         m.matchType,
        moduleId:     m.moduleId,
        module:       m.moduleName,
        moduleName:   m.moduleName,
        confidence:   m.confidence,
        reasons:      m.reasons,
        keywords:     m.keywords,
        recommendation: m.recommendation,
        baselineFeatures: m.baselineFeatures,
      })),
      matrix: result.alignmentMatrix.map(m => ({
        id:       m.featureId,
        name:     m.featureName,
        type:     m.matchType,
        module:   m.moduleName,
        confidence: m.confidence,
        recommendation: m.recommendation,
      })),
      moduleImpact: result.moduleImpact,
      recommendations: result.recommendations,
      report: result.report,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/repos/:id/report
 * 获取最新分析报告
 */
router.get('/:id/report', (req, res) => {
  try {
    const cfg = loadReposConfig();
    const reportDir = path.resolve(__dirname, '../..', cfg.output?.reportDir || './data/reports');
    if (!fs.existsSync(reportDir)) {
      return res.json({ success: true, reports: [] });
    }
    const files = fs.readdirSync(reportDir)
      .filter(f => f.startsWith(req.params.id) && f.endsWith('.json'))
      .map(f => ({
        file: f,
        path: path.join(reportDir, f),
        mtime: fs.statSync(path.join(reportDir, f)).mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    res.json({ success: true, reports: files.slice(0, 10) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/repos/:id/modules
 * 获取基线中的模块列表
 */
router.get('/:id/modules', (req, res) => {
  try {
    const baseline = loadLatestBaseline(req.params.id);
    if (!baseline) {
      return res.status(404).json({ success: false, error: 'Baseline not found' });
    }
    const modules = Object.entries(baseline.modules || {}).map(([id, m]) => ({
      id,
      name: m.name,
      featureCount: m.featureCount,
      topics: m.topics,
      classes: m.classes?.length || 0,
      files: m.files?.length || 0,
    }));
    res.json({ success: true, repoId: req.params.id, modules });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
