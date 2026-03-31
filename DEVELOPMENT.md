# DevGuard Agent 开发指南

## 快速开始

### 环境准备

```bash
# 克隆项目
git clone https://github.com/your-org/devguard-agent.git
cd devguard-agent

# 创建 Python 虚拟环境
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r backend/python/requirements.txt

# 安装 C++ 依赖 (Ubuntu/Debian)
sudo apt-get install -y \
  build-essential cmake \
  libboost-all-dev \
  nlohmann-json3-dev \
  protobuf-compiler libprotobuf-dev
```

### 本地开发

#### Python 模块

```bash
# 启动 API 服务
python -m devguard.api.app

# 运行测试
pytest backend/python/tests/ -v

# 代码格式化
black backend/python/devguard/
isort backend/python/devguard/

# 代码检查
flake8 backend/python/devguard/
mypy backend/python/devguard/
```

#### C++ 模块

```bash
# 编译
cd backend/cpp
mkdir -p build && cd build
cmake ..
make -j$(nproc)

# 运行测试
ctest --output-on-failure

# 安装
sudo make install

# 清理
make clean
```

### Docker 部署

```bash
# 构建镜像
docker-compose -f backend/docker/docker-compose.yml build

# 启动服务
docker-compose -f backend/docker/docker-compose.yml up -d

# 查看日志
docker-compose logs -f api
docker-compose logs -f cpp-engine

# 停止服务
docker-compose down

# 清理
docker-compose down -v
```

## API 文档

### 需求管理 API

#### 分析需求文档

```bash
POST /api/requirements/analyze

{
  "id": "REQ-2025-Q1-XXX",
  "title": "城市NOA雨天感知降级策略",
  "content": "# 需求文档\n...",
  "format": "markdown",
  "priority": "P1",
  "module": "perception",
  "asil": "B"
}

Response:
{
  "status": "success",
  "requirement_id": "REQ-2025-Q1-XXX",
  "features": [...],
  "alignment_results": {...},
  "implementation_plan": {...},
  "code_skeleton": "...",
  "doc_suggestions": [...]
}
```

#### 仅解析需求

```bash
POST /api/requirements/parse

{
  "id": "REQ-2025-Q1-XXX",
  "title": "...",
  "content": "...",
  "format": "markdown"
}

Response:
{
  "status": "success",
  "requirement_id": "REQ-2025-Q1-XXX",
  "features": [
    {
      "id": "BR-001",
      "name": "雨量分级检测",
      "type": "BUSINESS",
      "phase": "CODE_LOGIC",
      "keywords": ["雨量", "分级"],
      "priority": "P0",
      "specified": true
    }
  ]
}
```

### 分析 API

#### 分析 PR

```bash
POST /api/analysis/pr

{
  "number": 9152,
  "title": "feat: 优化车道线检测在夜间场景的准确性",
  "description": "...",
  "author": "lisi-dev",
  "branch": "feat/lane-detection-night-v2",
  "commits": [
    {
      "sha": "a1b2c3d",
      "message": "feat(perception): 夜间场景自适应边缘阈值"
    }
  ],
  "changed_files": 2,
  "additions": 73,
  "deletions": 20
}

Response:
{
  "status": "success",
  "pr_number": 9152,
  "can_merge": true,
  "commit_validations": [
    {
      "commit_sha": "a1b2c3d",
      "status": "PASS",
      "semantic_match_score": 0.85,
      "matched_keywords": ["夜间", "感知"],
      "missing_keywords": []
    }
  ],
  "code_changes": [...],
  "doc_gaps": [...],
  "traced_requirements": ["REQ-2025-Q4-014"],
  "confirmations": [...]
}
```

### 仿真 API

#### 运行仿真验证

```bash
POST /api/simulation/run

{
  "requirement_id": "REQ-2025-Q1-XXX",
  "scenario_path": "/data/scenarios/rain_heavy.bag",
  "adcu_binary": "/usr/local/bin/devguard-adcu",
  "playback_speed": 1.0,
  "duration_sec": 60,
  "collect_interval_ms": 100,
  "requirements": [
    {
      "id": "TR-PERF-001",
      "name": "感知延迟 P99",
      "metric_key": "latency",
      "constraint": "< 80ms",
      "unit": "ms"
    }
  ]
}

Response:
{
  "status": "success",
  "requirement_id": "REQ-2025-Q1-XXX",
  "passed": true,
  "results": [
    {
      "req_id": "TR-PERF-001",
      "metric": "感知延迟 P99",
      "constraint": "< 80ms",
      "measured": 75.3,
      "unit": "ms",
      "passed": true,
      "deviation": -5.875
    }
  ],
  "report": {...}
}
```

