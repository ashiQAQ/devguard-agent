/**
 * arm_recorder — ARM 传感器数据实时落盘系统
 *
 * 架构：
 *   SensorBus (ROS2 Topic) → TopicSubscriber → RingBuffer → DiskWriter → FileRotator
 *
 * 当前实现（基线版本 v1.0）：
 *   - 订阅多个 ROS2 Topic（LiDAR / Camera / IMU / CAN）
 *   - 按固定文件大小切割（默认 512MB）
 *   - 文件命名：{topic}_{timestamp}.bag
 *   - 无 Topic 对齐，无跨文件合并索引
 */

#pragma once
#include <string>
#include <vector>
#include <unordered_map>
#include <mutex>
#include <atomic>
#include <thread>
#include <fstream>
#include <functional>
#include <chrono>
#include <cstdint>

namespace arm_recorder {

// ─── 基础数据结构 ─────────────────────────────────────────────────────────────

struct Header {
  uint64_t timestamp_ns;   // 纳秒时间戳
  uint32_t seq;            // 序列号
  std::string frame_id;    // 坐标系
};

struct Message {
  Header   header;
  std::string topic;
  std::vector<uint8_t> data;
  size_t   size() const { return data.size(); }
};

// ─── 配置 ─────────────────────────────────────────────────────────────────────

struct RecorderConfig {
  std::string output_dir       = "/data/recordings";
  size_t      max_file_size_mb = 512;          // 单文件最大 MB
  size_t      ring_buffer_size = 4096;         // 环形缓冲区消息数
  bool        compress         = false;        // 是否压缩（LZ4）
  std::vector<std::string> topics = {
    "/perception/lidar/points",
    "/perception/camera/front",
    "/localization/imu",
    "/canbus/chassis",
    "/planning/trajectory",
  };
};

// ─── 环形缓冲区 ───────────────────────────────────────────────────────────────

class RingBuffer {
public:
  explicit RingBuffer(size_t capacity)
    : capacity_(capacity), head_(0), tail_(0), count_(0) {
    buffer_.resize(capacity);
  }

  bool push(Message&& msg) {
    std::lock_guard<std::mutex> lk(mtx_);
    if (count_ >= capacity_) return false;  // 丢弃（TODO: 背压策略）
    buffer_[tail_] = std::move(msg);
    tail_ = (tail_ + 1) % capacity_;
    ++count_;
    return true;
  }

  bool pop(Message& msg) {
    std::lock_guard<std::mutex> lk(mtx_);
    if (count_ == 0) return false;
    msg = std::move(buffer_[head_]);
    head_ = (head_ + 1) % capacity_;
    --count_;
    return true;
  }

  size_t size() const {
    std::lock_guard<std::mutex> lk(mtx_);
    return count_;
  }

private:
  std::vector<Message> buffer_;
  size_t capacity_, head_, tail_, count_;
  mutable std::mutex mtx_;
};

// ─── 文件写入器（当前版本：按大小切割，无 Topic 对齐）────────────────────────

class DiskWriter {
public:
  explicit DiskWriter(const RecorderConfig& cfg) : cfg_(cfg) {}

  void open(const std::string& topic, uint64_t start_ts) {
    std::lock_guard<std::mutex> lk(mtx_);
    auto& ctx = files_[topic];
    ctx.start_ts = start_ts;
    ctx.bytes_written = 0;
    ctx.seq = 0;

    // 文件名：{output_dir}/{topic_safe}_{timestamp_ms}.bin
    std::string safe_topic = topic;
    std::replace(safe_topic.begin(), safe_topic.end(), '/', '_');
    ctx.path = cfg_.output_dir + "/" + safe_topic + "_"
               + std::to_string(start_ts / 1000000) + ".bin";

    ctx.ofs.open(ctx.path, std::ios::binary | std::ios::trunc);
    if (!ctx.ofs.is_open()) {
      throw std::runtime_error("Cannot open file: " + ctx.path);
    }
    write_file_header(ctx);
  }

