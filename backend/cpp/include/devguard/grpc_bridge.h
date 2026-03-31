// ============================================================
// DevGuard gRPC Bridge — 头文件
// 调车本 (x86) ↔ 域控 (ARM64) 双向通信
//
// 调车本侧: GrpcBridgeClient  (主动发起连接)
// 域控侧:   GrpcBridgeServer  (监听，接受调车本连接)
// ============================================================
#pragma once

#include <string>
#include <vector>
#include <functional>
#include <memory>
#include <atomic>
#include <thread>
#include <mutex>
#include <unordered_map>
#include <chrono>

#include "devguard/symbolic_validator.h"
#include "devguard/can_signal_monitor.h"

namespace devguard {

// ── 版本信息 ──────────────────────────────────────────────────────────────────

struct VersionInfo {
    std::string module_id;    // 模块 ID，如 "speed_controller"
    std::string version;      // 语义版本，如 "1.2.3"
    std::string git_hash;     // Git commit hash（40位）
    std::string build_time;   // 构建时间 ISO8601
    std::string build_host;   // 构建机器
    std::string target_arch;  // 目标架构，如 "aarch64"
    std::string asil_level;   // ASIL 等级
    std::vector<std::string> req_ids;  // 关联的需求 ID 列表
};

// ── 版本↔需求对齐结果 ─────────────────────────────────────────────────────────

struct VersionAlignResult {
    std::string module_id;
    std::string version;
    std::vector<std::string> covered_reqs;   // 已覆盖的需求
    std::vector<std::string> missing_reqs;   // 未覆盖的需求（需求存在但版本未声明）
    std::vector<std::string> extra_reqs;     // 版本声明但需求库中不存在
    float coverage_rate = 0.0f;              // 覆盖率 0.0-1.0
    std::string verdict;                     // "PASS" / "WARNING" / "FAIL"
};

// ── 域控健康状态 ──────────────────────────────────────────────────────────────

struct EcuHealth {
    std::string ecu_id;
    std::string ecu_type;       // "ADCU" / "MDC" / "Orin" / "custom"
    std::string ip_address;
    std::string os_version;
    float cpu_usage_pct = 0.0f;
    float mem_usage_mb  = 0.0f;
    float temp_celsius  = 0.0f;
    uint64_t uptime_sec = 0;
    std::string status;         // "ONLINE" / "DEGRADED" / "OFFLINE"
    uint64_t timestamp_us = 0;
};

// ── 校验会话结果 ──────────────────────────────────────────────────────────────

struct ValidateSessionResult {
    std::string session_id;
    bool all_passed = false;
    int error_count = 0;
    int warning_count = 0;
    std::vector<ValidationResult> results;
    std::vector<SignalValue> signal_snapshot;
    uint64_t timestamp_us = 0;
};

// ── 推送需求结果 ──────────────────────────────────────────────────────────────

struct PushReqsResult {
    bool success = false;
    int accepted_count = 0;
    int rejected_count = 0;
    std::vector<std::string> errors;
};

// ── 推送版本结果 ──────────────────────────────────────────────────────────────

struct PushVersionResult {
    bool success = false;
    std::vector<std::string> errors;
    std::vector<VersionAlignResult> align_results;
};

// ── 回调类型 ──────────────────────────────────────────────────────────────────

using SignalStreamCallback    = std::function<void(const SignalValue&)>;
using ViolationStreamCallback = std::function<void(const ViolationEvent&)>;
using HealthStreamCallback    = std::function<void(const EcuHealth&)>;

// ── 连接配置 ──────────────────────────────────────────────────────────────────

struct BridgeConfig {
    // 域控侧（Server）
    std::string listen_addr    = "0.0.0.0:50051";
    std::string ecu_id         = "ADCU-01";
    std::string ecu_type       = "ADCU";

    // 调车本侧（Client）
    std::string server_addr    = "192.168.1.100:50051";
    int connect_timeout_ms     = 5000;
    int rpc_timeout_ms         = 10000;
    bool use_tls               = false;
    std::string tls_cert_path  = "";
    std::string tls_key_path   = "";

    // 心跳
    int heartbeat_interval_ms  = 1000;
    int max_reconnect_attempts = 10;
};

// ============================================================
// 调车本侧 Client（运行在 x86 PC）
// ============================================================

class GrpcBridgeClient {
public:
    explicit GrpcBridgeClient(const BridgeConfig& config);
    ~GrpcBridgeClient();

    // ── 连接管理 ──────────────────────────────────────────────────────────────

    // 连接到域控
    bool Connect();

    // 断开连接
    void Disconnect();

    // 是否已连接
    bool IsConnected() const { return connected_.load(); }

    // ── 需求管理 ──────────────────────────────────────────────────────────────

    // 推送需求文档到域控
    // reqs_json: JSON 格式的需求列表
    PushReqsResult PushRequirements(const std::string& session_id,
                                    const std::string& operator_id,
                                    const std::string& reqs_json,
                                    bool force_update = false);

    // 推送版本信息，触发版本↔需求对齐校验
    PushVersionResult PushVersion(const std::string& session_id,
                                  const std::string& operator_id,
                                  const std::vector<VersionInfo>& versions);

    // 触发运行时需求校验
    ValidateSessionResult Validate(const std::string& session_id,
                                   const std::vector<std::string>& req_ids = {},
                                   bool include_signals = true,
                                   int timeout_ms = 5000);

    // 查询版本状态与需求覆盖情况
    std::pair<std::vector<VersionInfo>, std::vector<VersionAlignResult>>
    GetVersionStatus(const std::string& session_id,
                     const std::vector<std::string>& module_ids = {});

