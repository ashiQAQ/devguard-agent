# DevGuard Agent 启动手册

> AI 驱动的全链路开发质量守护系统，专为自动驾驶等高安全性软件项目设计。

---

## 目录

1. [项目概述](#1-项目概述)
2. [环境要求](#2-环境要求)
3. [目录结构](#3-目录结构)
4. [数据库配置（MySQL）](#4-数据库配置mysql)
5. [后端启动](#5-后端启动)
6. [前端启动](#6-前端启动)
7. [访问地址](#7-访问地址)
8. [功能模块](#8-功能模块)
9. [常见问题](#9-常见问题)

---

## 1. 项目概述

DevGuard Agent 是一套 AI 驱动的开发质量守护系统，核心功能包括：

| 模块 | 说明 |
|------|------|
| 📄 需求文档管理 | 创建/编辑/归档需求文档，支持 Markdown 编辑与预览 |
| 📋 需求条目管理 | 从文档中提取需求条目，支持 AI 自动提取 |
| 🤖 AI 需求分析 | 文档摘要、风险识别、需求提取 |
| 🆕 新增内容高亮 | 保存后自动高亮新增内容，方便 Review |
| 🔍 PR 分析 | 代码提交与需求对齐校验 |
| 🧪 仿真验证 | 需求仿真测试 |
| 📊 仪表盘 | 统计概览与最近文档 |

---

## 2. 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Python | 3.9+ | 后端运行环境 |
| Node.js | 16+ | 前端构建工具 |
| MySQL | 5.7+ / 8.0+ | 数据库 |
| npm | 7+ | 前端包管理 |

---

## 3. 目录结构

```
devguard-agent/
├── backend/
│   └── python/
│       ├── devguard/
│       │   ├── api/
│       │   │   ├── app.py              # FastAPI 主入口
│       │   │   └── routes/
│       │   │       ├── req_docs.py     # 需求文档 API
│       │   │       ├── requirements.py # 需求条目 API
│       │   │       ├── ai_analysis.py  # AI 分析 API
│       │   │       ├── analysis.py     # PR 分析 API
│       │   │       └── simulation.py   # 仿真 API
│       │   ├── database/
│       │   │   ├── models.py           # SQLAlchemy ORM 模型
│       │   │   ├── __init__.py         # 数据库连接管理
│       │   │   └── init.sql            # MySQL 建表脚本
│       │   ├── analysis/
│       │   │   └── ai_analyzer.py      # AI 分析引擎
│       │   └── config.py               # 配置管理
│       ├── .env                        # 环境变量（需自行创建）
│       ├── .env.example                # 环境变量示例
│       ├── requirements.txt            # Python 依赖
│       └── venv/                       # Python 虚拟环境
├── frontend/
│   ├── src/
│   │   ├── views/
│   │   │   ├── Dashboard.vue           # 仪表盘
│   │   │   ├── req-docs/               # 需求文档页面
│   │   │   │   ├── List.vue            # 文档列表
│   │   │   │   ├── Detail.vue          # 文档详情/编辑
│   │   │   │   └── Create.vue          # 创建文档
│   │   │   └── requirements/           # 需求条目页面
│   │   ├── router/index.ts             # 路由配置
│   │   └── api/client.ts               # API 客户端
│   ├── vite.config.ts                  # Vite 配置（含代理）
│   └── package.json
├── data/
│   └── devguard.db                     # SQLite 备用数据库
└── docs/
    ├── STARTUP.md                      # 本文档
    ├── DATABASE.md                     # 数据库配置指南
    └── INIT.md                         # 初始化指南
```

---

## 4. 数据库配置（MySQL）

### 4.1 启动 MySQL

```bash
# macOS（Homebrew）
brew services start mysql

# 验证
mysql -u root -p -e "SELECT 'OK';"
```

### 4.2 创建数据库

```sql
-- 登录 MySQL
mysql -u root -p

-- 创建数据库
CREATE DATABASE devguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 退出
EXIT;
```

### 4.3 导入表结构

```bash
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent

mysql -u root -p devguard < backend/python/devguard/database/init.sql
```

### 4.4 配置 .env

```bash
cd backend/python
cp .env.example .env
```

编辑 `.env`：

```bash
# 数据库（MySQL）
DATABASE_URL=mysql+pymysql://root:你的密码@localhost:3306/devguard?charset=utf8mb4

# AI 配置（无 Key 时自动降级为 Mock）
AI_PROVIDER=mock
AI_API_KEY=
AI_MODEL=gpt-4o

# 日志
LOG_LEVEL=INFO
DEBUG=false
```

### 4.5 验证表结构

```bash
mysql -u root -p devguard -e "SHOW TABLES;"
```

预期输出（11 张表）：

```
analyses
baselines
commit_validations
commits
confirmations
features
pull_requests
requirement_docs
requirements
simulations
```

---

## 5. 后端启动

### 5.1 安装依赖

```bash
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/backend/python

# 创建虚拟环境（首次）
python3.9 -m venv venv

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
pip install pymysql cryptography
```

### 5.2 启动服务

```bash
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/backend/python

# 开发模式（热重载）
./venv/bin/uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000 --reload

# 后台运行
nohup ./venv/bin/uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000 --reload > /tmp/devguard-backend.log 2>&1 &
```

### 5.3 验证后端

```bash
# 检查服务
curl http://localhost:8000/api/req-docs/docs

# 查看 API 文档
open http://localhost:8000/docs
```

---

## 6. 前端启动

### 6.1 安装依赖

```bash
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/frontend

npm install
```

### 6.2 启动服务

```bash
# 开发模式
npm run dev

# 或指定端口
npx vite --port 3000

# 后台运行
nohup npx vite --port 3000 > /tmp/devguard-frontend.log 2>&1 &
```

### 6.3 构建生产版本

```bash
npm run build
```

---

## 7. 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端 | http://localhost:3000 | Web 界面 |
| 后端 API | http://localhost:8000 | REST API |
| API 文档 | http://localhost:8000/docs | Swagger UI |
| 仪表盘 | http://localhost:3000/dashboard | 统计概览 |
| 需求文档 | http://localhost:3000/req-docs | 文档管理 |
| 需求列表 | http://localhost:3000/requirements-list | 需求条目 |

---

## 8. 功能模块

### 8.1 需求文档

| 操作 | 路径 | 说明 |
|------|------|------|
| 文档列表 | `/req-docs` | 查看所有文档 |
| 创建文档 | `/req-docs/create` | 新建文档 |
| 文档详情 | `/req-docs/{doc_id}` | 编辑/预览文档 |

**文档详情页功能：**
- ✏️ 编辑模式 / 📖 预览模式 切换
- 💾 保存（Ctrl+S 快捷键）
- 🆕 保存后自动高亮新增内容（渐变底色 + NEW 徽章）
- 🔍 AI 分析（摘要、风险、需求提取）
- ➕ 新增需求条目（插入到文档）

### 8.2 AI 分析

点击文档详情页「🔍 AI 分析」按钮：

| Tab | 功能 |
|-----|------|
| 📋 文档摘要 | AI 生成概述、关键实体、风险、建议 |
| 📝 需求条目 | AI 从文档中提取独立需求项 |
| 🆕 新增内容 | 显示本次编辑新增的内容 |

### 8.3 API 接口

**需求文档：**

```
POST   /api/req-docs/docs                    创建文档
GET    /api/req-docs/docs                    列出文档
GET    /api/req-docs/docs/{doc_id}           获取文档
PUT    /api/req-docs/docs/{doc_id}           更新文档
DELETE /api/req-docs/docs/{doc_id}           删除文档
POST   /api/req-docs/docs/{doc_id}/save-markdown   保存内容
POST   /api/req-docs/docs/{doc_id}/extract         AI 提取需求
POST   /api/req-docs/docs/{doc_id}/ai-summary      AI 分析摘要
```

**需求条目：**

```
POST   /api/req-docs/requirements            创建需求
GET    /api/req-docs/requirements            列出需求
GET    /api/req-docs/requirements/{req_id}   获取需求
PUT    /api/req-docs/requirements/{req_id}   更新需求
DELETE /api/req-docs/requirements/{req_id}   删除需求
```

---

## 9. 常见问题

### Q: 后端启动报 `ModuleNotFoundError`

```bash
# 确保使用 venv 中的 Python
cd backend/python
./venv/bin/python -c "import fastapi; print('OK')"

# 如果失败，重新安装依赖
./venv/bin/pip install -r requirements.txt
./venv/bin/pip install pymysql cryptography
```

### Q: MySQL 连接失败

```bash
# 检查 MySQL 是否运行
lsof -i :3306

# 启动 MySQL
brew services start mysql

# 测试连接
mysql -u root -p -e "SELECT 1;"
```

### Q: 前端页面空白

```bash
# 检查后端是否运行
curl http://localhost:8000/api/req-docs/docs

# 检查前端代理配置（vite.config.ts）
# proxy: { '/api': { target: 'http://localhost:8000' } }
```

### Q: 文档内容乱码

MySQL 连接字符串需加 `?charset=utf8mb4`：

```
DATABASE_URL=mysql+pymysql://root:密码@localhost:3306/devguard?charset=utf8mb4
```

### Q: AI 分析返回 Mock 数据

无 API Key 时自动降级为 Mock 模式，配置真实 Key：

```bash
# .env
AI_PROVIDER=openai
AI_API_KEY=sk-xxxx
AI_MODEL=gpt-4o
```

---

## 快速启动脚本

```bash
#!/bin/bash
# 一键启动 DevGuard Agent

PROJECT=/Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent

# 启动后端
cd $PROJECT/backend/python
nohup ./venv/bin/uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000 --reload \
  > /tmp/devguard-backend.log 2>&1 &
echo "✅ 后端已启动 (PID: $!)"

# 启动前端
cd $PROJECT/frontend
nohup npx vite --port 3000 > /tmp/devguard-frontend.log 2>&1 &
echo "✅ 前端已启动 (PID: $!)"

sleep 3
echo ""
echo "🌐 访问地址:"
echo "   前端: http://localhost:3000"
echo "   后端: http://localhost:8000/docs"
```

保存为 `start.sh` 并执行：

```bash
chmod +x start.sh
./start.sh
```

---

*文档版本: v2.4.0 | 更新时间: 2026-04-07*
