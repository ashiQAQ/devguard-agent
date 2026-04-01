PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE requirement_docs (
	id VARCHAR(36) NOT NULL, 
	doc_id VARCHAR(50) NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	description TEXT, 
	content TEXT NOT NULL, 
	format VARCHAR(20), 
	version VARCHAR(20), 
	doc_type VARCHAR(30), 
	project VARCHAR(100), 
	module VARCHAR(100), 
	status VARCHAR(20), 
	req_count INTEGER, 
	feature_count INTEGER, 
	last_parsed_at DATETIME, 
	author VARCHAR(100), 
	reviewer VARCHAR(100), 
	approved_by VARCHAR(100), 
	approved_at DATETIME, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id)
);
INSERT INTO requirement_docs VALUES('a3ba5509-90a0-4a06-b814-d286e6444fb5','DOC-2026-001','L3自动驾驶系统需求规范 v2.1','支持高速公路场景的L3级别自动驾驶系统完整需求规范',replace('# L3自动驾驶系统需求规范\n\n## 1. 系统概述\n\n### 1.1 系统范围\n\n本规范定义了支持高速公路场景的L3级别自动驾驶系统的软件需求。\n\n## 2. 功能需求\n\n**BR-2025-001**: 系统应能在0-130km/h范围内自动维持设定车速\n**BR-2025-002**: 系统应能自动跟随前车\n\n## 3. 性能需求\n\n**PR-2025-001**: 目标检测延迟 ≤ 100ms\n\n\n\n\n\n## 4.新需求1111111','\n',char(10)),'markdown','1.0.0','SRS','','','archived',0,0,NULL,'自动驾驶架构组',NULL,NULL,NULL,'2026-04-01 03:23:09.363108','2026-04-01 03:49:39.857661');
INSERT INTO requirement_docs VALUES('425ff084-68f8-4c50-82ea-1a27d2f17ec4','DOC-2026-002','高亮测试文档','',replace('# 测试文档\n\n## 原有内容\n\n这是原有的内容行。\n\n**BR-001**: 原有需求\n\n## 新增需求（会高亮显示）\n\n**BR-2026-NEW-001**: 系统应在检测到障碍物时自动制动\n**BR-2026-NEW-002**: 制动距离应小于50米\n**BR-2026-NEW-003**: 系统响应时间应小于100ms\n\n### 性能要求\n\n**PR-2026-NEW-001**: 目标检测延迟 ≤ 50ms\n**PR-2026-NEW-002**: 系统可用性 ≥ 99.99%\n','\n',char(10)),'markdown','1.0.0','PRD','','','draft',0,0,NULL,'测试',NULL,NULL,NULL,'2026-04-01 03:31:53.809546','2026-04-01 03:32:18.438790');
INSERT INTO requirement_docs VALUES('b06a8fcc-5ad1-4bf3-be58-464091072597','DOC-2026-003','高亮功能测试','',replace('# 测试文档\n\n## 原有内容\n\n这是原有的内容，不会高亮。\n\n**BR-001**: 原有需求','\n',char(10)),'markdown','1.0.0','PRD','','','draft',0,0,NULL,'测试用户',NULL,NULL,NULL,'2026-04-01 03:36:04.323212','2026-04-01 03:36:04.323212');
CREATE TABLE pull_requests (
	id VARCHAR(36) NOT NULL, 
	pr_number INTEGER NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	description TEXT, 
	author VARCHAR(100), 
	branch VARCHAR(255), 
	changed_files INTEGER, 
	additions INTEGER, 
	deletions INTEGER, 
	can_merge BOOLEAN, 
	analysis_result JSON, 
	created_at DATETIME, 
	analyzed_at DATETIME, 
	PRIMARY KEY (id)
);
CREATE TABLE simulations (
	id VARCHAR(36) NOT NULL, 
	requirement_id VARCHAR(36) NOT NULL, 
	scenario_path VARCHAR(255), 
	playback_speed FLOAT, 
	duration_sec INTEGER, 
	status VARCHAR(20), 
	passed BOOLEAN, 
	results JSON, 
	report JSON, 
	created_at DATETIME, 
	started_at DATETIME, 
	completed_at DATETIME, 
	PRIMARY KEY (id)
);
CREATE TABLE baselines (
	id VARCHAR(36) NOT NULL, 
	baseline_id VARCHAR(50) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	version VARCHAR(20), 
	language VARCHAR(20), 
	schema JSON, 
	is_active BOOLEAN, 
	parent_id VARCHAR(36), 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id)
);
CREATE TABLE requirements (
	id VARCHAR(36) NOT NULL, 
	req_id VARCHAR(50) NOT NULL, 
	doc_id VARCHAR(36), 
	seq_no INTEGER, 
	title VARCHAR(255) NOT NULL, 
	description TEXT, 
	content TEXT, 
	req_type VARCHAR(20), 
	priority VARCHAR(10), 
	module VARCHAR(100), 
	asil VARCHAR(10), 
	symbolic_conditions JSON, 
	status VARCHAR(20), 
	source VARCHAR(20), 
	created_at DATETIME, 
	updated_at DATETIME, 
	confirmed_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(doc_id) REFERENCES requirement_docs (id)
);
INSERT INTO requirements VALUES('1cbc8e83-5acc-474d-9723-a566299851d4','PR-2026-001',NULL,0,'紧急制动响应时间','系统检测到障碍物后应在100ms内完成制动决策','系统检测到障碍物后应在100ms内完成制动决策','PR','P0','','D',NULL,'pending','manual','2026-04-01 03:23:09.390196','2026-04-01 03:23:09.390196',NULL);
CREATE TABLE commits (
	id VARCHAR(36) NOT NULL, 
	pr_id VARCHAR(36) NOT NULL, 
	sha VARCHAR(40) NOT NULL, 
	message TEXT NOT NULL, 
	author VARCHAR(100), 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(pr_id) REFERENCES pull_requests (id)
);
CREATE TABLE features (
	id VARCHAR(36) NOT NULL, 
	requirement_id VARCHAR(36) NOT NULL, 
	feature_id VARCHAR(50) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	description TEXT, 
	feature_type VARCHAR(20), 
	phase VARCHAR(30), 
	priority VARCHAR(10), 
	asil_implication VARCHAR(10), 
	estimated_complexity VARCHAR(10), 
	keywords JSON, 
	acceptance_criteria JSON, 
	constraints JSON, 
	related_modules JSON, 
	dependencies JSON, 
	aligned_module VARCHAR(100), 
	alignment_score FLOAT, 
	alignment_type VARCHAR(20), 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(requirement_id) REFERENCES requirements (id)
);
CREATE TABLE analyses (
	id VARCHAR(36) NOT NULL, 
	requirement_id VARCHAR(36) NOT NULL, 
	analysis_type VARCHAR(20), 
	status VARCHAR(20), 
	result JSON, 
	created_at DATETIME, 
	completed_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(requirement_id) REFERENCES requirements (id)
);
CREATE TABLE commit_validations (
	id VARCHAR(36) NOT NULL, 
	pr_id VARCHAR(36) NOT NULL, 
	commit_id VARCHAR(36) NOT NULL, 
	status VARCHAR(20), 
	semantic_match_score FLOAT, 
	matched_keywords JSON, 
	missing_keywords JSON, 
	suggestion TEXT, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(pr_id) REFERENCES pull_requests (id), 
	FOREIGN KEY(commit_id) REFERENCES commits (id)
);
CREATE TABLE confirmations (
	id VARCHAR(36) NOT NULL, 
	requirement_id VARCHAR(36) NOT NULL, 
	owner VARCHAR(100) NOT NULL, 
	status VARCHAR(20), 
	comment TEXT, 
	created_at DATETIME, 
	confirmed_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(requirement_id) REFERENCES requirements (id)
);
CREATE UNIQUE INDEX ix_requirement_docs_doc_id ON requirement_docs (doc_id);
CREATE UNIQUE INDEX ix_pull_requests_pr_number ON pull_requests (pr_number);
CREATE INDEX ix_simulations_requirement_id ON simulations (requirement_id);
CREATE UNIQUE INDEX ix_baselines_baseline_id ON baselines (baseline_id);
CREATE INDEX ix_requirements_doc_id ON requirements (doc_id);
CREATE UNIQUE INDEX ix_requirements_req_id ON requirements (req_id);
CREATE UNIQUE INDEX ix_commits_sha ON commits (sha);
COMMIT;
