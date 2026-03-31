// ============================================================
// DevGuard Agent — 公共类型定义
// Language: C++17
// ============================================================
#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <optional>
#include <cstdint>

namespace devguard {

// ── 需求类型 ──────────────────────────────────────────────────────────────────

enum class RequirementType : uint8_t {
  BUSINESS  = 0,  // 业务需求 — 强制对齐
  TECHNICAL = 1,  // 技术需求 — 条件对齐
};

enum class TechPhase : uint8_t {
  PRE_COMPILE   = 0,  // 编译前 (代码规范)
  COMPILE_TIME  = 1,  // 编译时 (C++标准/编译选项)
  CODE_LOGIC    = 2,  // 代码逻辑 (接口/线程安全)
  SIGNAL_ALIGN  = 3,  // 业务信号对齐 (CAN/ROS)
  RUNTIME_PERF  = 4,  // 运行时性能 (延迟/内存/CPU)
};

enum class BlockingLevel : uint8_t {
  SOFT        = 0,  // 警告，不阻断
  HARD        = 1,  // 直接阻断
  CONDITIONAL = 2,  // 偏离需确认
};

enum class AlignMode : uint8_t {
  STRICT      = 0,  // 强制对齐 (业务需求)
  CONDITIONAL = 1,  // 有则严格 (已指定技术需求)
  SKIP        = 2,  // 跳过 (未指定技术需求)
};

// ── 功能点 ────────────────────────────────────────────────────────────────────

struct Feature {
  std::string id;
  std::string name;
  std::string description;
  RequirementType type;
  std::vector<std::string> keywords;
  std::vector<std::string> acceptance;
  std::string priority;  // P0/P1/P2
  bool mandatory = false;
  bool specified = false;
  AlignMode align_mode = AlignMode::SKIP;

  // 技术需求专属
  std::optional<TechPhase> phase;
  std::optional<std::string> constraint;
  std::optional<std::string> verification;
  BlockingLevel blocking_level = BlockingLevel::SOFT;
  bool requires_simulation = false;
};

// ── 基线模块 ──────────────────────────────────────────────────────────────────

struct BaselineModule {
  std::string id;
  std::string name;
  std::string asil;  // A/B/C/D
  bool is_realtime = false;
  std::string latency_target;
  std::string latency_max;
  std::vector<std::string> classes;
  std::vector<std::string> functions;
  std::vector<std::string> topics;
  std::vector<std::string> dependencies;
  std::vector<std::string> dependents;
};

struct Baseline {
  std::string id;
  std::string name;
  std::string version;
  std::string language;
  std::unordered_map<std::string, BaselineModule> modules;
};

// ── 对齐结果 ──────────────────────────────────────────────────────────────────

enum class AlignStatus : uint8_t {
  FULL_MATCH   = 0,  // 完全覆盖
  PARTIAL      = 1,  // 部分覆盖
  NEW_FEATURE  = 2,  // 全新功能
  TECH_DEBT    = 3,  // 技术债务
};

struct AlignResult {
  std::string feature_id;
  std::string module_id;
  AlignStatus status;
  float similarity_score = 0.0f;
  std::vector<std::string> matched_keywords;
  std::vector<std::string> missing_keywords;
  std::string risk_level;  // LOW/MEDIUM/HIGH/CRITICAL
  std::string recommendation;
};

// ── 性能指标 ──────────────────────────────────────────────────────────────────

struct PerformanceMetrics {
  std::string req_id;
  std::string scenario;
  uint64_t timestamp_us = 0;

  // 延迟
  float latency_p50_ms = 0.0f;
  float latency_p95_ms = 0.0f;
  float latency_p99_ms = 0.0f;
  float latency_max_ms = 0.0f;

  // 内存
  float memory_peak_mb = 0.0f;
  float memory_avg_mb = 0.0f;

  // CPU
  float cpu_peak_pct = 0.0f;
  float cpu_avg_pct = 0.0f;

  // 吞吐
  float throughput_hz = 0.0f;

  // 对比基线
  std::optional<float> baseline_latency_p99_ms;
  std::optional<float> baseline_memory_mb;
};

// ── 仿真结果 ──────────────────────────────────────────────────────────────────

enum class SimulationStatus : uint8_t {
  PASS        = 0,
  FAIL        = 1,
  CONDITIONAL = 2,
  PENDING     = 3,
};

struct SimulationResult {
  std::string pr_id;
  std::string scenario;
  SimulationStatus status;
  PerformanceMetrics metrics;
  std::vector<std::string> violations;  // 超出约束的需求ID
  std::string report_path;
};

}  // namespace devguard
