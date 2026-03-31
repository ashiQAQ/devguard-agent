/**
 * @file merger.h
 * @brief Segment Merger - 文件段合并核心逻辑
 *
 * 功能：多段ARM文件按时间戳顺序合并，支持Topic过滤、时间范围切分
 * 核心算法：外部归并排序（O(N)时间复杂度）
 *
 * @version 1.0
 * @date 2026-03-29
 */
#ifndef ARM_RECORDER_MERGER_H
#define ARM_RECORDER_MERGER_H

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace arm_recorder {

class Merger {
public:
  using ProgressCallback = std::function<void(float progress, const char* status)>;

  /**
   * @brief 构造函数
   * @param output_path 输出文件路径
   */
  explicit Merger(const std::string& output_path);

  /**
   * @brief 析构（确保文件关闭）
   */
  ~Merger();

  /**
   * @brief 合并多个段
   * @param segment_ids   段ID列表（内部存储路径映射）
   * @param topic_filter  Topic过滤器（空=全部）
   * @param time_start    起始时间戳（us，0=从头）
   * @param time_end      结束时间戳（us，0=到末尾）
   * @param progress_cb   进度回调
   * @return >=0 合并消息数, <0 错误码
   */
  int Merge(const std::vector<std::string>& segment_ids,
            const std::vector<std::string>& topic_filter = {},
            int64_t time_start = 0,
            int64_t time_end = 0,
            ProgressCallback progress_cb = nullptr);

  /**
   * @brief 获取合并状态
   */
  struct MergeStats {
    int64_t  total_input_msgs;   // 输入消息总数
    int64_t  total_output_msgs;  // 输出消息总数
    int64_t  skipped_by_filter;  // Topic过滤跳过数
    int64_t  skipped_by_range;   // 时间范围过滤跳过数
    int64_t  dropped_gaps;       // 丢弃的乱序消息
    double   elapsed_seconds;   // 耗时
    double   throughput_mbps;    // 吞吐率 MB/s
  };
  MergeStats GetStats() const;

  /**
   * @brief 估算输出文件大小
   */
  int64_t EstimateOutputSize(const std::vector<std::string>& segment_ids);

  /**
   * @brief 验证段文件的完整性
   */
  struct SegmentInfo {
    std::string segment_id;
    std::string file_path;
    int64_t     file_size;
    int64_t     msg_count;
    int64_t     start_ts;
    int64_t     end_ts;
    bool        valid;
    std::string error_msg;
  };
  std::vector<SegmentInfo> InspectSegments(const std::vector<std::string>& segment_ids);

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace arm_recorder

#endif  // ARM_RECORDER_MERGER_H
