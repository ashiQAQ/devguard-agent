"""
需求强校验引擎
支持符号需求校验（如 carSpeed=1, geer=D）
"""

import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class ValidationLevel(Enum):
    """校验级别"""
    ERROR = "error"      # 阻断级错误
    WARNING = "warning"  # 警告
    INFO = "info"        # 提示


class RequirementType(Enum):
    """需求类型"""
    BUSINESS = "BUSINESS"
    TECHNICAL = "TECHNICAL"
    SYMBOLIC = "SYMBOLIC"  # 符号需求


@dataclass
class SymbolicCondition:
    """符号条件"""
    variable: str        # 变量名（如 carSpeed）
    operator: str        # 操作符（=, !=, >, <, >=, <=）
    value: Any          # 值（可以是数字、字符串、枚举）
    value_type: str     # 值类型（number, string, enum, range）
    unit: str = ""      # 单位（km/h, m/s, 等）
    
    def to_dict(self) -> Dict:
        return {
            "variable": self.variable,
            "operator": self.operator,
            "value": self.value,
            "value_type": self.value_type,
            "unit": self.unit,
        }


@dataclass
class ValidationResult:
    """校验结果"""
    is_valid: bool
    level: ValidationLevel
    field: str
    message: str
    suggestion: str = ""
    details: Dict = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            "is_valid": self.is_valid,
            "level": self.level.value,
            "field": self.field,
            "message": self.message,
            "suggestion": self.suggestion,
            "details": self.details,
        }


@dataclass
class RequirementValidationReport:
    """需求校验报告"""
    requirement_id: str
    is_valid: bool
    results: List[ValidationResult]
    symbolic_conditions: List[SymbolicCondition]
    parsed_features: List[Dict]
    summary: Dict
    
    def to_dict(self) -> Dict:
        return {
            "requirement_id": self.requirement_id,
            "is_valid": self.is_valid,
            "results": [r.to_dict() for r in self.results],
            "symbolic_conditions": [c.to_dict() for c in self.symbolic_conditions],
            "parsed_features": self.parsed_features,
            "summary": self.summary,
        }


