# DevGuard Agent 初始化指南

## 项目结构

```
/Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/
├── backend/
│   └── python/
│       ├── devguard/
│       │   ├── api/routes/          # API 路由
│       │   ├── database/            # 数据库模型
│       │   │   ├── models.py        # SQLAlchemy ORM 模型
│       │   │   ├── __init__.py      # 数据库连接管理
│       │   │   └── init.sql         # SQL 初始化脚本
│       │   └── analysis/            # AI 分析引擎
│       ├── .env                     # 环境配置
│       └── venv/                    # Python 虚拟环境 (Python 3.9)
├── frontend/
│   └── src/
│       ├── views/req-docs/          # 需求文档页面
│       ├── views/requirements/      # 需求列表页面
│       └── views/Dashboard.vue      # 仪表盘
└── data/
    └── devguard.db                  # SQLite 数据库文件
```

## 快速启动

### 1. 后端启动

```bash
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/backend/python

# 激活虚拟环境
source venv/bin/activate

# 启动服务
uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000 --reload
```

后端 API 地址: http://localhost:8000

### 2. 前端启动

```bash
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/frontend

# 安装依赖（首次）
npm install

# 启动开发服务器
npm run dev
```

前端地址: http://localhost:3000

## 数据库配置

### SQLite（开发环境，默认）

```bash
# .env 文件
DATABASE_URL=sqlite:////Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/data/devguard.db
```

数据库表会在首次启动时自动创建。

### PostgreSQL（生产环境）

```bash
# .env 文件
DATABASE_URL=postgresql://devguard:devguard@localhost:5432/devguard
```

使用 SQL 初始化脚本：

```bash
# 创建数据库
createdb -U postgres devguard

# 执行初始化脚本
psql -U postgres -d devguard -f backend/python/devguard/database/init.sql
```

## API 端点

### 需求文档

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/req-docs/docs` | 创建文档 |
| GET | `/api/req-docs/docs` | 列出文档 |
| GET | `/api/req-docs/docs/{doc_id}` | 获取文档详情 |
| PUT | `/api/req-docs/docs/{doc_id}` | 更新文档 |
| DELETE | `/api/req-docs/docs/{doc_id}` | 删除文档 |
| POST | `/api/req-docs/docs/{doc_id}/save-markdown` | 保存 Markdown |
| POST | `/api/req-docs/docs/{doc_id}/extract` | AI 提取需求条目 |
| POST | `/api/req-docs/docs/{doc_id}/ai-summary` | AI 分析摘要 |

### 需求条目

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/req-docs/requirements` | 创建需求 |
| GET | `/api/req-docs/requirements` | 列出需求 |
| GET | `/api/req-docs/requirements/{req_id}` | 获取需求详情 |
| PUT | `/api/req-docs/requirements/{req_id}` | 更新需求 |
| DELETE | `/api/req-docs/requirements/{req_id}` | 删除需求 |
| POST | `/api/req-docs/requirements/{req_id}/extract-features` | AI 提取功能点 |

## 数据模型

### RequirementDoc（需求文档）

```python
- id: UUID
- doc_id: str          # DOC-2026-001
- title: str
- description: str
- content: str         # Markdown 内容
- doc_type: str        # PRD / SRS / ICD / HLD
- status: str          # draft / review / approved / archived
- req_count: int       # 关联需求数
- author: str
- created_at: datetime
- updated_at: datetime
```

### Requirement（需求条目）

```python
- id: UUID
- req_id: str          # BR-2026-001
- doc_id: UUID         # 关联文档
- title: str
- description: str
- req_type: str        # BUSINESS / TECHNICAL / PERFORMANCE / INTERFACE
- priority: str        # P0 / P1 / P2
- asil: str            # QM / A / B / C / D
- status: str          # pending / confirmed / in_progress / done
- source: str          # manual / ai_extracted
```

### Feature（功能点）

```python
- id: UUID
- requirement_id: UUID
- feature_id: str
- name: str
- description: str
- priority: str
- asil_implication: str
- keywords: list
```

## 环境变量

```bash
# .env 示例

# 数据库
DATABASE_URL=sqlite:////path/to/devguard.db

# AI 配置
AI_PROVIDER=mock          # openai / azure / local / mock
AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o

# 日志
LOG_LEVEL=INFO
DEBUG=false
```

## 测试命令

```bash
# 创建文档
curl -X POST http://localhost:8000/api/req-docs/docs \
  -H "Content-Type: application/json" \
  -d '{"title":"测试文档","content":"# 测试","doc_type":"PRD"}'

# 查询文档
curl http://localhost:8000/api/req-docs/docs

# 创建需求
curl -X POST http://localhost:8000/api/req-docs/requirements \
  -H "Content-Type: application/json" \
  -d '{"title":"测试需求","description":"描述","req_type":"BR","priority":"P1"}'

# 查询需求
curl http://localhost:8000/api/req-docs/requirements
```
