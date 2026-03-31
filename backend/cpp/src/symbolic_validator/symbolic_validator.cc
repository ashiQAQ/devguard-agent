// ============================================================
// 符号需求校验引擎 — 实现
// 零外部依赖，仅使用 C++17 标准库
// ============================================================

#include "devguard/symbolic_validator.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <regex>
#include <sstream>

namespace devguard {

// ── 工具函数 ──────────────────────────────────────────────────────────────────

static std::string Trim(const std::string& s) {
    size_t start = s.find_first_not_of(" \t\r\n");
    if (start == std::string::npos) return "";
    size_t end = s.find_last_not_of(" \t\r\n");
    return s.substr(start, end - start + 1);
}

static std::string ToLower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    return s;
}

// ── 操作符解析 ────────────────────────────────────────────────────────────────

SymbolicOp SymbolicValidator::ParseOp(const std::string& op_str) const {
    if (op_str == "=")  return SymbolicOp::EQ;
    if (op_str == "!=") return SymbolicOp::NEQ;
    if (op_str == ">")  return SymbolicOp::GT;
    if (op_str == "<")  return SymbolicOp::LT;
    if (op_str == ">=") return SymbolicOp::GTE;
    if (op_str == "<=") return SymbolicOp::LTE;
    if (op_str == "in") return SymbolicOp::IN;
    return SymbolicOp::EQ;
}

// ── 值解析 ────────────────────────────────────────────────────────────────────

SymbolicValue SymbolicValidator::ParseValue(const std::string& val_str,
                                            std::string& unit_out) const {
    std::string s = Trim(val_str);
    unit_out = "";

    // 尝试提取单位
    static const std::regex unit_pattern(
        R"(([+-]?\d+\.?\d*)\s*([a-zA-Z°%/$]+)?)");
    std::smatch m;
    if (std::regex_match(s, m, unit_pattern)) {
        std::string num_str = m[1].str();
        if (m.size() > 2 && m[2].length() > 0) {
            unit_out = m[2].str();
        }
        // 尝试解析为数字
        try {
            if (num_str.find('.') != std::string::npos) {
                return std::stod(num_str);
            } else {
                return std::stod(num_str);
            }
        } catch (...) {
            // 不是数字，作为字符串
            return s;
        }
    }

    return s;
}

// ── 构造函数 ──────────────────────────────────────────────────────────────────

SymbolicValidator::SymbolicValidator() {
    // 预注册默认变量
    VariableSpec v;

    v = {"carSpeed", "number", "m/s", 0.0, 83.33, true, {}, "车辆速度", "VehicleSpeed", "/vehicle/speed", 0x101, 0, 8, 0.00390625, -125.0};
    registry_["carSpeed"] = v;
    registry_["vehicleSpeed"] = v;
    registry_["CarSpeed"] = v;

    v = {"geer", "enum", "", 0.0, 0.0, false, {"P","R","N","D","1","2","3","4","5","6"}, "档位", "GearPosition", "/vehicle/gear", 0x102, 0, 4, 1.0, 0.0};
    registry_["geer"] = v;
    registry_["gear"] = v;
    registry_["GearPosition"] = v;

    v = {"engineSpeed", "number", "rpm", 0.0, 8000.0, true, {}, "发动机转速", "EngineSpeed", "/engine/speed", 0x103, 0, 16, 0.25, 0.0};
    registry_["engineSpeed"] = v;

    v = {"throttle", "number", "%", 0.0, 100.0, true, {}, "油门开度", "ThrottlePos", "/vehicle/throttle", 0x104, 0, 8, 0.3922, 0.0};
    registry_["throttle"] = v;

    v = {"brakePressure", "number", "bar", 0.0, 250.0, true, {}, "制动压力", "BrakePressure", "/vehicle/brake", 0x105, 0, 12, 0.1, 0.0};
    registry_["brakePressure"] = v;

    v = {"steeringAngle", "number", "deg", -720.0, 720.0, true, {}, "方向盘转角", "SteeringAngle", "/vehicle/steering", 0x106, 29, 12, 0.1, -204.8};
    registry_["steeringAngle"] = v;

    v = {"longitudeAccel", "number", "m/s2", -20.0, 20.0, true, {}, "纵向加速度", "LongAccel", "/vehicle/accel", 0x107, 0, 16, 0.001, -100.0};
    registry_["longitudeAccel"] = v;

    v = {"lateralAccel", "number", "m/s2", -20.0, 20.0, true, {}, "横向加速度", "LatAccel", "/vehicle/accel", 0x108, 16, 12, 0.001, -100.0};
    registry_["lateralAccel"] = v;

    v = {"yawRate", "number", "deg/s", -150.0, 150.0, true, {}, "横摆角速度", "YawRate", "/vehicle/yaw", 0x109, 0, 16, 0.01, -327.68};
    registry_["yawRate"] = v;

    v = {"temperature", "number", "°C", -40.0, 125.0, true, {}, "环境温度", "AmbientTemp", "/vehicle/ambient", 0x110, 0, 8, 1.0, -40.0};
    registry_["temperature"] = v;
}

