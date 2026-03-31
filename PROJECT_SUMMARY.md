# DevGuard Agent 项目总结

## 项目概述

DevGuard Agent 是一个**自动驾驶代码质量守护系统**，通过两套独立的触发流程（需求驱动 + 代码驱动），实现从需求分析、代码开发、测试生成到提交检测、合入的完整端到端质量守护。

## 核心创新

### 1. 业务需求 vs 技术需求的差异化对齐

- **业务需求（BR-xxx）**：强制对齐
  - 缺失 → 🔴 阻断
  - 偏离 → 🔴 阻断
  
- **技术需求（TR-xxx）**：条件对齐
  - 已指定 → 严格执行，偏离 → 🟠 警告+确认
  - 未指定 → 工程师自由选择

### 2. 技术需求按实现时段分层

```
编译前 (代码规范)
    ↓
编译时 (C++17/编译)
    ↓
代码逻辑 (接口/线程安全)
    ↓
业务信号对齐 (CAN/ROS)
    ↓
运行时性能 (延迟/内存/CPU)
```

不同时段有不同的验证方式和阻断级别。

### 3. Commit 语义对齐校验

- 核心功能词缺失 → 🔴 阻断
- 语义匹配度 < 60% → 🟡 警告
- 语义匹配度 ≥ 80% → 🟢 通过

### 4. 需求负责人反向确认机制

- 需求负责人对代码合入有**一票否决权**
- 状态：APPROVE / CONDITIONAL / REJECT

### 5. 仿真验证流程

- ADCU 域控模拟器接口
- 数据回灌引擎（CAN/ROS）
- 性能采集器（延迟/内存/CPU）
- 性能偏离处理（3 选 1：优化/确认/修改需求）

## 系统架构

### 后端架构（C++ + Python 混合）

```
┌─────────────────────────────────────────────────────────────────┐
│                    前端 (Vue 3 + Element Plus)                  │
├─────────────────────────────────────────────────────────────────┤
│                    API 网关 (FastAPI)                            │
├─────────────────────────────────────────────────────────────────┤
│  业务逻辑层 (Python)          │  高性能计算层 (C++)              │
│  • Flow A/B 流程              │  • 功能点对齐引擎                │
│  • 需求解析                   │  • 代码扫描                      │
│  • PR 分析                     │  • 性能采集                      │
│  • 仿真编排                    │  • ADCU 模拟器                   │
├─────────────────────────────────────────────────────────────────┤
│                    数据库层 (PostgreSQL)                         │
├─────────────────────────────────────────────────────────────────┤
│  缓存层 (Redis)  │  消息队列 (RabbitMQ)  │  文件存储 (S3)       │
└─────────────────────────────────────────────────────────────────┘
```

### 两套核心流程

#### Flow A: 需求输入触发

```
需求文档输入
    ↓
需求解析（Markdown/JSON/YAML）
    ↓
功能点提取（业务需求 + 技术需求）
    ↓
功能点对齐（图匹配算法）
    ↓
差距分析 + 风险评估
    ↓
实施计划生成
    ↓
代码骨架生成
    ↓
文档变更建议
    ↓
下发确认
```

#### Flow B: 代码提交触发

```
PR 事件接收
    ↓
Commit 语义对齐校验（核心门禁）
    ↓
代码变更分析
    ↓
设计文档缺口检测
    ↓
需求逆向追溯
    ↓
需求负责人反向确认（一票否决权）
    ↓
合入门禁判定
    ↓
PR 评论自动下发
```

## 项目结构

