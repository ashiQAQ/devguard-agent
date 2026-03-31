/**
 * @file recorder.h
 * @brief ARM Data Real-time Recorder - Core Header
 *
 * 功能：自动驾驶ARM数据实时落盘
 * 支持：多Topic订阅、缓冲写、文件分割、时间戳对齐
 *
 * 设计原则：
 *   - 零丢帧：环形缓冲 + 双缓冲写
 *   - 零泄漏：RAII + 信号安全
 *   - 零丢失：WAL预写 + 原子关闭
 *
 * @version 1.0
 * @date 2026-03-29
 */
#ifndef ARM_RECORDER_RECORDER_H
#define ARM_RECORDER_RECORDER_H

#include <atomic>
#include <chrono>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

// ============================================================================
// Forward Declarations
// ============================================================================
namespace arm_recorder {

// ============================================================================
// Type Aliases
// ============================================================================
using TimestampUs = int64_t;  // 微秒时间戳
using TopicId = uint32_t;      // Topic唯一标识符

// ============================================================================
// Enums
// ============================================================================

/**
 * @brief 落盘文件状态
 */
enum class FileStatus : uint8_t {
  kOpen = 0,       // 正在写入
  kSealed = 1,     // 已封存（可读不可写）
  kMerging = 2,   // 合并中
  kMerged = 3,    // 已合并
  kCorrupted = 4  // 文件损坏
};

/**
 * @brief 数据品质标签
 */
enum class DataQuality : uint8_t {
  kGood = 0,       // 正常
  kGapped = 1,     // 有丢帧
  kReplayed = 2,  // 回灌数据
  kSynthetic = 3  // 仿真合成
};

// ============================================================================
// Structs
// ============================================================================

/**
 * @brief Topic元数据
 */
struct TopicMeta {
  std::string     name;           // Topic名称
  std::string     msg_type;       // 消息类型 (e.g., "sensor_msgs/PointCloud2")
  uint32_t        frequency;      // 预期频率 Hz
  TimestampUs     last_ts;        // 上次时间戳
  uint64_t        msg_count;      // 累计消息数
  uint64_t        drop_count;     // 丢帧数
  DataQuality     quality;        // 数据品质
};

/**
 * @brief Topic数据块（写入单位）
 */
struct DataBlock {
  TopicId         topic_id;       // Topic标识
  TimestampUs     timestamp;      // 消息时间戳（us）
  uint32_t        seq;            // 序列号
  uint32_t        data_size;      // 数据长度
  const uint8_t*  data_ptr;       // 数据指针（外部持有）

  DataBlock() : topic_id(0), timestamp(0), seq(0), data_size(0), data_ptr(nullptr) {}
};

/**
 * @brief 文件段元数据
 */
struct SegmentMeta {
  std::string     segment_id;     // 段唯一ID (UUID)
  std::string     file_path;      // 文件路径
  TimestampUs     start_time;     // 段起始时间戳
  TimestampUs     end_time;       // 段结束时间戳
  uint64_t        file_size;      // 文件大小(bytes)
  uint32_t        topic_count;    // Topic数量
  uint64_t        total_msgs;     // 总消息数
  FileStatus      status;         // 状态
  uint32_t        crc32;          // 文件校验
  std::string     created_at;     // 创建时间 (ISO8601)

  SegmentMeta() : topic_id(0), timestamp(0), seq(0), data_size(0), data_ptr(nullptr) {}
};

/**
 * @brief 全局落盘配置
 */
struct RecorderConfig {
  std::string     output_dir;           // 输出目录
  uint64_t        max_segment_duration_ms = 300000;  // 最大段时长 5min
  uint64_t        max_segment_size_mb = 512;          // 最大段大小 512MB
  uint32_t        buffer_capacity = 8192;             // 环形缓冲容量
  uint32_t        flush_interval_ms = 100;            // 强制刷新间隔
  bool            enable_compress = false;            // 启用压缩(zstd)
  uint32_t        compress_level = 3;                 // 压缩级别 1-22
  bool            enable_encrypt = false;             // 启用加密(AES-256-GCM)
  std::string     encrypt_key_path;                    // 密钥文件路径
  bool            enable_timestamp_check = true;      // 启用时间戳校验
  int64_t         timestamp_tolerance_ms = 1000;      // 时间戳容差
  uint32_t        merge_thread_num = 4;               // 并行合并线程数
  bool            enable_wal = true;                   // 启用预写日志
  uint32_t        wal_flush_ms = 50;                  // WAL刷新间隔

