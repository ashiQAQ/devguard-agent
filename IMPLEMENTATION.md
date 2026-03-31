# DevGuard Agent 实现指南

## 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone https://github.com/your-org/devguard-agent.git
cd devguard-agent

# 初始化（安装依赖 + 编译 C++）
make init

# 或分步初始化
make install      # 安装 Python 依赖
make cpp-build    # 编译 C++ 模块
```

### 2. 配置

```bash
# 复制配置模板
cp backend/python/.env.example backend/python/.env

# 编辑配置
vim backend/python/.env

# 关键配置项:
# - DATABASE_URL: PostgreSQL 连接字符串
# - GITHUB_TOKEN: GitHub API Token
# - OPENAI_API_KEY: OpenAI API Key
# - CPP_ENGINE_HOST/PORT: C++ 引擎地址
```

### 3. 启动服务

```bash
# 开发模式（热重载）
make dev

# 或手动启动
cd backend/python
python -m devguard.main --reload --init-db

# API 文档: http://localhost:8000/docs
```

## 项目结构

```
backend/
├── cpp/                    # C++ 高性能模块
│   ├── CMakeLists.txt
│   ├── src/
│   │   ├── feature_aligner/
│   │   │   ├── aligner.h
│   │   │   └── aligner.cc
│   │   ├── code_scanner/
│   │   ├── adcu_simulator/
│   │   ├── data_playback/
│   │   ├── perf_collector/
│   │   │   ├── collector.h
│   │   │   └── collector.cc
│   │   └── baseline_db/
│   ├── include/devguard/
│   └── tests/
│
├── python/                 # Python 业务逻辑
│   ├── requirements.txt
│   ├── .env.example
│   ├── devguard/
│   │   ├── main.py         # 启动脚本
│   │   ├── config.py       # 配置管理
│   │   ├── api/
│   │   │   ├── app.py      # FastAPI 应用
│   │   │   └── routes/
│   │   │       ├── requirements.py
│   │   │       ├── analysis.py
│   │   │       ├── simulation.py
│   │   │       └── baselines.py
│   │   ├── webhook/
│   │   │   └── github_handler.py
│   │   ├── analysis/
│   │   │   └── req_parser.py
│   │   ├── flows/
│   │   │   ├── flow_a.py
│   │   │   └── flow_b.py
│   │   ├── simulation/
│   │   │   └── orchestrator.py
│   │   ├── database/
│   │   │   ├── models.py   # SQLAlchemy 模型
│   │   │   └── session.py  # 数据库会话
│   │   ├── notification/
│   │   └── utils/
│   └── tests/
│
└── docker/
    ├── Dockerfile.python
    ├── Dockerfile.cpp
    └── docker-compose.yml
```

## 数据库

### 初始化

```bash
# 自动初始化（启动时）
python -m devguard.main --init-db

# 或手动初始化
python -c "from devguard.database.session import init_db; init_db()"
```

### 表结构

- **requirements** - 需求记录
- **features** - 功能点
- **analysis** - 分析记录
- **pull_requests** - PR 记录
- **commits** - Commit 记录
- **commit_validations** - Commit 校验结果
- **confirmations** - 需求负责人确认
- **simulations** - 仿真验证记录
- **baselines** - 架构基线
- **analysis_history** - 分析历史

## API 端点

### 需求管理

```bash
# 分析需求
POST /api/requirements/analyze
{
  "id": "REQ-2025-Q1-XXX",
  "title": "需求标题",
  "content": "需求内容",
  "format": "markdown"
}

# 仅解析需求
POST /api/requirements/parse

# 列出需求
GET /api/requirements/list

# 获取需求详情
GET /api/requirements/{requirement_id}

# 更新需求
PUT /api/requirements/{requirement_id}

# 删除需求
DELETE /api/requirements/{requirement_id}

# 获取需求状态
GET /api/requirements/{requirement_id}/status

# 确认需求
POST /api/requirements/{requirement_id}/confirm

# 驳回需求
POST /api/requirements/{requirement_id}/reject
```

### PR 分析

```bash
# 分析 PR
POST /api/analysis/pr
{
  "number": 9152,
  "title": "PR 标题",
  "commits": [...],
  "changed_files": 2,
  "additions": 73,
  "deletions": 20
}

# 获取 PR 分析结果
GET /api/analysis/pr/{pr_number}

# 确认 PR 分析
POST /api/analysis/pr/{pr_number}/confirm
{
  "owner": "张三",
  "status": "APPROVE"
}
```

### 仿真验证

```bash
# 运行仿真
POST /api/simulation/run
{
  "requirement_id": "REQ-2025-Q1-XXX",
  "scenario_path": "/data/scenarios/rain_heavy.bag",
  "duration_sec": 60,
  "requirements": [...]
}

# 获取仿真状态
GET /api/simulation/status/{simulation_id}

# 获取仿真结果
GET /api/simulation/results/{simulation_id}

