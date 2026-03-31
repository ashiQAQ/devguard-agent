# DevGuard Agent 后端架构文档

> **版本**: v1.0  
> **日期**: 2026-03-30  
> **语言**: C++ + Python 混合实现

---

## 一、架构概览

DevGuard Agent 后端采用 **C++ + Python 混合架构**，充分利用两种语言的优势：

- **Python**: 业务逻辑、流程编排、API 服务、数据处理
- **C++**: 高性能计算、实时系统、性能关键路径

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DevGuard Agent 后端架构                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Layer 1: 数据接入层 (Python)                                              │
│  ├─ Webhook 服务 (Flask/FastAPI)                                           │
│  └─ Git 客户端 (GitPython + PyGithub)                                       │
│                                                                             │
│  Layer 2: 分析引擎层 (Python + C++)                                         │
│  ├─ ReqParser (Python) — 文本解析                                          │
│  ├─ FeatureAligner (C++) — 图匹配                                          │
│  ├─ CodeScanner (C++) — AST 解析                                           │
│  └─ SemanticMatcher (Python) — LLM 语义匹配                                │
│                                                                             │
│  Layer 3: 仿真验证层 (C++ + Python)                                         │
│  ├─ ADCU 模拟器接口 (C++)                                                   │
│  ├─ 数据回灌引擎 (C++)                                                      │
│  ├─ 性能采集器 (C++)                                                        │
│  └─ 仿真编排器 (Python)                                                     │
│                                                                             │
│  Layer 4: 数据处理层 (Python + C++)                                         │
│  ├─ 性能分析 (Python)                                                       │
│  ├─ 基线管理 (C++)                                                          │
│  └─ 历史记录 (Python)                                                       │
│                                                                             │
│  Layer 5: 业务逻辑层 (Python)                                              │
│  ├─ Flow A 编排器 — 需求输入触发                                           │
│  ├─ Flow B 编排器 — 代码提交触发                                           │
│  └─ AI 能力层 — LLM 集成                                                    │
│                                                                             │
│  Layer 6: 通知与集成层 (Python)                                            │
│  ├─ PR 评论下发                                                             │
│  ├─ 邮件/IM 通知                                                            │
│  └─ Webhook 回调                                                            │
│                                                                             │
│  Layer 7: API 服务层 (Python)                                              │
│  ├─ REST API (FastAPI)                                                     │
│  └─ gRPC 服务 (C++, 可选)                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、语言选择矩阵

| 类别 | 任务 | 语言 | 原因 |
|------|------|------|------|
| **数据接入** | Webhook 服务 | Python | 快速迭代，API 集成 |
| | Git 操作 | Python | 文本处理，CLI 调用 |
| **分析处理** | 文本解析 (PRD/Issue) | Python | 正则/NLP 友好 |
| | 图匹配 (功能点对齐) | C++ | 高性能，大规模 |
| | AST 解析 (代码扫描) | C++ | 高性能，LLVM 集成 |
| | 语义匹配 (Commit 对齐) | Python | LLM 集成，灵活 |
| **仿真验证** | ADCU 通信 | C++ | 低延迟，实时性 |
| | 数据回灌 | C++ | 高吞吐，精确控制 |
| | 性能采集 | C++ | 低开销，实时监控 |
| | 流程编排 | Python | 状态机，易于调试 |
| **数据处理** | 性能分析 | Python | 数据分析库丰富 |
| | 基线存储 | C++ | 高效索引，快速查询 |
| | 历史记录 | Python | ORM 友好，灵活查询 |
| **业务逻辑** | Flow 编排 | Python | 流程控制，易于调试 |
| | AI 能力 | Python | LLM API，提示词工程 |
| **通知集成** | PR 评论 | Python | GitHub API |
| | 邮件/IM | Python | 集成各种服务 |
| **API 服务** | REST API | Python | 快速开发，易于文档 |
| | gRPC (可选) | C++ | 高性能内部通信 |

---

## 三、模块间通信

### 3.1 通信方式

| 从 | 到 | 方式 | 协议 | 原因 |
|----|----|------|------|------|
| Python (Webhook) | Python (ReqParser) | 直接函数调用 | In-Process | 同进程，低延迟 |
| Python (ReqParser) | C++ (FeatureAligner) | ctypes / CFFI | Shared Library | 高性能图匹配 |
| Python (Analysis) | C++ (CodeScanner) | subprocess + JSON | IPC (stdin/stdout) | 独立进程，隔离 |
| Python (Orchestrator) | C++ (ADCU Simulator) | subprocess + Protocol Buffers | IPC (socket) | 实时性能数据 |
| Python (API) | Python (Flows) | 直接函数调用 | In-Process | 同进程，低延迟 |
| Python (Flows) | Python (Database) | SQLAlchemy ORM | SQL | 数据持久化 |

