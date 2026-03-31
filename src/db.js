/**
 * db.js — MySQL 连接池 + 建表 DDL
 * DevGuard Agent v2.1
 *
 * 表清单：
 *   dg_projects          项目配置
 *   dg_baselines         架构基线（含 JSON schema）
 *   dg_analysis_history  每次 PR/需求分析结果
 *   dg_req_changes       需求变更历史（按仓库/分支/日期可查）
 *   dg_configs           全局配置 KV
 *   dg_webhooks          Webhook 事件日志
 */

'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

// ─── 连接池 ──────────────────────────────────────────────────────────────────

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || '127.0.0.1',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'devguard',
  password:           process.env.DB_PASSWORD || 'Abc123456Abc123456',
  database:           process.env.DB_NAME     || 'devguard',
  socketPath:         process.env.DB_SOCKET   || '/tmp/mysql.sock',
  charset:            'utf8mb4',
  timezone:           '+08:00',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 10000,
});

// ─── 建表 DDL ────────────────────────────────────────────────────────────────

const DDL = [
  // 项目配置
  `CREATE TABLE IF NOT EXISTS dg_projects (
    id            VARCHAR(64)  NOT NULL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    type          VARCHAR(20)  NOT NULL DEFAULT 'github',
    url           VARCHAR(512),
    branch        VARCHAR(128) NOT NULL DEFAULT 'main',
    token         TEXT,
    webhook_secret VARCHAR(128),
    language      VARCHAR(20)  NOT NULL DEFAULT 'cpp',
    auto_analyzers JSON,
    enabled       TINYINT(1)   NOT NULL DEFAULT 1,
    baseline_id   VARCHAR(64),
    last_trigger  DATETIME,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_enabled (enabled),
    INDEX idx_url (url(128))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 架构基线
  `CREATE TABLE IF NOT EXISTS dg_baselines (
    id          VARCHAR(64)  NOT NULL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    version     VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
    language    VARCHAR(20)  NOT NULL DEFAULT 'cpp',
    schema_data LONGTEXT,
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    parent_id   VARCHAR(64),
    project_id  VARCHAR(64),
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_project (project_id),
    INDEX idx_active (is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 分析历史（PR 分析、需求分析、代码评审等）
  `CREATE TABLE IF NOT EXISTS dg_analysis_history (
    id              VARCHAR(64)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(64)  NOT NULL,
    repo_url        VARCHAR(512),
    repo_name       VARCHAR(255),
    branch          VARCHAR(128) NOT NULL DEFAULT 'main',
    analysis_type   VARCHAR(30)  NOT NULL COMMENT 'pr_review|req_align|code_review|full_cycle',
    pr_number       INT,
    pr_title        VARCHAR(512),
    pr_author       VARCHAR(128),
    trigger_event   VARCHAR(30)  COMMENT 'pr_create|pr_update|manual|schedule',
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT 'pending|running|done|failed',
    risk_level      VARCHAR(10)  COMMENT 'block|crit|major|minor|pass',
    can_merge       TINYINT(1),
    result_summary  TEXT,
    result_detail   LONGTEXT     COMMENT 'JSON: full AI analysis result',
    baseline_id     VARCHAR(64),
    duration_ms     INT,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME,
    INDEX idx_project_branch (project_id, branch),
    INDEX idx_repo_url (repo_url(128)),
    INDEX idx_created (created_at),
    INDEX idx_pr (project_id, pr_number),
    INDEX idx_type (analysis_type),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 需求变更历史（支持按日期/仓库/分支对比）
  `CREATE TABLE IF NOT EXISTS dg_req_changes (
    id              VARCHAR(64)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(64)  NOT NULL,
    repo_url        VARCHAR(512),
    repo_name       VARCHAR(255),
    branch          VARCHAR(128) NOT NULL DEFAULT 'main',
    req_id          VARCHAR(64),
    req_title       VARCHAR(512),
    req_type        VARCHAR(20)  COMMENT 'BUSINESS|TECHNICAL|SYMBOLIC',
    change_type     VARCHAR(20)  NOT NULL COMMENT 'add|update|delete|align|misalign',
    priority        VARCHAR(10)  DEFAULT 'P1',
    module          VARCHAR(128),
    old_content     LONGTEXT,
    new_content     LONGTEXT,
    diff_summary    TEXT,
    analysis_id     VARCHAR(64)  COMMENT 'FK -> dg_analysis_history.id',
    pr_number       INT,
    commit_sha      VARCHAR(40),
    author          VARCHAR(128),
    risk_level      VARCHAR(10),
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_project_branch (project_id, branch),
    INDEX idx_repo_url (repo_url(128)),
    INDEX idx_created (created_at),
    INDEX idx_req_id (req_id),
    INDEX idx_change_type (change_type),
    INDEX idx_analysis (analysis_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 全局配置 KV（triggers / pipeline / notifications / ai）
  `CREATE TABLE IF NOT EXISTS dg_configs (
    cfg_key     VARCHAR(128) NOT NULL PRIMARY KEY,
    cfg_value   LONGTEXT     NOT NULL,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Webhook 事件日志
  `CREATE TABLE IF NOT EXISTS dg_webhooks (
    id          VARCHAR(64)  NOT NULL PRIMARY KEY,
    project_id  VARCHAR(64),
    platform    VARCHAR(20)  NOT NULL DEFAULT 'github',
    event_type  VARCHAR(50),
    payload     LONGTEXT,
    status      VARCHAR(20)  NOT NULL DEFAULT 'received',
    error_msg   TEXT,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_project (project_id),
    INDEX idx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// ─── 初始化 ──────────────────────────────────────────────────────────────────

let _initialized = false;

async function initDB() {
  if (_initialized) return;
  const conn = await pool.getConnection();
  try {
    for (const ddl of DDL) {
      await conn.execute(ddl);
    }
    _initialized = true;
    console.log('✅ MySQL 数据库表初始化完成');
  } finally {
    conn.release();
  }
}

// ─── 通用查询封装 ─────────────────────────────────────────────────────────────

async function query(sql, params = []) {
  // query() 用隐式类型转换，兼容 MySQL 9 的严格类型检查
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function execute(sql, params = []) {
  // execute() 用于 INSERT/UPDATE/DELETE（写操作，prepared statement 更安全）
  const [result] = await pool.execute(sql, params);
  return result;
}

module.exports = { pool, initDB, query, queryOne, execute };
