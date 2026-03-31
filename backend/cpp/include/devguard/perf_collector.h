// perf_collector.h
// 性能采集器 — 低开销实时性能监控
// 采集延迟/内存/CPU 指标，输出 JSON

#pragma once

#include <string>
#include <vector>
#include <map>
#include <chrono>
#include <atomic>
#include <thread>
#include <functional>

namespace devguard {

// 性能指标快照
struct PerfSnapshot {
  uint64_t timestamp_us;   // 时间戳 (微秒)
  float latency_ms;        // 处理延迟 (ms)
  float memory_mb;         // 内存占用 (MB)
  float cpu_percent;       // CPU 占用率 (%)
  float throughput_hz;     // 吞吐量 (Hz)
};

// 性能统计
struct PerfStats {
  float p50_ms;
  float p95_ms;
  float p99_ms;
  float max_ms;
  float avg_ms;
  float peak_memory_mb;
  float avg_cpu_percent;
  float avg_throughput_hz;
  uint64_t sample_count;
};

// 采集配置
struct CollectorConfig {
  int interval_ms = 100;       // 采集间隔 (ms)
  int duration_sec = 60;       // 采集时长 (s)
  bool collect_latency = true;
  bool collect_memory = true;
  bool collect_cpu = true;
  bool collect_throughput = true;
  std::string output_format = "json";  // json / csv
};

// 性能采集器
class PerfCollector {
 public:
  explicit PerfCollector(const CollectorConfig& config);
  ~PerfCollector();

  // 开始采集
  void Start();

  // 停止采集
  void Stop();

  // 记录一次处理延迟
  void RecordLatency(float latency_ms);

  // 获取统计结果
  PerfStats GetStats() const;

  // 输出 JSON
  std::string ToJson() const;

  // 输出 CSV
  std::string ToCsv() const;

 private:
  // 采集线程
  void CollectLoop();

  // 读取内存占用 (MB)
  float ReadMemoryMB() const;

  // 读取 CPU 占用率 (%)
  float ReadCpuPercent();

  CollectorConfig config_;
  std::vector<PerfSnapshot> snapshots_;
  std::vector<float> latency_samples_;

  std::atomic<bool> running_{false};
  std::thread collect_thread_;

  // CPU 计算状态
  uint64_t prev_cpu_total_ = 0;
  uint64_t prev_cpu_idle_ = 0;

  mutable std::mutex mutex_;
};

}  // namespace devguard
