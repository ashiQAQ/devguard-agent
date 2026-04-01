-- ============================================================
-- DevGuard Agent 数据库初始化脚本
-- 数据库: PostgreSQL
-- 版本: 2.4.0
-- 创建时间: 2026-04-01
-- ============================================================

-- 创建数据库（如不存在）
-- CREATE DATABASE devguard;

-- 连接数据库后执行以下脚本
-- \c devguard;

-- ============================================================
-- 需求文档表（主体）
-- ============================================================
CREATE TABLE IF NOT EXISTS requirement_docs (
    id VARCHAR(36) PRIMARY KEY,
    doc_id VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- 文档内容
    content TEXT NOT NULL DEFAULT '',
    format VARCHAR(20) DEFAULT 'markdown',
    version VARCHAR(20) DEFAULT '1.0.0',
    
    -- 分类
    doc_type VARCHAR(30) DEFAULT 'PRD',
    project VARCHAR(100),
    module VARCHAR(100),
    
    -- 状态
    status VARCHAR(20) DEFAULT 'draft',
    
    -- 统计
    req_count INTEGER DEFAULT 0,
    feature_count INTEGER DEFAULT 0,
    last_parsed_at TIMESTAMP,
    
    -- 作者/审核
    author VARCHAR(100),
    reviewer VARCHAR(100),
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_docs_doc_id ON requirement_docs(doc_id);
CREATE INDEX IF NOT EXISTS idx_docs_status ON requirement_docs(status);
CREATE INDEX IF NOT EXISTS idx_docs_type ON requirement_docs(doc_type);
CREATE INDEX IF NOT EXISTS idx_docs_created ON requirement_docs(created_at DESC);


-- ============================================================
-- 需求条目表（文档子集）
-- ============================================================
CREATE TABLE IF NOT EXISTS requirements (
    id VARCHAR(36) PRIMARY KEY,
    req_id VARCHAR(50) UNIQUE NOT NULL,
    
    -- 归属文档
    doc_id VARCHAR(36) REFERENCES requirement_docs(id) ON DELETE SET NULL,
    seq_no INTEGER DEFAULT 0,
    
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
    symbolic_conditions JSONB,
    
    -- 状态
    status VARCHAR(20) DEFAULT 'pending',
    
    -- 来源
    source VARCHAR(20) DEFAULT 'manual',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reqs_req_id ON requirements(req_id);
CREATE INDEX IF NOT EXISTS idx_reqs_doc_id ON requirements(doc_id);
CREATE INDEX IF NOT EXISTS idx_reqs_status ON requirements(status);
CREATE INDEX IF NOT EXISTS idx_reqs_priority ON requirements(priority);
CREATE INDEX IF NOT EXISTS idx_reqs_created ON requirements(created_at DESC);


-- ============================================================
-- 功能点表（需求子集）
-- ============================================================
CREATE TABLE IF NOT EXISTS features (
    id VARCHAR(36) PRIMARY KEY,
    requirement_id VARCHAR(36) NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
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
    keywords JSONB,
    acceptance_criteria JSONB,
    constraints JSONB,
    related_modules JSONB,
    dependencies JSONB,
    
    -- 对齐结果
    aligned_module VARCHAR(100),
    alignment_score REAL,
    alignment_type VARCHAR(20),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(requirement_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_features_req_id ON features(requirement_id);
CREATE INDEX IF NOT EXISTS idx_features_feature_id ON features(feature_id);


-- ============================================================
-- 分析记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS analyses (
    id VARCHAR(36) PRIMARY KEY,
    requirement_id VARCHAR(36) NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    analysis_type VARCHAR(20),
    status VARCHAR(20),
    result JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analyses_req_id ON analyses(requirement_id);


-- ============================================================
-- PR 记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS pull_requests (
    id VARCHAR(36) PRIMARY KEY,
    pr_number INTEGER UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    author VARCHAR(100),
    branch VARCHAR(255),
    changed_files INTEGER,
    additions INTEGER,
    deletions INTEGER,
    can_merge BOOLEAN DEFAULT FALSE,
    analysis_result JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    analyzed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pr_number ON pull_requests(pr_number);
CREATE INDEX IF NOT EXISTS idx_pr_created ON pull_requests(created_at DESC);


-- ============================================================
-- Commit 记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS commits (
    id VARCHAR(36) PRIMARY KEY,
    pr_id VARCHAR(36) NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    sha VARCHAR(40) UNIQUE NOT NULL,
    message TEXT NOT NULL,
    author VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_commits_sha ON commits(sha);
CREATE INDEX IF NOT EXISTS idx_commits_pr_id ON commits(pr_id);


-- ============================================================
-- Commit 校验结果表
-- ============================================================
CREATE TABLE IF NOT EXISTS commit_validations (
    id VARCHAR(36) PRIMARY KEY,
    pr_id VARCHAR(36) NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    commit_id VARCHAR(36) NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
    status VARCHAR(20),
    semantic_match_score REAL,
    matched_keywords JSONB,
    missing_keywords JSONB,
    suggestion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 需求确认表
-- ============================================================
CREATE TABLE IF NOT EXISTS confirmations (
    id VARCHAR(36) PRIMARY KEY,
    requirement_id VARCHAR(36) NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    owner VARCHAR(100) NOT NULL,
    status VARCHAR(20),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_confirmations_req_id ON confirmations(requirement_id);


-- ============================================================
-- 仿真记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS simulations (
    id VARCHAR(36) PRIMARY KEY,
    requirement_id VARCHAR(36) NOT NULL,
    scenario_path VARCHAR(255),
    playback_speed REAL DEFAULT 1.0,
    duration_sec INTEGER,
    status VARCHAR(20),
    passed BOOLEAN,
    results JSONB,
    report JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_simulations_req_id ON simulations(requirement_id);
CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(status);


-- ============================================================
-- 架构基线表
-- ============================================================
CREATE TABLE IF NOT EXISTS baselines (
    id VARCHAR(36) PRIMARY KEY,
    baseline_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0.0',
    language VARCHAR(20) DEFAULT 'cpp',
    schema JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    parent_id VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_baselines_id ON baselines(baseline_id);
CREATE INDEX IF NOT EXISTS idx_baselines_active ON baselines(is_active);


-- ============================================================
-- 初始化数据
-- ============================================================

-- 插入测试文档
INSERT INTO requirement_docs (id, doc_id, title, description, content, doc_type, status, author, created_at, updated_at)
VALUES 
    (gen_random_uuid(), 'DOC-2026-001', 'L3自动驾驶系统需求规范 v2.1', 
     '支持高速公路场景的L3级别自动驾驶系统完整需求规范，已通过ISO 26262 ASIL-B认证审核',
     '# L3自动驾驶系统需求规范

**文档编号**: SRS-AUTO-2025-v2.1
**版本**: v2.1
**状态**: 已归档
**作者**: 自动驾驶架构组

---

## 1. 系统概述

### 1.1 系统范围

本规范定义了支持高速公路场景的L3级别自动驾驶系统的软件需求。系统需满足SAE J3016定义的L3级别要求。

### 1.2 运行设计域 (ODD)

- 道路类型: 结构化高速公路
- 速度范围: 0-130 km/h
- 天气条件: 晴、阴、小雨

## 2. 功能需求

### 2.1 自动巡航控制 (ACC)

**BR-2025-001**: 系统应能在0-130km/h范围内自动维持设定车速
**BR-2025-002**: 系统应能自动跟随前车，保持安全跟车距离

### 2.2 车道保持辅助 (LKA)

**BR-2025-004**: 系统应能识别车道线并自动保持在车道中央行驶

## 3. 性能需求

**PR-2025-001**: 目标检测延迟 ≤ 100ms
**PR-2025-002**: 控制指令响应时间 ≤ 50ms

## 4. 安全需求

**SR-2025-001**: 系统应满足ISO 26262 ASIL-B安全完整性等级
**SR-2025-002**: 系统应在传感器故障时5秒内完成最小风险状态转换
', 'SRS', 'archived', '自动驾驶架构组', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    (gen_random_uuid(), 'DOC-2026-002', '感知系统接口需求规范 v1.3', 
     '定义感知系统与规划控制模块之间的数据接口规范',
     '# 感知系统接口需求规范

**文档编号**: ICD-PERC-2025-v1.3
**版本**: v1.3

## 1. 接口概述

本文档定义感知系统输出的标准数据格式，供规划控制模块消费。

## 2. 目标检测接口

**IR-2025-001**: 感知系统应以10Hz频率输出目标列表
**IR-2025-002**: 每个目标应包含：位置、速度、类别、置信度

## 3. 车道线接口

**IR-2025-004**: 车道线数据应以20Hz频率输出
', 'ICD', 'archived', '感知算法组', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    (gen_random_uuid(), 'DOC-2026-003', '域控制器软件架构设计 v0.9', 
     '域控制器软件架构高层设计文档，草稿阶段',
     '# 域控制器软件架构设计

**文档编号**: HLD-DCU-2025-v0.9
**版本**: v0.9（草稿）

## 1. 架构概述

域控制器采用分层架构：硬件抽象层 → 中间件层 → 应用层。

## 2. 软件分层

### 2.1 硬件抽象层 (HAL)
- 传感器驱动：Camera/LiDAR/Radar/IMU

### 2.2 中间件层
- 通信框架：基于DDS的发布订阅模式
', 'HLD', 'draft', '系统架构组', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (doc_id) DO NOTHING;


-- ============================================================
-- 验证查询
-- ============================================================

-- 查看所有表
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- 查看文档数量
-- SELECT COUNT(*) FROM requirement_docs;

-- 查看需求数量
-- SELECT COUNT(*) FROM requirements;
