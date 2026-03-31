/**
 * history-api.js — 分析历史 + 需求变更查询 API
 * DevGuard Agent v2.1
 *
 * 支持：
 *   - 按日期范围查询分析记录
 *   - 按仓库/分支过滤
 *   - 两个分支需求变更对比
 *   - 按模块统计变更分布
 *   - 变更时间线
 */

'use strict';

require('dotenv').config();
const express = require('express');
const { AnalysisStore, ReqChangeStore, ProjectStore, BaselineStore } = require('./db-store');

const router = express.Router();
const ok  = (res, data) => res.json({ success: true, ...data });
const err = (res, msg, code = 500) => res.status(code).json({ success: false, error: msg });

// ─── 分析历史 ────────────────────────────────────────────────────────────────

// 列表（支持分页 + 多维过滤）
router.get('/history', async (req, res) => {
  try {
    const {
      projectId, repoUrl, repoName, branch,
      analysisType, prNumber, status, riskLevel, triggerEvent,
      dateFrom, dateTo, page, pageSize,
    } = req.query;

    const result = await AnalysisStore.list({
      projectId, repoUrl, repoName, branch,
      analysisType: analysisType || undefined,
      prNumber: prNumber ? parseInt(prNumber) : undefined,
      status: status || undefined,
      riskLevel: riskLevel || undefined,
      triggerEvent: triggerEvent || undefined,
      dateFrom: dateFrom ? `${dateFrom} 00:00:00` : undefined,
      dateTo:   dateTo   ? `${dateTo} 23:59:59` : undefined,
      page: parseInt(page || '1'),
      pageSize: parseInt(pageSize || '20'),
    });
    ok(res, result);
  } catch (e) {
    err(res, e.message);
  }
});

// 详情
router.get('/history/:id', async (req, res) => {
  try {
    const record = await AnalysisStore.get(req.params.id);
    if (!record) return err(res, 'Not found', 404);
    ok(res, { record });
  } catch (e) {
    err(res, e.message);
  }
});

