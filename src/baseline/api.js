/**
 * 基线管理 API — 路由层
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const {
  generateBaseline,
  saveBaseline,
  loadBaseline,
  listBaselines,
  buildDefaultADModules,
} = require('./schema');

const { alignRequirement } = require('./aligner');

// ─── 辅助 ────────────────────────────────────────────────────────────────────
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// 使用与 schema.js 一致的路径 (devguard-agent/data/baselines/)
const DATA_DIR = path.resolve(__dirname, '../../data/baselines');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── 基线管理 ────────────────────────────────────────────────────────────────

// 列出所有基线
router.get('/baselines', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    const baselines = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
        return {
          id: data.id, name: data.name, version: data.version,
          updatedAt: data.updatedAt, language: data.language,
          moduleCount: Object.keys(data.modules || {}).length,
          stats: data.stats,
        };
      } catch { return null; }
    }).filter(Boolean);
    res.json({ success: true, baselines });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 获取单个基线
router.get('/baselines/:id', (req, res) => {
  const baseline = loadBaseline(req.params.id);
  if (!baseline) return res.status(404).json({ success: false, error: 'Baseline not found' });
  res.json({ success: true, baseline });
});

// 生成新基线（默认自动驾驶模板）
router.post('/baselines/generate', asyncHandler(async (req, res) => {
  const { name, language = 'cpp', repoPath, modules } = req.body;

  // 生成基线
  const baseline = await generateBaseline({
    name: name || '自动驾驶系统',
    language,
    repoPath,
    modules,
  });

  // 如果没有指定repoPath，使用默认AD模块结构
  if (!repoPath && !modules) {
    baseline.modules = buildDefaultADModules(language);
  }

  const file = saveBaseline(baseline);
  res.json({ success: true, baseline, file });
}));

// 生成完整AD基线（带所有默认模块）
router.post('/baselines/generate-ad', asyncHandler(async (req, res) => {
  const { name, language = 'cpp' } = req.body;

  const baseline = {
    id: require('crypto').randomUUID(),
    name: name || '自动驾驶系统基线',
    version: '1.0.0',
    language,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    architecture: {
      pattern: 'distributed-real-time',
      rosVersion: 'ROS2 Humble',
      communication: 'DDS / Pub-Sub',
      os: 'Ubuntu 22.04 / QNX',
      realtime: true,
      safetyLevel: 'ASIL-D',
    },
    modules: buildDefaultADModules(language),
    stats: {
      totalModules: Object.keys(buildDefaultADModules(language)).length,
    },
    safety: {
      asilLevel: 'D',
      standard: 'ISO26262',
      watchdogs: [
        { name: 'Process Watchdog', period: '100ms', action: 'restart' },
        { name: 'Heartbeat Watchdog', period: '50ms', action: 'MRC' },
      ],
      redundancies: [
        { type: 'sensor', items: ['lidar_1', 'lidar_2', 'radar'] },
        { type: 'computing', items: ['primary_compute', 'backup_compute'] },
      ],
    },
    perception: {
      sensors: [
        { type: 'lidar', model: 'Velodyne VLS-128', count: 1, fps: 10 },
        { type: 'camera', model: 'camera_fisheye', count: 8, fps: 30 },
        { type: 'radar', model: 'continental_ars408', count: 2, fps: 20 },
        { type: 'ultrasonic', count: 12, fps: 40 },
      ],
      models: [
        { name: '障碍物检测', type: 'detection', framework: 'PointPillars', latency: '40ms' },
        { name: '车道线检测', type: 'laneline', framework: 'SCNN', latency: '30ms' },
        { name: '目标跟踪', type: 'tracking', framework: 'AB3DMOT', latency: '20ms' },
        { name: '融合感知', type: 'fusion', framework: 'CenterFusion', latency: '50ms' },
      ],
      latency: { target: '50ms', max: '100ms' },
    },
    planning: {
      algorithms: [
        { name: '行为决策', type: 'behavior', framework: 'Rule-based + ML', latency: '20ms' },
        { name: '轨迹规划', type: 'trajectory', framework: 'QP + Spiral', latency: '50ms' },
        { name: '速度规划', type: 'speed', framework: 'DP +QP', latency: '30ms' },
      ],
      scenarios: ['高速巡航', '城区巡航', '变道', '汇入汇出', '紧急制动', '十字路口'],
      latency: { target: '100ms', max: '200ms' },
      fallback: 'MRC (Minimal Risk Condition)',
    },
    simulation: {
      frameworks: ['CARLA', 'LGSVL', 'Apollo Simulation'],
      scenarioCount: 1500,
      metrics: ['L4-safe', 'Comfort', 'Efficiency', 'Success-Rate'],
    },
  };

  const file = saveBaseline(baseline);
  res.json({ success: true, baseline, file });
}));

// 更新基线
router.put('/baselines/:id', asyncHandler(async (req, res) => {
  const baseline = loadBaseline(req.params.id);
  if (!baseline) return res.status(404).json({ success: false, error: 'Baseline not found' });

  Object.assign(baseline, req.body, { updatedAt: new Date().toISOString() });
  const file = saveBaseline(baseline);
  res.json({ success: true, baseline, file });
}));

// 删除基线
router.delete('/baselines/:id', asyncHandler(async (req, res) => {
  const file = path.join(DATA_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    res.json({ success: true, message: 'Baseline deleted' });
  } else {
    res.status(404).json({ success: false, error: 'Baseline not found' });
  }
}));

// 导出基线
router.get('/baselines/:id/export', (req, res) => {
  const baseline = loadBaseline(req.params.id);
  if (!baseline) return res.status(404).json({ success: false, error: 'Not found' });
  res.setHeader('Content-Disposition', `attachment; filename=baseline-${baseline.name}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.json(baseline);
});

// ─── 需求对齐分析 ──────────────────────────────────────────────────────────────

// 执行需求对齐分析
router.post('/align', asyncHandler(async (req, res) => {
  const { baselineId, requirement, prdContent, modulePriority } = req.body;

  if (!requirement) {
    return res.status(400).json({ success: false, error: 'requirement is required' });
  }

  let baseline;
  if (baselineId) {
    baseline = loadBaseline(baselineId);
    if (!baseline) return res.status(404).json({ success: false, error: 'Baseline not found' });
  } else {
    // 无基线时使用默认AD基线
    baseline = {
      modules: buildDefaultADModules('cpp'),
      techDebts: [],
    };
  }

  const result = await alignRequirement({ baseline, requirement, prdContent, modulePriority });

  res.json({
    success: true,
    baselineId: baseline.id,
    baselineName: baseline.name,
    ...result,
  });
}));

// 获取模块列表（前端下拉选择）
router.get('/modules', (req, res) => {
  const mods = buildDefaultADModules('cpp');
  const list = Object.entries(mods).map(([key, v]) => ({
    id: key,
    name: v.name,
    name_en: v.name_en,
    asil: v.asil,
    realtime: v.rt,
    latency: v.latency,
    risks: v.risks,
    submodules: Object.entries(v.submodules || {}).map(([sk, sv]) => ({ id: sk, ...sv })),
  }));
  res.json({ success: true, modules: list });
});

// ─── 上传代码仓库分析 ────────────────────────────────────────────────────────

// 分析上传的代码包
router.post('/analyze-upload', asyncHandler(async (req, res) => {
  // 此接口需要前端配合上传文件
  // 简化实现：返回说明
  res.json({
    success: true,
    message: '请使用 /api/baselines/generate 并指定 repoPath，或直接生成默认AD基线',
    hint: '推荐使用 /api/baselines/generate-ad 生成标准自动驾驶架构基线',
  });
}));

module.exports = router;