# 确认仿真结果
POST /api/simulation/results/{simulation_id}/confirm
{
  "owner": "李四",
  "accept_deviation": true
}
```

### 基线管理

```bash
# 创建基线
POST /api/baselines/create

# 列出基线
GET /api/baselines/list

# 获取基线详情
GET /api/baselines/{baseline_id}

# 更新基线
PUT /api/baselines/{baseline_id}

# 删除基线
DELETE /api/baselines/{baseline_id}

# 获取基线版本历史
GET /api/baselines/{baseline_id}/versions

# 回滚基线
POST /api/baselines/{baseline_id}/rollback
```

## GitHub Webhook

### 配置

1. 在 GitHub 仓库设置中添加 Webhook
2. Payload URL: `https://your-domain/api/webhook/github/webhook`
3. Content type: `application/json`
4. Secret: 设置一个密钥（在 .env 中配置）
5. Events: 选择 `Pull requests` 和 `Pushes`

### 处理流程

```
GitHub Webhook
    ↓
github_handler.py
    ↓
验证签名
    ↓
获取 PR 详情 + Commits
    ↓
Flow B 分析
    ↓
在 PR 下发评论
```

## 开发工作流

### 添加新的 API 端点

1. 在 `devguard/api/routes/` 中创建新的路由文件
2. 定义 Pydantic 模型和路由函数
3. 在 `devguard/api/app.py` 中注册路由

```python
# devguard/api/routes/my_feature.py
from fastapi import APIRouter

router = APIRouter()

@router.get("/my-endpoint")
async def my_endpoint():
    return {"status": "ok"}

# devguard/api/app.py
from devguard.api.routes import my_feature
app.include_router(my_feature.router, prefix="/api/my-feature")
```

### 添加新的数据库模型

1. 在 `devguard/database/models.py` 中定义模型
2. 运行迁移（使用 Alembic）

```python
# devguard/database/models.py
class MyModel(Base):
    __tablename__ = "my_models"
    
    id = Column(String(36), primary_key=True)
    name = Column(String(255))
```

### 添加新的 Flow

1. 在 `devguard/flows/` 中创建新的 Flow 类
2. 实现 `execute()` 方法
3. 在 API 路由中调用

```python
# devguard/flows/flow_c.py
class FlowC:
    async def execute(self, data):
        # 实现流程
        pass
```

## 测试

### 运行测试

```bash
# 运行所有测试
make test

# 运行特定测试
pytest backend/python/tests/test_req_parser.py -v

# 生成覆盖率报告
pytest backend/python/tests/ --cov=devguard --cov-report=html
```

### 编写测试

```python
# backend/python/tests/test_my_feature.py
import pytest
from devguard.flows.flow_a import FlowA

@pytest.mark.asyncio
async def test_flow_a():
    flow_a = FlowA()
    result = await flow_a.execute("REQ-001", "# 需求", "markdown")
    assert result["status"] == "success"
```

## 部署

### Docker 部署

```bash
# 构建镜像
make docker-build

# 启动容器
make docker-up

# 查看日志
make docker-logs

# 停止容器
make docker-down
```

### Kubernetes 部署

```bash
# 创建 Namespace
kubectl create namespace devguard

# 部署应用
kubectl apply -f k8s/deployment.yaml -n devguard

# 查看状态
kubectl get pods -n devguard
```

## 监控与日志

### 日志

```bash
# 查看日志
tail -f logs/devguard.log

# 日志级别
LOG_LEVEL=DEBUG  # 调试
LOG_LEVEL=INFO   # 信息
LOG_LEVEL=WARNING # 警告
LOG_LEVEL=ERROR  # 错误
```

### 性能监控

```bash
# Python 性能分析
python -m cProfile -s cumulative -m devguard.api.app

# C++ 性能分析
perf record ./devguard-cpp-server
perf report
```

## 常见问题

### Q: 如何连接到 PostgreSQL？

A: 在 `.env` 中配置 `DATABASE_URL`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/devguard
```

### Q: 如何配置 GitHub Webhook？

A: 
1. 在 GitHub 仓库设置中添加 Webhook
2. Payload URL: `https://your-domain/api/webhook/github/webhook`
3. 在 `.env` 中配置 `GITHUB_TOKEN` 和 `GITHUB_WEBHOOK_SECRET`

### Q: 如何调试 Flow B？

A: 
1. 在 `flow_b.py` 中添加日志
2. 运行 `make dev` 启动开发服务器
3. 发送 PR 事件到 Webhook 端点

### Q: 如何扩展仿真场景？

A: 
1. 在 `/data/scenarios/` 目录下添加新的 ROS Bag 文件
2. 在 API 中指定 `scenario_path`

## 下一步

1. **前端开发** - 实现 Web UI (Vue/React)
2. **集成测试** - 端到端流程测试
3. **性能优化** - 基准测试和优化
4. **部署上线** - Kubernetes 编排
5. **功能扩展** - 支持更多平台和功能

---

**版本**: v2.4.0  
**最后更新**: 2026-03-30