### 3.2 IPC 通信协议

**Python ↔ C++ 通信使用 Protocol Buffers + JSON**:

```protobuf
// requirement.proto
syntax = "proto3";

package devguard;

message Feature {
  string id = 1;
  string name = 2;
  string description = 3;
  string type = 4;  // BUSINESS / TECHNICAL
  repeated string keywords = 5;
  string priority = 6;
}

message AlignRequest {
  repeated Feature features = 1;
  string baseline_id = 2;
}

message AlignResult {
  string feature_id = 1;
  string module_id = 2;
  string status = 3;  // FULL_MATCH / PARTIAL / NEW_FEATURE
  float similarity_score = 4;
  repeated string matched_keywords = 5;
}

message AlignResponse {
  repeated AlignResult results = 1;
}
```

---

## 四、C++ 模块详解

### 4.1 FeatureAligner (功能点对齐引擎)

**职责**: 将功能点与基线模块进行图匹配，计算相似度

**技术栈**: Boost Graph + 自定义匹配算法

**输入**: Feature 列表 + Baseline

**输出**: AlignResult 列表

```cpp
// feature_aligner/aligner.h
namespace devguard {

class FeatureAligner {
 public:
  FeatureAligner(const Baseline& baseline);
  
  // 对齐功能点
  std::vector<AlignResult> Align(const std::vector<Feature>& features);
  
 private:
  Baseline baseline_;
  
  // 图匹配算法
  float ComputeSimilarity(const Feature& feature, const BaselineModule& module);
  std::vector<std::string> ExtractKeywords(const std::string& text);
};

}  // namespace devguard
```

### 4.2 CodeScanner (AST 代码扫描)

**职责**: 扫描代码结构，提取类/函数/接口

**技术栈**: Clang LibTooling + LLVM

**输入**: 代码文件路径

**输出**: 代码结构 (类/函数/接口列表)

```cpp
// code_scanner/scanner.h
namespace devguard {

class CodeScanner {
 public:
  CodeScanner();
  
  // 扫描代码
  CodeStructure Scan(const std::string& file_path);
  
 private:
  clang::tooling::ClangTool tool_;
};

}  // namespace devguard
```

### 4.3 ADCU 模拟器接口

**职责**: 启动 ADCU 域控进程，管理生命周期

**技术栈**: CAN/ROS C++ API + Protocol Buffers

**输入**: 配置参数

**输出**: 模拟器进程句柄

```cpp
// adcu_simulator/simulator.h
namespace devguard {

class ADCUSimulator {
 public:
  ADCUSimulator(const SimulatorConfig& config);
  
  // 启动模拟器
  bool Start();
  
  // 停止模拟器
  bool Stop();
  
  // 获取状态
  SimulatorStatus GetStatus();
  
 private:
  SimulatorConfig config_;
  pid_t process_id_ = -1;
};

}  // namespace devguard
```

### 4.4 数据回灌引擎

**职责**: 加载场景数据，按时间戳回放

**技术栈**: ROS Bag 回放 + 自定义 CAN 回灌

**输入**: 场景数据文件 (ROS Bag / CAN 日志)

**输出**: 回放事件流

```cpp
// data_playback/playback.h
namespace devguard {

class DataPlayback {
 public:
  DataPlayback();
  
  // 加载数据
  bool Load(const std::string& data_file);
  
  // 开始回放
  bool Start();
  
  // 暂停回放
  bool Pause();
  
  // 获取进度
  float GetProgress();
  
 private:
  rosbag::Bag bag_;
};

}  // namespace devguard
```

### 4.5 性能采集器

**职责**: 采集延迟/内存/CPU 指标

**技术栈**: Linux perf + 自定义 hook

**输入**: 进程 PID

**输出**: PerformanceMetrics

```cpp
// perf_collector/collector.h
namespace devguard {

class PerfCollector {
 public:
  PerfCollector(pid_t target_pid);
  
  // 开始采集
  bool Start();
  
  // 停止采集
  PerformanceMetrics Stop();
  
 private:
  pid_t target_pid_;
  std::vector<PerformanceMetrics> samples_;
};

}  // namespace devguard
```

### 4.6 基线数据库

**职责**: 存储/查询/版本管理基线

**技术栈**: SQLite + 自定义索引

**输入**: Baseline 对象

**输出**: 查询结果