// 按 PR 查历史
router.get('/history/pr/:projectId/:prNumber', async (req, res) => {
  try {
    const records = await AnalysisStore.byPR(
      req.params.projectId,
      parseInt(req.params.prNumber)
    );
    ok(res, { records, count: records.length });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 需求变更历史 ─────────────────────────────────────────────────────────────

// 列表（支持多维过滤）
router.get('/req-changes', async (req, res) => {
  try {
    const {
      projectId, repoUrl, repoName, branch, reqId,
      changeType, priority, module,
      dateFrom, dateTo, page, pageSize,
    } = req.query;

    const result = await ReqChangeStore.list({
      projectId, repoUrl, repoName, branch, reqId,
      changeType: changeType || undefined,
      priority: priority || undefined,
      module: module || undefined,
      dateFrom: dateFrom ? `${dateFrom} 00:00:00` : undefined,
      dateTo:   dateTo   ? `${dateTo} 23:59:59` : undefined,
      page: parseInt(page || '1'),
      pageSize: parseInt(pageSize || '50'),
    });
    ok(res, result);
  } catch (e) {
    err(res, e.message);
  }
});

// 写入变更（由 pipeline 调用）
router.post('/req-changes', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const created = await ReqChangeStore.batchCreate(items);
    ok(res, { created: created.length });
  } catch (e) {
    err(res, e.message);
  }
});

// 变更时间线（按天/周/月聚合）
router.get('/req-changes/timeline', async (req, res) => {
  try {
    const { projectId, repoUrl, branch, groupBy } = req.query;
    const timeline = await ReqChangeStore.timeline({
      projectId, repoUrl, branch,
      groupBy: groupBy || 'day',
    });
    ok(res, { timeline });
  } catch (e) {
    err(res, e.message);
  }
});

// 按模块统计变更
router.get('/req-changes/by-module', async (req, res) => {
  try {
    const { projectId, repoUrl, dateFrom, dateTo } = req.query;
    const stats = await ReqChangeStore.byModule({
      projectId, repoUrl,
      dateFrom: dateFrom ? `${dateFrom} 00:00:00` : undefined,
      dateTo:   dateTo   ? `${dateTo} 23:59:59` : undefined,
    });
    ok(res, { stats });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 分支对比 ─────────────────────────────────────────────────────────────────

// 对比两个分支的需求变更差异
router.post('/req-changes/compare-branch', async (req, res) => {
  try {
    const { repoUrl, branchA, branchB, dateFrom, dateTo } = req.body;
    if (!repoUrl || !branchA || !branchB) {
      return err(res, 'repoUrl, branchA, branchB 必填', 400);
    }
    const result = await ReqChangeStore.compareBranch({
      repoUrl, branchA, branchB, dateFrom, dateTo,
    });
    ok(res, {
      repoUrl,
      branchA,
      branchB,
      total: result.length,
      items: result,
    });
  } catch (e) {
    err(res, e.message);
  }
});

// 仓库维度对比（列出某仓库所有分支的变更概览）
router.get('/req-changes/compare-repo', async (req, res) => {
  try {
    const { repoUrl, dateFrom, dateTo } = req.query;
    if (!repoUrl) return err(res, 'repoUrl 必填', 400);

    // 查所有分支的最新变更数
    const rows = await req.app.get('db').query(
      `SELECT branch,
              COUNT(*) AS total,
              MAX(created_at) AS last_change,
              SUM(CASE WHEN change_type='misalign' THEN 1 ELSE 0 END) AS misaligns,
              SUM(CASE WHEN change_type='align' THEN 1 ELSE 0 END) AS aligns
       FROM dg_req_changes
       WHERE repo_url=?
         AND (? IS NULL OR created_at >= ?)
         AND (? IS NULL OR created_at <= ?)
       GROUP BY branch
       ORDER BY last_change DESC`,
      [repoUrl, dateFrom||null, dateFrom||null, dateTo||null, dateTo||null]
    );
    ok(res, { repoUrl, branches: rows });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── 汇总统计 ─────────────────────────────────────────────────────────────────

// 项目/仓库概览
router.get('/summary', async (req, res) => {
  try {
    const { projectId, repoUrl, dateFrom, dateTo } = req.query;
    const cond = (col, v) => v ? `${col}=? AND ` : '';
    const params = [];
    let where = 'WHERE 1=1';
    if (projectId) { where += ` AND project_id=?`; params.push(projectId); }
    if (repoUrl)   { where += ` AND repo_url=?`; params.push(repoUrl); }
    if (dateFrom)  { where += ` AND created_at>=?`; params.push(`${dateFrom} 00:00:00`); }
    if (dateTo)    { where += ` AND created_at<=?`; params.push(`${dateTo} 23:59:59`); }

    const [analysisSummary, changeSummary] = await Promise.all([
      req.app.get('db').query(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
                SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) AS running,
                SUM(CASE WHEN risk_level='block' OR risk_level='crit' THEN 1 ELSE 0 END) AS high_risk,
                SUM(CASE WHEN can_merge=1 THEN 1 ELSE 0 END) AS can_merge_count
         FROM dg_analysis_history ${where}`,
        params
      ),
      req.app.get('db').query(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN change_type='add' THEN 1 ELSE 0 END) AS adds,
                SUM(CASE WHEN change_type='update' THEN 1 ELSE 0 END) AS updates,
                SUM(CASE WHEN change_type='delete' THEN 1 ELSE 0 END) AS deletes,
                SUM(CASE WHEN change_type='align' THEN 1 ELSE 0 END) AS aligns,
                SUM(CASE WHEN change_type='misalign' THEN 1 ELSE 0 END) AS misaligns,
                COUNT(DISTINCT req_id) AS unique_reqs,
                COUNT(DISTINCT branch) AS branch_count
         FROM dg_req_changes ${where}`,
        params
      ),
    ]);

    ok(res, {
      analysis: analysisSummary[0],
      changes: changeSummary[0],
    });
  } catch (e) {
    err(res, e.message);
  }
});

module.exports = router;