class SymbolicParser:
    """符号需求解析器"""
    
    # 操作符模式（按优先级排序）
    OPERATORS = [
        (r">=", ">="),
        (r"<=", "<="),
        (r"!=", "!="),
        (r"=", "="),
        (r">", ">"),
        (r"<", "<"),
    ]
    
    # 常见单位
    UNITS = [
        "km/h", "m/s", "mph", "kph",
        "ms", "s", "min", "h",
        "m", "km", "cm", "mm",
        "kg", "g", "mg",
        "V", "A", "W", "kW",
        "Hz", "kHz", "MHz", "GHz",
        "°C", "°F", "K",
        "%", "dB", "rpm",
    ]
    
    def __init__(self):
        self.variable_registry: Dict[str, Dict] = {}
    
    def register_variable(self, name: str, spec: Dict):
        """注册变量规格"""
        """
        spec = {
            "type": "number" | "string" | "enum" | "range",
            "unit": "km/h",
            "min": 0,
            "max": 300,
            "enum_values": ["D", "N", "R", "P"],  # 枚举类型
            "description": "车辆速度",
        }
        """
        self.variable_registry[name] = spec
    
    def parse_condition(self, text: str) -> Optional[SymbolicCondition]:
        """解析单个符号条件"""
        text = text.strip()
        
        # 尝试匹配操作符
        for pattern, op in self.OPERATORS:
            if op in text:
                parts = text.split(op, 1)
                if len(parts) == 2:
                    variable = parts[0].strip()
                    value_part = parts[1].strip()
                    
                    # 解析值和单位
                    value, value_type, unit = self._parse_value(value_part)
                    
                    return SymbolicCondition(
                        variable=variable,
                        operator=op,
                        value=value,
                        value_type=value_type,
                        unit=unit,
                    )
        
        return None
    
    def _parse_value(self, value_str: str) -> Tuple[Any, str, str]:
        """解析值：返回 (value, type, unit)"""
        value_str = value_str.strip()
        unit = ""
        
        # 检查单位
        for u in self.UNITS:
            if value_str.endswith(u):
                value_str = value_str[:-len(u)].strip()
                unit = u
                break
        
        # 尝试解析为数字
        try:
            if "." in value_str:
                value = float(value_str)
                return value, "number", unit
            else:
                value = int(value_str)
                return value, "number", unit
        except ValueError:
            pass
        
        # 尝试解析为范围 [min, max]
        if value_str.startswith("[") and value_str.endswith("]"):
            inner = value_str[1:-1]
            if "," in inner:
                parts = inner.split(",")
                try:
                    min_val = float(parts[0].strip())
                    max_val = float(parts[1].strip())
                    return (min_val, max_val), "range", unit
                except ValueError:
                    pass
        
        # 默认为字符串/枚举
        return value_str, "string", unit
    
    def parse_conditions(self, text: str) -> List[SymbolicCondition]:
        """解析多个符号条件（逗号或分号分隔）"""
        conditions = []
        
        # 支持多种分隔符
        separators = [";", ",", "\n"]
        parts = [text]
        
        for sep in separators:
            new_parts = []
            for p in parts:
                new_parts.extend(p.split(sep))
            parts = new_parts
        
        for part in parts:
            part = part.strip()
            if part:
                cond = self.parse_condition(part)
                if cond:
                    conditions.append(cond)
        
        return conditions
    
    def validate_condition(self, condition: SymbolicCondition) -> ValidationResult:
        """校验符号条件"""
        var_name = condition.variable
        
        # 检查变量是否已注册
        if var_name in self.variable_registry:
            spec = self.variable_registry[var_name]
            
            # 类型校验
            expected_type = spec.get("type")
            if expected_type and condition.value_type != expected_type:
                # 尝试类型转换
                if expected_type == "number" and condition.value_type == "string":
                    try:
                        condition.value = float(condition.value)
                        condition.value_type = "number"
                    except ValueError:
                        return ValidationResult(
                            is_valid=False,
                            level=ValidationLevel.ERROR,
                            field=f"symbolic.{var_name}",
                            message=f"变量 {var_name} 期望数值类型，实际为: {condition.value}",
                            suggestion=f"请提供有效的数值，例如: {var_name}=100",
                        )
                
                # 枚举校验
                if expected_type == "enum":
                    enum_values = spec.get("enum_values", [])
                    if condition.value not in enum_values:
                        return ValidationResult(
                            is_valid=False,
                            level=ValidationLevel.ERROR,
                            field=f"symbolic.{var_name}",
                            message=f"变量 {var_name} 的值 '{condition.value}' 不在有效枚举中",
                            suggestion=f"有效值: {', '.join(enum_values)}",
                            details={"valid_values": enum_values},
                        )
            
            # 范围校验
            if condition.value_type == "number":
                min_val = spec.get("min")
                max_val = spec.get("max")
                
                if min_val is not None and condition.value < min_val:
                    return ValidationResult(
                        is_valid=False,
                        level=ValidationLevel.ERROR,
                        field=f"symbolic.{var_name}",
                        message=f"变量 {var_name} 的值 {condition.value} 小于最小值 {min_val}",
                        suggestion=f"请使用 >= {min_val} 的值",
                    )
                
                if max_val is not None and condition.value > max_val:
                    return ValidationResult(
                        is_valid=False,
                        level=ValidationLevel.ERROR,
                        field=f"symbolic.{var_name}",
                        message=f"变量 {var_name} 的值 {condition.value} 大于最大值 {max_val}",
                        suggestion=f"请使用 <= {max_val} 的值",
                    )
            
            # 单位校验
            expected_unit = spec.get("unit")
            if expected_unit and condition.unit and condition.unit != expected_unit:
                return ValidationResult(
                    is_valid=False,
                    level=ValidationLevel.WARNING,
                    field=f"symbolic.{var_name}",
                    message=f"变量 {var_name} 的单位 '{condition.unit}' 与期望单位 '{expected_unit}' 不匹配",
                    suggestion=f"建议使用单位: {expected_unit}",
                )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            field=f"symbolic.{var_name}",
            message=f"符号条件有效: {var_name}{condition.operator}{condition.value}",
        )


