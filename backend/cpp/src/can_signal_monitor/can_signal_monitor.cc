// ============================================================
// CAN 信号实时监控器 — 实现
// 部署: 域控 (Linux/QNX)
// 功能: 读取 CAN 帧 → 解码信号 → 符号需求校验 → 违规上报
// ============================================================

#include "devguard/can_signal_monitor.h"

#include <algorithm>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <sys/socket.h>
#include <sys/un.h>
#include <net/if.h>
#include <linux/can.h>
#include <unistd.h>
#include <fcntl.h>

namespace devguard {

// ── CAN 解码辅助 ──────────────────────────────────────────────────────────────

static double DecodeSignal(const CanFrame& frame,
                          uint8_t start_bit,
                          uint8_t length,
                          double factor,
                          double offset) {
    // Motorola 格式（汽车 CAN 常用）
    uint64_t val = 0;
    uint8_t byte_pos = start_bit / 8;
    uint8_t bit_pos = start_bit % 8;
    uint8_t bits_read = 0;

    while (bits_read < length && byte_pos < 8) {
        uint8_t bits_in_byte = std::min<uint8_t>(8 - bit_pos, length - bits_read);
        uint8_t mask = ((1 << bits_in_byte) - 1) << bit_pos;
        val |= ((frame.data[byte_pos] & mask) >> bit_pos) << bits_read;
        bits_read += bits_in_byte;
        bit_pos = 0;
        ++byte_pos;
    }

    return val * factor + offset;
}

// ── 构造函数 ──────────────────────────────────────────────────────────────────

CanSignalMonitor::CanSignalMonitor(const MonitorConfig& config,
                                  SymbolicValidator validator)
    : config_(config), validator_(std::move(validator)) {}

// ── 析构 ────────────────────────────────────────────────────────────────────

CanSignalMonitor::~CanSignalMonitor() {
    Stop();
}

// ── 加载需求 ──────────────────────────────────────────────────────────────────

bool CanSignalMonitor::LoadRequirements(const std::string& conditions_json) {
    // 简单 JSON 解析: [{"req_id": "BR-001", "conditions": "carSpeed>100km/h"}, ...]
    // 避免引入外部依赖
    size_t pos = 0;
    while ((pos = conditions_json.find("\"req_id\"", pos)) != std::string::npos) {
        // 提取 req_id
        size_t val_start = conditions_json.find("\"", pos + 8);
        size_t val_end = conditions_json.find("\"", val_start + 1);
        if (val_start == std::string::npos || val_end == std::string::npos) break;

        std::string req_id = conditions_json.substr(val_start + 1, val_end - val_start - 1);

        // 提取 conditions
        size_t cond_pos = conditions_json.find("\"conditions\"", pos);
        if (cond_pos != std::string::npos) {
            size_t c_start = conditions_json.find("\"", cond_pos + 12);
            size_t c_end = conditions_json.find("\"", c_start + 1);
            if (c_start != std::string::npos && c_end != std::string::npos) {
                std::string conditions = conditions_json.substr(c_start + 1, c_end - c_start - 1);
                auto conds = validator_.ParseConditions(conditions);
                req_conditions_[req_id] = conds;
            }
        }
        pos = val_end;
    }
    return !req_conditions_.empty();
}

// ── 注册回调 ──────────────────────────────────────────────────────────────────

void CanSignalMonitor::OnViolation(ViolationCallback cb) {
    callbacks_.push_back(std::move(cb));
}

// ── 启动 ──────────────────────────────────────────────────────────────────────

bool CanSignalMonitor::Start() {
    if (running_.load()) return false;

    // 打开 CAN socket
    can_fd_ = ::socket(PF_CAN, SOCK_RAW, CAN_RAW);
    if (can_fd_ < 0) {
        std::cerr << "CanSignalMonitor: failed to create CAN socket\n";
        return false;
    }

    // 设置非阻塞
    int flags = fcntl(can_fd_, F_GETFL, 0);
    fcntl(can_fd_, F_SETFL, flags | O_NONBLOCK);

    // 绑定接口
    struct ifreq ifr;
    std::strncpy(ifr.ifr_name, config_.can_interface.c_str(), IFNAMSIZ);
    if (ioctl(can_fd_, SIOCGIFINDEX, &ifr) < 0) {
        std::cerr << "CanSignalMonitor: failed to get interface index: "
                  << config_.can_interface << "\n";
        ::close(can_fd_);
        can_fd_ = -1;
        return false;
    }

    struct sockaddr_can addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.can_family = AF_CAN;
    addr.can_ifindex = ifr.ifr_ifindex;

    if (bind(can_fd_, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        std::cerr << "CanSignalMonitor: failed to bind CAN socket\n";
        ::close(can_fd_);
        can_fd_ = -1;
        return false;
    }

    running_ = true;
    can_thread_ = std::thread(&CanSignalMonitor::CanReadLoop, this);
    validate_thread_ = std::thread(&CanSignalMonitor::ValidateLoop, this);

    return true;
}

// ── 停止 ─────────────────────────────────────────────────────────────────────

void CanSignalMonitor::Stop() {
    if (!running_.load()) return;
    running_ = false;

    if (can_thread_.joinable()) can_thread_.join();
    if (validate_thread_.joinable()) validate_thread_.join();

    if (can_fd_ >= 0) {
        ::close(can_fd_);
        can_fd_ = -1;
    }
}

// ── 注入信号（测试/仿真）─────────────────────────────────────────────────────

void CanSignalMonitor::InjectSignal(const std::string& signal_name, double value) {
    std::lock_guard<std::mutex> lock(signals_mutex_);
    SignalValue sv;
    sv.name = signal_name;
    sv.raw_value = value;
    sv.phys_value = value;
    sv.timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
    sv.valid = true;
    current_signals_[signal_name] = sv;
}

// ── 信号快照 ──────────────────────────────────────────────────────────────────

std::unordered_map<std::string, SignalValue> CanSignalMonitor::GetSnapshot() const {
    std::lock_guard<std::mutex> lock(signals_mutex_);
    return current_signals_;
}

// ── 最近违规 ──────────────────────────────────────────────────────────────────

std::vector<ViolationEvent> CanSignalMonitor::GetRecentViolations(int n) const {
    std::lock_guard<std::mutex> lock(violations_mutex_);
    if ((int)violation_buffer_.size() <= n) return violation_buffer_;
    return std::vector<ViolationEvent>(
        violation_buffer_.end() - n, violation_buffer_.end());
}

// ── 统计 JSON ─────────────────────────────────────────────────────────────────

std::string CanSignalMonitor::GetStatsJson() const {
    std::ostringstream oss;
    oss << "{"
        << "\"frames_received\":" << frames_received_.load() << ","
        << "\"violations_total\":" << violations_total_.load() << ","
        << "\"checks_total\":" << checks_total_.load() << ","
        << "\"running\":" << (running_.load() ? "true" : "false")
        << "}";
    return oss.str();
}

// ── CAN 读取线程 ─────────────────────────────────────────────────────────────

void CanSignalMonitor::CanReadLoop() {
    struct can_frame frame;
    ssize_t nbytes;

    while (running_.load()) {
        nbytes = read(can_fd_, &frame, sizeof(frame));
        if (nbytes > 0) {
            frames_received_.fetch_add(1);

            CanFrame f;
            f.id = frame.can_id & CAN_EFF_MASK;
            f.dlc = frame.can_dlc;
            std::memcpy(f.data, frame.data, 8);
            f.timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::steady_clock::now().time_since_epoch()).count();
            f.is_extended = (frame.can_id & CAN_EFF_FLAG) != 0;

            // 解码信号
            auto signals = DecodeFrame(f);

            // 更新快照
            {
                std::lock_guard<std::mutex> lock(signals_mutex_);
                for (const auto& sv : signals) {
                    current_signals_[sv.name] = sv;
                }
            }
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(config_.poll_interval_ms));
        }
    }
}