```
devguard-agent/
├── backend/
│   ├── cpp/                    # C++ 高性能模块
│   │   ├── CMakeLists.txt
│   │   ├── src/
│   │   │   ├── feature_aligner/
│   │   │   ├── code_scanner/
│   │   │   ├── adcu_simulator/
│   │   │   ├── data_playback/
│   │   │   ├── perf_collector/
│   │   │   └── baseline_db/
│   │   └── include/devguard/
│   │
│   ├── python/                 # Python 业务逻辑
│   │   ├── requirements.txt
│   │   ├── .env.example
│   │   ├── devguard/
│   │   │   ├── main.py
│   │   │   ├── config.py
│   │   │   ├── api/
│   │   │   │   ├── app.py
│   │   │   │   └── routes/
│   │   │   ├── webhook/
│   │   │   ├── analysis/
│   │   │   ├── flows/
│   │   │   ├── simulation/
│   │   │   ├── database/
│   │   │   └── notification/
│   │   └── tests/
│   │
│   └── docker/
│       ├── Dockerfile.python
│       ├── Dockerfile.cpp
│       └── docker-compose.yml
│
├── frontend/                   # Vue 3 Web UI
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── api/
│   │   ├── router/
│   │   ├── stores/
│   │   ├── types/
│   │   ├── styles/
│   │   └── views/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── FRONTEND.md
│
├── docs/
│   ├── PRD-DEVGUARD-AGENT.md   # 产品需求文档
│   ├── ARCHITECTURE.md          # 架构设计
│   └── FEATURE-ANALYSIS-GUIDE.md
│
├── demo/
│   ├── pipeline-demo.js
│   └── two-flows-demo.js
│
├── Makefile                    # 开发命令
├── DEVELOPMENT.md              # 开发指南
├── IMPLEMENTATION.md           # 实现指南
├── BACKEND_SUMMARY.md          # 后端总结
└── PROJECT_SUMMARY.md          # 项目总结
```

## 代码统计

| 类型 | 文件数 | 代码行数 |
|------|--------|---------|
| C++ 代码 | 9 | ~2700 |
| Python 代码 | 28+ | ~3200 |
| Vue 前端 | 15+ | ~1500 |
| 配置文件 | 10+ | ~300 |
| 文档 | 8+ | ~3000 |
| **总计** | **60+** | **~7840** |

## 技术栈

### 后端

- **Python**: FastAPI, SQLAlchemy, asyncio, pandas, sentence-transformers
- **C++**: Boost Graph, Clang LibTooling, Protocol Buffers, Linux perf
- **数据库**: PostgreSQL, SQLite, Redis
- **容器**: Docker, Docker Compose

### 前端

- **框架**: Vue 3 + TypeScript
- **路由**: Vue Router 4
- **状态管理**: Pinia
- **UI 组件**: Element Plus
- **构建工具**: Vite
- **HTTP 客户端**: Axios

## 快速开始

### 后端

```bash
# 初始化
make init

# 配置
cp backend/python/.env.example backend/python/.env
vim backend/python/.env

# 启动
make dev

# API 文档: http://localhost:8000/docs
```

### 前端

```bash
# 安装依赖
cd frontend
npm install

# 启动开发服务器
npm run dev

# 访问: http://localhost:3000
```

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

## 核心功能

### ✅ 已实现

- [x] 需求分析与下发流程 (Flow A)
- [x] 代码提交检测流程 (Flow B)
- [x] 需求分类与差异化对齐
- [x] 技术需求分层
- [x] Commit 语义对齐校验
- [x] 需求负责人反向确认
- [x] 仿真验证流程
- [x] 后端 API 服务
- [x] 数据库模型
- [x] GitHub Webhook 集成
- [x] 前端 Web UI (基础)
- [x] 完整的文档
- [x] **需求强校验引擎** (2026-03-30 新增)
- [x] **符号需求支持** (carSpeed=100km/h, geer=D 格式)
- [x] **C++ 域控端扩展** (符号校验引擎 + CAN 信号监控器)
- [x] **需求详情页** (Detail.vue)
- [x] **需求编辑页** (Edit.vue)
- [x] **路由守卫** (认证检查)
- [x] **校验结果可视化** (错误/警告/提示分级展示)

### 🟡 部分实现

- [ ] 前端页面（7/10 已实现）
- [ ] 认证系统（基础路由守卫已实现）
- [ ] 表单验证（后端强校验已实现，前端实时校验部分实现）
- [ ] 数据导出

