// ============================================================
// DevGuard gRPC Bridge — 使用示例
// 演示调车本 (x86) ↔ 域控 (ARM64) 完整工作流
// ============================================================

#include <iostream>
#include <thread>
#include <chrono>
#include <atomic>
#include <csignal>

#include "devguard/grpc_bridge.h"
#include "devguard/symbolic_validator.h"
#include "devguard/can_signal_monitor.h"

using namespace devguard;

// 全局标志（用于优雅退出）
std::atomic<bool> g_running{true};

void signal_handler(int signal) {
    std::cout << "\n收到退出信号，停止...\n";
    g_running.store(false);
}

// ============================================================
// 示例 1: 调车本侧（x86 PC）
// ============================================================

void run_pc_client_example() {
    std::cout << "\n========== 调车本侧示例 ==========\n";

    // 配置
    BridgeConfig config;
    config.server_addr = "192.168.1.100:50051";  // 域控 IP
    config.connect_timeout_ms = 5000;

    // 创建客户端
    GrpcBridgeClient client(config);

    // 连接
    if (!client.Connect()) {
        std::cerr << "连接域控失败\n";
        return;
    }
    std::cout << "✓ 已连接到域控\n";

    // 生成会话 ID
    std::string session_id = GrpcBridgeClient::GenerateSessionId();
    std::cout << "会话 ID: " << session_id << "\n";

    // 1. 推送需求文档
    std::string reqs_json = R"([
        {
            "req_id": "BR-2025-Q1-001",
            "title": "车辆速度控制",
            "conditions": "carSpeed=100km/h, geer=D",
            "req_type": "SYMBOLIC",
            "priority": "P1",
            "module": "动力控制",
            "asil": "B"
        }
    ])";

    auto push_result = client.PushRequirements(
        session_id, "operator01", reqs_json, false);
    std::cout << "推送需求: " 
              << (push_result.success ? "成功" : "失败")
              << " (" << push_result.accepted_count << " 条)\n";

    // 2. 推送版本信息
    std::vector<VersionInfo> versions = {
        {"speed_controller", "1.2.0", "abc123def", "2026-03-30T10:00:00Z",
         "build-server", "aarch64", "B", {"BR-2025-Q1-001"}}
    };

    auto ver_result = client.PushVersion(session_id, "operator01", versions);
    std::cout << "推送版本: " 
              << (ver_result.success ? "成功" : "失败") << "\n";

    // 打印对齐结果
    for (const auto& align : ver_result.align_results) {
        std::cout << "  模块: " << align.module_id << " v" << align.version << "\n";
        std::cout << "    覆盖率: " << (align.coverage_rate * 100) << "%\n";
        std::cout << "    判定: " << align.verdict << "\n";
    }

    // 3. 触发运行时校验
    auto validate_result = client.Validate(session_id, {}, true, 5000);
    std::cout << "运行时校验: "
              << (validate_result.all_passed ? "全部通过" : "有违规")
              << " (错误:" << validate_result.error_count 
              << " 警告:" << validate_result.warning_count << ")\n";

    // 4. 订阅信号流
    std::atomic<int> signal_count{0};
    client.SubscribeSignals(session_id, {"carSpeed", "geer"}, 
        [&](const SignalValue& sig) {
            signal_count.fetch_add(1);
            std::cout << "  信号: " << sig.name << " = " 
                      << sig.phys_value << " " << sig.unit << "\n";
        }, 100);

    // 5. 订阅违规事件流
    client.SubscribeViolations(session_id, {}, 
        [&](const ViolationEvent& evt) {
            std::cout << "  ⚠️ 违规: " << evt.req_id 
                      << " - " << evt.message << "\n";
        }, "WARNING");

    // 保持运行 10 秒
    for (int i = 0; i < 10 && g_running.load(); ++i) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    // 6. 部署新版本（可选）
    // client.Deploy(session_id, "operator01", "speed_controller",
    //              "./speed_controller.bin", "/app/modules/", true);

    // 停止订阅
    client.StopSubscriptions();
    client.Disconnect();

    std::cout << "调车本示例完成\n";
}

// ============================================================
// 示例 2: 域控侧（ARM64）
// ============================================================

