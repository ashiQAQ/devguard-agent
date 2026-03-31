"""
分析引擎模块
"""

from .req_parser import ReqParser, Feature
from .req_validator import (
    RequirementValidator,
    SymbolicParser,
    SymbolicCondition,
    ValidationResult,
    RequirementValidationReport,
    ValidationLevel,
    validate_requirement,
    validate_requirements,
    parse_symbolic_conditions,
)
from .ai_analyzer import (
    # 数据模型
    ExtractedFeature,
    RequirementInsight,
    SemanticAlignment,
    AIAnalysisResult,
    # AI 提供者
    AIProvider,
    OpenAIProvider,
    MockAIProvider,
    # 分析器
    RequirementAnalyzer,
    RequirementAnalysisPipeline,
    # 便捷函数
    analyze_requirement,
    batch_analyze_requirements,
)

__all__ = [
    # 旧版
    "ReqParser",
    "Feature",
    # 校验
    "RequirementValidator",
    "SymbolicParser",
    "SymbolicCondition",
    "ValidationResult",
    "RequirementValidationReport",
    "ValidationLevel",
    "validate_requirement",
    "validate_requirements",
    "parse_symbolic_conditions",
    # AI 分析
    "ExtractedFeature",
    "RequirementInsight",
    "SemanticAlignment",
    "AIAnalysisResult",
    "AIProvider",
    "OpenAIProvider",
    "MockAIProvider",
    "RequirementAnalyzer",
    "RequirementAnalysisPipeline",
    "analyze_requirement",
    "batch_analyze_requirements",
]
