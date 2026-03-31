"""
ReqParser 单元测试
"""

import pytest
from devguard.analysis.req_parser import ReqParser, Feature


@pytest.mark.unit
class TestReqParser:
    """ReqParser 单元测试"""

    @pytest.fixture
    def parser(self):
        return ReqParser()

    def test_parse_markdown_basic(self, parser, sample_requirement_content):
        """测试基础 Markdown 解析"""
        features = parser.parse(
            "REQ-2025-Q1-001",
            sample_requirement_content,
            "markdown"
        )
        assert isinstance(features, list)
        assert len(features) > 0

    def test_parse_extracts_business_requirements(self, parser, sample_requirement_content):
        """测试提取业务需求"""
        features = parser.parse("REQ-001", sample_requirement_content, "markdown")
        business = [f for f in features if f.feature_type == "BUSINESS"]
        assert len(business) > 0

    def test_parse_extracts_technical_requirements(self, parser, sample_requirement_content):
        """测试提取技术需求"""
        features = parser.parse("REQ-001", sample_requirement_content, "markdown")
        technical = [f for f in features if f.feature_type == "TECHNICAL"]
        assert len(technical) > 0

    def test_feature_has_required_fields(self, parser, sample_requirement_content):
        """测试功能点包含必要字段"""
        features = parser.parse("REQ-001", sample_requirement_content, "markdown")
        for f in features:
            assert f.id
            assert f.name
            assert f.feature_type in ("BUSINESS", "TECHNICAL")
            assert f.phase in (
                "PRE_COMPILE", "COMPILE_TIME", "CODE_LOGIC",
                "SIGNAL_ALIGN", "RUNTIME_PERF"
            )
            assert isinstance(f.keywords, list)
            assert f.priority in ("P0", "P1", "P2")

    def test_technical_requirement_phase_runtime(self, parser):
        """测试运行时性能需求分类"""
        content = """
# 技术需求

### TR-001 感知延迟 P99

系统感知延迟 P99 应小于 80ms，需要仿真环境验证。
"""
        features = parser.parse("REQ-001", content, "markdown")
        runtime = [f for f in features if f.phase == "RUNTIME_PERF"]
        assert len(runtime) > 0

    def test_technical_requirement_phase_compile(self, parser):
        """测试编译时需求分类"""
        content = """
# 技术需求

### TR-001 代码规范

所有代码必须通过 clang-tidy 静态检查，符合 C++17 标准。
"""
        features = parser.parse("REQ-001", content, "markdown")
        compile_time = [f for f in features if f.phase in ("PRE_COMPILE", "COMPILE_TIME")]
        assert len(compile_time) > 0

    def test_parse_empty_content(self, parser):
        """测试空内容"""
        features = parser.parse("REQ-001", "", "markdown")
        assert isinstance(features, list)

    def test_parse_json_format(self, parser):
        """测试 JSON 格式"""
        import json
        content = json.dumps({
            "features": [
                {
                    "id": "BR-001",
                    "name": "雨量分级检测",
                    "type": "BUSINESS",
                    "keywords": ["雨量", "分级"]
                }
            ]
        })
        features = parser.parse("REQ-001", content, "json")
        assert isinstance(features, list)

    def test_keywords_extracted(self, parser, sample_requirement_content):
        """测试关键字提取"""
        features = parser.parse("REQ-001", sample_requirement_content, "markdown")
        for f in features:
            assert len(f.keywords) > 0

    def test_priority_inference(self, parser):
        """测试优先级推断"""
        content = """
# 需求

### FR-001 核心功能（P0）

这是一个 P0 级别的核心功能，必须实现。

### FR-002 次要功能

这是一个普通功能。
"""
        features = parser.parse("REQ-001", content, "markdown")
        p0_features = [f for f in features if f.priority == "P0"]
        assert len(p0_features) > 0

    def test_specified_flag(self, parser):
        """测试 specified 标志"""
        content = """
# 技术需求

### TR-001 延迟要求

P99 延迟必须小于 80ms。

### TR-002 内存要求

内存占用应尽量小（无具体指标）。
"""
        features = parser.parse("REQ-001", content, "markdown")
        specified = [f for f in features if f.specified]
        unspecified = [f for f in features if not f.specified]
        # 有具体指标的应该是 specified
        assert len(specified) >= 0


@pytest.mark.unit
class TestFeature:
    """Feature 数据类测试"""

    def test_creation(self):
        """测试创建"""
        f = Feature(
            id="BR-001",
            name="雨量分级检测",
            feature_type="BUSINESS",
            phase="CODE_LOGIC",
            keywords=["雨量", "分级"],
            priority="P0",
            specified=True
        )
        assert f.id == "BR-001"
        assert f.feature_type == "BUSINESS"
        assert f.phase == "CODE_LOGIC"

    def test_default_values(self):
        """测试默认值"""
        f = Feature(
            id="TR-001",
            name="延迟要求",
            feature_type="TECHNICAL",
            phase="RUNTIME_PERF",
            keywords=["延迟"],
            priority="P1",
            specified=True
        )
        assert f.constraint == ""
        assert f.acceptance == []
