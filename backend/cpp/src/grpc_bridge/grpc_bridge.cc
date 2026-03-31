// ============================================================
// DevGuard gRPC Bridge — 实现
// 调车本 (x86) ↔ 域控 (ARM64) 双向通信
// ============================================================

#include "devguard/grpc_bridge.h"

#include <algorithm>
#include <chrono>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <random>
#include <ctime>

// 注意：实际编译需要链接 grpc++
// #include <grpc++/grpc++.h>
// #include "devguard_bridge.grpc.pb.h"

namespace devguard {

// ── 工具函数 ──────────────────────────────────────────────────────────────────

static std::string GenerateUuid() {
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static std::uniform_int_distribution<> dis(0, 15);
    static std::uniform_int_distribution<> dis2(8, 11);

    std::ostringstream oss;
    oss << std::hex;
    for (int i = 0; i < 8; i++) oss << dis(gen);
    oss << "-";
    for (int i = 0; i < 4; i++) oss << dis(gen);
    oss << "-4";
    for (int i = 0; i < 3; i++) oss << dis(gen);
    oss << "-";
    oss << dis2(gen);
    for (int i = 0; i < 3; i++) oss << dis(gen);
    oss << "-";
    for (int i = 0; i < 12; i++) oss << dis(gen);
    return oss.str();
}

std::string GrpcBridgeClient::GenerateSessionId() {
    return GenerateUuid();
}

// ============================================================
// GrpcBridgeClient（调车本侧）
// ============================================================

GrpcBridgeClient::GrpcBridgeClient(const BridgeConfig& config)
    : config_(config) {
    // TODO: 初始化 gRPC channel 和 stub
    // channel_ = grpc::CreateChannel(config_.server_addr, ...);
    // stub_ = EcuAgentService::NewStub(channel_);
}

GrpcBridgeClient::~GrpcBridgeClient() {
    StopSubscriptions();
    Disconnect();
}

// ── 连接管理 ──────────────────────────────────────────────────────────────────

bool GrpcBridgeClient::Connect() {
    return DoConnect();
}

void GrpcBridgeClient::Disconnect() {
    running_.store(false);
    if (reconnect_thread_.joinable()) {
        reconnect_thread_.join();
    }
    // TODO: 关闭 gRPC channel
    connected_.store(false);
}

bool GrpcBridgeClient::DoConnect() {
    // TODO: 实现 gRPC 连接
    // grpc::ChannelArguments args;
    // args.SetInt(GRPC_ARG_KEEPALIVE_TIME_MS, config_.heartbeat_interval_ms);
    // channel_ = grpc::CreateChannel(config_.server_addr, credentials, args);
    // stub_ = EcuAgentService::NewStub(channel_);

    // 模拟连接成功
    connected_.store(true);
    return true;
}

void GrpcBridgeClient::ReconnectLoop() {
    int attempts = 0;
    while (running_.load() && attempts < config_.max_reconnect_attempts) {
        if (DoConnect()) {
            attempts = 0;
        } else {
            attempts++;
            std::this_thread::sleep_for(
                std::chrono::milliseconds(1000 * attempts));
        }
    }
}

// ── 需求管理 ──────────────────────────────────────────────────────────────────

PushReqsResult GrpcBridgeClient::PushRequirements(
    const std::string& session_id,
    const std::string& operator_id,
    const std::string& reqs_json,
    bool force_update) {

    PushReqsResult result;

    // TODO: 调用 gRPC PushRequirements
    // PushRequirementsRequest req;
    // req.set_session_id(session_id);
    // req.set_operator_id(operator_id);
    // req.set_reqs(reqs_json);
    // req.set_force_update(force_update);
    // ClientContext ctx;
    // ctx.set_deadline(std::chrono::system_clock::now() + 
    //     std::chrono::milliseconds(config_.rpc_timeout_ms));
    // PushRequirementsResponse resp;
    // Status status = stub_->PushRequirements(&ctx, req, &resp);
    // if (status.ok()) { ... }

    // 模拟成功
    result.success = true;
    result.accepted_count = 10;
    result.rejected_count = 0;
    return result;
}

PushVersionResult GrpcBridgeClient::PushVersion(
    const std::string& session_id,
    const std::string& operator_id,
    const std::vector<VersionInfo>& versions) {

    PushVersionResult result;

    // TODO: 调用 gRPC PushVersion
    // ... 同上

    // 模拟对齐结果
    for (const auto& ver : versions) {
        VersionAlignResult align;
        align.module_id = ver.module_id;
        align.version = ver.version;
        align.covered_reqs = ver.req_ids;
        align.coverage_rate = 1.0f;
        align.verdict = "PASS";
        result.align_results.push_back(align);
    }
    result.success = true;
    return result;
}

// ── 运行时校验 ────────────────────────────────────────────────────────────────

ValidateSessionResult GrpcBridgeClient::Validate(
    const std::string& session_id,
    const std::vector<std::string>& req_ids,
    bool include_signals,
    int timeout_ms) {

    ValidateSessionResult result;
    result.session_id = session_id;

    // TODO: 调用 gRPC Validate
    // ... 获取响应后填充 result

    // 模拟响应
    result.all_passed = true;
    result.timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    return result;
}

// ── 版本状态查询 ────────────────────────────────────────────────────────────────

std::pair<std::vector<VersionInfo>, std::vector<VersionAlignResult>>
GrpcBridgeClient::GetVersionStatus(const std::string& session_id,
                                   const std::vector<std::string>& module_ids) {
    // TODO: 调用 gRPC GetVersionStatus
    return {{}, {}};
}

// ── 实时数据流订阅 ────────────────────────────────────────────────────────────

void GrpcBridgeClient::SubscribeSignals(
    const std::string& session_id,
    const std::vector<std::string>& variables,
    SignalStreamCallback cb,
    int interval_ms) {

    // TODO: 启动异步订阅线程
    // 使用 gRPC 异步客户端流式读取
    // std::thread([this, session_id, variables, cb, interval_ms]() {
    //     SubscribeSignalsRequest req;
    //     req.set_session_id(session_id);
    //     for (const auto& v : variables) req.add_variables(v);
    //     ClientContext ctx;
    //     auto reader = stub_->SubscribeSignals(&ctx, req);
    //     SignalSnapshot snapshot;
    //     while (reader->Read(&snapshot)) {
    //         SignalValue val;
    //         val.name = snapshot.name();
    //         val.phys_value = snapshot.phys_value();
    //         cb(val);
    //     }
    // }).detach();
}

void GrpcBridgeClient::SubscribeViolations(
    const std::string& session_id,
    const std::vector<std::string>& req_ids,
    ViolationStreamCallback cb,
    const std::string& min_severity) {
    // TODO: 同上
}

void GrpcBridgeClient::SubscribeHealth(
    const std::string& session_id,
    HealthStreamCallback cb) {
    // TODO: 同上
}

void GrpcBridgeClient::StopSubscriptions() {
    // TODO: 取消所有订阅
    for (auto& t : stream_threads_) {
        if (t.joinable()) t.join();
    }
    stream_threads_.clear();
}

// ── 部署与调试 ────────────────────────────────────────────────────────────────

bool GrpcBridgeClient::Deploy(
    const std::string& session_id,
    const std::string& operator_id,
    const std::string& module_id,
    const std::string& local_binary_path,
    const std::string& target_path,
    bool restart_after) {

    // 读取本地二进制
    std::ifstream file(local_binary_path, std::ios::binary | std::ios::ate);
    if (!file.is_open()) {
        return false;
    }
    size_t size = file.tellg();
    file.seekg(0);
    std::vector<uint8_t> data(size);
    file.read(reinterpret_cast<char*>(data.data()), size);

    // TODO: 调用 gRPC Deploy
    return true;
}

std::pair<bool, std::string> GrpcBridgeClient::DebugCommand(
    const std::string& session_id,
    const std::string& module_id,
    const std::string& command,
    const std::string& args) {

    // TODO: 调用 gRPC DebugCommand
    return {true, "OK"};
}

// ── 状态 JSON ─────────────────────────────────────────────────────────────────

std::string GrpcBridgeClient::GetStatusJson() const {
    std::ostringstream oss;
    oss << "{"
        << "\"connected\":" << (connected_.load() ? "true" : "false") << ","
        << "\"server_addr\":\"" << config_.server_addr << "\""
        << "}";
    return oss.str();
}

// ============================================================
// GrpcBridgeServer（域控侧）
// ============================================================

GrpcBridgeServer::GrpcBridgeServer(const BridgeConfig& config,
                                   SymbolicValidator validator,
                                   CanSignalMonitor* monitor)
    : config_(config),
      validator_(std::move(validator)),
      monitor_(monitor) {
    // TODO: 初始化 gRPC server
}

GrpcBridgeServer::~GrpcBridgeServer() {
    Stop();
}

// ── 服务启动/停止 ──────────────────────────────────────────────────────────────

bool GrpcBridgeServer::Start() {
    // TODO: 启动 gRPC 服务
    // ServerBuilder builder;
    // builder.AddListeningPort(config_.listen_addr, InsecureServerCredentials());
    // builder.RegisterService(&service_impl_);
    // server_ = builder.BuildAndStart();

    running_.store(true);
    health_thread_ = std::thread(&GrpcBridgeServer::HealthReportLoop, this);
    return true;
}

void GrpcBridgeServer::Stop() {
    running_.store(false);
    if (health_thread_.joinable()) {
        health_thread_.join();
    }
    // TODO: 关闭 gRPC server
}

// ── 注册处理器 ─────────────────────────────────────────────────────────────────

void GrpcBridgeServer::OnRequirementsPush(ReqPushHandler handler) {
    std::lock_guard<std::mutex> lock(mutex_);
    req_push_handler_ = std::move(handler);
}

void GrpcBridgeServer::OnVersionPush(VersionPushHandler handler) {
    std::lock_guard<std::mutex> lock(mutex_);
    version_push_handler_ = std::move(handler);
}

void GrpcBridgeServer::OnValidate(ValidateHandler handler) {
    std::lock_guard<std::mutex> lock(mutex_);
    validate_handler_ = std::move(handler);
}

void GrpcBridgeServer::OnDeploy(DeployHandler handler) {
    std::lock_guard<std::mutex> lock(mutex_);
    deploy_handler_ = std::move(handler);
}

// ── 主动推送 ──────────────────────────────────────────────────────────────────

void GrpcBridgeServer::BroadcastSignal(const SignalValue& signal) {
    // TODO: 通过 gRPC 流式推送
    // for (auto& writer : signal_writers_) {
    //     SignalSnapshot snap;
    //     snap.set_name(signal.name);
    //     snap.set_phys_value(signal.phys_value);
    //     writer->Write(snap);
    // }
}

void GrpcBridgeServer::BroadcastViolation(const ViolationEvent& event) {
    violation_broadcast_count_.fetch_add(1);
    // TODO: 通过 gRPC 流式推送
}

void GrpcBridgeServer::BroadcastHealth(const EcuHealth& health) {
    // TODO: 通过 gRPC 流式推送
}

// ── 健康报告循环 ────────────────────────────────────────────────────────────────

void GrpcBridgeServer::HealthReportLoop() {
    while (running_.load()) {
        // 采集域控健康状态
        EcuHealth health;
        health.ecu_id = config_.ecu_id;
        health.ecu_type = config_.ecu_type;
        health.timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        // TODO: 读取真实 CPU/内存/温度
        // 可通过 /proc/stat, /proc/meminfo, thermal_zone 读取

        // 广播
        BroadcastHealth(health);

        std::this_thread::sleep_for(
            std::chrono::milliseconds(config_.heartbeat_interval_ms));
    }
}

// ── 状态 JSON ─────────────────────────────────────────────────────────────────

std::string GrpcBridgeServer::GetStatusJson() const {
    std::ostringstream oss;
    oss << "{"
        << "\"running\":" << (running_.load() ? "true" : "false") << ","
        << "\"ecu_id\":\"" << config_.ecu_id << "\","
        << "\"listen_addr\":\"" << config_.listen_addr << "\","
        << "\"req_push_count\":" << req_push_count_.load() << ","
        << "\"validate_count\":" << validate_count_.load() << ","
        << "\"violation_broadcast_count\":" << violation_broadcast_count_.load()
        << "}";
    return oss.str();
}

// ============================================================
// VersionReqAligner（版本↔需求对齐引擎）
// ============================================================

bool VersionReqAligner::LoadRequirements(const std::string& reqs_json) {
    // 简单 JSON 解析: [{"req_id": "BR-001", ...}, ...]
    size_t pos = 0;
    while ((pos = reqs_json.find("\"req_id\"", pos)) != std::string::npos) {
        size_t val_start = reqs_json.find("\"", pos + 8);
        size_t val_end = reqs_json.find("\"", val_start + 1);
        if (val_start != std::string::npos && val_end != std::string::npos) {
            std::string req_id = reqs_json.substr(val_start + 1, val_end - val_start - 1);
            req_registry_[req_id] = reqs_json.substr(pos, val_end - pos + 100);
        }
        pos = val_end;
    }
    return !req_registry_.empty();
}

void VersionReqAligner::RegisterVersion(const VersionInfo& version) {
    version_registry_[version.module_id] = version;
}

std::vector<VersionAlignResult> VersionReqAligner::Align() const {
    std::vector<VersionAlignResult> results;
    for (const auto& [mod_id, ver] : version_registry_) {
        results.push_back(AlignModule(ver));
    }
    return results;
}

VersionAlignResult VersionReqAligner::AlignModule(const VersionInfo& version) const {
    VersionAlignResult result;
    result.module_id = version.module_id;
    result.version = version.version;

    // 检查每个声明的需求
    for (const auto& req_id : version.req_ids) {
        if (req_registry_.count(req_id)) {
            result.covered_reqs.push_back(req_id);
        } else {
            result.extra_reqs.push_back(req_id);
        }
    }

    // 检查需求库中未被任何版本覆盖的需求
    for (const auto& [req_id, _] : req_registry_) {
        bool found = false;
        for (const auto& ver : version_registry_) {
            for (const auto& rid : ver.second.req_ids) {
                if (rid == req_id) {
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        if (!found) {
            result.missing_reqs.push_back(req_id);
        }
    }

    // 计算覆盖率
    size_t total = result.covered_reqs.size() + result.extra_reqs.size();
    result.coverage_rate = total > 0 ?
        static_cast<float>(result.covered_reqs.size()) / total : 0.0f;

    // 判定
    if (result.missing_reqs.empty() && result.extra_reqs.empty()) {
        result.verdict = "PASS";
    } else if (result.covered_reqs.size() > 0) {
        result.verdict = "WARNING";
    } else {
        result.verdict = "FAIL";
    }

    return result;
}

std::string VersionReqAligner::AlignReportJson() const {
    auto results = Align();

    std::ostringstream oss;
    oss << "{\n";
    oss << "  \"all_passed\":" << (AllPassed() ? "true" : "false") << ",\n";
    oss << "  \"modules\": [\n";
    for (size_t i = 0; i < results.size(); ++i) {
        const auto& r = results[i];
        oss << "    {\n";
        oss << "      \"module_id\":\"" << r.module_id << "\",\n";
        oss << "      \"version\":\"" << r.version << "\",\n";
        oss << "      \"coverage_rate\":" << r.coverage_rate << ",\n";
        oss << "      \"verdict\":\"" << r.verdict << "\",\n";

        oss << "      \"covered_reqs\":[";
        for (size_t j = 0; j < r.covered_reqs.size(); ++j) {
            oss << "\"" << r.covered_reqs[j] << "\"";
            if (j < r.covered_reqs.size() - 1) oss << ",";
        }
        oss << "],\n";

        oss << "      \"missing_reqs\":[";
        for (size_t j = 0; j < r.missing_reqs.size(); ++j) {
            oss << "\"" << r.missing_reqs[j] << "\"";
            if (j < r.missing_reqs.size() - 1) oss << ",";
        }
        oss << "]\n";

        oss << "    }";
        if (i < results.size() - 1) oss << ",";
        oss << "\n";
    }
    oss << "  ]\n";
    oss << "}\n";
    return oss.str();
}

bool VersionReqAligner::AllPassed() const {
    for (const auto& r : Align()) {
        if (r.verdict != "PASS") return false;
    }
    return true;
}

}  // namespace devguard