## 项目结构

```
backend/
├── cpp/
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
├── python/
│   ├── requirements.txt
│   ├── devguard/
│   │   ├── api/
│   │   │   ├── app.py
│   │   │   └── routes/
│   │   │       ├── requirements.py
│   │   │       ├── analysis.py
│   │   │       ├── simulation.py
│   │   │       └── baselines.py
│   │   ├── analysis/
│   │   │   └── req_parser.py
│   │   ├── flows/
│   │   │   ├── flow_a.py
│   │   │   └── flow_b.py
│   │   ├── simulation/
│   │   │   └── orchestrator.py
│   │   ├── notification/
│   │   ├── database/
│   │   └── utils/
│   └── tests/
│
└── docker/
    ├── Dockerfile.python
    ├── Dockerfile.cpp
    └── docker-compose.yml
```

## 开发工作流

### 1. 需求分析流程 (Flow A)

```python
from devguard.flows.flow_a import FlowA

flow_a = FlowA()
result = await flow_a.execute(
    requirement_id="REQ-2025-Q1-XXX",
    content="# 需求文档...",
    format="markdown"
)

# 输出:
# - 功能点列表
# - 对齐结果
# - 实施计划
# - 代码骨架
# - 文档建议
```

### 2. 代码提交分析流程 (Flow B)

```python
from devguard.flows.flow_b import FlowB

flow_b = FlowB()
result = await flow_b.execute(pr_event)

# 输出:
# - Commit 语义对齐校验结果
# - 代码变更分析
# - 文档缺口检测
# - 需求追溯结果
# - 反向确认状态
# - 合入门禁判定
```

### 3. 仿真验证流程

```python
from devguard.simulation.orchestrator import SimulationOrchestrator, SimulationConfig

config = SimulationConfig(
    scenario_path="/data/scenarios/rain_heavy.bag",
    adcu_binary="/usr/local/bin/devguard-adcu",
    playback_speed=1.0,
    duration_sec=60,
    collect_interval_ms=100,
)

orchestrator = SimulationOrchestrator(config)
result = await orchestrator.run(requirements)

# 输出:
# - 性能指标采集
# - 对比基线
# - 性能报告
# - 偏离处理建议
```

## 测试

### 单元测试

```bash
# 运行所有测试
pytest backend/python/tests/ -v

# 运行特定测试
pytest backend/python/tests/test_req_parser.py -v

# 生成覆盖率报告
pytest backend/python/tests/ --cov=devguard --cov-report=html
```

### 集成测试

```bash
# 启动 Docker 环境
docker-compose -f backend/docker/docker-compose.yml up -d

# 运行集成测试
pytest backend/python/tests/integration/ -v

# 停止环境
docker-compose down
```

## 调试

### Python 调试

```python
# 在代码中添加断点
import pdb; pdb.set_trace()

# 或使用 IDE 调试器
# VS Code: 按 F5 启动调试
# PyCharm: 右键 → Debug
```

### C++ 调试

```bash
# 编译调试版本
cd backend/cpp/build
cmake -DCMAKE_BUILD_TYPE=Debug ..
make

# 使用 gdb 调试
gdb ./devguard-cpp-server
(gdb) run
(gdb) break main
(gdb) continue
```

## 性能优化

### Python 性能分析

```bash
# 使用 cProfile
python -m cProfile -s cumulative -m devguard.api.app

# 使用 py-spy
pip install py-spy
py-spy record -o profile.svg -- python -m devguard.api.app
```

### C++ 性能分析

```bash
# 使用 perf
perf record ./devguard-cpp-server
perf report

# 使用 valgrind
valgrind --tool=callgrind ./devguard-cpp-server
kcachegrind callgrind.out.*
```

## 常见问题

### Q: 如何添加新的需求类型？

A: 在 `req_parser.py` 中修改 `_infer_phase()` 方法，添加新的关键字匹配规则。

### Q: 如何集成新的 LLM 模型？

A: 在 `ai_provider.py` 中添加新的模型配置，支持 OpenAI、Claude、Gemini 等。

### Q: 如何扩展仿真场景？

A: 在 `data/scenarios/` 目录下添加新的 ROS Bag 文件或 CAN 数据文件。

### Q: 如何自定义 Commit 校验规则？

A: 在 `flow_b.py` 中修改 `_extract_required_keywords()` 和 `_validate_commits()` 方法。

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 许可证

MIT License

## 联系方式

- 项目主页: https://github.com/your-org/devguard-agent
- 问题报告: https://github.com/your-org/devguard-agent/issues
- 讨论: https://github.com/your-org/devguard-agent/discussions

---

**版本**: v2.4.0  
**最后更新**: 2026-03-30
