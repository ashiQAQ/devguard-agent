/**
 * @file recorder.cc
 * @brief ARM Data Real-time Recorder - Implementation
 *
 * @version 1.0
 * @date 2026-03-29
 */

#include "recorder.h"

#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#include <zstd.h>

#include <algorithm>
#include <cerrno>
#include <cstring>
#include <fstream>
#include <random>
#include <sstream>

#include "merger.h"

// ============================================================================
// Implementation Details
// ============================================================================

namespace arm_recorder {
namespace internal {

// 文件魔数
static constexpr uint32_t kFileMagic = 0x41524D44;  // "ARMD"
static constexpr uint32_t kVersion = 1;

// 文件头 (64 bytes)
struct FileHeader {
  uint32_t magic;           // 魔数
  uint32_t version;         // 版本
  uint32_t header_size;      // 头部长度
  uint32_t flags;           // 标志位
  TimestampUs record_start;  // 录制起始时间戳
  TimestampUs record_end;    // 录制结束时间戳
  uint64_t topic_count;     // Topic数量
  uint64_t msg_count;       // 消息总数
  uint32_t segment_size;    // 单条元数据大小
  uint8_t  reserved[24];    // 保留
};

// Topic描述块
struct TopicEntry {
  uint32_t    topic_id;
  char        topic_name[128];
  char        msg_type[128];
  uint32_t    frequency;
  uint64_t    msg_count;
  TimestampUs start_ts;
  TimestampUs end_ts;
  uint8_t     reserved[8];
};

// 消息索引 (16 bytes)
struct MsgIndex {
  TimestampUs timestamp;   // 消息时间戳
  uint32_t    offset;      // 数据偏移
  uint32_t    size;        // 数据大小
  uint32_t    topic_id;    // Topic ID
};

// WAL预写日志条目
struct WALEntry {
  uint32_t    topic_id;
  TimestampUs timestamp;
  uint32_t    seq;
  uint32_t    data_size;
  uint32_t    padding;  // 对齐
};

/**
 * @brief 环形缓冲（单Topic）
 */
class RingBuffer {
public:
  explicit RingBuffer(uint32_t capacity) : capacity_(capacity) {
    buffer_.resize(capacity * 1024);  // 预分配
  }

  // 生产者：写入数据
  bool Push(TopicId tid, TimestampUs ts, const uint8_t* data, uint32_t size) {
    std::lock_guard<std::mutex> lock(mtx_);
    if (size > buffer_.size()) return false;

    // 移动写指针
    write_pos_ = (write_pos_ + 1) % capacity_;
    total_written_++;

    // 记录索引
    Index idx;
    idx.tid = tid;
    idx.ts = ts;
    idx.offset = write_pos_;
    idx.size = size;
    indices_[write_pos_] = idx;

    // 复制数据
    std::memcpy(buffer_.data() + (write_pos_ * 1024), data, std::min(size, 1024u));

    // 覆盖检测
    if (write_pos_ == read_pos_) {
      overflow_count_++;
      return false;
    }
    return true;
  }

  // 消费者：批量读取
  uint32_t PopBatch(std::vector<Index>* out_indices) {
    std::lock_guard<std::mutex> lock(mtx_);
    uint32_t count = 0;
    while (read_pos_ != write_pos_ && count < 64) {
      out_indices->push_back(indices_[read_pos_]);
      read_pos_ = (read_pos_ + 1) % capacity_;
      count++;
    }
    return count;
  }

  uint64_t overflow_count() const { return overflow_count_; }
  uint64_t total_written() const { return total_written_; }

private:
  struct Index {
    TopicId tid;
    TimestampUs ts;
    uint32_t offset;
    uint32_t size;
  };

  uint32_t capacity_;
  std::vector<uint8_t> buffer_;
  std::vector<Index> indices_;
  std::atomic<uint32_t> write_pos_{0};
  std::atomic<uint32_t> read_pos_{0};
  std::atomic<uint64_t> overflow_count_{0};
  std::atomic<uint64_t> total_written_{0};
  std::mutex mtx_;
};

// ============================================================================

}  // namespace internal
}  // namespace arm_recorder

