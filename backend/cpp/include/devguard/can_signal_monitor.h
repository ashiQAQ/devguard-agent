// ============================================================
// DevGuard Agent — CAN 信号实时监控器 (C++17)
// 部署位置: 域控 (ADCU/MDC/Orin)
// 功能: 实时采集 CAN 信号，与符号需求对比，违规立即上报
// ============================================================
#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <functional>
#include <atomic>
#include <thread>
#include <mutex>
#include <chrono>
#include <cstdint>

#include "devguard/symbolic_validator.h"

namespace devguard {

// ── CAN 帧 ────────────────────────────────────────────────────────────────────

struct CanFrame {
    uint32_t id;           // CAN ID
    uint8_t  dlc;          // 数据长度
    uint8_t  data[8];      // 数据字节
    uint64_t timestamp_us; // 时间戳（微秒）
    bool     is_extended;  // 扩展帧
};

// ── 信号解码结果 ──────────────────────────────────────────────────────────────

struct SignalValue {
    std::string name;          // 信号名
    double      raw_value;     // 原始值
    double      phys_value;    // 物理值（经 factor/offset 换算）
    std::string unit;          // 单位
    uint64_t    timestamp_us;  // 时间戳
    bool        valid;         // 是否有效
};

// ── 违规事件 ──────────────────────────────────────────────────────────────────

enum class ViolationSeverity : uint8_t {
    INFO     = 0,
    WARNING  = 1,
    CRITICAL = 2,  // 安全关键违规，需立即处理
};

struct ViolationEvent {
    std::string       requirement_id;  // 违反的需求 ID
    std::string       variable;        // 违规变量
    std::string       condition_raw;   // 原始条件文本
    SymbolicValue     actual_value;    // 实际值
    SymbolicValue     expected_value;  // 期望值
    ViolationSeverity severity;
    uint64_t          timestamp_us;
    std::string       message;
};

// ── 监控配置 ──────────────────────────────────────────────────────────────────

struct MonitorConfig {
    std::string can_interface = "can0";  // CAN 接口名
    int         poll_interval_ms = 10;   // 轮询间隔
    int         report_interval_ms = 100; // 上报间隔
    bool        enable_ros = false;       // 是否启用 ROS 订阅
    std::string grpc_endpoint = "";       // gRPC 上报地址（空=不上报）
    std::string unix_socket = "/tmp/devguard.sock"; // Unix Socket
    int         violation_buffer_size = 1000;
};

// ── 违规回调 ──────────────────────────────────────────────────────────────────

using ViolationCallback = std::function<void(const ViolationEvent&)>;

// ── CAN 信号监控器 ────────────────────────────────────────────────────────────

class CanSignalMonitor {
public:
    explicit CanSignalMonitor(const MonitorConfig& config,
                               SymbolicValidator validator);
    ~CanSignalMonitor();

    // 加载需要监控的符号需求
    // conditions_json: [{"req_id": "BR-001", "conditions": "carSpeed>100km/h,geer=D"}, ...]
    bool LoadRequirements(const std::string& conditions_json);

    // 注册违规回调（可注册多个）
    void OnViolation(ViolationCallback cb);

    // 启动监控
    bool Start();

    // 停止监控
    void Stop();

    // 是否正在运行
    bool IsRunning() const { return running_.load(); }

    // 手动注入信号值（用于测试/仿真）
    void InjectSignal(const std::string& signal_name, double value);

    // 获取当前所有信号快照
    std::unordered_map<std::string, SignalValue> GetSnapshot() const;

    // 获取最近 N 条违规事件
    std::vector<ViolationEvent> GetRecentViolations(int n = 100) const;

    // 获取统计信息（JSON）
    std::string GetStatsJson() const;

private:
    // CAN 读取线程
    void CanReadLoop();

    // 校验线程（解耦读取和校验）
    void ValidateLoop();

    // 解码 CAN 帧中的信号
    std::vector<SignalValue> DecodeFrame(const CanFrame& frame) const;

    // 执行符号需求校验
    void CheckRequirements(const std::unordered_map<std::string, SignalValue>& signals);

    // 上报违规
    void ReportViolation(const ViolationEvent& event);

    MonitorConfig   config_;
    SymbolicValidator validator_;

    // 需求条件表: req_id → conditions
    std::unordered_map<std::string, std::vector<SymbolicCondition>> req_conditions_;

    // 当前信号快照
    mutable std::mutex signals_mutex_;
    std::unordered_map<std::string, SignalValue> current_signals_;

    // 违规缓冲
    mutable std::mutex violations_mutex_;
    std::vector<ViolationEvent> violation_buffer_;

    // 回调列表
    std::vector<ViolationCallback> callbacks_;

    // 线程控制
    std::atomic<bool> running_{false};
    std::thread can_thread_;
    std::thread validate_thread_;

    // 统计
    std::atomic<uint64_t> frames_received_{0};
    std::atomic<uint64_t> violations_total_{0};
    std::atomic<uint64_t> checks_total_{0};

    int can_fd_ = -1;  // CAN socket fd
};

}  // namespace devguard