// ── 注册变量 ──────────────────────────────────────────────────────────────────

void SymbolicValidator::RegisterVariable(const VariableSpec& spec) {
    registry_[spec.name] = spec;
}

// ── 加载变量注册表（JSON）───────────────────────────────────────────────────

bool SymbolicValidator::LoadVariableRegistry(const std::string& json_str) {
    // 简单的 JSON 解析（避免引入 nlohmann/json 依赖）
    // 格式: [{"name": "carSpeed", "type": "number", "unit": "m/s", ...}, ...]
    try {
        size_t pos = 0;
        while ((pos = json_str.find("{", pos)) != std::string::npos) {
            size_t end = json_str.find("}", pos);
            if (end == std::string::npos) break;
            std::string obj = json_str.substr(pos, end - pos + 1);

            VariableSpec spec;
            // 简单提取 name
            size_t name_pos = obj.find("\"name\"");
            if (name_pos != std::string::npos) {
                size_t val_start = obj.find("\"", name_pos + 6);
                size_t val_end = obj.find("\"", val_start + 1);
                if (val_start != std::string::npos && val_end != std::string::npos) {
                    spec.name = obj.substr(val_start + 1, val_end - val_start - 1);
                }
            }
            if (!spec.name.empty()) {
                registry_[spec.name] = spec;
            }
            pos = end + 1;
        }
        return true;
    } catch (...) {
        return false;
    }
}

// ── 解析单个条件 ─────────────────────────────────────────────────────────────

std::optional<SymbolicCondition> SymbolicValidator::ParseCondition(
    const std::string& text) const {
    std::string s = Trim(text);
    if (s.empty()) return std::nullopt;

    // 查找操作符
    const std::vector<std::pair<std::string, SymbolicOp>> ops = {
        {">=", SymbolicOp::GTE},
        {"<=", SymbolicOp::LTE},
        {"!=", SymbolicOp::NEQ},
        {"=",  SymbolicOp::EQ},
        {">",  SymbolicOp::GT},
        {"<",  SymbolicOp::LT},
    };

    for (const auto& [op_str, op] : ops) {
        size_t pos = s.find(op_str);
        if (pos != std::string::npos) {
            std::string var = Trim(s.substr(0, pos));
            std::string val_part = Trim(s.substr(pos + op_str.length()));

            std::string unit;
            SymbolicValue value = ParseValue(val_part, unit);

            SymbolicCondition cond;
            cond.variable = var;
            cond.op = op;
            cond.value = value;
            cond.unit = unit;
            cond.raw = s;
            return cond;
        }
    }

    return std::nullopt;
}

// ── 解析多个条件 ─────────────────────────────────────────────────────────────

std::vector<SymbolicCondition> SymbolicValidator::ParseConditions(
    const std::string& text) const {
    std::vector<SymbolicCondition> result;
    std::string s = text;

    // 按分号、换行分割
    std::replace(s.begin(), s.end(), ';', ',');
    std::replace(s.begin(), s.end(), '\n', ',');

    size_t start = 0;
    while (start < s.size()) {
        size_t comma = s.find(',', start);
        size_t end = (comma == std::string::npos) ? s.size() : comma;

        std::string part = Trim(s.substr(start, end - start));
        if (!part.empty()) {
            auto cond = ParseCondition(part);
            if (cond) result.push_back(*cond);
        }
        start = end + 1;
    }

    return result;
}

// ── 静态校验 ──────────────────────────────────────────────────────────────────