  // 默认Topic配置
  std::vector<std::string> default_topics = {
    "/apollo/sensor/lidar/front/PointCloud2",
    "/apollo/sensor/lidar/rear/PointCloud2",
    "/apollo/sensor/camera/front_120/Image",
    "/apollo/sensor/camera/front_60/Image",
    "/apollo/canbus/chassis",
    "/apollo/localization/pose",
    "/apollo/planning/trajectory",
    "/apollo/prediction/trajectory",
    "/apollo/control/pad",
    "/apollo/routing/response"
  };
};

// ============================================================================
// Interfaces
// ============================================================================

/**
 * @brief Topic数据回调接口
 */
class ITopicCallback {
public:
  virtual ~ITopicCallback() = default;
  virtual void OnData(TopicId id, const DataBlock& block) = 0;
};

/**
 * @brief 落盘状态回调接口
 */
class IRecorderObserver {
public:
  virtual ~IRecorderObserver() = default;
  virtual void OnSegmentCreated(const SegmentMeta& meta) = 0;
  virtual void OnSegmentSealed(const SegmentMeta& meta) = 0;
  virtual void OnError(const std::string& topic, int code, const std::string& msg) = 0;
  virtual void OnStats(uint64_t total_msgs, uint64_t total_bytes, float msg_rate) = 0;
};

// ============================================================================
// Core Recorder Class
// ============================================================================

/**
 * @brief ARM数据实时落盘器
 *
 * 使用方式:
 * @code
 *   Recorder recorder;
 *   recorder.SetConfig(config);
 *   recorder.SetObserver(&observer);
 *   recorder.Init();
 *   recorder.Start();
 *   // ... 数据自动落盘 ...
 *   recorder.Stop();
 * @endcode
 */
class Recorder {
public:
  Recorder();
  ~Recorder();

  // Non-copyable
  Recorder(const Recorder&) = delete;
  Recorder& operator=(const Recorder&) = delete;

  /**
   * @brief 设置配置
   */
  void SetConfig(const RecorderConfig& config);

  /**
   * @brief 设置状态观察者
   */
  void SetObserver(IRecorderObserver* observer);

  /**
   * @brief 初始化（启动前必须调用）
   * @return 0 成功, <0 错误码
   */
  int Init();

  /**
   * @brief 启动落盘
   * @return 0 成功, <0 错误码
   */
  int Start();

  /**
   * @brief 停止落盘
   * @param wait_ms 等待线程退出的超时(ms), <=0 表示无限等待
   * @return 0 成功, <0 错误码
   */
  int Stop(int wait_ms = 5000);

  /**
   * @brief 注册Topic订阅
   * @param topic_name Topic名称
   * @param msg_type 消息类型
   * @param callback 数据回调
   * @return >=0 TopicId, <0 错误码
   */
  TopicId Subscribe(const std::string& topic_name,
                    const std::string& msg_type,
                    ITopicCallback* callback);

  /**
   * @brief 取消订阅
   */
  void Unsubscribe(TopicId id);

  /**
   * @brief 手动触发分段（强制开启新段）
   * @param reason 触发原因
   */
  void ForceNewSegment(const std::string& reason);

  /**
   * @brief 获取当前段信息
   */
  bool GetCurrentSegment(SegmentMeta* meta) const;

  /**
   * @brief 获取落盘统计
   */
  void GetStats(uint64_t* total_msgs,
                uint64_t* total_bytes,
                uint64_t* dropped_msgs) const;

  /**
   * @brief 检查是否正在运行
   */
  bool IsRunning() const;

  // ========================================================================
  // 文件合并接口
  // ========================================================================

  /**
   * @brief 合并指定段
   * @param segment_ids 要合并的段ID列表
   * @param output_path 输出文件路径
   * @param topic_filter 只合并指定的Topic (空=全部)
   * @param time_range 时间范围 [start, end] (0,0]=全部
   * @return >=0 合并后消息数, <0 错误码
   */
  int MergeSegments(const std::vector<std::string>& segment_ids,
                    const std::string& output_path,
                    const std::vector<std::string>& topic_filter = {},
                    TimestampUs time_range_start = 0,
                    TimestampUs time_range_end = 0);

  /**
   * @brief 异步合并（不阻塞）
   * @param segment_ids 要合并的段ID列表
   * @param output_path 输出文件路径
   * @param callback 合并完成回调 (msg_count, error_msg)
   */
  void MergeSegmentsAsync(const std::vector<std::string>& segment_ids,
                          const std::string& output_path,
                          std::function<void(int, const std::string&)> callback);

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace arm_recorder

#endif  // ARM_RECORDER_RECORDER_H
