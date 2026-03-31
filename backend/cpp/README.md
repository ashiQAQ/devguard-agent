# DevGuard C++ 模块说明

## 架构定位

C++ 模块是 DevGuard 的**高性能计算核心**，同时承担**域控端轻量 Agent** 的角色：

```
┌─────────────────────────────────────────────────────────────┐
│  PC 端 (开发/CI 服务器)                                    │
│  Python FastAPI + C++ 插件                                  │
│  ├── FeatureAligner     (图匹配，功能点对齐)                  │
│  ├── PerfCollector     (Linux perf，性能采集)                │
│  └── SymbolicValidator  (符号需求静态校验)                   │
├─────────────────────────────────────────────────────────────┤
│  域控端 (ADCU/MDC/Orin, ARM64/x86, Linux/QNX)               │
│  C++ 独立守护进程（零 Python 依赖）                          │
│  ├── CanSignalMonitor   (CAN 信号实时监控)                   │
│  ├── SymbolicValidator  (符号需求运行时校验)                  │
│  └── gRPC Bridge        (域控↔PC 通信桥)                    │
└─────────────────────────────────────────────────────────────┘
```

## 模块列表

| 模块 | 头文件 | 部署位置 | 说明 |
|------|--------|----------|------|
| FeatureAligner | `include/devguard/feature_aligner.h` | PC | 功能点与基线模块图匹配对齐 |
| PerfCollector | `include/devguard/perf_collector.h` | PC | Linux perf 性能采集 |
| SymbolicValidator | `include/devguard/symbolic_validator.h` | PC + 域控 | 符号需求校验，零依赖 |
| CanSignalMonitor | `include/devguard/can_signal_monitor.h` | 域控 | CAN 信号实时监控与校验 |

## 构建

### PC 端（完整依赖）

```bash
cd backend/cpp
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

依赖：`Boost::graph`, `nlohmann_json`, `protobuf`

### 域控端（零依赖版本）

`symbolic_validator` 可单独编译，**无任何外部依赖**：

```bash
# 仅编译符号校验引擎（适用于裸机域控）
g++ -std=c++17 -O3 -o symbolic_validator \
    src/symbolic_validator/symbolic_validator.cc \
    -lpthread
```

## 使用示例

### 1. SymbolicValidator（符号需求校验）

```cpp
#include "devguard/symbolic_validator.h"
using namespace devguard;

int main() {
    // 创建校验器（预装自动驾驶常用变量）
    auto validator = CreateDefaultValidator();
    
    // 解析符号条件
    auto conditions = validator.ParseConditions(
        "carSpeed=100km/h, geer=D, throttle>=50%");
    
    // 静态校验（不需要实际值）
    auto results = validator.ValidateConditions(conditions);
    if (SymbolicValidator::HasBlockingError(results)) {
        printf("校验失败:\n%s\n", 
            validator.ResultsToJson(results).c_str());
        return 1;
    }
    
    // 运行时校验（从 CAN 采集到实际值）
    std::unordered_map<std::string, SymbolicValue> actuals = {
        {"carSpeed", 105.0},  // 实际速度 105 km/h
        {"geer", std::string("D")},
        {"throttle", 45.0},
    };
    
    auto check = validator.CheckConditions(conditions, actuals);
    for (const auto& r : check) {
        printf("%s: %s\n", r.variable.c_str(),
            r.level == ValidationLevel::PASS ? "✓" : "✗");
    }
    
    return 0;
}
```

### 2. CanSignalMonitor（域控 CAN 监控）

```cpp
#include "devguard/can_signal_monitor.h"
using namespace devguard;

int main() {
    MonitorConfig cfg;
    cfg.can_interface = "can0";
    cfg.report_interval_ms = 50;
    
    CanSignalMonitor monitor(cfg, CreateDefaultValidator());
    
    // 加载符号需求
    monitor.LoadRequirements(R"([
        {"req_id": "BR-2025-Q1-001", 
         "conditions": "carSpeed>120km/h, geer=D"}
    ])");
    
    // 注册违规回调
    monitor.OnViolation([](const ViolationEvent& evt) {
        printf("[VIOLATION] %s: %s\n", 
            evt.requirement_id.c_str(),
            evt.message.c_str());
    });
    
    monitor.Start();
    std::this_thread::sleep_for(std::chrono::seconds(60));
    monitor.Stop();
    
    return 0;
}
```

## 符号条件语法

```
变量 = 值
变量 > 值
变量 >= 值
变量 < 值
变量 <= 值
变量 != 值

# 多个条件用逗号/分号分隔
carSpeed=100km/h, geer=D, throttle>=50%

# 支持的单位
km/h, m/s, mph          # 速度
rpm                       # 转速
%, bar, °C, °F          # 百分比、压力、温度
deg, deg/s               # 角度、角速度
m/s2                      # 加速度
```

## 预定义变量（CAN/ROS 映射）

| 变量 | 类型 | 单位 | CAN ID | ROS Topic |
|------|------|------|--------|-----------|
| carSpeed | number | m/s | 0x101 | /vehicle/speed |
| geer/gear | enum | - | 0x102 | /vehicle/gear |
| engineSpeed | number | rpm | 0x103 | /engine/speed |
| throttle | number | % | 0x104 | /vehicle/throttle |
| brakePressure | number | bar | 0x105 | /vehicle/brake |
| steeringAngle | number | deg | 0x106 | /vehicle/steering |
| longitudeAccel | number | m/s² | 0x107 | /vehicle/accel |
| lateralAccel | number | m/s² | 0x108 | /vehicle/accel |
| yawRate | number | deg/s | 0x109 | /vehicle/yaw |
| temperature | number | °C | 0x110 | /vehicle/ambient |

## Protocol Buffers

定义了三个 `.proto` 文件用于域控↔PC 通信：

- `proto/baseline.proto` — 基线模块结构
- `proto/requirement.proto` — 需求与符号条件
- `proto/performance.proto` — 性能指标

## 后续计划

- [x] gRPC Bridge（域控↔PC 通信）✓ 已实现
- [ ] ROS 2 订阅支持（rclcpp 节点集成）
- [ ] 实时性约束检查器（Clang 插件）
- [ ] Android ADB 部署脚本
- [x] Python 绑定（pybind11 封装）- 可选
