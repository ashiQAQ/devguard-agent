-- ============================================================
-- DevGuard Agent 数据库初始化脚本
-- 数据库: MySQL
-- 版本: 2.4.0
-- 创建时间: 2026-04-02
-- ============================================================

-- 创建数据库（如不存在）
-- CREATE DATABASE devguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 连接数据库后执行以下脚本
-- USE devguard;

-- ============================================================
-- 需求文档表（主体）
-- ============================================================
CREATE TABLE IF NOT EXISTS requirement_docs (
    id VARCHAR(36) PRIMARY KEY,
    doc_id VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- 文档内容
    content TEXT NOT NULL,
    format VARCHAR(20) DEFAULT 'markdown',
    version VARCHAR(20) DEFAULT '1.0.0',
    
    -- 分类
    doc_type VARCHAR(30) DEFAULT 'PRD',
    project VARCHAR(100),
    module VARCHAR(100),
    
    -- 状态
    status VARCHAR(20) DEFAULT 'draft',
    
    -- 统计
    req_count INT DEFAULT 0,
    feature_count INT DEFAULT 0,
    last_parsed_at DATETIME,
    
    -- 作者/审核
    author VARCHAR(100),
    reviewer VARCHAR(100),
    approved_by VARCHAR(100),
    approved_at DATETIME,
    
    -- 时间戳
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_docs_doc_id (doc_id),
    INDEX idx_docs_status (status),
    INDEX idx_docs_type (doc_type),
    INDEX idx_docs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 需求条目表（文档子集）
-- ============================================================
CREATE TABLE IF NOT EXISTS requirements (
    id VARCHAR(36) PRIMARY KEY,
    req_id VARCHAR(50) UNIQUE NOT NULL,
    
    -- 归属文档
    doc_id VARCHAR(36),
    seq_no INT DEFAULT 0,
    
    -- 基本信息
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT,
    
    -- 分类
    req_type VARCHAR(20),
    priority VARCHAR(10) DEFAULT 'P1',
    module VARCHAR(100),
    asil VARCHAR(10),
    
    -- 符号条件（JSON）
    symbolic_conditions JSON,
    
    -- 状态
    status VARCHAR(20) DEFAULT 'pending',
    
    -- 来源
    source VARCHAR(20) DEFAULT 'manual',
    
    -- 时间戳
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    
    -- 需求链（版本比对）
    prev_req_id VARCHAR(36) DEFAULT NULL,
    next_req_id VARCHAR(36) DEFAULT NULL,
    created_seq INT DEFAULT 0,
    
    FOREIGN KEY (doc_id) REFERENCES requirement_docs(id) ON DELETE SET NULL,
    
    INDEX idx_reqs_req_id (req_id),
    INDEX idx_reqs_doc_id (doc_id),
    INDEX idx_reqs_status (status),
    INDEX idx_reqs_priority (priority),
    INDEX idx_reqs_created (created_at),
    INDEX idx_reqs_created_seq (created_seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 功能点表（需求子集）
-- ============================================================
CREATE TABLE IF NOT EXISTS features (
    id VARCHAR(36) PRIMARY KEY,
    requirement_id VARCHAR(36) NOT NULL,
    feature_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- 分类
    feature_type VARCHAR(20),
    phase VARCHAR(30),
    priority VARCHAR(10) DEFAULT 'P1',
    asil_implication VARCHAR(10),
    estimated_complexity VARCHAR(10) DEFAULT 'MEDIUM',
    
    -- 规格（JSON）
    keywords JSON,
    acceptance_criteria JSON,
    constraints JSON,
    related_modules JSON,
    dependencies JSON,
    
    -- 对齐结果
    aligned_module VARCHAR(100),
    alignment_score FLOAT,
    alignment_type VARCHAR(20),
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE,
    
    UNIQUE KEY uk_req_feature (requirement_id, feature_id),
    INDEX idx_features_req_id (requirement_id),
    INDEX idx_features_feature_id (feature_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 分析记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS analyses (
    id VARCHAR(36) PRIMARY KEY,
    requirement_id VARCHAR(36) NOT NULL,
    analysis_type VARCHAR(20),
    status VARCHAR(20),
    result JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    
    FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE,
    
    INDEX idx_analyses_req_id (requirement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- PR 记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS pull_requests (
    id VARCHAR(36) PRIMARY KEY,
    pr_number INT UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    author VARCHAR(100),
    branch VARCHAR(255),
    changed_files INT,
    additions INT,
    deletions INT,
    can_merge BOOLEAN DEFAULT FALSE,
    analysis_result JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    analyzed_at DATETIME,
    
    INDEX idx_pr_number (pr_number),
    INDEX idx_pr_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- Commit 记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS commits (
    id VARCHAR(36) PRIMARY KEY,
    pr_id VARCHAR(36) NOT NULL,
    sha VARCHAR(40) UNIQUE NOT NULL,
    message TEXT NOT NULL,
    author VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (pr_id) REFERENCES pull_requests(id) ON DELETE CASCADE,
    
    INDEX idx_commits_sha (sha),
    INDEX idx_commits_pr_id (pr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- Commit 校验结果表
-- ============================================================
CREATE TABLE IF NOT EXISTS commit_validations (
    id VARCHAR(36) PRIMARY KEY,
    pr_id VARCHAR(36) NOT NULL,
    commit_id VARCHAR(36) NOT NULL,
    status VARCHAR(20),
    semantic_match_score FLOAT,
    matched_keywords JSON,
    missing_keywords JSON,
    suggestion TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (pr_id) REFERENCES pull_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (commit_id) REFERENCES commits(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 需求确认表
-- ============================================================
CREATE TABLE IF NOT EXISTS confirmations (
    id VARCHAR(36) PRIMARY KEY,
    requirement_id VARCHAR(36) NOT NULL,
    owner VARCHAR(100) NOT NULL,
    status VARCHAR(20),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    
    FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE,
    
    INDEX idx_confirmations_req_id (requirement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 仿真记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS simulations (
    id VARCHAR(36) PRIMARY KEY,
    requirement_id VARCHAR(36) NOT NULL,
    scenario_path VARCHAR(255),
    playback_speed FLOAT DEFAULT 1.0,
    duration_sec INT,
    status VARCHAR(20),
    passed BOOLEAN,
    results JSON,
    report JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    
    INDEX idx_simulations_req_id (requirement_id),
    INDEX idx_simulations_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 架构基线表
-- ============================================================
CREATE TABLE IF NOT EXISTS baselines (
    id VARCHAR(36) PRIMARY KEY,
    baseline_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0.0',
    language VARCHAR(20) DEFAULT 'cpp',
    schema JSON,
    is_active BOOLEAN DEFAULT TRUE,
    parent_id VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_baselines_id (baseline_id),
    INDEX idx_baselines_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 测试数据
-- ============================================================

INSERT INTO requirement_docs (id, doc_id, title, description, content, doc_type, status, author, created_at, updated_at)
VALUES 
    (UUID(), 'DOC-2026-001', 'L3自动驾驶系统需求规范 v2.1', 
     '支持高速公路场景的L3级别自动驾驶系统完整需求规范，已通过ISO 26262 ASIL-B认证审核',
     '# L3自动驾驶系统需求规范

**文档编号**: SRS-AUTO-2025-v2.1
**版本**: v2.1
**状态**: 已归档
**作者**: 自动驾驶架构组

---

## 1. 系统概述

### 1.1 系统范围

本规范定义了支持高速公路场景的L3级别自动驾驶系统的软件需求。

## 2. 功能需求

**BR-2025-001**: 系统应能在0-130km/h范围内自动维持设定车速
**BR-2025-002**: 系统应能自动跟随前车，保持安全跟车距离

## 3. 性能需求

**PR-2025-001**: 目标检测延迟 ≤ 100ms
**PR-2025-002**: 控制指令响应时间 ≤ 50ms

## 4. 安全需求

**SR-2025-001**: 系统应满足ISO 26262 ASIL-B安全完整性等级
', 'SRS', 'archived', '自动驾驶架构组', NOW(), NOW()),

    (UUID(), 'DOC-2026-002', '感知系统接口需求规范 v1.3', 
     '定义感知系统与规划控制模块之间的数据接口规范',
     '# 感知系统接口需求规范

## 1. 接口概述

本文档定义感知系统输出的标准数据格式，供规划控制模块消费。

## 2. 目标检测接口

**IR-2025-001**: 感知系统应以10Hz频率输出目标列表
**IR-2025-002**: 每个目标应包含：位置、速度、类别、置信度
', 'ICD', 'archived', '感知算法组', NOW(), NOW()),

    (UUID(), 'DOC-2026-003', '域控制器软件架构设计 v0.9', 
     '域控制器软件架构高层设计文档，草稿阶段',
     '# 域控制器软件架构设计

## 1. 架构概述

域控制器采用分层架构：硬件抽象层 → 中间件层 → 应用层。

## 2. 软件分层

### 2.1 硬件抽象层 (HAL)
- 传感器驱动：Camera/LiDAR/Radar/IMU
', 'HLD', 'draft', '系统架构组', NOW(), NOW())
ON DUPLICATE KEY UPDATE title=title;