ValidationResult SymbolicValidator::ValidateCondition(
    const SymbolicCondition& cond) const {
    ValidationResult result;
    result.variable = cond.variable;

    auto it = registry_.find(cond.variable);
    if (it == registry_.end()) {
        result.level = ValidationLevel::WARNING;
        result.message = "变量 '" + cond.variable + "' 未在注册表中注册";
        result.suggestion = "请使用预定义变量（carSpeed, geer, throttle 等）或调用 RegisterVariable() 注册";
        return result;
    }

    const VariableSpec& spec = it->second;

    // 类型校验
    auto* num_val = std::get_if<double>(&cond.value);
    auto* str_val = std::get_if<std::string>(&cond.value);
    auto* range_val = std::get_if<std::pair<double, double>>(&cond.value);

    if (spec.type == "number") {
        if (!num_val && !range_val) {
            result.level = ValidationLevel::ERROR;
            result.message = "变量 '" + cond.variable + "' 期望数值类型，实际为: " +
                (str_val ? *str_val : "range");
            result.suggestion = "示例: " + cond.variable + "=100" + spec.unit;
            return result;
        }

        if (num_val) {
            double val = *num_val;
            // 单位校验
            if (!cond.unit.empty() && !spec.unit.empty() &&
                ToLower(cond.unit) != ToLower(spec.unit)) {
                // 尝试换算
                double converted = ConvertUnit(val, cond.unit, spec.unit);
                if (std::abs(converted) < 1e-9 && val != 0.0) {
                    result.level = ValidationLevel::WARNING;
                    result.message = "变量 '" + cond.variable + "' 的单位 '" + cond.unit +
                        "' 与期望单位 '" + spec.unit + "' 不匹配，且无法自动换算";
                    result.suggestion = "建议使用单位: " + spec.unit;
                }
            }

            // 范围校验
            if (spec.has_range) {
                if (val < spec.min_val) {
                    result.level = ValidationLevel::ERROR;
                    result.message = "变量 '" + cond.variable + "' 的值 " +
                        std::to_string(val) + " 小于最小值 " + std::to_string(spec.min_val);
                    result.suggestion = "请使用 >= " + std::to_string(spec.min_val) + spec.unit;
                    return result;
                }
                if (val > spec.max_val) {
                    result.level = ValidationLevel::ERROR;
                    result.message = "变量 '" + cond.variable + "' 的值 " +
                        std::to_string(val) + " 大于最大值 " + std::to_string(spec.max_val);
                    result.suggestion = "请使用 <= " + std::to_string(spec.max_val) + spec.unit;
                    return result;
                }
            }
        }
    } else if (spec.type == "enum") {
        if (!str_val) {
            result.level = ValidationLevel::ERROR;
            result.message = "变量 '" + cond.variable + "' 期望枚举类型";
            result.suggestion = "有效值: " + [&]() {
                std::string out;
                for (size_t i = 0; i < spec.enum_values.size(); ++i) {
                    if (i > 0) out += ", ";
                    out += spec.enum_values[i];
                }
                return out;
            }();
            return result;
        }

        bool found = false;
        for (const auto& ev : spec.enum_values) {
            if (ToLower(*str_val) == ToLower(ev)) {
                found = true;
                break;
            }
        }
        if (!found) {
            result.level = ValidationLevel::ERROR;
            result.message = "枚举值 '" + *str_val + "' 不在有效值列表中";
            result.suggestion = "有效值: " + [&]() {
                std::string out;
                for (size_t i = 0; i < spec.enum_values.size(); ++i) {
                    if (i > 0) out += ", ";
                    out += spec.enum_values[i];
                }
                return out;
            }();
            return result;
        }
    }

    result.level = ValidationLevel::PASS;
    result.message = "符号条件有效: " + cond.raw;
    return result;
}

// ── 批量静态校验 ─────────────────────────────────────────────────────────────

std::vector<ValidationResult> SymbolicValidator::ValidateConditions(
    const std::vector<SymbolicCondition>& conditions) const {
    std::vector<ValidationResult> results;
    for (const auto& cond : conditions) {
        results.push_back(ValidateCondition(cond));
    }
    return results;
}

// ── 运行时校验 ────────────────────────────────────────────────────────────────