    // ── 实时数据流 ────────────────────────────────────────────────────────────

    // 订阅 CAN 信号实时流（异步，回调驱动）
    void SubscribeSignals(const std::string& session_id,
                          const std::vector<std::string>& variables,
                          SignalStreamCallback cb,
                          int interval_ms = 100);

    // 订阅需求违规事件流
    void SubscribeViolations(const std::string& session_id,
                             const std::vector<std::string>& req_ids,
                             ViolationStreamCallback cb,
                             const std::string& min_severity = "WARNING");

    // 订阅域控健康状态流
    void SubscribeHealth(const std::string& session_id,
                         HealthStreamCallback cb);

    // 停止所有订阅
    void StopSubscriptions();

    // ── 部署与调试 ────────────────────────────────────────────────────────────

    // 部署二进制文件到域控
    bool Deploy(const std::string& session_id,
                const std::string& operator_id,
                const std::string& module_id,
                const std::string& local_binary_path,
                const std::string& target_path,
                bool restart_after = false);

    // 执行调试命令
    std::pair<bool, std::string> DebugCommand(const std::string& session_id,
                                               const std::string& module_id,
                                               const std::string& command,
                                               const std::string& args = "{}");

    // ── 工具方法 ──────────────────────────────────────────────────────────────

    // 生成调车会话 ID
    static std::string GenerateSessionId();

    // 获取连接状态 JSON
    std::string GetStatusJson() const;

private:
    void ReconnectLoop();
    bool DoConnect();

    BridgeConfig config_;
    std::atomic<bool> connected_{false};
    std::atomic<bool> running_{false};
    std::thread reconnect_thread_;
    std::vector<std::thread> stream_threads_;
    mutable std::mutex mutex_;

    // gRPC channel/stub（使用 void* 避免在头文件引入 grpc 依赖）
    void* channel_ = nullptr;
    void* stub_    = nullptr;
};

// ============================================================
// 域控侧 Server（运行在 ARM64 域控）
// ============================================================

class GrpcBridgeServer {
public:
    explicit GrpcBridgeServer(const BridgeConfig& config,
                               SymbolicValidator validator,
                               CanSignalMonitor* monitor = nullptr);
    ~GrpcBridgeServer();

    // 启动 gRPC 服务
    bool Start();

    // 停止服务
    void Stop();

    bool IsRunning() const { return running_.load(); }

    // ── 注册处理器 ────────────────────────────────────────────────────────────

    // 注册需求推送处理器（收到调车本推送的需求时调用）
    using ReqPushHandler = std::function<PushReqsResult(
        const std::string& session_id,
        const std::string& reqs_json)>;
    void OnRequirementsPush(ReqPushHandler handler);

    // 注册版本推送处理器
    using VersionPushHandler = std::function<PushVersionResult(
        const std::string& session_id,
        const std::vector<VersionInfo>& versions)>;
    void OnVersionPush(VersionPushHandler handler);

    // 注册校验触发处理器
    using ValidateHandler = std::function<ValidateSessionResult(
        const std::string& session_id,
        const std::vector<std::string>& req_ids)>;
    void OnValidate(ValidateHandler handler);

    // 注册部署处理器
    using DeployHandler = std::function<bool(
        const std::string& module_id,
        const std::string& target_path,
        const std::vector<uint8_t>& binary_data)>;
    void OnDeploy(DeployHandler handler);

    // ── 主动推送（域控→调车本）────────────────────────────────────────────────

    // 向所有订阅者推送信号
    void BroadcastSignal(const SignalValue& signal);

    // 向所有订阅者推送违规事件
    void BroadcastViolation(const ViolationEvent& event);

    // 向所有订阅者推送健康状态
    void BroadcastHealth(const EcuHealth& health);

    // 获取服务状态 JSON
    std::string GetStatusJson() const;

private:
    void HealthReportLoop();

    BridgeConfig config_;
    SymbolicValidator validator_;
    CanSignalMonitor* monitor_;

    std::atomic<bool> running_{false};
    std::thread health_thread_;
    mutable std::mutex mutex_;

    ReqPushHandler     req_push_handler_;
    VersionPushHandler version_push_handler_;
    ValidateHandler    validate_handler_;
    DeployHandler      deploy_handler_;

    // gRPC server（void* 避免头文件引入 grpc 依赖）
    void* server_ = nullptr;

    // 统计
    std::atomic<uint64_t> req_push_count_{0};
    std::atomic<uint64_t> validate_count_{0};
    std::atomic<uint64_t> violation_broadcast_count_{0};
};

// ============================================================
// 版本↔需求对齐引擎（纯逻辑，无 gRPC 依赖）
// ============================================================

class VersionReqAligner {
public:
    explicit VersionReqAligner() = default;

    // 加载需求库（JSON 格式）
    bool LoadRequirements(const std::string& reqs_json);

    // 注册版本信息
    void RegisterVersion(const VersionInfo& version);

    // 执行对齐校验
    // 返回每个模块的对齐结果
    std::vector<VersionAlignResult> Align() const;

    // 单模块对齐
    VersionAlignResult AlignModule(const VersionInfo& version) const;

    // 生成对齐报告（JSON）
    std::string AlignReportJson() const;

    // 是否全部通过
    bool AllPassed() const;

private:
    // 需求库: req_id → Requirement
    std::unordered_map<std::string, std::string> req_registry_;
    // 版本库: module_id → VersionInfo
    std::unordered_map<std::string, VersionInfo> version_registry_;
};

}  // namespace devguard