```cpp
// baseline_db/baseline.h
namespace devguard {

class BaselineDB {
 public:
  BaselineDB(const std::string& db_path);
  
  // 保存基线
  bool Save(const Baseline& baseline);
  
  // 加载基线
  std::optional<Baseline> Load(const std::string& baseline_id);
  
  // 查询所有基线
  std::vector<Baseline> ListAll();
  
 private:
  sqlite3* db_ = nullptr;
};

}  // namespace devguard
```

---

## 五、Python 模块详解

### 5.1 ReqParser (需求解析)

**职责**: 解析 PRD/Issue，提取功能点、关键词

**技术栈**: spaCy + regex + YAML/JSON 解析

```python
# devguard/analysis/req_parser.py

class ReqParser:
    """需求解析器"""
    
    def parse(self, text: str) -> List[Feature]:
        """解析需求文本"""
        # 1. 格式识别
        format_type = self._detect_format(text)
        
        # 2. 章节解析
        sections = self._parse_sections(text)
        
        # 3. 功能点提取
        features = self._extract_features(sections)
        
        # 4. 关键词提取
        for feature in features:
            feature.keywords = self._extract_keywords(feature.description)
        
        return features
```

### 5.2 SemanticMatcher (语义匹配)

**职责**: Commit ↔ 需求语义对齐，计算匹配度

**技术栈**: sentence-transformers + OpenAI API

```python
# devguard/analysis/semantic_matcher.py

class SemanticMatcher:
    """语义匹配器"""
    
    async def match(self, commit_msg: str, requirement: Feature) -> float:
        """计算 Commit 与需求的语义匹配度"""
        # 1. 提取 Commit 语义
        commit_embedding = await self._embed(commit_msg)
        
        # 2. 提取需求语义
        req_embedding = await self._embed(requirement.description)
        
        # 3. 计算相似度
        similarity = self._cosine_similarity(commit_embedding, req_embedding)
        
        return similarity
```

### 5.3 Flow A 编排器

**职责**: 需求输入 → 分析 → 下发 → 代码生成

**状态机**:

```
IDLE → PARSING → ANALYZING → GENERATING → CONFIRMING → COMPLETED
                                                    ↓
                                                  FAILED
```

### 5.4 Flow B 编排器

**职责**: PR 提交 → 分析 → 反向确认 → 合入

**状态机**:

```
IDLE → VALIDATING → ANALYZING → CONFIRMING → COMPLETED
                                         ↓
                                       BLOCKED
```

---

## 六、部署架构

### 6.1 Docker 容器化

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Python 服务
  api:
    build:
      context: .
      dockerfile: backend/docker/Dockerfile.python
    ports:
      - "8000:8000"
    environment:
      - PYTHONUNBUFFERED=1
    depends_on:
      - db
      - redis
      - cpp-service

  # C++ 服务
  cpp-service:
    build:
      context: .
      dockerfile: backend/docker/Dockerfile.cpp
    ports:
      - "9000:9000"
    volumes:
      - /tmp/devguard:/tmp/devguard

  # 数据库
  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=devguard
      - POSTGRES_PASSWORD=devguard

  # 缓存
  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

### 6.2 进程通信

```
┌─────────────────────────────────────────────────────────────────┐
│  Python 容器 (FastAPI)                                          │
│  ├─ Webhook 服务                                                │
│  ├─ ReqParser                                                   │
│  ├─ SemanticMatcher                                             │
│  ├─ Flow A/B 编排器                                             │
│  └─ REST API                                                    │
│       │                                                          │
│       │ IPC (socket/stdin-stdout)                               │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐
│  │  C++ 容器 (高性能模块)                                       │
│  │  ├─ FeatureAligner                                           │
│  │  ├─ CodeScanner                                              │
│  │  ├─ ADCU Simulator                                           │
│  │  ├─ DataPlayback                                             │
│  │  ├─ PerfCollector                                            │
│  │  └─ BaselineDB                                               │
│  └─────────────────────────────────────────────────────────────┘
│       │                                                          │
│       │ SQL                                                      │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐
│  │  PostgreSQL (历史记录、分析结果)                            │
│  │  SQLite (基线数据库)                                         │
│  │  Redis (缓存、队列)                                          │
│  └─────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

---

## 七、开发指南

### 7.1 C++ 模块开发

```bash
# 编译
cd backend/cpp
mkdir build && cd build
cmake ..
make

# 测试
ctest

# 生成共享库
make install
```

### 7.2 Python 模块开发

```bash
# 安装依赖
cd backend/python
pip install -r requirements.txt

# 运行服务
python devguard/main.py

# 运行测试
pytest tests/
```

---

> **文档版本**: v1.0  
> **最后更新**: 2026-03-30