bool SymbolicValidator::EvalOp(SymbolicOp op,
                                const SymbolicValue& actual,
                                const SymbolicValue& expected) const {
    auto* a_num = std::get_if<double>(&actual);
    auto* a_str = std::get_if<std::string>(&actual);
    auto* e_num = std::get_if<double>(&expected);
    auto* e_str = std::get_if<std::string>(&expected);
    auto* e_range = std::get_if<std::pair<double, double>>(&expected);

    switch (op) {
        case SymbolicOp::EQ:
            if (a_num && e_num) return std::abs(*a_num - *e_num) < 1e-6;
            if (a_str && e_str) return ToLower(*a_str) == ToLower(*e_str);
            return false;
        case SymbolicOp::NEQ:
            if (a_num && e_num) return std::abs(*a_num - *e_num) >= 1e-6;
            if (a_str && e_str) return ToLower(*a_str) != ToLower(*e_str);
            return true;
        case SymbolicOp::GT:
            if (a_num && e_num) return *a_num > *e_num;
            return false;
        case SymbolicOp::LT:
            if (a_num && e_num) return *a_num < *e_num;
            return false;
        case SymbolicOp::GTE:
            if (a_num && e_num) return *a_num >= *e_num;
            return false;
        case SymbolicOp::LTE:
            if (a_num && e_num) return *a_num <= *e_num;
            return false;
        case SymbolicOp::IN:
            if (a_num && e_range) return *a_num >= e_range->first && *a_num <= e_range->second;
            return false;
        default:
            return false;
    }
}

ValidationResult SymbolicValidator::CheckCondition(
    const SymbolicCondition& cond,
    const SymbolicValue& actual) const {
    ValidationResult result;
    result.variable = cond.variable;
    result.actual_value = actual;
    result.expected_value = cond.value;
    result.has_actual = true;

    bool ok = EvalOp(cond.op, actual, cond.value);

    if (ok) {
        result.level = ValidationLevel::PASS;
        result.message = cond.variable + " " + cond.raw + " [实际: " +
            [&]() {
                auto* v = std::get_if<double>(&actual);
                return v ? std::to_string(*v) : "\"\"";
            }() + "] ✓";
    } else {
        result.level = ValidationLevel::ERROR;
        result.message = "符号需求违规: " + cond.variable + " 不满足 " + cond.raw;

        auto* actual_num = std::get_if<double>(&actual);
        if (actual_num) {
            result.suggestion = "当前值: " + std::to_string(*actual_num) +
                ", 需要满足: " + cond.raw;
        }
    }

    return result;
}

std::vector<ValidationResult> SymbolicValidator::CheckConditions(
    const std::vector<SymbolicCondition>& conditions,
    const std::unordered_map<std::string, SymbolicValue>& actuals) const {
    std::vector<ValidationResult> results;
    for (const auto& cond : conditions) {
        auto it = actuals.find(cond.variable);
        if (it != actuals.end()) {
            results.push_back(CheckCondition(cond, it->second));
        } else {
            ValidationResult r;
            r.variable = cond.variable;
            r.level = ValidationLevel::WARNING;
            r.message = "变量 '" + cond.variable + "' 当前无可用值（未采集到信号）";
            r.suggestion = "检查 CAN 信号是否正常发送";
            results.push_back(r);
        }
    }
    return results;
}

// ── 单位换算 ──────────────────────────────────────────────────────────────────

double SymbolicValidator::ConvertUnit(double value,
                                      const std::string& from,
                                      const std::string& to) const {
    // 速度换算
    static const std::unordered_map<std::string, double> speed_to_ms = {
        {"km/h", 1.0/3.6},
        {"kph", 1.0/3.6},
        {"m/s", 1.0},
        {"mph", 0.44704},
    };
    std::string from_l = ToLower(from);
    std::string to_l = ToLower(to);

    auto it_from = speed_to_ms.find(from_l);
    auto it_to = speed_to_ms.find(to_l);

    if (it_from != speed_to_ms.end() && it_to != speed_to_ms.end()) {
        double ms = value * it_from->second;
        return ms / it_to->second;
    }

    // 温度换算
    if ((from_l == "°c" || from_l == "c") &&
        (to_l == "°f" || to_l == "f")) {
        return value * 9.0/5.0 + 32.0;
    }
    if ((from_l == "°f" || from_l == "f") &&
        (to_l == "°c" || to_l == "c")) {
        return (value - 32.0) * 5.0/9.0;
    }

    return value;  // 无法换算，返回原值
}