// Now define the Recorder::Impl
namespace arm_recorder {

// ============================================================================
// Segment Writer - WAL-backed binary writer
// ============================================================================

class SegmentWriter {
public:
  SegmentWriter(const std::string& path, uint64_t max_size_mb)
      : file_path_(path),
        max_size_(max_size_mb * 1024 * 1024),
        fd_(-1),
        file_size_(0),
        msg_index_offset_(0) {}

  ~SegmentWriter() { Close(); }

  bool Open() {
    fd_ = ::open(file_path_.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd_ < 0) return false;

    // 写入文件头占位
    internal::FileHeader header{};
    header.magic = internal::kFileMagic;
    header.version = internal::kVersion;
    header.header_size = sizeof(internal::FileHeader);
    ::write(fd_, &header, sizeof(header));

    // 预分配文件空间（稀疏文件）
    ::posix_fallocate(fd_, 0, max_size_);
    file_size_ = sizeof(header);
    return true;
  }

  void Close() {
    if (fd_ >= 0) {
      ::fsync(fd_);
      ::close(fd_);
      fd_ = -1;
    }
  }

  // 写入消息（时间戳顺序）
  bool WriteMsg(uint32_t topic_id, TimestampUs ts, uint32_t seq,
                const uint8_t* data, uint32_t size) {
    if (fd_ < 0) return false;

    // 检查空间
    if (file_size_ + size + sizeof(internal::MsgIndex) > max_size_) {
      return false;  // 需要切换段
    }

    // 写索引
    internal::MsgIndex idx;
    idx.timestamp = ts;
    idx.offset = static_cast<uint32_t>(file_size_);
    idx.size = size;
    idx.topic_id = topic_id;

    ::write(fd_, &idx, sizeof(idx));
    // 写数据
    ::write(fd_, data, size);
    file_size_ += sizeof(idx) + size;
    msg_count_++;

    return true;
  }

  void Seal() {
    if (fd_ < 0) return;
    ::fsync(fd_);

    // 回填文件头
    internal::FileHeader header{};
    header.magic = internal::kFileMagic;
    header.version = internal::kVersion;
    header.header_size = sizeof(header);
    header.topic_count = topic_count_;
    header.msg_count = msg_count_;
    header.record_start = start_ts_;
    header.record_end = end_ts_;

    ::pwrite(fd_, &header, sizeof(header), 0);
    ::fsync(fd_);
  }

  void set_start_ts(TimestampUs ts) { start_ts_ = ts; }
  void set_end_ts(TimestampUs ts) { end_ts_ = ts; }
  void set_topic_count(uint64_t n) { topic_count_ = n; }
  uint64_t file_size() const { return file_size_; }
  uint64_t msg_count() const { return msg_count_; }

private:
  std::string file_path_;
  uint64_t max_size_;
  int fd_;
  uint64_t file_size_;
  TimestampUs start_ts_{0};
  TimestampUs end_ts_{0};
  uint64_t topic_count_{0};
  uint64_t msg_count_{0};
};

// ============================================================================
// Segment Manager - 段生命周期管理
// ============================================================================

class SegmentManager {
public:
  explicit SegmentManager(const std::string& output_dir) : output_dir_(output_dir) {
    ::mkdir(output_dir.c_str(), 0755);
  }

  std::string CreateSegment(TimestampUs start_ts) {
    auto id = GenerateUUID();
    auto path = output_dir_ + "/" + id + ".armd";

    auto seg = std::make_unique<SegmentWriter>(path, 512);
    seg->set_start_ts(start_ts);

    std::lock_guard<std::mutex> lock(mtx_);
    segments_[id] = std::move(seg);
    current_id_ = id;
    current_path_ = path;
    return path;
  }

