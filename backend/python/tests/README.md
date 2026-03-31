# DevGuard Agent 测试文档

## 测试结构

```
tests/
├── conftest.py              # pytest 配置和全局 fixtures
├── run_tests.py             # 测试运行脚本
├── fixtures/
│   ├── __init__.py
│   └── data.py              # 测试数据 fixtures
├── unit/                    # 单元测试
│   ├── __init__.py
│   ├── test_flow_a.py       # Flow A 单元测试
│   ├── test_flow_b.py       # Flow B 单元测试
│   └── test_req_parser.py   # ReqParser 单元测试
├── integration/             # 集成测试
│   ├── __init__.py
│   └── test_api.py          # API 路由集成测试
└── e2e/                     # 端到端测试
    ├── __init__.py
    ├── test_flow_a_e2e.py   # Flow A 端到端测试
    ├── test_flow_b_e2e.py   # Flow B 端到端测试
    └── test_simulation_e2e.py # 仿真验证端到端测试
```

## 快速开始

### 安装测试依赖

```bash
cd backend/python
pip install -r requirements.txt
pip install pytest pytest-asyncio pytest-cov httpx
```

### 运行所有测试

```bash
python tests/run_tests.py
# 或
pytest tests/ -v
```

### 运行特定类型测试

```bash
# 仅单元测试
python tests/run_tests.py --type unit
pytest tests/unit/ -v

# 仅集成测试
python tests/run_tests.py --type integration
pytest tests/integration/ -v

# 仅端到端测试
python tests/run_tests.py --type e2e
pytest tests/e2e/ -v

# 生成覆盖率报告
python tests/run_tests.py --type coverage
pytest --cov=devguard --cov-report=html tests/
```

## 测试标记

- `@pytest.mark.unit` - 单元测试
- `@pytest.mark.integration` - 集成测试
- `@pytest.mark.e2e` - 端到端测试
- `@pytest.mark.slow` - 慢速测试（默认跳过）
- `@pytest.mark.requires_db` - 需要数据库
- `@pytest.mark.requires_api` - 需要 API 服务

## 测试数据 Fixtures

### 需求相关

- `sample_requirement_content` - Markdown 格式需求文档
- `sample_requirement_json` - JSON 格式需求
- `sample_technical_requirement` - 技术需求
- `sample_features` - 功能点列表
- `sample_alignment_results` - 对齐结果

### PR 相关

- `sample_pr_event` - 匹配的 PR 事件
- `sample_pr_event_no_matching` - 不匹配的 PR 事件

### 仿真相关

- `sample_simulation_config` - 仿真配置
- `sample_simulation_result` - 仿真结果

### 基线相关

- `sample_baseline` - 架构基线

## 关键测试场景

### Flow A 测试

1. **完整流程测试** - 需求解析 → 功能点提取 → 对齐 → 代码骨架
2. **技术需求分层** - 验证 5 个实现时段分类
3. **对齐分数阈值** - 0.8+通过，0.6-0.8警告，<0.6阻断
4. **代码骨架风格** - 验证 Apollo CyberRT 风格

### Flow B 测试

1. **完整流程测试** - PR 接收 → Commit 校验 → 需求追溯 → 合入门禁
2. **语义匹配测试** - 验证分数计算和阈值
3. **阻断场景测试** - Commit 不匹配、需求负责人拒绝
4. **条件确认测试** - 条件确认允许合并
5. **文档缺口测试** - 高严重性缺口阻断

### 仿真测试

1. **全部通过** - 所有性能指标满足约束
2. **延迟超标** - P99 延迟超过阈值
3. **内存超标** - 内存占用超过阈值
4. **偏离度计算** - 验证偏离度公式
5. **技术需求分层** - 运行时性能需要仿真，编译时不需要

## 测试最佳实践

### 单元测试

- 每个函数/方法至少一个测试
- 使用 mocking 隔离依赖
- 测试正常路径和异常路径
- 使用参数化测试覆盖多种输入

### 集成测试

- 测试 API 端点的完整请求-响应周期
- 验证状态码和响应结构
- 测试错误处理（404, 400, 422 等）

### 端到端测试

- 测试完整的业务流程
- 验证多个组件的协作
- 使用真实数据或高保真模拟数据
- 验证业务规则（如阻断阈值）

## 覆盖率目标

- 单元测试: > 80%
- 集成测试: > 60%
- 端到端测试: > 40%
- 总体: > 70%

## 持续集成

建议在 CI/CD 中运行：

```yaml
# .github/workflows/test.yml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v2
    - name: Set up Python
      uses: actions/setup-python@v2
      with:
        python-version: '3.10'
    - name: Install dependencies
      run: |
        pip install -r backend/python/requirements.txt
        pip install pytest pytest-asyncio pytest-cov
    - name: Run tests
      run: pytest tests/ -v --cov=devguard --cov-report=xml
    - name: Upload coverage
      uses: codecov/codecov-action@v2
```

## 调试测试

```bash
# 详细输出
pytest tests/test_flow_a.py -v -s

# 只运行特定测试
pytest tests/test_flow_a.py::TestFlowA::test_execute_success -v

# 失败时进入 pdb
pytest tests/ --pdb

# 显示本地变量
pytest tests/ --showlocals
```

## 常见问题

### Q: 测试运行很慢？

A: 使用 `-m "not slow"` 跳过慢速测试，或在 CI 中并行运行。

### Q: 如何添加新的测试数据？

A: 在 `tests/fixtures/data.py` 中添加新的 fixture 函数。

### Q: 如何测试需要数据库的功能？

A: 使用 `mock_database` fixture，它提供 SQLite 内存数据库。

### Q: 如何测试异步代码？

A: 使用 `@pytest.mark.asyncio` 装饰器，pytest-asyncio 会自动处理。