### ⏳ 待实现

- [ ] 剩余前端页面
- [ ] 单元测试
- [ ] E2E 测试
- [ ] 性能优化
- [ ] 国际化支持
- [ ] 监控告警
- [ ] 日志聚合

## 关键文档

- **PRD-DEVGUARD-AGENT.md** (v2.4, 1303 行) - 完整产品需求
- **ARCHITECTURE.md** (16KB) - 详细架构设计
- **DEVELOPMENT.md** (8.7KB) - 开发指南
- **IMPLEMENTATION.md** - 实现指南
- **FRONTEND.md** - 前端开发指南
- **Makefile** - 开发命令速查

## 下一步行动

### 短期（1-2 周）

1. 实现剩余前端页面
2. 添加认证系统
3. 完善表单验证

### 中期（2-4 周）

1. 集成测试
2. 性能优化
3. 部署上线

### 长期（1-3 个月）

1. 支持更多代码托管平台
2. 基线自动更新
3. 需求变更同步
4. 可视化依赖关系

## 团队协作

### 后端开发

- 实现 Flow A/B 的完整逻辑
- 优化 C++ 性能模块
- 完善 API 接口

### 前端开发

- 实现剩余页面
- 添加认证系统
- 性能优化

### 测试

- 单元测试
- 集成测试
- E2E 测试

### 运维

- Docker 部署
- Kubernetes 编排
- 监控告警

## 许可证

MIT License

## 联系方式

- 项目主页: https://github.com/your-org/devguard-agent
- 问题报告: https://github.com/your-org/devguard-agent/issues
- 讨论: https://github.com/your-org/devguard-agent/discussions

---

**版本**: v2.5.0  
**最后更新**: 2026-03-30  
**项目状态**: 🟢 活跃开发中

## v2.5.0 更新日志 (2026-03-30)

### 新增功能

1. **需求强校验引擎** (`backend/python/devguard/analysis/req_validator.py`)
   - 支持业务需求/技术需求/符号需求三种类型
   - 必需字段检查、格式校验、语义校验、交叉字段校验
   - 校验级别：ERROR（阻断）/ WARNING（警告）/ INFO（提示）

2. **符号需求解析**
   - 支持格式：`carSpeed=100km/h, geer=D, throttle>=50%`
   - 自动识别变量、操作符、值、单位
   - 内置常用变量注册表（carSpeed, geer, throttle, engineSpeed 等）
   - 类型校验（number/string/enum/range）
   - 范围校验、单位校验、枚举值校验

3. **AI 需求分析引擎** (`backend/python/devguard/analysis/ai_analyzer.py`)
   - 多模型支持：OpenAI / Azure / Mock
   - 功能点自动提取
   - 风险分析
   - 代码建议生成
   - 语义相似度计算
   - 功能点与代码对齐

4. **前端页面**
   - 需求详情页（Detail.vue）：展示需求信息、符号条件、校验结果
   - 需求编辑页（Edit.vue）：实时校验、符号条件输入与解析预览
   - 路由守卫：未登录自动跳转登录页

5. **API 接口**
   - `POST /requirements/validate` - 需求强校验
   - `POST /requirements/parse-symbolic` - 符号条件解析
   - `POST /requirements/create` - 创建需求（带校验，失败返回 422）
   - `PUT /requirements/{id}` - 更新需求（带校验）
   - `POST /ai/analyze` - AI 完整需求分析
   - `POST /ai/extract-features` - 功能点提取
   - `POST /ai/analyze-risks` - 风险分析
   - `POST /ai/code-suggestions` - 代码建议
   - `POST /ai/similarity` - 语义相似度

6. **C++ 域控扩展**
   - SymbolicValidator（符号校验引擎，零依赖）
   - CanSignalMonitor（CAN 信号实时监控）
   - GrpcBridge（调车本↔域控双向通信）
   - Proto 定义（devguard_bridge.proto）