  void SealCurrent(TimestampUs end_ts) {
    std::lock_guard<std::mutex> lock(mtx_);
    if (!current_id_.empty()) {
      auto it = segments_.find(current_id_);
      if (it != segments_.end()) {
        it->second->set_end_ts(end_ts);
        it->second->Seal();

        // 通知观察者
        SegmentMeta meta;
        meta.segment_id = current_id_;
        meta.file_path = current_path_;
        meta.start_time = it->second->set_start_ts ? 0 : 0;  // placeholder
        meta.end_time = end_ts;
        meta.file_size = it->second->file_size();
        meta.total_msgs = it->second->msg_count();
        meta.status = FileStatus::kSealed;
      }
    }
    current_id_.clear();
    current_path_.clear();
  }

  bool WriteToCurrent(uint32_t tid, TimestampUs ts, uint32_t seq,
                      const uint8_t* data, uint32_t size) {
    std::lock_guard<std::mutex> lock(mtx_);
    if (current_id_.empty()) return false;
    auto it = segments_.find(current_id_);
    if (it == segments_.end()) return false;
    return it->second->WriteMsg(tid, ts, seq, data, size);
  }

  bool ShouldSplit(uint64_t current_size, TimestampUs current_duration_ms,
                   uint64_t max_size_mb, uint64_t max_duration_ms) {
    return current_size >= max_size_mb * 1024 * 1024 ||
           current_duration_ms >= max_duration_ms;
  }

private:
  std::string GenerateUUID() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 15);

    char buf[37];
    snprintf(buf, sizeof(buf),
             "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
             dis(gen), dis(gen), dis(gen), dis(gen),
             dis(gen), dis(gen), dis(gen), dis(gen),
             dis(gen), dis(gen), dis(gen), dis(gen),
             dis(gen), dis(gen), dis(gen), dis(gen));
    return std::string(buf);
  }

  std::string output_dir_;
  std::mutex mtx_;
  std::unordered_map<std::string, std::unique_ptr<SegmentWriter>> segments_;
  std::string current_id_;
  std::string current_path_;
};

// ============================================================================
// Impl
// ============================================================================

struct Recorder::Impl {
  RecorderConfig   config_;
  IRecorderObserver* observer_ = nullptr;

  std::atomic<bool> running_{false};
  std::thread       writer_thread_;
  std::thread       stats_thread_;

  std::unique_ptr<SegmentManager> segment_mgr_;
  std::mutex           write_mtx_;
  std::atomic<uint64_t> total_msgs_{0};
  std::atomic<uint64_t> total_bytes_{0};
  std::atomic<uint64_t> dropped_msgs_{0};

  // Topic注册表
  std::map<TopicId, TopicMeta> topic_table_;
  std::mutex topic_mtx_;

  TimestampUs segment_start_ts_{0};
  uint64_t     segment_start_wall_ms_{0};
  std::atomic<uint64_t> current_segment_size_{0};

  // 双缓冲
  struct PendingMsg {
    uint32_t    tid;
    TimestampUs ts;
    uint32_t    seq;
    std::vector<uint8_t> data;
  };
  std::vector<PendingMsg> pending_a_, pending_b_;
  std::atomic<std::vector<PendingMsg>*> writing_buf_{&pending_a_};
  std::vector<PendingMsg>* readable_buf_{&pending_b_};

  Impl() = default;

  void SetConfig(const RecorderConfig& cfg) { config_ = cfg; }

  void SetObserver(IRecorderObserver* obs) { observer_ = obs; }

  int Init() {
    if (config_.output_dir.empty()) {
      config_.output_dir = "/tmp/arm_recordings";
    }
    segment_mgr_ = std::make_unique<SegmentManager>(config_.output_dir);
    return 0;
  }

  int Start() {
    if (running_.exchange(true)) return -1;

    segment_start_ts_ = NowUs();
    segment_start_wall_ms_ = NowMs();

    auto path = segment_mgr_->CreateSegment(segment_start_ts_);

    writer_thread_ = std::thread([this]() { WriterLoop(); });
    stats_thread_   = std::thread([this]() { StatsLoop(); });

    return 0;
  }