// ── 获取变量规格 ──────────────────────────────────────────────────────────────

const VariableSpec* SymbolicValidator::GetSpec(const std::string& variable) const {
    auto it = registry_.find(variable);
    if (it != registry_.end()) return &it->second;

    // 大小写不敏感查找
    std::string var_lower = ToLower(variable);
    for (const auto& [name, spec] : registry_) {
        if (ToLower(name) == var_lower) return &spec;
    }
    return nullptr;
}

// ── JSON 序列化 ───────────────────────────────────────────────────────────────

std::string SymbolicValidator::ResultsToJson(
    const std::vector<ValidationResult>& results) const {
    std::ostringstream oss;
    oss << "[\n";
    for (size_t i = 0; i < results.size(); ++i) {
        const auto& r = results[i];
        oss << "  {\"variable\": \"" << r.variable << "\", ";
        oss << "\"level\": \"" << (r.level == ValidationLevel::PASS ? "PASS" :
                                    r.level == ValidationLevel::WARNING ? "WARNING" : "ERROR") << "\", ";
        oss << "\"message\": \"" << r.message << "\"";
        if (!r.suggestion.empty()) {
            oss << ", \"suggestion\": \"" << r.suggestion << "\"";
        }
        oss << "}";
        if (i < results.size() - 1) oss << ",";
        oss << "\n";
    }
    oss << "]";
    return oss.str();
}

// ── 静态工具 ──────────────────────────────────────────────────────────────────

bool SymbolicValidator::AllPassed(const std::vector<ValidationResult>& results) {
    for (const auto& r : results) {
        if (r.level != ValidationLevel::PASS) return false;
    }
    return true;
}

bool SymbolicValidator::HasBlockingError(const std::vector<ValidationResult>& results) {
    for (const auto& r : results) {
        if (r.level == ValidationLevel::ERROR) return true;
    }
    return false;
}

// ── 默认注册表 ────────────────────────────────────────────────────────────────

std::string GetDefaultVariableRegistry() {
    return R"([
  {"name": "carSpeed", "type": "number", "unit": "m/s", "min": 0, "max": 83.33,
   "can_signal": "VehicleSpeed", "can_id": "0x101", "ros_topic": "/vehicle/speed"},
  {"name": "geer", "type": "enum", "enum_values": ["P","R","N","D","1","2","3","4","5","6"],
   "can_signal": "GearPosition", "can_id": "0x102", "ros_topic": "/vehicle/gear"},
  {"name": "engineSpeed", "type": "number", "unit": "rpm", "min": 0, "max": 8000,
   "can_signal": "EngineSpeed", "can_id": "0x103", "ros_topic": "/engine/speed"},
  {"name": "throttle", "type": "number", "unit": "%", "min": 0, "max": 100,
   "can_signal": "ThrottlePos", "can_id": "0x104", "ros_topic": "/vehicle/throttle"},
  {"name": "brakePressure", "type": "number", "unit": "bar", "min": 0, "max": 250,
   "can_signal": "BrakePressure", "can_id": "0x105", "ros_topic": "/vehicle/brake"},
  {"name": "steeringAngle", "type": "number", "unit": "deg", "min": -720, "max": 720,
   "can_signal": "SteeringAngle", "can_id": "0x106", "ros_topic": "/vehicle/steering"},
  {"name": "longitudeAccel", "type": "number", "unit": "m/s2", "min": -20, "max": 20,
   "can_signal": "LongAccel", "can_id": "0x107", "ros_topic": "/vehicle/accel"},
  {"name": "lateralAccel", "type": "number", "unit": "m/s2", "min": -20, "max": 20,
   "can_signal": "LatAccel", "can_id": "0x108", "ros_topic": "/vehicle/accel"},
  {"name": "yawRate", "type": "number", "unit": "deg/s", "min": -150, "max": 150,
   "can_signal": "YawRate", "can_id": "0x109", "ros_topic": "/vehicle/yaw"},
  {"name": "temperature", "type": "number", "unit": "°C", "min": -40, "max": 125,
   "can_signal": "AmbientTemp", "can_id": "0x110", "ros_topic": "/vehicle/ambient"}
])";
}

SymbolicValidator CreateDefaultValidator() {
    return SymbolicValidator();
}

}  // namespace devguard
