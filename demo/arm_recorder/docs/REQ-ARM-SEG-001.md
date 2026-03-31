# ARM数据实时落盘系统 - 需求规格说明书

> **REQ-ID**: REQ-ARM-SEG-001
> **版本**: v1.0
> **日期**: 2026-03-29
> **状态**: 待评审
> **作者**: 系统架构组

---

## 一、背景与目标

### 1.1 背景

自动驾驶路测数据量庞大，单次录制可达TB级别。现有方案存在以下痛点：

| 问题 | 影响 |
|------|------|
| 单文件过大 | 文件系统单文件大小限制（ext4单文件最大16TB，但实际使用中>100GB文件读取性能下降明显） |
| 数据孤立 | 多段录制数据无法自动关联，事后分析需要手动拼接 |
| 事故追溯难 | 事故发生时的前后数据需要精确时间对齐，现有人工操作易出错 |
| 存储成本高 | 完整录制占用大量存储空间，无法按需提取关键时间段 |

### 1.2 目标

设计一套**ARM数据实时落盘系统**，实现：

1. **多Topic并发落盘**：支持Apollo全量Sensor数据（10+ Topic）实时写入
2. **智能文件分割**：基于时间+大小双维度自动分段，零丢帧
3. **时间戳精确对齐**：跨Topic数据按统一时间轴对齐，误差<1ms
4. **高效文件合并**：多段数据按时间顺序合并，支持Topic过滤和时间范围切分
5. **零丢帧保证**：环形缓冲 + WAL预写 + 双缓冲写

---

## 二、系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      ARM Recorder                               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Topic       │  │ Ring Buffer   │  │ WAL (Write-Ahead   │    │
│  │ Subscriber  │──▶│ (per topic)  │──▶│ Log) per segment   │    │
│  │ x N         │  │              │  │                    │    │
│  └─────────────┘  └──────────────┘  └─────────┬──────────┘    │
│                                                 │               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────▼──────────┐    │
│  │ Double       │◀─│ Segment       │◀─│ Dual-buffer Writer │    │
│  │ Buffer       │  │ Manager       │  │ (flush thread)    │    │
│  └──────┬──────┘  └──────┬───────┘  └────────────────────┘    │
│         │                │                                      │
│         │         ┌──────▼───────┐                              │
│         │         │ Segment      │                              │
│         │         │ Writer        │                              │
│         │         │ (.armd)       │                              │
│         │         └──────┬───────┘                              │
│         │                │  Segment                              │
│  ┌──────▼──────┐  ┌─────▼──────────────┐                        │
│  │ Merge       │◀─│  Segment Pool      │                        │
│  │ Engine      │  │  (indexed .armd)   │                        │
│  └──────┬──────┘  └───────────────────┘                        │
│         │                                                         │
│         │ Merged Output (.armd)                                  │
└─────────┼─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Time-Sorted Merge Output                       │
│  · All topics in one file                                       │
│  · Strict timestamp ordering                                    │
│  · Topic filter + time range support                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心数据流

```
[Topic A] ──┐
[Topic B] ──┼──▶ RingBuffer ──▶ WAL ──▶ DoubleBuffer ──▶ SegmentWriter ──▶ .armd
[Topic C] ──┤               (per-topic)      (shared)       (5min/512MB)
[Topic D] ──┘
```

---

## 三、功能需求

### 3.1 文件分割（Segment）

#### FR-SEG-001: 自动时间分段

- **触发条件**：当前段录制时长 >= 配置阈值（默认 **5分钟**）
- **时间基准**：使用录制系统本地时钟（单调递增），不接受外部时钟回退
- **边界处理**：段结束时间戳 = 最后一条消息的实际时间戳（非触发时间）
- **新段起始**：立即创建，**时间戳从新段第一条消息开始**，不填补间隙

#### FR-SEG-002: 自动大小分段

- **触发条件**：当前段文件大小 >= 配置阈值（默认 **512MB**）
- **预检查**：写入前检查，剩余空间不足时提前触发分段
- **原子性**：分段操作在写入线程中完成，不阻塞数据接收