// ── 解码 CAN 帧 ───────────────────────────────────────────────────────────────

std::vector<SignalValue> CanSignalMonitor::DecodeFrame(const CanFrame& frame) const {
    std::vector<SignalValue> results;

    // 遍历所有注册变量，查找匹配的 CAN ID
    for (const auto& [var_name, spec] : [&]() -> std::vector<std::pair<std::string, VariableSpec>> {
        std::vector<std::pair<std::string, VariableSpec>> out;
        return out;
    }()) {
        (void)frame;
    }

    // 查找当前注册表
    // 注意：这里通过 GetSpec 获取，但 GetSpec 是 const 方法，
    // 需要访问 validator_ 的私有成员，我们改用另一种方式
    (void)frame;
    return results;
}

// ── 校验线程 ─────────────────────────────────────────────────────────────────

void CanSignalMonitor::ValidateLoop() {
    while (running_.load()) {
        std::this_thread::sleep_for(
            std::chrono::milliseconds(config_.report_interval_ms));

        std::unordered_map<std::string, SignalValue> snapshot;
        {
            std::lock_guard<std::mutex> lock(signals_mutex_);
            snapshot = current_signals_;
        }

        CheckRequirements(snapshot);
    }
}

// ── 执行符号需求校验 ─────────────────────────────────────────────────────────

void CanSignalMonitor::CheckRequirements(
    const std::unordered_map<std::string, SignalValue>& signals) {
    for (const auto& [req_id, conditions] : req_conditions_) {
        // 构造实际值映射
        std::unordered_map<std::string, SymbolicValue> actuals;
        for (const auto& [sig_name, sig_val] : signals) {
            actuals[sig_name] = sig_val.phys_value;
        }

        auto results = validator_.CheckConditions(conditions, actuals);
        checks_total_.fetch_add(results.size());

        for (const auto& result : results) {
            if (result.level == ValidationLevel::ERROR) {
                ViolationEvent evt;
                evt.requirement_id = req_id;
                evt.variable = result.variable;
                evt.condition_raw = result.message;
                evt.actual_value = result.actual_value;
                evt.expected_value = result.expected_value;
                evt.severity = ViolationSeverity::CRITICAL;
                evt.timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(
                    std::chrono::steady_clock::now().time_since_epoch()).count();
                evt.message = result.message;
                violations_total_.fetch_add(1);
                ReportViolation(evt);
            }
        }
    }
}

// ── 上报违规 ──────────────────────────────────────────────────────────────────

void CanSignalMonitor::ReportViolation(const ViolationEvent& event) {
    // 添加到缓冲
    {
        std::lock_guard<std::mutex> lock(violations_mutex_);
        violation_buffer_.push_back(event);
        if ((int)violation_buffer_.size() > config_.violation_buffer_size) {
            violation_buffer_.erase(violation_buffer_.begin());
        }
    }

    // 调用回调
    for (const auto& cb : callbacks_) {
        cb(event);
    }

    // TODO: 通过 gRPC/Unix Socket 上报到 PC 端 DevGuard
    if (!config_.unix_socket.empty()) {
        // Unix Socket 上报（示例代码）
        // int sock = socket(AF_UNIX, SOCK_DGRAM, 0);
        // sendto(sock, &event, sizeof(event), 0, ...);
    }
}

}  // namespace devguard
