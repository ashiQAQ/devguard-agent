// ============================================================
// DevGuard Agent — 符号需求校验引擎 (C++17)
// 部署位置: 域控 (ADCU/MDC/Orin) + PC 工具链
// 零外部依赖，可直接链接到业务代码
// ============================================================
#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <functional>
#include <optional>
#include <variant>
#include <cstdint>

namespace devguard {

// ── 值类型 ────────────────────────────────────────────────────────────────────

using SymbolicValue = std::variant<
    double,           // 数值（含单位换算后的标准值）
    std::string,      // 字符串/枚举
    std::pair<double, double>  // 范围 [min, max]
>;

// ── 操作符 ────────────────────────────────────────────────────────────────────

enum class SymbolicOp : uint8_t {
    EQ  = 0,  // =
    NEQ = 1,  // !=
    GT  = 2,  // >
    LT  = 3,  // <
    GTE = 4,  // >=
    LTE = 5,  // <=
    IN  = 6,  // in [a, b]
};

// ── 单个符号条件 ──────────────────────────────────────────────────────────────

struct SymbolicCondition {
    std::string variable;   // 变量名，如 "carSpeed"
    SymbolicOp  op;         // 操作符
    SymbolicValue value;    // 期望值
    std::string unit;       // 单位，如 "km/h"
    std::string raw;        // 原始文本，如 "carSpeed=100km/h"
};

// ── 校验级别 ──────────────────────────────────────────────────────────────────

enum class ValidationLevel : uint8_t {
    PASS    = 0,  // 通过
    WARNING = 1,  // 警告（不阻断）
    ERROR   = 2,  // 错误（阻断）
};

// ── 单条校验结果 ──────────────────────────────────────────────────────────────

struct ValidationResult {
    std::string      variable;
    ValidationLevel  level;
    std::string      message;
    std::string      suggestion;
    SymbolicValue    actual_value;   // 实际采集到的值（运行时校验时填充）
    SymbolicValue    expected_value; // 期望值
    bool             has_actual = false;
};

// ── 变量规格（注册表条目）────────────────────────────────────────────────────

struct VariableSpec {
    std::string name;
    std::string type;          // "number" | "enum" | "string"
    std::string unit;          // 标准单位
    double      min_val = 0.0;
    double      max_val = 0.0;
    bool        has_range = false;
    std::vector<std::string> enum_values;
    std::string description;
    std::string can_signal;    // 对应的 CAN 信号名（如 "VehicleSpeed"）
    std::string ros_topic;     // 对应的 ROS topic（如 "/vehicle/speed"）
    uint32_t    can_id = 0;    // CAN ID
    uint8_t     can_start_bit = 0;
    uint8_t     can_length = 0;
    double      can_factor = 1.0;
    double      can_offset = 0.0;
};

// ── 符号需求校验引擎 ──────────────────────────────────────────────────────────

class SymbolicValidator {
public:
    SymbolicValidator();
    ~SymbolicValidator() = default;

    // 注册变量规格
    void RegisterVariable(const VariableSpec& spec);

    // 批量注册（从 JSON 字符串）
    bool LoadVariableRegistry(const std::string& json_str);

    // ── 解析 ──────────────────────────────────────────────────────────────────

    // 解析单个条件，如 "carSpeed=100km/h"
    std::optional<SymbolicCondition> ParseCondition(const std::string& text) const;

    // 解析多个条件（逗号/分号分隔）
    std::vector<SymbolicCondition> ParseConditions(const std::string& text) const;

    // ── 静态校验（编译期/提交时）────────────────────────────────────────────

    // 校验单个条件的合法性（不需要实际值）
    ValidationResult ValidateCondition(const SymbolicCondition& cond) const;

    // 校验一组条件
    std::vector<ValidationResult> ValidateConditions(
        const std::vector<SymbolicCondition>& conditions) const;

    // ── 运行时校验（域控上实时校验）─────────────────────────────────────────

    // 用实际值校验条件是否满足
    // actual: 当前实际值（从 CAN/ROS 采集）
    ValidationResult CheckCondition(
        const SymbolicCondition& cond,
        const SymbolicValue& actual) const;

    // 批量运行时校验
    std::vector<ValidationResult> CheckConditions(
        const std::vector<SymbolicCondition>& conditions,
        const std::unordered_map<std::string, SymbolicValue>& actuals) const;

    // ── 工具方法 ──────────────────────────────────────────────────────────────

    // 单位换算（如 km/h → m/s）
    double ConvertUnit(double value, const std::string& from, const std::string& to) const;

    // 获取变量规格
    const VariableSpec* GetSpec(const std::string& variable) const;

    // 序列化校验结果为 JSON
    std::string ResultsToJson(const std::vector<ValidationResult>& results) const;

    // 是否全部通过
    static bool AllPassed(const std::vector<ValidationResult>& results);

    // 是否有阻断级错误
    static bool HasBlockingError(const std::vector<ValidationResult>& results);

private:
    SymbolicOp  ParseOp(const std::string& op_str) const;
    SymbolicValue ParseValue(const std::string& val_str, std::string& unit_out) const;
    bool EvalOp(SymbolicOp op, const SymbolicValue& actual,
                const SymbolicValue& expected) const;

    std::unordered_map<std::string, VariableSpec> registry_;
};

// ── 默认变量注册表（自动驾驶常用信号）────────────────────────────────────────

// 返回包含常用自动驾驶变量的 JSON 字符串
std::string GetDefaultVariableRegistry();

// 创建预装默认变量的校验器
SymbolicValidator CreateDefaultValidator();

}  // namespace devguard