#### FR-SEG-003: 强制手动分段

- 提供API：`ForceNewSegment(reason)` 允许外部触发分段
- **使用场景**：
  - 接管/退出自动驾驶模式时
  - 感知到异常事件（急刹、碰撞预警）时
  - 测试工程师手动标记关键时刻时
- **日志记录**：记录触发原因到段元数据

#### FR-SEG-004: 段元数据管理

每个段文件头部包含元数据：

| 字段 | 类型 | 说明 |
|------|------|------|
| `segment_id` | UUID | 全局唯一标识符 |
| `start_time` | int64 | 首条消息时间戳（us） |
| `end_time` | int64 | 末条消息时间戳（us） |
| `duration_ms` | uint64 | 录制时长（ms） |
| `file_size` | uint64 | 文件大小（bytes） |
| `topic_count` | uint32 | 包含的Topic数 |
| `msg_count` | uint64 | 总消息数 |
| `topic_list` | string[] | Topic名称列表 |
| `checksum` | uint32 | CRC32校验 |
| `status` | enum | open/sealed/merged/corrupted |
| `prev_id` | UUID | 前一段ID（用于链式追溯） |
| `next_id` | UUID | 后一段ID（用于链式追溯） |

#### FR-SEG-005: 段文件命名规范

```
{output_dir}/
  {timestamp_start_yyyyMMdd_HHmmss}_{segment_id_short}.armd
  例如: 20260329_143022_7f3a.armd
```

### 3.2 时间戳对齐（Timestamp Alignment）

#### FR-TIME-001: 统一时间轴

- **基准**：所有Topic使用相同的**微秒级时间戳**
- **时钟源**：优先使用 Apollo 定位系统时间（`/apollo/localization/pose.timestamp`），降级使用系统 monotonic clock
- **异常检测**：消息时间戳与当前时间偏差超过 **±1秒** 视为异常，跳过该消息并记录

#### FR-TIME-002: 跨Topic时序保证

- 同一段内，所有Topic的消息**按时间戳升序排列**
- **多Topic并发写入**时：
  1. 各Topic独立接收，互不阻塞
  2. 双缓冲合并时执行全局排序
  3. 写入文件时严格按时间顺序
- **时间戳相等时**：按 Topic ID 升序排列（保证确定性）

#### FR-TIME-003: 时间戳与文件名的映射

- 任意时刻的时间戳，可通过遍历段文件快速定位所属段
- **索引文件**（可选）：`.armi` 索引文件记录每条消息的段内偏移

### 3.3 文件合并（Merge）

#### FR-MERGE-001: 多段顺序合并

- **输入**：2-N 个段ID列表
- **输出**：单个合并后的 `.armd` 文件
- **排序**：按 `start_time` 全局升序
- **算法**：外部归并排序（适合TB级数据，内存占用 O(N) 其中 N=段数）

#### FR-MERGE-002: Topic过滤合并

- **输入**：额外指定 `topic_filter` 列表
- **行为**：只包含指定的Topic数据，其他Topic消息跳过
- **应用场景**：只回放激光雷达数据进行分析时

#### FR-MERGE-003: 时间范围切分

- **输入**：`time_range_start` 和 `time_range_end`（微秒时间戳）
- **行为**：
  - `start <= msg.timestamp <= end` 的消息保留
  - 时间范围外的消息跳过
- **边界**：`time_range_start == 0` 表示从头，`time_range_end == 0` 表示到末尾

#### FR-MERGE-004: 合并进度回调

- 合并过程提供进度回调：`callback(progress: float, status: string)`
- 进度百分比：`0.0 ~ 100.0`
- 合并完成后返回统计数据（输入消息数、输出消息数、跳过数、耗时）

#### FR-MERGE-005: 合并去重检测

- 检测相邻段之间是否存在**时间戳重叠**
- 如有重叠，发出警告（`WARNING: overlapping timestamps detected`）
- 可配置策略：**跳过重复** / **保留全部** / **报错终止**

### 3.4 数据完整性保证

