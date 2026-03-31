/**
 * @file merger.cc
 * @brief Segment Merger - Implementation
 *
 * @version 1.0
 * @date 2026-03-29
 */

#include "merger.h"

#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#include <zstd.h>

#include <algorithm>
#include <chrono>
#include <fstream>
#include <numeric>
#include <queue>

namespace arm_recorder {
namespace internal {
static constexpr uint32_t kFileMagic = 0x41524D44;  // "ARMD"

struct FileHeader {
  uint32_t  magic;
  uint32_t  version;
  uint32_t  header_size;
  uint32_t  flags;
  int64_t   record_start;
  int64_t   record_end;
  uint64_t  topic_count;
  uint64_t  msg_count;
  uint32_t  segment_size;
  uint8_t   reserved[24];
};

struct MsgIndex {
  int64_t   timestamp;  // 微秒时间戳
  uint32_t  offset;
  uint32_t  size;
  uint32_t  topic_id;
};

struct TopicEntry {
  uint32_t  topic_id;
  char      topic_name[128];
  char      msg_type[128];
  uint32_t  frequency;
  uint64_t  msg_count;
  int64_t   start_ts;
  int64_t   end_ts;
  uint8_t   reserved[8];
};

}  // namespace internal

// ============================================================================
// Merger::Impl
// ============================================================================

struct Merger::Impl {
  std::string output_path_;
  int output_fd_ = -1;

  std::vector<std::string> segment_paths_;  // segment_id -> file_path
  std::vector<std::string> topic_filter_;
  int64_t time_start_ = 0;
  int64_t time_end_ = 0;

  // 多路归并状态
  struct SegmentReader {
    int                  fd;
    const uint8_t*      mmap_base;
    size_t              mmap_size;
    internal::FileHeader header;
    std::vector<internal::TopicEntry> topics;
    std::vector<internal::MsgIndex>   indices;  // 内存索引
    size_t             idx_pos;   // 当前消费到的索引位置
    std::string        seg_id;
    std::string        file_path;
    bool                valid;
    std::string         error;

    ~SegmentReader() {
      if (mmap_base && mmap_base != MAP_FAILED) munmap(const_cast<uint8_t*>(mmap_base), mmap_size);
      if (fd >= 0) ::close(fd);
    }
  };

  std::vector<std::unique_ptr<SegmentReader>> readers_;
  std::atomic<bool>                           stop_{false};

  MergeStats stats_{};

  explicit Impl(const std::string& out) : output_path_(out) {}

  ~Impl() {
    if (output_fd_ >= 0) {
      ::fsync(output_fd_);
      ::close(output_fd_);
    }
  }

  // -------------------------------------------------------------------------
  // 步骤1：打开并索引所有段文件
  // -------------------------------------------------------------------------
  bool OpenSegments(const std::vector<std::string>& segment_ids) {
    readers_.clear();

    for (const auto& sid : segment_ids) {
      auto reader = std::make_unique<SegmentReader>();
      reader->seg_id = sid;
      // 路径映射：这里简化，实际从 SegmentManager 查询
      reader->file_path = "/tmp/arm_recordings/" + sid + ".armd";

      struct stat st;
      if (::stat(reader->file_path.c_str(), &st) < 0) {
        reader->valid = false;
        reader->error = strerror(errno);
        readers_.push_back(std::move(reader));
        continue;
      }

      reader->fd = ::open(reader->file_path.c_str(), O_RDONLY);
      if (reader->fd < 0) {
        reader->valid = false;
        reader->error = strerror(errno);
        readers_.push_back(std::move(reader));
        continue;
      }

      // Mmap整个文件（段文件通常<=512MB，可接受）
      reader->mmap_size = st.st_size;
      reader->mmap_base = static_cast<const uint8_t*>(
          ::mmap(nullptr, st.st_size, PROT_READ, MAP_PRIVATE, reader->fd, 0));

      if (reader->mmap_base == MAP_FAILED) {
        reader->valid = false;
        reader->error = "mmap failed";
        readers_.push_back(std::move(reader));
        continue;
      }

      // 解析文件头
      auto* hdr = reinterpret_cast<const internal::FileHeader*>(reader->mmap_base);
      if (hdr->magic != internal::kFileMagic) {
        reader->valid = false;
        reader->error = "invalid magic";
        readers_.push_back(std::move(reader));
        continue;
      }
      reader->header = *hdr;
      reader->valid = true;

      // 建立索引：扫描消息索引区
      size_t topic_region_size = hdr->topic_count * sizeof(internal::TopicEntry);
      const auto* topic_ptr = reinterpret_cast<const internal::TopicEntry*>(
          reader->mmap_base + sizeof(internal::FileHeader));
      for (uint64_t i = 0; i < hdr->topic_count; ++i) {
        reader->topics.push_back(topic_ptr[i]);
      }

      // 索引区紧跟在Topic描述后
      size_t index_region_start = sizeof(internal::FileHeader) + topic_region_size;
      size_t index_count = (st.st_size - index_region_start) / sizeof(internal::MsgIndex);

      for (size_t i = 0; i < index_count; ++i) {
        const auto* idx = reinterpret_cast<const internal::MsgIndex*>(
            reader->mmap_base + index_region_start + i * sizeof(internal::MsgIndex));
        reader->indices.push_back(*idx);
      }

      readers_.push_back(std::move(reader));
    }

    return std::any_of(readers_.begin(), readers_.end(),
                      [](const auto& r) { return r->valid; });
  }

