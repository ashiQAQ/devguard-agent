/**
 * db-store.js — 数据访问层（替换内存/文件存储）
 * DevGuard Agent v2.1
 *
 * 支持：
 *   - 项目 CRUD
 *   - 基线 CRUD
 *   - 分析历史写入/查询
 *   - 需求变更历史（按日期/仓库/分支对比）
 *   - 全局配置 KV
 */

'use strict';

const crypto = require('crypto');
const db = require('./db');

// ─── 通用工具 ─────────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }
function now()  { return new Date(); }
function fmtDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 19).replace('T', ' ');
  return String(d);
}

// ─── 1. 项目管理 ───────────────────────────────────────────────────────────────

const ProjectStore = {
  async list() {
    const rows = await db.query(
      'SELECT * FROM dg_projects ORDER BY created_at DESC'
    );
    return rows.map(r => ({ ...r, auto_analyzers: parseJSON(r.auto_analyzers) }));
  },

  async get(id) {
    const r = await db.queryOne('SELECT * FROM dg_projects WHERE id = ?', [id]);
    if (!r) return null;
    return { ...r, auto_analyzers: parseJSON(r.auto_analyzers) };
  },

  async getByURL(url) {
    const r = await db.queryOne(
      'SELECT * FROM dg_projects WHERE url = ? LIMIT 1',
      [url]
    );
    if (!r) return null;
    return { ...r, auto_analyzers: parseJSON(r.auto_analyzers) };
  },

  async create(data) {
    const id = data.id || uuid();
    const nowTs = now();
    await db.execute(
      `INSERT INTO dg_projects
        (id,name,type,url,branch,token,webhook_secret,language,auto_analyzers,enabled,baseline_id,last_trigger,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        data.name,
        data.type  || 'github',
        data.url   || '',
        data.branch || 'main',
        data.token || '',
        data.webhookSecret || uuid().slice(0, 8),
        data.language || 'cpp',
        JSON.stringify(data.autoAnalyzers || ['align','review']),
        data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
        data.baselineId || null,
        data.lastTrigger ? fmtDate(new Date(data.lastTrigger)) : null,
        nowTs, nowTs,
      ]
    );
    return this.get(id);
  },

  async update(id, data) {
    const fields = [], vals = [];
    const map = {
      name: 'name', type: 'type', url: 'url', branch: 'branch',
      token: 'token', language: 'language', enabled: 'enabled',
      baselineId: 'baseline_id', lastTrigger: 'last_trigger',
    };
    const jsonMap = { autoAnalyzers: 'auto_analyzers' };
    for (const [k, v] of Object.entries(data)) {
      if (k === 'id') continue;
      const col = map[k] || k;
      if (jsonMap[k]) {
        fields.push(`${col}=?`);
        vals.push(JSON.stringify(v));
      } else if (col === 'enabled') {
        fields.push(`${col}=?`);
        vals.push(v ? 1 : 0);
      } else if (col === 'last_trigger' && v) {
        fields.push(`${col}=?`);
        vals.push(fmtDate(new Date(v)));
      } else {
        fields.push(`${col}=?`);
        vals.push(v ?? null);
      }
    }
    if (!fields.length) return this.get(id);
    fields.push('updated_at=?');
    vals.push(now(), id);
    await db.execute(
      `UPDATE dg_projects SET ${fields.join(',')} WHERE id=?`,
      vals
    );
    return this.get(id);
  },

  async remove(id) {
    await db.execute('DELETE FROM dg_projects WHERE id=?', [id]);
  },

  async touchTrigger(id) {
    await db.execute(
      'UPDATE dg_projects SET last_trigger=NOW() WHERE id=?',
      [id]
    );
  },
};

// ─── 2. 基线管理 ───────────────────────────────────────────────────────────────

const BaselineStore = {
  async list(projectId) {
    const rows = projectId
      ? await db.query('SELECT * FROM dg_baselines WHERE project_id=? ORDER BY created_at DESC', [projectId])
      : await db.query('SELECT * FROM dg_baselines ORDER BY created_at DESC');
    return rows.map(r => ({ ...r, schema_data: parseJSON(r.schema_data) }));
  },

  async get(id) {
    const r = await db.queryOne('SELECT * FROM dg_baselines WHERE id=?', [id]);
    if (!r) return null;
    return { ...r, schema_data: parseJSON(r.schema_data) };
  },

  async getActive(projectId) {
    const rows = await db.query(
      'SELECT * FROM dg_baselines WHERE project_id=? AND is_active=1 LIMIT 1',
      [projectId]
    );
    return rows[0]
      ? { ...rows[0], schema_data: parseJSON(rows[0].schema_data) }
      : null;
  },

  async create(data) {
    const id = data.id || uuid();
    const nowTs = now();
    await db.execute(
      `INSERT INTO dg_baselines
        (id,name,version,language,schema_data,is_active,parent_id,project_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        data.name,
        data.version || '1.0.0',
        data.language || 'cpp',
        JSON.stringify(data.schemaData || data.schema || {}),
        data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
        data.parentId || null,
        data.projectId || null,
        nowTs, nowTs,
      ]
    );
    return this.get(id);
  },

  async update(id, data) {
    const fields = [], vals = [];
    const map = { name:'name', version:'version', language:'language',
                  isActive:'is_active', parentId:'parent_id', projectId:'project_id' };
    for (const [k, v] of Object.entries(data)) {
      if (k === 'id') continue;
      const col = map[k] || k;
      if (col === 'schema_data') {
        fields.push(`${col}=?`);
        vals.push(JSON.stringify(v));
      } else if (col === 'is_active') {
        fields.push(`${col}=?`);
        vals.push(v ? 1 : 0);
      } else {
        fields.push(`${col}=?`);
        vals.push(v ?? null);
      }
    }
    if (!fields.length) return this.get(id);
    fields.push('updated_at=?');
    vals.push(now(), id);
    await db.execute(`UPDATE dg_baselines SET ${fields.join(',')} WHERE id=?`, vals);
    return this.get(id);
  },

  async remove(id) {
    await db.execute('DELETE FROM dg_baselines WHERE id=?', [id]);
  },
};