class RequirementValidator:
    """需求强校验引擎"""
    
    # 必需字段
    REQUIRED_FIELDS = {
        "BUSINESS": ["req_id", "title", "content", "module", "priority"],
        "TECHNICAL": ["req_id", "title", "content", "module", "priority", "phase"],
        "SYMBOLIC": ["req_id", "title", "conditions", "module"],
    }
    
    # 需求 ID 格式
    REQ_ID_PATTERNS = [
        r"^BR-\d{4}-Q[1-4]-\d{3}$",  # BR-2025-Q1-001
        r"^TR-\d{4}-Q[1-4]-\d{3}$",  # TR-2025-Q1-001
        r"^SY-\d{4}-Q[1-4]-\d{3}$",  # SY-2025-Q1-001 (符号需求)
        r"^REQ-\d{4}-\d{3}$",         # REQ-2025-001
    ]
    
    # ASIL 等级
    ASIL_LEVELS = ["A", "B", "C", "D", "QM"]
    
    # 优先级
    PRIORITY_LEVELS = ["P0", "P1", "P2"]
    
    # 技术需求时段
    PHASES = [
        "PRE_COMPILE",      # 编译前（代码规范）
        "COMPILE_TIME",     # 编译时（C++17/编译器）
        "CODE_LOGIC",       # 代码逻辑（接口/线程安全）
        "SIGNAL_ALIGN",     # 业务信号对齐（CAN/ROS）
        "RUNTIME_PERF",     # 运行时性能（延迟/内存/CPU）
    ]
    
    def __init__(self):
        self.symbolic_parser = SymbolicParser()
        self._init_default_variables()
    
    def _init_default_variables(self):
        """初始化默认变量注册表"""
        # 车辆相关
        self.symbolic_parser.register_variable("carSpeed", {
            "type": "number",
            "unit": "km/h",
            "min": 0,
            "max": 300,
            "description": "车辆速度",
        })
        
        self.symbolic_parser.register_variable("geer", {  # gear 的变体
            "type": "enum",
            "enum_values": ["D", "N", "R", "P", "1", "2", "3", "4", "5", "6"],
            "description": "档位",
        })
        
        self.symbolic_parser.register_variable("gear", {
            "type": "enum",
            "enum_values": ["D", "N", "R", "P", "1", "2", "3", "4", "5", "6"],
            "description": "档位",
        })
        
        self.symbolic_parser.register_variable("engineSpeed", {
            "type": "number",
            "unit": "rpm",
            "min": 0,
            "max": 8000,
            "description": "发动机转速",
        })
        
        self.symbolic_parser.register_variable("throttle", {
            "type": "number",
            "unit": "%",
            "min": 0,
            "max": 100,
            "description": "油门开度",
        })
        
        self.symbolic_parser.register_variable("brakePressure", {
            "type": "number",
            "unit": "bar",
            "min": 0,
            "max": 200,
            "description": "制动压力",
        })
        
        self.symbolic_parser.register_variable("steeringAngle", {
            "type": "number",
            "unit": "°",
            "min": -720,
            "max": 720,
            "description": "方向盘转角",
        })
        
        # 环境相关
        self.symbolic_parser.register_variable("temperature", {
            "type": "number",
            "unit": "°C",
            "min": -40,
            "max": 85,
            "description": "环境温度",
        })
        
        self.symbolic_parser.register_variable("humidity", {
            "type": "number",
            "unit": "%",
            "min": 0,
            "max": 100,
            "description": "湿度",
        })
    
    def validate(self, requirement: Dict) -> RequirementValidationReport:
        """执行完整校验"""
        results = []
        symbolic_conditions = []
        parsed_features = []
        
        req_id = requirement.get("req_id", "unknown")
        req_type = requirement.get("req_type", "BUSINESS")
        
        # 1. 必需字段校验
        results.extend(self._validate_required_fields(requirement, req_type))
        
        # 2. 字段格式校验
        results.extend(self._validate_field_formats(requirement))
        
        # 3. 语义校验
        results.extend(self._validate_semantics(requirement))
        
        # 4. 符号条件校验（如果是符号需求）
        if req_type == "SYMBOLIC" or requirement.get("conditions"):
            conditions_text = requirement.get("conditions", "")
            if conditions_text:
                symbolic_conditions = self.symbolic_parser.parse_conditions(conditions_text)
                for cond in symbolic_conditions:
                    result = self.symbolic_parser.validate_condition(cond)
                    results.append(result)
        
        # 5. 交叉校验
        results.extend(self._validate_cross_fields(requirement))
        
        # 生成摘要
        summary = self._generate_summary(results, symbolic_conditions)
        
        # 判断整体有效性
        is_valid = not any(r.level == ValidationLevel.ERROR for r in results)
        
        return RequirementValidationReport(
            requirement_id=req_id,
            is_valid=is_valid,
            results=results,
            symbolic_conditions=symbolic_conditions,
            parsed_features=parsed_features,
            summary=summary,
        )
    
    def _validate_required_fields(self, req: Dict, req_type: str) -> List[ValidationResult]:
        """校验必需字段"""
        results = []
        required = self.REQUIRED_FIELDS.get(req_type, self.REQUIRED_FIELDS["BUSINESS"])
        
        for field in required:
            if field not in req or not req[field]:
                results.append(ValidationResult(
                    is_valid=False,
                    level=ValidationLevel.ERROR,
                    field=field,
                    message=f"缺少必需字段: {field}",
                    suggestion=f"请提供 {field} 字段",
                ))
        
        return results
    
    def _validate_field_formats(self, req: Dict) -> List[ValidationResult]:
        """校验字段格式"""
        results = []
        
        # 需求 ID 格式
        req_id = req.get("req_id", "")
        if req_id:
            matched = any(re.match(p, req_id) for p in self.REQ_ID_PATTERNS)
            if not matched:
                results.append(ValidationResult(
                    is_valid=False,
                    level=ValidationLevel.ERROR,
                    field="req_id",
                    message=f"需求 ID 格式无效: {req_id}",
                    suggestion="格式: BR-2025-Q1-001, TR-2025-Q1-001, 或 REQ-2025-001",
                ))
        
        # ASIL 等级
        asil = req.get("asil")
        if asil and asil not in self.ASIL_LEVELS:
            results.append(ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                field="asil",
                message=f"无效的 ASIL 等级: {asil}",
                suggestion=f"有效等级: {', '.join(self.ASIL_LEVELS)}",
            ))
        
        # 优先级
        priority = req.get("priority")
        if priority and priority not in self.PRIORITY_LEVELS:
            results.append(ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                field="priority",
                message=f"无效的优先级: {priority}",
                suggestion=f"有效优先级: {', '.join(self.PRIORITY_LEVELS)}",
            ))
        
        # 技术需求时段
        phase = req.get("phase")
        if phase and phase not in self.PHASES:
            results.append(ValidationResult(
                is_valid=False,
                level=ValidationLevel.WARNING,
                field="phase",
                message=f"未知的技术需求时段: {phase}",
                suggestion=f"建议使用: {', '.join(self.PHASES)}",
            ))
        
        return results
    
    def _validate_semantics(self, req: Dict) -> List[ValidationResult]:
        """语义校验"""
        results = []
        
        # 标题长度
        title = req.get("title", "")
        if len(title) < 5:
            results.append(ValidationResult(
                is_valid=False,
                level=ValidationLevel.WARNING,
                field="title",
                message="标题过短，建议至少 5 个字符",
                suggestion="提供更具描述性的标题",
            ))
        elif len(title) > 100:
            results.append(ValidationResult(
                is_valid=False,
                level=ValidationLevel.WARNING,
                field="title",
                message="标题过长，建议不超过 100 个字符",
                suggestion="简化标题，详细描述放在 content 字段",
            ))
        
        # 内容长度
        content = req.get("content", "")
        if len(content) < 20:
            results.append(ValidationResult(
                is_valid=False,
                level=ValidationLevel.WARNING,
                field="content",
                message="需求内容过短，建议至少 20 个字符",
                suggestion="提供更详细的需求描述",
            ))
        
        # ASIL 与优先级匹配
        asil = req.get("asil")
        priority = req.get("priority")
        
        if asil == "D" and priority != "P0":
            results.append(ValidationResult(
                is_valid=False,
                level=ValidationLevel.WARNING,
                field="priority",
                message="ASIL D 需求建议使用 P0 优先级",
                suggestion="ASIL D 表示最高安全等级，建议设置 P0 优先级",
            ))
        
        return results
    
    def _validate_cross_fields(self, req: Dict) -> List[ValidationResult]:
        """交叉字段校验"""
        results = []
        
        # 业务需求应该有 ASIL 等级
        if req.get("req_type") == "BUSINESS":
            if not req.get("asil"):
                results.append(ValidationResult(
                    is_valid=False,
                    level=ValidationLevel.WARNING,
                    field="asil",
                    message="业务需求建议指定 ASIL 等级",
                    suggestion="ASIL 等级帮助确定安全关键程度",
                ))
        
        # 技术需求应该有时段
        if req.get("req_type") == "TECHNICAL":
            if not req.get("phase"):
                results.append(ValidationResult(
                    is_valid=False,
                    level=ValidationLevel.WARNING,
                    field="phase",
                    message="技术需求建议指定实现时段",
                    suggestion=f"时段帮助确定验证方式: {', '.join(self.PHASES)}",
                ))
        
        return results
    
    def _generate_summary(self, results: List[ValidationResult], 
                         conditions: List[SymbolicCondition]) -> Dict:
        """生成校验摘要"""
        errors = [r for r in results if r.level == ValidationLevel.ERROR]
        warnings = [r for r in results if r.level == ValidationLevel.WARNING]
        infos = [r for r in results if r.level == ValidationLevel.INFO]
        
        return {
            "total_checks": len(results),
            "error_count": len(errors),
            "warning_count": len(warnings),
            "info_count": len(infos),
            "symbolic_condition_count": len(conditions),
            "passed": len(errors) == 0,
            "error_fields": [r.field for r in errors],
            "warning_fields": [r.field for r in warnings],
        }
    
    def quick_validate(self, requirement: Dict) -> Tuple[bool, List[str]]:
        """快速校验，返回 (是否有效, 错误消息列表)"""
        report = self.validate(requirement)
        errors = [r.message for r in report.results if r.level == ValidationLevel.ERROR]
        return report.is_valid, errors


# 便捷函数
def validate_requirement(requirement: Dict) -> RequirementValidationReport:
    """校验单个需求"""
    validator = RequirementValidator()
    return validator.validate(requirement)


def validate_requirements(requirements: List[Dict]) -> List[RequirementValidationReport]:
    """批量校验需求"""
    validator = RequirementValidator()
    return [validator.validate(req) for req in requirements]


def parse_symbolic_conditions(text: str) -> List[SymbolicCondition]:
    """解析符号条件"""
    parser = SymbolicParser()
    return parser.parse_conditions(text)