  int Stop(int wait_ms) {
    if (!running_.exchange(false)) return 0;

    if (writer_thread_.joinable()) {
      if (wait_ms > 0) writer_thread_.join();
      else writer_thread_.detach();
    }
    if (stats_thread_.joinable()) stats_thread_.join();

    // 封存当前段
    segment_mgr_->SealCurrent(NowUs());

    return 0;
  }

  TopicId Subscribe(const std::string& topic_name,
                    const std::string& msg_type,
                    ITopicCallback* callback) {
    std::lock_guard<std::mutex> lock(topic_mtx_);
    TopicId id = static_cast<TopicId>(topic_table_.size() + 1);
    TopicMeta meta;
    meta.name = topic_name;
    meta.msg_type = msg_type;
    topic_table_[id] = meta;
    return id;
  }

  void Unsubscribe(TopicId id) {
    std::lock_guard<std::mutex> lock(topic_mtx_);
    topic_table_.erase(id);
  }

  void Enqueue(uint32_t tid, TimestampUs ts, uint32_t seq,
               const uint8_t* data, uint32_t size) {
    if (!running_.load()) return;

    PendingMsg msg;
    msg.tid = tid;
    msg.ts = ts;
    msg.seq = seq;
    msg.data.assign(data, data + size);

    auto buf = writing_buf_.load();
    {
      std::lock_guard<std::mutex> lock(write_mtx_);
      buf->push_back(std::move(msg));
    }

    total_msgs_.fetch_add(1, std::memory_order_relaxed);
    total_bytes_.fetch_add(size, std::memory_order_relaxed);
  }

  void ForceNewSegment(const std::string& reason) {
    std::lock_guard<std::mutex> lock(write_mtx_);
    segment_mgr_->SealCurrent(NowUs());

    TimestampUs new_ts = NowUs();
    auto path = segment_mgr_->CreateSegment(new_ts);
    segment_start_ts_ = new_ts;
    segment_start_wall_ms_ = NowMs();
    current_segment_size_.store(0, std::memory_order_relaxed);
  }

  void GetStats(uint64_t* total_msgs, uint64_t* total_bytes,
                uint64_t* dropped_msgs) const {
    if (total_msgs) *total_msgs = total_msgs_.load();
    if (total_bytes) *total_bytes = total_bytes_.load();
    if (dropped_msgs) *dropped_msgs = dropped_msgs_.load();
  }

  int MergeSegments(const std::vector<std::string>& segment_ids,
                    const std::string& output_path,
                    const std::vector<std::string>& topic_filter,
                    TimestampUs time_start, TimestampUs time_end) {
    Merger merger(output_path);
    return merger.Merge(segment_ids, topic_filter, time_start, time_end);
  }

private:
  // Writer loop - 双缓冲批量写
  void WriterLoop() {
    std::vector<PendingMsg> local_buf;

    while (running_.load()) {
      {
        std::lock_guard<std::mutex> lock(write_mtx_);
        auto buf = writing_buf_.load();
        readable_buf_.store(buf);
        if (buf == &pending_a_) {
          writing_buf_.store(&pending_b_);
        } else {
          writing_buf_.store(&pending_a_);
        }
        local_buf.swap(*buf);
      }

      // 按时间戳排序
      std::sort(local_buf.begin(), local_buf.end(),
                [](const PendingMsg& a, const PendingMsg& b) {
                  return a.ts < b.ts;
                });

      // 批量写入
      for (const auto& msg : local_buf) {
        // 时间戳检查
        if (config_.enable_timestamp_check) {
          if (std::llabs(msg.ts - segment_start_ts_) >
              config_.timestamp_tolerance_ms * 1000) {
            // 异常时间戳，跳过
            dropped_msgs_.fetch_add(1, std::memory_order_relaxed);
            continue;
          }
        }

        // 写入段
        bool ok = segment_mgr_->WriteToCurrent(
            msg.tid, msg.ts, msg.seq, msg.data.data(),
            static_cast<uint32_t>(msg.data.size()));

        if (!ok) {
          // 触发分段
          auto now_ms = NowMs();
          auto dur_ms = now_ms - segment_start_wall_ms_;
          if (segment_mgr_->ShouldSplit(current_segment_size_.load(), dur_ms,
                                        config_.max_segment_size_mb,
                                        config_.max_segment_duration_ms)) {
            std::lock_guard<std::mutex> lock(write_mtx_);
            segment_mgr_->SealCurrent(msg.ts);
            auto new_path = segment_mgr_->CreateSegment(msg.ts);
            segment_start_ts_ = msg.ts;
            segment_start_wall_ms_ = now_ms;
            current_segment_size_.store(0, std::memory_order_relaxed);

            if (observer_) {
              SegmentMeta meta;
              meta.segment_id = "new";
              meta.file_path = new_path;
              observer_->OnSegmentCreated(meta);
            }
          }

          // 重试写入
          segment_mgr_->WriteToCurrent(msg.tid, msg.ts, msg.seq,
                                       msg.data.data(),
                                       static_cast<uint32_t>(msg.data.size()));
        }

        current_segment_size_.fetch_add(msg.data.size(),
                                        std::memory_order_relaxed);
      }

      local_buf.clear();
      std::this_thread::sleep_for(std::chrono::milliseconds(
          config_.flush_interval_ms));
    }

    // 最后强制刷盘
    segment_mgr_->SealCurrent(NowUs());
  }