  /**
   * 写入一条消息
   * @return true 如果触发了文件切割
   */
  bool write(const Message& msg) {
    std::lock_guard<std::mutex> lk(mtx_);
    auto it = files_.find(msg.topic);
    if (it == files_.end()) return false;

    auto& ctx = it->second;

    // 写入消息头（8字节时间戳 + 4字节长度）
    uint64_t ts = msg.header.timestamp_ns;
    uint32_t len = static_cast<uint32_t>(msg.data.size());
    ctx.ofs.write(reinterpret_cast<const char*>(&ts), 8);
    ctx.ofs.write(reinterpret_cast<const char*>(&len), 4);
    ctx.ofs.write(reinterpret_cast<const char*>(msg.data.data()), len);
    ctx.bytes_written += 12 + len;
    ctx.last_ts = ts;
    ++ctx.seq;

    // 检查是否需要切割
    if (ctx.bytes_written >= cfg_.max_file_size_mb * 1024 * 1024) {
      rotate_file(ctx, msg.topic);
      return true;
    }
    return false;
  }

  void close_all() {
    std::lock_guard<std::mutex> lk(mtx_);
    for (auto& [topic, ctx] : files_) {
      if (ctx.ofs.is_open()) {
        write_file_footer(ctx);
        ctx.ofs.close();
      }
    }
  }

  struct FileContext {
    std::ofstream ofs;
    std::string   path;
    uint64_t      start_ts    = 0;
    uint64_t      last_ts     = 0;
    size_t        bytes_written = 0;
    uint32_t      seq         = 0;
  };

private:
  void write_file_header(FileContext& ctx) {
    // Magic + version + start_ts
    const char magic[] = "ARMREC01";
    ctx.ofs.write(magic, 8);
    ctx.ofs.write(reinterpret_cast<const char*>(&ctx.start_ts), 8);
  }

  void write_file_footer(FileContext& ctx) {
    // end_ts + total_msgs
    ctx.ofs.write(reinterpret_cast<const char*>(&ctx.last_ts), 8);
    ctx.ofs.write(reinterpret_cast<const char*>(&ctx.seq), 4);
  }

  void rotate_file(FileContext& ctx, const std::string& topic) {
    write_file_footer(ctx);
    ctx.ofs.close();
    // 重新打开新文件（使用 last_ts 作为新文件起始时间戳）
    open(topic, ctx.last_ts);
  }

  RecorderConfig cfg_;
  std::unordered_map<std::string, FileContext> files_;
  mutable std::mutex mtx_;
};

// ─── 主录制器 ─────────────────────────────────────────────────────────────────

class ArmRecorder {
public:
  explicit ArmRecorder(const RecorderConfig& cfg)
    : cfg_(cfg), buffer_(cfg.ring_buffer_size), writer_(cfg), running_(false) {}

  void start() {
    running_ = true;
    uint64_t now = current_time_ns();

    // 为每个 Topic 打开文件
    for (const auto& topic : cfg_.topics) {
      writer_.open(topic, now);
    }

    // 启动写盘线程
    write_thread_ = std::thread([this]() { write_loop(); });
  }

  void stop() {
    running_ = false;
    if (write_thread_.joinable()) write_thread_.join();
    writer_.close_all();
  }

  // 接收消息（由 ROS2 回调调用）
  void on_message(Message msg) {
    if (!buffer_.push(std::move(msg))) {
      ++dropped_count_;  // 缓冲区满，丢弃
    }
  }

  size_t dropped() const { return dropped_count_.load(); }

private:
  void write_loop() {
    Message msg;
    while (running_ || buffer_.size() > 0) {
      if (buffer_.pop(msg)) {
        writer_.write(msg);
      } else {
        std::this_thread::sleep_for(std::chrono::microseconds(100));
      }
    }
  }

  static uint64_t current_time_ns() {
    return static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::system_clock::now().time_since_epoch()
      ).count()
    );
  }

  RecorderConfig cfg_;
  RingBuffer     buffer_;
  DiskWriter     writer_;
  std::thread    write_thread_;
  std::atomic<bool>   running_;
  std::atomic<size_t> dropped_count_{0};
};

}  // namespace arm_recorder
