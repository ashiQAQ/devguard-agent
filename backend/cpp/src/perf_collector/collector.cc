// perf_collector.cc
// 性能采集器实现

#include "devguard/perf_collector.h"

#include <fstream>
#include <sstream>
#include <algorithm>
#include <cmath>
#include <chrono>
#include <nlohmann/json.hpp>

namespace devguard {

PerfCollector::PerfCollector(const CollectorConfig& config)
    : config_(config) {}

PerfCollector::~PerfCollector() {
  Stop();
}

void PerfCollector::Start() {
  if (running_) return;
  
  running_ = true;
  collect_thread_ = std::thread(&PerfCollector::CollectLoop, this);
}

void PerfCollector::Stop() {
  if (!running_) return;
  
  running_ = false;
  if (collect_thread_.joinable()) {
    collect_thread_.join();
  }
}

void PerfCollector::RecordLatency(float latency_ms) {
  std::lock_guard<std::mutex> lock(mutex_);
  latency_samples_.push_back(latency_ms);
}

void PerfCollector::CollectLoop() {
  auto start_time = std::chrono::steady_clock::now();
  
  while (running_) {
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
        now - start_time).count();
    
    if (elapsed >= config_.duration_sec) {
      break;
    }
    
    PerfSnapshot snapshot;
    snapshot.timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(
        now.time_since_epoch()).count();
    
    if (config_.collect_latency && !latency_samples_.empty()) {
      std::lock_guard<std::mutex> lock(mutex_);
      if (!latency_samples_.empty()) {
        snapshot.latency_ms = latency_samples_.back();
      }
    }
    
    if (config_.collect_memory) {
      snapshot.memory_mb = ReadMemoryMB();
    }
    
    if (config_.collect_cpu) {
      snapshot.cpu_percent = ReadCpuPercent();
    }
    
    {
      std::lock_guard<std::mutex> lock(mutex_);
      snapshots_.push_back(snapshot);
    }
    
    std::this_thread::sleep_for(
        std::chrono::milliseconds(config_.interval_ms));
  }
}

float PerfCollector::ReadMemoryMB() const {
  // 读取 /proc/self/status 中的 VmRSS
  std::ifstream status_file("/proc/self/status");
  if (!status_file.is_open()) return 0.0f;
  
  std::string line;
  while (std::getline(status_file, line)) {
    if (line.find("VmRSS:") == 0) {
      std::istringstream iss(line);
      std::string label;
      int kb;
      iss >> label >> kb;
      return kb / 1024.0f;  // 转换为 MB
    }
  }
  return 0.0f;
}

float PerfCollector::ReadCpuPercent() {
  // 读取 /proc/stat 计算 CPU 占用率
  std::ifstream stat_file("/proc/stat");
  if (!stat_file.is_open()) return 0.0f;
  
  std::string line;
  std::getline(stat_file, line);
  
  std::istringstream iss(line);
  std::string cpu_label;
  uint64_t user, nice, system, idle, iowait, irq, softirq;
  
  iss >> cpu_label >> user >> nice >> system >> idle >> iowait >> irq >> softirq;
  
  uint64_t total = user + nice + system + idle + iowait + irq + softirq;
  uint64_t idle_time = idle + iowait;
  
  if (prev_cpu_total_ == 0) {
    prev_cpu_total_ = total;
    prev_cpu_idle_ = idle_time;
    return 0.0f;
  }
  
  uint64_t total_diff = total - prev_cpu_total_;
  uint64_t idle_diff = idle_time - prev_cpu_idle_;
  
  float cpu_percent = 0.0f;
  if (total_diff > 0) {
    cpu_percent = 100.0f * (total_diff - idle_diff) / total_diff;
  }
  
  prev_cpu_total_ = total;
  prev_cpu_idle_ = idle_time;
  
  return cpu_percent;
}

PerfStats PerfCollector::GetStats() const {
  std::lock_guard<std::mutex> lock(mutex_);
  
  PerfStats stats = {};
  stats.sample_count = latency_samples_.size();
  
  if (latency_samples_.empty()) {
    return stats;
  }
  
  // 计算延迟统计
  std::vector<float> sorted_latencies = latency_samples_;
  std::sort(sorted_latencies.begin(), sorted_latencies.end());
  
  stats.p50_ms = sorted_latencies[sorted_latencies.size() * 0.5];
  stats.p95_ms = sorted_latencies[sorted_latencies.size() * 0.95];
  stats.p99_ms = sorted_latencies[sorted_latencies.size() * 0.99];
  stats.max_ms = sorted_latencies.back();
  
  float sum = 0.0f;
  for (float lat : latency_samples_) {
    sum += lat;
  }
  stats.avg_ms = sum / latency_samples_.size();
  
  // 计算内存和 CPU 统计
  if (!snapshots_.empty()) {
    float peak_mem = 0.0f;
    float sum_cpu = 0.0f;
    
    for (const auto& snap : snapshots_) {
      peak_mem = std::max(peak_mem, snap.memory_mb);
      sum_cpu += snap.cpu_percent;
    }
    
    stats.peak_memory_mb = peak_mem;
    stats.avg_cpu_percent = sum_cpu / snapshots_.size();
  }
  
  return stats;
}

std::string PerfCollector::ToJson() const {
  std::lock_guard<std::mutex> lock(mutex_);
  
  auto stats = GetStats();
  
  nlohmann::json j;
  j["stats"] = {
    {"p50_ms", stats.p50_ms},
    {"p95_ms", stats.p95_ms},
    {"p99_ms", stats.p99_ms},
    {"max_ms", stats.max_ms},
    {"avg_ms", stats.avg_ms},
    {"peak_memory_mb", stats.peak_memory_mb},
    {"avg_cpu_percent", stats.avg_cpu_percent},
    {"sample_count", stats.sample_count},
  };
  
  j["samples"] = nlohmann::json::array();
  for (const auto& snap : snapshots_) {
    j["samples"].push_back({
      {"timestamp_us", snap.timestamp_us},
      {"latency_ms", snap.latency_ms},
      {"memory_mb", snap.memory_mb},
      {"cpu_percent", snap.cpu_percent},
    });
  }
  
  return j.dump(2);
}

std::string PerfCollector::ToCsv() const {
  std::lock_guard<std::mutex> lock(mutex_);
  
  std::ostringstream oss;
  oss << "timestamp_us,latency_ms,memory_mb,cpu_percent\n";
  
  for (const auto& snap : snapshots_) {
    oss << snap.timestamp_us << ","
        << snap.latency_ms << ","
        << snap.memory_mb << ","
        << snap.cpu_percent << "\n";
  }
  
  return oss.str();
}

}  // namespace devguard