  // Stats汇报循环
  void StatsLoop() {
    while (running_.load()) {
      if (observer_) {
        observer_->OnStats(total_msgs_.load(), total_bytes_.load(),
                           0.0f);
      }
      std::this_thread::sleep_for(std::chrono::seconds(5));
    }
  }

  static TimestampUs NowUs() {
    return std::chrono::duration_cast<std::chrono::microseconds>(
               std::chrono::steady_clock::now().time_since_epoch())
        .count();
  }

  static uint64_t NowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now().time_since_epoch())
        .count();
  }
};

// ============================================================================
// Public Interface
// ============================================================================

Recorder::Recorder() : impl_(std::make_unique<Impl>()) {}
Recorder::~Recorder() { Stop(); }

void Recorder::SetConfig(const RecorderConfig& config) { impl_->SetConfig(config); }
void Recorder::SetObserver(IRecorderObserver* observer) { impl_->SetObserver(observer); }
int  Recorder::Init() { return impl_->Init(); }
int  Recorder::Start() { return impl_->Start(); }
int  Recorder::Stop(int wait_ms) { return impl_->Stop(wait_ms); }
bool Recorder::IsRunning() const { return impl_->running_.load(); }

TopicId Recorder::Subscribe(const std::string& topic, const std::string& msg_type,
                            ITopicCallback* callback) {
  return impl_->Subscribe(topic, msg_type, callback);
}
void Recorder::Unsubscribe(TopicId id) { impl_->Unsubscribe(id); }

void Recorder::ForceNewSegment(const std::string& reason) {
  impl_->ForceNewSegment(reason);
}

bool Recorder::GetCurrentSegment(SegmentMeta* meta) const {
  // placeholder
  return false;
}

void Recorder::GetStats(uint64_t* total_msgs, uint64_t* total_bytes,
                        uint64_t* dropped_msgs) const {
  impl_->GetStats(total_msgs, total_bytes, dropped_msgs);
}

int Recorder::MergeSegments(const std::vector<std::string>& segment_ids,
                            const std::string& output_path,
                            const std::vector<std::string>& topic_filter,
                            TimestampUs time_start, TimestampUs time_end) {
  return impl_->MergeSegments(segment_ids, output_path, topic_filter,
                              time_start, time_end);
}

void Recorder::MergeSegmentsAsync(
    const std::vector<std::string>& segment_ids,
    const std::string& output_path,
    std::function<void(int, const std::string&)> callback) {
  std::thread([=]() {
    int result = MergeSegments(segment_ids, output_path, {}, 0, 0);
    callback(result, result >= 0 ? "" : "Merge failed");
  }).detach();
}

}  // namespace arm_recorder