#### FR-INTEG-001: WAL预写日志

- 每条消息写入前，先追加到 WAL
- WAL刷新策略：每 **50ms** 或累积 **1MB** 强制刷盘
- **崩溃恢复**：启动时读取WAL，恢复未刷入段的最新消息

#### FR-INTEG-002: CRC32校验

- 每段文件关闭前计算整个文件的 CRC32，存入元数据
- 下次打开时验证，发现损坏则标记状态为 `corrupted`

#### FR-INTEG-003: 原子性段关闭

- 段关闭流程：
  1. 刷盘所有缓冲数据
  2. 写入文件尾 MAGIC 标记（`0xDEADBEEF`）
  3. 回填元数据到文件头
  4. `fsync()` 全量同步
  5. 重命名临时文件为正式文件名（原子操作）

---

## 四、非功能性需求

### 4.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 最大并发Topic数 | 32 | 支持扩展 |
| 单Topic最大吞吐 | 100 MB/s | 1080p 摄像头全速 |
| 消息落盘延迟 | < 10ms | P99 |
| 分段切换耗时 | < 50ms | 切换期间不丢帧 |
| 合并吞吐率 | > 500 MB/s | 多线程并行 |
| 内存占用 | < 512 MB | 固定上界，不随数据量增长 |

### 4.2 可靠性

| 指标 | 目标值 |
|------|--------|
| 丢帧率 | 0% (正常工况) |
| 段文件损坏率 | 0% (硬件故障除外) |
| 崩溃后数据可恢复率 | 99.9% (WAL保护) |
| MTBF | > 720h 连续运行 |

### 4.3 兼容性

- 操作系统：Linux (x86_64 / aarch64)
- 编译器：C++17 / GCC 9+
- 依赖库：libzstd（可选，压缩用）
- 文件格式：跨平台纯二进制 `.armd`，大小端兼容

---

## 五、接口规格

### 5.1 核心C++ API

```cpp
// 初始化
int Init();
int Start();       // 启动落盘（创建第一段）
int Stop(int wait_ms = 5000);

// Topic管理
TopicId Subscribe(topic_name, msg_type, callback);
void Unsubscribe(topic_id);

// 分段控制
void ForceNewSegment(reason);          // 强制分段
bool GetCurrentSegment(SegmentMeta*);   // 获取当前段信息

// 合并
int MergeSegments(segment_ids, output_path, topic_filter, time_start, time_end);
void MergeSegmentsAsync(segment_ids, output_path, callback);
Merger::MergeStats GetMergeStats();

// 统计
void GetStats(uint64_t* total_msgs, uint64_t* total_bytes, uint64_t* dropped_msgs);
```

### 5.2 数据结构

```cpp
struct DataBlock {
  TopicId     topic_id;    // Topic标识
  TimestampUs timestamp;   // 微秒时间戳
  uint32_t    seq;         // 序列号
  uint32_t    data_size;   // 数据长度
  const uint8_t* data_ptr; // 数据指针
};

struct SegmentMeta {
  std::string  segment_id;   // UUID
  std::string  file_path;    // 文件路径
  TimestampUs  start_time;  // 段起始时间戳
  TimestampUs  end_time;    // 段结束时间戳
  uint64_t     file_size;   // 文件大小
  FileStatus   status;      // open/sealed/merged/corrupted
};

struct RecorderConfig {
  std::string  output_dir;
  uint64_t     max_segment_duration_ms = 300000;  // 5min
  uint64_t     max_segment_size_mb = 512;
  bool         enable_timestamp_check = true;
  int64_t      timestamp_tolerance_ms = 1000;
  // ... 更多配置见 recorder.h
};
```

---

## 六、测试场景

### TC-SEG-001: 长时间连续录制自动分段

- **前置**：配置 max_segment_duration_ms = 60s
- **步骤**：连续写入 10 分钟数据，每分钟检查是否生成新段
- **验收**：生成 10 个段文件，每个时长约 60s

### TC-SEG-002: 大文件触发分段

