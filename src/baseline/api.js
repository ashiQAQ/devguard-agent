/**
 * baseline/api.js — 基线管理 API（MySQL 版）
 * DevGuard Agent v2.1
 */
'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { BaselineStore } = require('../db-store');
const { generateBaseline, buildDefaultADModules } = require('./schema');
const { alignRequirement } = require('./aligner');

function uuid() { return crypto.randomUUID(); }
const ok  = (res, d) => res.json({ success: true, ...d });
const err = (res, msg, code = 500) => res.status(code).json({ success: false, error: msg });

// ─── 基线列表 ───────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query;
    const baselines = await BaselineStore.list(projectId || null);
    ok(res, {
      baselines: baselines.map(b => ({
        id: b.id,
        name: b.name,
        version: b.version,
        language: b.language,
        isActive: !!b.is_active,
        moduleCount: b.schema_data ? Object.keys(b.schema_data.modules || {}).length : 0,
        updatedAt: b.updated_at,
        createdAt: b.created_at,
      })),
    });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 基线详情 ─────────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const baseline = await BaselineStore.get(req.params.id);
    if (!baseline) return err(res, 'Baseline not found', 404);
    ok(res, { baseline });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 生成基线 ─────────────────────────────────────────────────────────────

router.post('/generate', async (req, res) => {
  try {
    const { name, language = 'cpp', projectId, modules } = req.body;
    const schema = await generateBaseline({
      name: name || '默认系统',
      language,
      modules,
    });
    if (!modules) schema.modules = buildDefaultADModules(language);

    const baseline = await BaselineStore.create({
      name: name || '默认系统基线',
      version: '1.0.0',
      language,
      schemaData: schema,
      projectId,
    });
    ok(res, { baseline });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 生成 AD 完整基线 ────────────────────────────────────────────────────

router.post('/generate-ad', async (req, res) => {
  try {
    const { name, language = 'cpp', projectId } = req.body;
    const schema = {
      id: uuid(),
      name: name || '自动驾驶系统基线',
      version: '1.0.0',
      language,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      architecture: {
        pattern: 'distributed-real-time',
        rosVersion: 'ROS2 Humble',
        communication: 'DDS / Pub-Sub',
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

    const baseline = await BaselineStore.create({
      name: name || '自动驾驶系统基线',
      version: '1.0.0',
      language,
      schemaData: schema,
      projectId,
    });
    ok(res, { baseline });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 更新 / 删除基线 ───────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const baseline = await BaselineStore.update(req.params.id, {
      ...req.body,
      schemaData: req.body.schemaData || req.body.schema,
    });
    if (!baseline) return err(res, 'Baseline not found', 404);
    ok(res, { baseline });
  } catch (e) {
    err(res, e.message);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await BaselineStore.remove(req.params.id);
    ok(res, { message: '基线已删除' });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 导出基线 ─────────────────────────────────────────────────────────────

router.get('/:id/export', async (req, res) => {
  try {
    const baseline = await BaselineStore.get(req.params.id);
    if (!baseline) return err(res, 'Not found', 404);
    res.setHeader('Content-Disposition', `attachment; filename=baseline-${baseline.name}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.json(baseline.schema_data || baseline);
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 需求对齐分析 ──────────────────────────────────────────────────────────

router.post('/align', async (req, res) => {
  try {
    const { baselineId, requirement, prdContent, modulePriority } = req.body;
    if (!requirement) return err(res, 'requirement is required', 400);

    let baseline = null;
    if (baselineId) {
      baseline = await BaselineStore.get(baselineId);
      if (!baseline) return err(res, 'Baseline not found', 404);
      baseline = { ...baseline, modules: baseline.schema_data?.modules || {} };
    } else {
      baseline = { modules: buildDefaultADModules('cpp'), techDebts: [] };
    }

    const result = await alignRequirement({ baseline, requirement, prdContent, modulePriority });
    ok(res, { baselineId: baseline.id, baselineName: baseline.name, ...result });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 模块列表 ─────────────────────────────────────────────────────────────

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
  ok(res, { modules: list });
});

module.exports = router;