// ─── 3. 分析历史 ──────────────────────────────────────────────────────────────

const AnalysisStore = {
  async create(data) {
    const id = data.id || uuid();
    await db.execute(
      `INSERT INTO dg_analysis_history
        (id,project_id,repo_url,repo_name,branch,analysis_type,pr_number,pr_title,pr_author,
         trigger_event,status,risk_level,can_merge,result_summary,result_detail,
         baseline_id,duration_ms,created_at,completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        data.projectId    || null,
        data.repoUrl      || null,
        data.repoName     || null,
        data.branch       || 'main',
        data.analysisType || 'pr_review',
        data.prNumber     || null,
        data.prTitle      || null,
        data.prAuthor     || null,
        data.triggerEvent || 'manual',
        data.status       || 'pending',
        data.riskLevel    || null,
        data.canMerge     != null ? (data.canMerge ? 1 : 0) : null,
        data.resultSummary|| null,
        data.resultDetail ? JSON.stringify(data.resultDetail) : null,
        data.baselineId   || null,
        data.durationMs   || null,
        now(),
        data.completedAt  ? fmtDate(new Date(data.completedAt)) : null,
      ]
    );
    return this.get(id);
  },

  async get(id) {
    const r = await db.queryOne(
      'SELECT * FROM dg_analysis_history WHERE id=?', [id]
    );
    if (!r) return null;
    return { ...r, result_detail: parseJSON(r.result_detail), auto_analyzers: parseJSON(r.auto_analyzers) };
  },

  async update(id, data) {
    const fields = [], vals = [];
    const map = { status:'status', riskLevel:'risk_level', canMerge:'can_merge',
                  resultSummary:'result_summary', durationMs:'duration_ms',
                  completedAt:'completed_at', resultDetail:'result_detail' };
    for (const [k, v] of Object.entries(data)) {
      if (k === 'id') continue;
      const col = map[k] || k;
      if (col === 'result_detail') {
        fields.push(`${col}=?`);
        vals.push(v ? JSON.stringify(v) : null);
      } else if (col === 'can_merge') {
        fields.push(`${col}=?`);
        vals.push(v != null ? (v ? 1 : 0) : null);
      } else if (col === 'completed_at' && v) {
        fields.push(`${col}=?`);
        vals.push(fmtDate(new Date(v)));
      } else {
        fields.push(`${col}=?`);
        vals.push(v ?? null);
      }
    }
    if (!fields.length) return this.get(id);
    await db.execute(
      `UPDATE dg_analysis_history SET ${fields.join(',')} WHERE id=?`,
      [...vals, id]
    );
    return this.get(id);
  },

  /**
   * 查询分析历史
   * @param {object} filters
   *   - projectId, repoUrl, branch, analysisType, prNumber,
   *     status, riskLevel, dateFrom, dateTo, page, pageSize
   */
  async list(filters = {}) {
    const {
      projectId, repoUrl, repoName, branch, analysisType,
      prNumber, status, riskLevel, triggerEvent,
      dateFrom, dateTo, page = 1, pageSize = 20,
    } = filters;

    let sql = 'SELECT * FROM dg_analysis_history WHERE 1=1';
    const params = [];

    if (projectId)  { sql += ' AND project_id=?'; params.push(projectId); }
    if (repoUrl)    { sql += ' AND repo_url=?'; params.push(repoUrl); }
    if (repoName)   { sql += ' AND repo_name LIKE ?'; params.push(`%${repoName}%`); }
    if (branch)     { sql += ' AND branch=?'; params.push(branch); }
    if (analysisType){ sql += ' AND analysis_type=?'; params.push(analysisType); }
    if (prNumber)   { sql += ' AND pr_number=?'; params.push(prNumber); }
    if (status)    { sql += ' AND status=?'; params.push(status); }
    if (riskLevel) { sql += ' AND risk_level=?'; params.push(riskLevel); }
    if (triggerEvent){ sql += ' AND trigger_event=?'; params.push(triggerEvent); }
    if (dateFrom)   { sql += ' AND created_at>=?'; params.push(dateFrom); }
    if (dateTo)     { sql += ' AND created_at<=?'; params.push(dateTo); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = (await db.queryOne(countSql, params))?.total || 0;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(pageSize, 10), parseInt((page - 1) * pageSize, 10));

    const rows = await db.query(sql, params);
    return {
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      items: rows.map(r => ({ ...r, result_detail: parseJSON(r.result_detail) })),
    };
  },

  /** 最新 N 条 */
  async latest(projectId, limit = 10) {
    const rows = await db.query(
      'SELECT * FROM dg_analysis_history WHERE project_id=? ORDER BY created_at DESC LIMIT ?',
      [projectId, parseInt(limit, 10)]
    );
    return rows.map(r => ({ ...r, result_detail: parseJSON(r.result_detail) }));
  },

  /** 按 PR 查 */
  async byPR(projectId, prNumber) {
    const rows = await db.query(
      'SELECT * FROM dg_analysis_history WHERE project_id=? AND pr_number=? ORDER BY created_at DESC',
      [projectId, prNumber]
    );
    return rows.map(r => ({ ...r, result_detail: parseJSON(r.result_detail) }));
  },
};

// ─── 4. 需求变更历史（支持多维度对比）────────────────────────────────────────

const ReqChangeStore = {
  async create(data) {
    const id = data.id || uuid();
    await db.execute(
      `INSERT INTO dg_req_changes
        (id,project_id,repo_url,repo_name,branch,req_id,req_title,req_type,
         change_type,priority,module,old_content,new_content,diff_summary,
         analysis_id,pr_number,commit_sha,author,risk_level,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        data.projectId   || null,
        data.repoUrl     || null,
        data.repoName    || null,
        data.branch      || 'main',
        data.reqId       || null,
        data.reqTitle    || null,
        data.reqType     || null,
        data.changeType  || 'update',
        data.priority    || 'P1',
        data.module      || null,
        data.oldContent  || null,
        data.newContent  || null,
        data.diffSummary || null,
        data.analysisId  || null,
        data.prNumber    || null,
        data.commitSha   || null,
        data.author      || null,
        data.riskLevel   || null,
        now(),
      ]
    );
    return { id, ...data };
  },

  async batchCreate(items) {
    if (!items.length) return [];
    const cols = [
      'id','project_id','repo_url','repo_name','branch','req_id','req_title','req_type',
      'change_type','priority','module','old_content','new_content','diff_summary',
      'analysis_id','pr_number','commit_sha','author','risk_level','created_at',
    ];
    const placeholders = items.map(() =>
      `(${cols.map(() => '?').join(',')})`
    ).join(',');

    const vals = items.flatMap(d => [
      d.id || uuid(),
      d.projectId   || null,
      d.repoUrl     || null,
      d.repoName    || null,
      d.branch      || 'main',
      d.reqId       || null,
      d.reqTitle    || null,
      d.reqType     || null,
      d.changeType  || 'update',
      d.priority    || 'P1',
      d.module      || null,
      d.oldContent  || null,
      d.newContent  || null,
      d.diffSummary || null,
      d.analysisId  || null,
      d.prNumber    || null,
      d.commitSha   || null,
      d.author      || null,
      d.riskLevel   || null,
      now(),
    ]);

    await db.execute(
      `INSERT INTO dg_req_changes (${cols.join(',')}) VALUES ${placeholders}`,
      vals
    );
    return items;
  },

  /**
   * 查询变更历史
   * @param {object} filters — projectId, repoUrl, branch, reqId,
   *   changeType, dateFrom, dateTo, page, pageSize
   */
  async list(filters = {}) {
    const {
      projectId, repoUrl, repoName, branch, reqId,
      changeType, priority, module, dateFrom, dateTo,
      page = 1, pageSize = 50,
    } = filters;

    let sql = 'SELECT * FROM dg_req_changes WHERE 1=1';
    const params = [];

    if (projectId)  { sql += ' AND project_id=?'; params.push(projectId); }
    if (repoUrl)    { sql += ' AND repo_url=?'; params.push(repoUrl); }
    if (repoName)   { sql += ' AND repo_name LIKE ?'; params.push(`%${repoName}%`); }
    if (branch)     { sql += ' AND branch=?'; params.push(branch); }
    if (reqId)      { sql += ' AND req_id=?'; params.push(reqId); }
    if (changeType) { sql += ' AND change_type=?'; params.push(changeType); }
    if (priority)   { sql += ' AND priority=?'; params.push(priority); }
    if (module)     { sql += ' AND module=?'; params.push(module); }
    if (dateFrom)   { sql += ' AND created_at>=?'; params.push(dateFrom); }
    if (dateTo)     { sql += ' AND created_at<=?'; params.push(dateTo); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = (await db.queryOne(countSql, params))?.total || 0;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(pageSize, 10), parseInt((page - 1) * pageSize, 10));

    const rows = await db.query(sql, params);
    return { total, page, pageSize, pages: Math.ceil(total / pageSize), items: rows };
  },

  /**
   * 按时间段汇总（用于时间线视图）
   */
  async timeline(filters = {}) {
    const { projectId, repoUrl, branch, groupBy = 'day' } = filters;
    let sql, params = [];
    const truncMap = { day: 'DATE(created_at)', month: 'DATE_FORMAT(created_at, "%Y-%m")', week: 'YEARWEEK(created_at, 1)' };

    let where = 'WHERE 1=1';
    if (projectId) { where += ' AND project_id=?'; params.push(projectId); }
    if (repoUrl)   { where += ' AND repo_url=?'; params.push(repoUrl); }
    if (branch)    { where += ' AND branch=?'; params.push(branch); }

    sql = `SELECT ${truncMap[groupBy] || 'DATE(created_at)'} AS period,
                    COUNT(*) AS total,
                    SUM(CASE WHEN change_type='add' THEN 1 ELSE 0 END) AS add_count,
                    SUM(CASE WHEN change_type='update' THEN 1 ELSE 0 END) AS update_count,
                    SUM(CASE WHEN change_type='delete' THEN 1 ELSE 0 END) AS delete_count,
                    SUM(CASE WHEN change_type='align' THEN 1 ELSE 0 END) AS align_count,
                    SUM(CASE WHEN change_type='misalign' THEN 1 ELSE 0 END) AS misalign_count
             FROM dg_req_changes ${where}
             GROUP BY ${truncMap[groupBy] || 'DATE(created_at)'}
             ORDER BY period DESC LIMIT 90`;

    return db.query(sql, params);
  },

  /**
   * 仓库/分支维度对比：两个分支的变更对比
   */
  async compareBranch({ repoUrl, branchA, branchB, dateFrom, dateTo }) {
    const sql = `
      SELECT req_id, req_title, req_type,
             change_type,
             MAX(CASE WHEN branch=? THEN created_at ELSE NULL END) AS date_a,
             MAX(CASE WHEN branch=? THEN created_at ELSE NULL END) AS date_b,
             MAX(CASE WHEN branch=? THEN diff_summary ELSE NULL END) AS diff_a,
             MAX(CASE WHEN branch=? THEN diff_summary ELSE NULL END) AS diff_b
      FROM dg_req_changes
      WHERE repo_url=?
        AND branch IN (?,?)
        AND (? IS NULL OR created_at >= ?)
        AND (? IS NULL OR created_at <= ?)
      GROUP BY req_id, req_title, req_type, change_type
      ORDER BY req_id`;

    const rows = await db.query(sql, [
      branchA, branchB, branchA, branchB,
      repoUrl, branchA, branchB,
      dateFrom || null, dateFrom || null,
      dateTo   || null, dateTo   || null,
    ]);
    return rows;
  },

  /**
   * 按模块统计变更分布
   */
  async byModule(filters = {}) {
    const { projectId, repoUrl, dateFrom, dateTo } = filters;
    let sql = `SELECT module,
                      COUNT(*) AS total,
                      SUM(CASE WHEN change_type='add' THEN 1 ELSE 0 END) AS adds,
                      SUM(CASE WHEN change_type='update' THEN 1 ELSE 0 END) AS updates,
                      SUM(CASE WHEN change_type='align' THEN 1 ELSE 0 END) AS aligns,
                      SUM(CASE WHEN change_type='misalign' THEN 1 ELSE 0 END) AS misaligns
               FROM dg_req_changes WHERE 1=1`;
    const params = [];
    if (projectId) { sql += ' AND project_id=?'; params.push(projectId); }
    if (repoUrl)   { sql += ' AND repo_url=?'; params.push(repoUrl); }
    if (dateFrom)  { sql += ' AND created_at>=?'; params.push(dateFrom); }
    if (dateTo)    { sql += ' AND created_at<=?'; params.push(dateTo); }
    sql += ' GROUP BY module ORDER BY total DESC';
    return db.query(sql, params);
  },
};