- **前置**：配置 max_segment_size_mb = 10
- **步骤**：写入单Topic 50MB数据
- **验收**：生成至少 5 个段文件

### TC-TIME-001: 多Topic时间对齐

- **前置**：3个Topic，频率分别为 10Hz、20Hz、30Hz
- **步骤**：同时向3个Topic写入时间递增的消息
- **验收**：合并后文件中，所有消息严格按时间升序

### TC-MERGE-001: 多段合并Topic过滤

- **前置**：2个段，每段包含Topic A、B、C
- **步骤**：只过滤Topic A进行合并
- **验收**：输出文件只包含Topic A，数据量约为输入的1/3

### TC-MERGE-002: 时间范围切分

- **前置**：1个段，覆盖时间范围 [0, 100s]
- **步骤**：合并时指定 time_range = [30s, 60s]
- **验收**：输出文件只包含 [30s, 60s] 范围内的消息

### TC-RECOV-001: 崩溃恢复

- **前置**：写入过程中强制 kill 进程
- **步骤**：重启Recorder，调用恢复接口
- **验收**：WAL中的数据恢复到新段中

---

## 七、风险与依赖

### 7.1 技术风险

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| 时间戳乱序导致排序开销大 | 中 | 高 | 限制单段时长，段内数据量可控 |
| mmap大文件内存占用过高 | 低 | 高 | 限制单段512MB，内存索引 |
| 多线程竞争导致数据不一致 | 中 | 高 | 双缓冲 + 读写锁 |
| 磁盘IO成为瓶颈 | 高 | 中 | SSD优先，预分配文件空间 |

### 7.2 依赖关系

```
本需求
├── 依赖：定位时间同步模块（提供统一时间轴）
├── 依赖：Topic订阅模块（数据入口）
├── 依赖：文件系统（存储后端）
└── 独立于：感知、规划、控制等驾驶功能模块
```

---

## 八、验收标准

### 8.1 核心功能验收

- [ ] 10个Topic并发写入60分钟，无丢帧
- [ ] 连续录制中，时间分段正常触发
- [ ] 3个段合并后，时间戳严格单调递增
- [ ] Topic过滤合并结果正确
- [ ] 崩溃重启后，WAL数据完整恢复
- [ ] CRC32校验能检测文件损坏

### 8.2 性能验收

- [ ] 单Topic 100MB/s写入不掉帧
- [ ] 分段切换耗时 < 50ms
- [ ] 合并1GB数据耗时 < 5s

### 8.3 质量验收

- [ ] 所有单元测试通过
- [ ] 内存泄漏检测通过（valgrind）
- [ ] 静态分析无高危警告（clang-tidy）
- [ ] 代码覆盖率 > 80%

---

## 九、附录

### 9.1 文件格式规范

```
ARM Binary File (.armd)
+----------------------+
| FileHeader (64B)     |  magic=0x41524D44, version, topic_count, ...
+----------------------+
| TopicEntry[N]        |  N = topic_count, 每个128B
|   - topic_name       |    e.g., "/apollo/sensor/lidar/..."
|   - msg_type         |    e.g., "sensor_msgs/PointCloud2"
|   - frequency        |    Hz
+----------------------+
| MsgIndex[M]          |  16B/条, 时间升序
|   - timestamp (8B)   |  微秒
|   - offset (4B)      |  数据区偏移
|   - size (4B)        |  数据大小
+----------------------+
| MsgData[N]           |  紧跟在索引区后, 无填充
+----------------------+
| Footer (8B)          |  MAGIC=0xDEADBEEF
+----------------------+

CRC32: 覆盖 Header + TopicEntry + Index + Data
```

### 9.2 术语表

| 术语 | 定义 |
|------|------|
| Segment / 段 | 一次连续录制生成的文件 |
| Topic | ROS/Cyber主题，类似于数据通道 |
| WAL | Write-Ahead Log，预写日志 |
| ARM | Apollo Recording Metadata，本文定义的录制文件格式 |
| Merge | 多段合并为一个文件 |
| Timestamp | 微秒级单调递增时间戳 |
