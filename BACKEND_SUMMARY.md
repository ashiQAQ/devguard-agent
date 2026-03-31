# DevGuard Agent 后端架构总结

## 🏗️ 架构概览

DevGuard Agent 采用 **C++ + Python 混合架构**，充分发挥两种语言的优势：

```
┌─────────────────────────────────────────────────────────────────┐
│                    DevGuard Agent 后端架构                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  前端 (Vue/React)                                               │
│         │ HTTP/WebSocket                                        │
│         ▼                                                        │
│  API 网关 (Python FastAPI)                                      │
│         │                                                        │
│  ┌──────┴──────┬──────────┐                                     │
│  ▼             ▼          ▼                                     │
│  Webhook      Analysis   Simulation                             │
│  Service      Service    Service                                │
│  (Python)     (Python)   (Python)                               │
│         │             │          │                              │
│         └─────────────┼──────────┘                              │
│                       ▼                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  C++ 高性能模块                                         │   │
│  │  • FeatureAligner (图匹配)                              │   │
│  │  • CodeScanner (AST 解析)                               │   │
│  │  • ADCU Simulator (域控模拟)                            │   │
│  │  • DataPlayback (数据回灌)                              │   │
│  │  • PerfCollector (性能采集)                             │   │
│  │  • BaselineDB (基线存储)                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │ IPC/Socket                                            │
│         ▼                                                        │
│  数据层 (PostgreSQL/SQLite/Redis)                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📊 语言选择

### Python 模块（业务逻辑 + 流程控制）

✅ **数据接入层**
- Webhook 服务：快速迭代，易于集成 GitHub/GitLab API
- Git 操作：文本处理，CLI 调用

✅ **分析引擎层（部分）**
- ReqParser：正则表达式、NLP 友好
- SemanticMatcher：LLM 集成，灵活调整

✅ **仿真验证层（部分）**
- 仿真编排器：流程控制，易于调试

✅ **业务逻辑层**
- Flow A/B 编排：状态机，易于调试
- AI 能力：LLM API，提示词工程

✅ **通知与集成层**
- PR 评论、邮件、IM：各种服务集成

✅ **API 服务层**
- REST API：快速开发，易于文档化

### C++ 模块（高性能计算 + 实时系统）

✅ **分析引擎层（部分）**
- FeatureAligner：高性能图匹配，大规模基线对齐
- CodeScanner：高性能 AST 解析，处理大型代码库

✅ **仿真验证层（部分）**
- ADCU 模拟器接口：低延迟，直接与 ADCU 通信
- 数据回灌引擎：高吞吐，精确时间戳控制
- 性能采集器：低开销，实时性能监控

✅ **数据处理层（部分）**
- 基线管理：高效索引，快速查询

## 📁 项目结构

```
backend/
├── cpp/                          # C++ 高性能模块
│   ├── CMakeLists.txt
│   ├── src/
│   │   ├── feature_aligner/      # 功能点对齐引擎
│   │   ├── code_scanner/         # AST 代码扫描
│   │   ├── adcu_simulator/       # ADCU 域控模拟器接口
│   │   ├── data_playback/        # 数据回灌引擎
│   │   ├── perf_collector/       # 性能采集器
│   │   └── baseline_db/          # 基线数据库
│   ├── include/devguard/
│   │   ├── feature_aligner.h
│   │   ├── code_scanner.h
│   │   └── proto/                # Protocol Buffers
│   └── tests/
│
├── python/                       # Python 业务逻辑层
│   ├── requirements.txt
│   ├── devguard/
│   │   ├── api/                  # REST API 层 (FastAPI)
│   │   ├── webhook/              # Webhook 处理
│   │   ├── git/                  # Git 操作
│   │   ├── analysis/             # 分析引擎
│   │   │   └── req_parser.py     # 需求解析
│   │   ├── simulation/           # 仿真编排
│   │   │   └── orchestrator.py   # 流程编排
│   │   ├── flows/                # 业务流程
│   │   │   ├── flow_a.py         # 需求输入流程
│   │   │   └── flow_b.py         # 代码提交流程
│   │   ├── notification/         # 通知服务
│   │   ├── database/             # 数据层
│   │   └── utils/
│   └── tests/
│
└── docker/
    ├── Dockerfile.python
    ├── Dockerfile.cpp
    └── docker-compose.yml
```

## 🔗 模块间通信

| 从 | 到 | 方式 | 协议 |
|----|----|----|------|
| Python (Webhook) | Python (ReqParser) | 直接函数调用 | In-Process |
| Python (ReqParser) | C++ (FeatureAligner) | ctypes / CFFI | Shared Library |
| Python (Analysis) | C++ (CodeScanner) | subprocess + JSON | IPC |
| Python (Orchestrator) | C++ (ADCU Simulator) | subprocess + Protocol Buffers | IPC |
| Python (Flows) | Python (Database) | SQLAlchemy ORM | SQL |

## 🚀 快速开始

### Python 开发

```bash
# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r backend/python/requirements.txt

# 运行测试
pytest backend/python/tests/

# 启动 API 服务
python -m devguard.api.app
```

### C++ 开发

```bash
# 编译
cd backend/cpp
mkdir build && cd build
cmake ..
make -j$(nproc)

# 运行测试
ctest

# 安装
make install
```

### Docker 部署

```bash
# 启动所有服务
docker-compose -f backend/docker/docker-compose.yml up -d

# 查看日志
docker-compose logs -f api

# 停止服务
docker-compose down
```

## 📈 性能指标

| 指标 | 目标值 |
|------|--------|
| Webhook 响应延迟 | < 100ms |
| 需求解析速度 | < 500ms |
| 功能点对齐速度 | < 200ms |
| 代码扫描速度 | < 1s |
| 语义匹配速度 | < 300ms |
| 数据回灌吞吐 | > 1000 Hz |
| 性能采集开销 | < 5% |

## 🔑 关键设计决策

### 为什么混合架构？

✅ **性能 + 灵活性**
- 关键路径用 C++（图匹配、数据回灌、性能采集）
- 业务逻辑用 Python（快速迭代、易于调试）

✅ **开发效率**
- Python 快速原型，C++ 性能优化
- 清晰的模块边界，易于维护

✅ **可扩展性**
- 新增功能优先用 Python，性能瓶颈再用 C++
- 模块独立，易于替换

## 📚 文档

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - 详细架构设计
- [PRD-DEVGUARD-AGENT.md](./docs/PRD-DEVGUARD-AGENT.md) - 产品需求文档
- [C++ 模块文档](./docs/C++_MODULES.md) - C++ 模块详解
- [API 文档](./docs/API.md) - REST API 接口文档

## 🛠️ 技术栈

### Python
- FastAPI (Web 框架)
- SQLAlchemy (ORM)
- asyncio (异步)
- pandas/numpy (数据分析)
- sentence-transformers (语义匹配)
- OpenAI API (LLM)

### C++
- Boost Graph (图算法)
- Clang LibTooling (AST 解析)
- Protocol Buffers (序列化)
- Linux perf (性能采集)

### 数据库
- PostgreSQL (历史记录)
- SQLite (基线存储)
- Redis (缓存 + 队列)

### 容器化
- Docker
- Docker Compose

---

**版本**: v2.4.0  
**最后更新**: 2026-03-30