// ─── 5. 全局配置 ───────────────────────────────────────────────────────────────

const ConfigStore = {
  async get(key) {
    const r = await db.queryOne('SELECT cfg_value FROM dg_configs WHERE cfg_key=?', [key]);
    if (!r) return null;
    try { return JSON.parse(r.cfg_value); } catch { return r.cfg_value; }
  },

  async set(key, value) {
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    await db.execute(
      `INSERT INTO dg_configs (cfg_key, cfg_value, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE cfg_value=VALUES(cfg_value), updated_at=NOW()`,
      [key, v]
    );
    return value;
  },

  async getAll() {
    const rows = await db.query('SELECT * FROM dg_configs');
    const obj = {};
    for (const r of rows) {
      try { obj[r.cfg_key] = JSON.parse(r.cfg_value); }
      catch { obj[r.cfg_key] = r.cfg_value; }
    }
    return obj;
  },
};

// ─── 6. Webhook 日志 ──────────────────────────────────────────────────────────

const WebhookStore = {
  async create(data) {
    const id = data.id || uuid();
    await db.execute(
      `INSERT INTO dg_webhooks (id,project_id,platform,event_type,payload,status,created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [id, data.projectId||null, data.platform||'github',
       data.eventType||null, JSON.stringify(data.payload||{}), data.status||'received', now()]
    );
    return { id, ...data };
  },

  async list(projectId, limit = 50) {
    if (projectId) {
      return db.query(
        'SELECT * FROM dg_webhooks WHERE project_id=? ORDER BY created_at DESC LIMIT ?',
        [projectId, parseInt(limit, 10)]
      );
    }
    return db.query('SELECT * FROM dg_webhooks ORDER BY created_at DESC LIMIT ?', [parseInt(limit, 10)]);
  },

  async updateStatus(id, status, errorMsg) {
    await db.execute(
      'UPDATE dg_webhooks SET status=?, error_msg=? WHERE id=?',
      [status, errorMsg||null, id]
    );
  },
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function parseJSON(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return v; }
}

module.exports = {
  ProjectStore,
  BaselineStore,
  AnalysisStore,
  ReqChangeStore,
  ConfigStore,
  WebhookStore,
};