  // -------------------------------------------------------------------------
  // 步骤2：多路归并（外部排序思想）
  // -------------------------------------------------------------------------
  int DoMerge(ProgressCallback progress_cb) {
    auto start_time = std::chrono::steady_clock::now();

    // 打开输出文件
    output_fd_ = ::open(output_path_.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (output_fd_ < 0) return -1;

    // 写输出文件头（占位）
    internal::FileHeader out_header{};
    out_header.magic = internal::kFileMagic;
    out_header.version = 1;
    out_header.header_size = sizeof(out_header);
    ::write(output_fd_, &out_header, sizeof(out_header));

    // 构建Topic过滤器集合
    std::unordered_set<uint32_t> filter_ids;
    if (!topic_filter_.empty()) {
      for (const auto& r : readers_) {
        if (!r->valid) continue;
        for (const auto& t : r->topics) {
          for (const auto& f : topic_filter_) {
            if (std::string(t.topic_name).find(f) != std::string::npos) {
              filter_ids.insert(t.topic_id);
            }
          }
        }
      }
    }

    // 多路归并队列：小顶堆（按时间戳）
    struct HeapItem {
      int64_t  timestamp;
      size_t   reader_idx;  // 指向 readers_
      size_t   idx_in_seg; // 在该reader的indices中的位置
      bool operator>(const HeapItem& o) const { return timestamp > o.timestamp; }
    };
    std::priority_queue<HeapItem, std::vector<HeapItem>, std::greater<HeapItem>> heap;

    // 初始化：每个有效段放入第一条消息
    for (size_t ri = 0; ri < readers_.size(); ++ri) {
      auto& r = readers_[ri];
      if (!r || !r->valid || r->indices.empty()) continue;
      r->idx_pos = 0;
      const auto& idx = r->indices[0];
      if (time_start_ > 0 && idx.timestamp < time_start_) continue;
      if (time_end_ > 0 && idx.timestamp > time_end_) continue;
      if (!filter_ids.empty() && filter_ids.find(idx.topic_id) == filter_ids.end()) {
        stats_.skipped_by_filter++;
        continue;
      }
      heap.push({idx.timestamp, ri, 0});
    }

    int64_t total_merged = 0;
    int64_t total_input = 0;
    for (const auto& r : readers_) {
      if (r->valid) total_input += r->header.msg_count;
    }

    // 归并过程
    std::vector<uint8_t> msg_buf;
    std::vector<internal::MsgIndex> out_indices;

    while (!heap.empty()) {
      auto item = heap.top();
      heap.pop();

      auto& reader = readers_[item.reader_idx];
      const auto& idx = reader->indices[item.idx_in_seg];

      // 读取消息数据
      size_t data_off = sizeof(internal::FileHeader) +
          reader->header.topic_count * sizeof(internal::TopicEntry) + idx.offset;
      if (data_off + idx.size > reader->mmap_size) {
        stats_.dropped_gaps++;
        continue;
      }

      // 写消息数据
      ::write(output_fd_, reader->mmap_base + data_off, idx.size);
      out_indices.push_back(idx);

      // 推进该reader的下一个索引
      size_t next_pos = item.idx_in_seg + 1;
      if (next_pos < reader->indices.size()) {
        const auto& next_idx = reader->indices[next_pos];
        if (time_end_ <= 0 || next_idx.timestamp <= time_end_) {
          if (filter_ids.empty() ||
              filter_ids.find(next_idx.topic_id) != filter_ids.end()) {
            heap.push({next_idx.timestamp, item.reader_idx, next_pos});
          }
        }
      }

      total_merged++;

      // 进度回调
      if (progress_cb && total_input > 0) {
        float pct = static_cast<float>(total_merged) / total_input * 100.0f;
        progress_cb(pct, ("merged " + std::to_string(total_merged) + " msgs").c_str());
      }
    }

    // 回填输出文件头
    out_header.record_start = time_start_ > 0 ? time_start_ : (readers_.front() ? readers_.front()->header.record_start : 0);
    out_header.record_end = time_end_ > 0 ? time_end_ : (readers_.back() ? readers_.back()->header.record_end : 0);
    out_header.msg_count = total_merged;
    out_header.topic_count = filter_ids.empty() ? readers_.front()->header.topic_count : filter_ids.size();
    ::pwrite(output_fd_, &out_header, sizeof(out_header), 0);
    ::fsync(output_fd_);

    auto end_time = std::chrono::steady_clock::now();
    auto ms = std::chrono::duration<double>(end_time - start_time).count() * 1000;

    stats_.total_input_msgs = total_input;
    stats_.total_output_msgs = total_merged;
    stats_.elapsed_seconds = ms / 1000.0;
    stats_.throughput_mbps = (total_merged > 0 && ms > 0)
        ? (stats_.total_output_msgs * 200.0 / ms / 1000.0) : 0;  // 估算

    return static_cast<int>(total_merged);
  }
};

// ============================================================================
// Public Interface
// ============================================================================

Merger::Merger(const std::string& output_path) : impl_(std::make_unique<Impl>(output_path)) {}
Merger::~Merger() = default;

int Merger::Merge(const std::vector<std::string>& segment_ids,
                 const std::vector<std::string>& topic_filter,
                 int64_t time_start, int64_t time_end,
                 ProgressCallback progress_cb) {
  impl_->segment_paths_ = segment_ids;
  impl_->topic_filter_ = topic_filter;
  impl_->time_start_ = time_start;
  impl_->time_end_ = time_end;

  if (!impl_->OpenSegments(segment_ids)) return -1;
  return impl_->DoMerge(progress_cb);
}

Merger::MergeStats Merger::GetStats() const { return impl_->stats_; }

int64_t Merger::EstimateOutputSize(const std::vector<std::string>& segment_ids) {
  int64_t total = 0;
  for (const auto& sid : segment_ids) {
    std::string path = "/tmp/arm_recordings/" + sid + ".armd";
    struct stat st;
    if (::stat(path.c_str(), &st) == 0) total += st.st_size;
  }
  return total;
}

std::vector<Merger::SegmentInfo> Merger::InspectSegments(
    const std::vector<std::string>& segment_ids) {
  std::vector<SegmentInfo> result;
  for (const auto& sid : segment_ids) {
    SegmentInfo info;
    info.segment_id = sid;
    info.file_path = "/tmp/arm_recordings/" + sid + ".armd";
    struct stat st;
    if (::stat(info.file_path.c_str(), &st) == 0) {
      info.file_size = st.st_size;
      info.valid = true;
    } else {
      info.valid = false;
      info.error_msg = strerror(errno);
    }
    result.push_back(info);
  }
  return result;
}

}  // namespace arm_recorder