void run_ecu_server_example() {
    std::cout << "\n========== 域控侧示例 ==========\n";

    // 配置
    BridgeConfig config;
    config.listen_addr = "0.0.0.0:50051";
    config.ecu_id = "ADCU-001";
    config.ecu_type = "ADCU";
    config.heartbeat_interval_ms = 1000;

    // 创建符号校验器
    auto validator = CreateDefaultValidator();

    // 创建服务器
    GrpcBridgeServer server(config, validator, nullptr);

    // 注册处理器
    server.OnRequirementsPush([](const std::string& session_id,
                                const std::string& reqs_json) {
        std::cout << "收到需求推送: " << session_id << "\n";
        PushReqsResult r;
        r.success = true;
        r.accepted_count = 1;
        return r;
    });

    server.OnVersionPush([](const std::string& session_id,
                           const std::vector<VersionInfo>& versions) {
        std::cout << "收到版本推送: " << session_id << "\n";

        // 版本↔需求对齐
        VersionReqAligner aligner;
        // aligner.LoadRequirements(...);
        for (const auto& v : versions) {
            aligner.RegisterVersion(v);
        }
        auto results = aligner.Align();

        PushVersionResult r;
        r.success = aligner.AllPassed();
        r.align_results = results;
        return r;
    });

    server.OnValidate([&validator](const std::string& session_id,
                                   const std::vector<std::string>& req_ids) {
        std::cout << "收到校验请求: " << session_id << "\n";

        // 示例：校验符号条件
        auto conds = validator.ParseConditions("carSpeed=100km/h, geer=D");
        auto results = validator.ValidateConditions(conds);

        ValidateSessionResult r;
        r.session_id = session_id;
        r.all_passed = !SymbolicValidator::HasBlockingError(results);
        r.timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        // 填充结果
        for (const auto& res : results) {
            ValidationResult vr;
            vr.variable = res.variable;
            vr.level = res.level == ValidationLevel::PASS ? "PASS" :
                       res.level == ValidationLevel::WARNING ? "WARNING" : "ERROR";
            vr.message = res.message;
            r.results.push_back(vr);
            if (res.level == ValidationLevel::ERROR) r.error_count++;
            if (res.level == ValidationLevel::WARNING) r.warning_count++;
        }

        return r;
    });

    server.OnDeploy([](const std::string& module_id,
                      const std::string& target_path,
                      const std::vector<uint8_t>& data) {
        std::cout << "部署模块: " << module_id << " -> " << target_path
                  << " (" << data.size() << " bytes)\n";
        // TODO: 写入文件系统
        return true;
    });

    // 启动
    if (!server.Start()) {
        std::cerr << "启动 gRPC 服务失败\n";
        return;
    }
    std::cout << "✓ gRPC 服务已启动: " << config.listen_addr << "\n";

    // 模拟周期性广播信号
    std::thread broadcast_thread([&server]() {
        int count = 0;
        while (g_running.load() && count < 20) {
            SignalValue sig;
            sig.name = "carSpeed";
            sig.phys_value = 50.0 + (count % 10) * 5.0;
            sig.unit = "km/h";
            sig.timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::steady_clock::now().time_since_epoch()).count();
            sig.valid = true;
            server.BroadcastSignal(sig);

            // 模拟违规
            if (count == 15) {
                ViolationEvent evt;
                evt.req_id = "BR-2025-Q1-001";
                evt.variable = "carSpeed";
                evt.message = "carSpeed > 120km/h (当前: 125km/h)";
                evt.severity = "CRITICAL";
                evt.timestamp_us = sig.timestamp_us;
                server.BroadcastViolation(evt);
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(500));
            count++;
        }
    });

    // 等待
    for (int i = 0; i < 15 && g_running.load(); ++i) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        std::cout << "服务器运行中... (" << server.GetStatusJson() << ")\n";
    }

    broadcast_thread.join();
    server.Stop();

    std::cout << "域控示例完成\n";
}

// ============================================================
// 示例 3: 独立符号校验（无需 gRPC）
// ============================================================

void run_standalone_validator_example() {
    std::cout << "\n========== 独立符号校验示例 ==========\n";

    // 创建校验器
    auto validator = CreateDefaultValidator();

    // 解析符号条件
    std::string conditions_text = "carSpeed=100km/h, geer=D, throttle>=50%";
    auto conditions = validator.ParseConditions(conditions_text);

    std::cout << "解析条件: " << conditions_text << "\n";
    std::cout << "解析出 " << conditions.size() << " 个条件\n";

    // 静态校验
    auto static_results = validator.ValidateConditions(conditions);
    std::cout << "\n--- 静态校验结果 ---\n";
    for (const auto& r : static_results) {
        std::cout << "[" << (r.level == ValidationLevel::PASS ? "✓" :
                          r.level == ValidationLevel::WARNING ? "⚠" : "✗") << "] "
                  << r.variable << ": " << r.message << "\n";
        if (!r.suggestion.empty()) {
            std::cout << "    建议: " << r.suggestion << "\n";
        }
    }

    // 运行时校验
    std::unordered_map<std::string, SymbolicValue> actuals = {
        {"carSpeed", 105.0},   // 超速！
        {"geer", std::string("D")},
        {"throttle", 45.0},    // 油门不足
    };

    auto runtime_results = validator.CheckConditions(conditions, actuals);
    std::cout << "\n--- 运行时校验结果 ---\n";
    for (const auto& r : runtime_results) {
        std::cout << "[" << (r.level == ValidationLevel::PASS ? "✓" : "✗") << "] "
                  << r.message << "\n";
    }

    // 输出 JSON
    std::cout << "\n--- JSON 输出 ---\n";
    std::cout << validator.ResultsToJson(runtime_results) << "\n";
}

// ============================================================
// 主函数
// ============================================================

int main(int argc, char* argv[]) {
    // 注册信号处理
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    std::cout << "DevGuard gRPC Bridge 示例\n";
    std::cout << "==========================\n";

    // 根据参数选择运行模式
    if (argc > 1) {
        std::string mode = argv[1];
        if (mode == "pc" || mode == "client") {
            run_pc_client_example();
        } else if (mode == "ecu" || mode == "server") {
            run_ecu_server_example();
        } else if (mode == "validator") {
            run_standalone_validator_example();
        } else {
            std::cerr << "用法: " << argv[0] 
                      << " [pc|ecu|validator]\n";
            std::cerr << "  pc        - 调车本侧示例\n";
            std::cerr << "  ecu       - 域控侧示例\n";
            std::cerr << "  validator - 独立符号校验示例\n";
            return 1;
        }
    } else {
        // 默认运行独立校验示例
        run_standalone_validator_example();
    }

    return 0;
}
