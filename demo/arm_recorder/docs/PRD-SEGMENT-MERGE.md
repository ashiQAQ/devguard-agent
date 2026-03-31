# PRD: ARM落盘文件分割与合并系统

> **产品需求文档** | v1.0 | 2026-03-29

---

## 1. 背景

Apollo路测单次录制数据量可达 **2TB**，现有单文件存储方案面临：
- 100GB+ 文件读取性能下降 30%
- 事故追溯需精确定位前后 5s 数据段
- 多日连续录制数据无法自动关联
- 存储成本高，无法按需提取关键时间段

## 2. 用户故事

| ID | 角色 | 故事 |
|----|------|------|
| US-01 | 测试工程师 | 我需要在发生急刹时，立即获取前后各5秒的完整感知+规划+控制数据，以便复盘 |
| US-02 | 算法工程师 | 我需要按时间范围提取指定路段的激光雷达+定位数据，进行算法回灌测试 |
| US-03 | 安全工程师 | 我需要在事故后的72小时内，提交完整的、时间对齐的多传感器数据包作为证据 |
| US-04 | 运维工程师 | 我需要自动管理录制文件的大小，单个文件不超过512MB，便于存储和归档 |

## 3. 核心功能

### 3.1 自动文件分割

**触发条件（二选一）**：
- 时间维度：当前段录制时长 >= 5分钟
- 大小维度：当前段文件大小 >= 512MB

**关键约束**：
- 分割操作在写入线程中完成，**不阻塞数据接收**
- 分割后新段**立即可写**，无锁等待
- 分割前后数据**时间戳连续**，不填补间隙
- 分割点精确位于**最后一条消息时间戳**，不是触发时间

**使用场景触发分割**：
- 接管/退出自动驾驶模式
- 感知到异常事件（急刹ACC_AEB、碰撞预警FCW）
- 测试工程师手动标记关键时刻

### 3.2 时间戳全局对齐

**要求**：
- 所有Topic使用**统一微秒时间轴**
- 同一段内消息**严格按时间戳升序**
- 时间戳相等时按 Topic ID 排序（确定性）

**异常检测**：
- 消息时间戳与当前时间偏差 > ±1秒 → 跳过并记录
- 发现时间回退 → 跳过该消息，不重放

### 3.3 多段文件合并

**功能**：
- 将N个段文件合并为1个 `.armd` 文件
- 全局按时间升序排列（外部归并排序，内存 O(段数)）
- 支持进度回调

**过滤器**：
- **Topic过滤**：只合并指定的Topic（其他跳过）
- **时间范围**：只保留 `[time_start, time_end]` 区间内的消息

**合并策略**：
- 相邻段时间重叠时 → 发出警告
- 可选：跳过重复 / 保留全部 / 报错终止

### 3.4 段元数据链

每个段记录 `prev_id` 和 `next_id`，支持：
- 从任意段快速定位前后段
- 事故追溯时自动扩展时间窗口
- 合并时自动识别连续段

## 4. 接口设计

```cpp
// 强制分段
void ForceNewSegment(const std::string& reason);

// 获取当前段信息
bool GetCurrentSegment(SegmentMeta* meta);

// 合并（同步）
int MergeSegments(
    std::vector<std::string> segment_ids,    // 段ID列表
    std::string output_path,                  // 输出路径
    std::vector<std::string> topic_filter,   // Topic过滤（空=全部）
    TimestampUs time_start,                   // 起始时间戳（0=从头）
    TimestampUs time_end                       // 结束时间戳（0=到末尾）
);

// 合并（异步）
void MergeSegmentsAsync(
    std::vector<std::string> segment_ids,
    std::string output_path,
    std::function<void(int msg_count, std::string error)> callback
);
```

## 5. 数据结构

```cpp
struct SegmentMeta {
  std::string  segment_id;     // UUID
  std::string  file_path;      // /path/to/20260329_143022_7f3a.armd
  TimestampUs  start_time;     // 首条消息时间戳（us）
  TimestampUs  end_time;       // 末条消息时间戳（us）
  uint64_t     file_size;      // 文件大小（bytes）
  uint64_t     msg_count;      // 总消息数
  uint32_t     topic_count;    // Topic数量
  FileStatus   status;         // open/sealed/merged/corrupted
  uint32_t     crc32;          // 文件校验
  std::string  prev_id;        // 前一段ID
  std::string  next_id;       // 后一段ID
};
```

## 6. 性能要求

| 指标 | 目标 |
|------|------|
| 分段切换耗时 | < 50ms（期间不丢帧） |
| 合并吞吐率 | > 500 MB/s |
| 多Topic并发 | 支持 10+ Topic |
| 内存占用 | < 512 MB（固定上限） |

## 7. 测试验收

### 7.1 分割验收

- [ ] 连续录制 10 分钟，生成约 10 个段，每段时长约 1 分钟（时间触发）
- [ ] 写入 1GB 单Topic数据，生成至少 2 个段（大小触发）
- [ ] 分段期间 10 Topic 并发写入无丢帧

### 7.2 合并验收

- [ ] 3个段合并后，全局时间戳严格单调递增
- [ ] Topic过滤（只保留 lidar）合并后，输出只含 lidar Topic
- [ ] 时间范围 [30s, 60s] 合并后，输出只在此时段内
- [ ] 合并 1GB 数据耗时 < 3s，进度回调正常

### 7.3 时间对齐验收

- [ ] 3个 Topic（10/20/30 Hz）同时写入，合并后严格按时间排序
- [ ] 时间戳异常（偏差 > 1s）消息被跳过并记录
