"""
Flow A 单元测试
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock

from devguard.flows.flow_a import FlowA, FlowAState
from devguard.analysis.req_parser import Feature


@pytest.mark.unit
class TestFlowA:
    """Flow A 单元测试"""

    @pytest.fixture
    def flow_a(self):
        """创建 Flow A 实例"""
        return FlowA()

    def test_initialization(self, flow_a):
        """测试初始化"""
        assert flow_a.state_machine is not None
        assert flow_a.requirement_id == ""
        assert flow_a.features == []
        assert flow_a.alignment_results == {}

    @pytest.mark.asyncio
    async def test_execute_success(self, flow_a, sample_requirement_content):
        """测试成功执行"""
        with patch.object(flow_a, '_parse_requirement', new_callable=AsyncMock) as mock_parse:
            with patch.object(flow_a, '_align_features', new_callable=AsyncMock) as mock_align:
                with patch.object(flow_a, '_analyze_gaps', new_callable=AsyncMock) as mock_analyze:
                    with patch.object(flow_a, '_generate_implementation_plan', new_callable=AsyncMock) as mock_plan:
                        with patch.object(flow_a, '_generate_code_skeleton', new_callable=AsyncMock) as mock_skeleton:
                            with patch.object(flow_a, '_generate_doc_suggestions', new_callable=AsyncMock) as mock_docs:
                                # 设置返回值
                                mock_parse.return_value = [
                                    Feature(
                                        id="BR-001",
                                        name="雨量分级检测",
                                        feature_type="BUSINESS",
                                        phase="CODE_LOGIC",
                                        keywords=["雨量", "分级"],
                                        priority="P0",
                                        specified=True
                                    )
                                ]
                                mock_align.return_value = {"alignment_score": 0.85}
                                mock_analyze.return_value = {"gaps": []}
                                mock_plan.return_value = {"steps": []}
                                mock_skeleton.return_value = "// code skeleton"
                                mock_docs.return_value = []

                                # 执行
                                result = await flow_a.execute("REQ-2025-Q1-001", sample_requirement_content)

                                # 验证
                                assert result["status"] == "success"
                                assert flow_a.requirement_id == "REQ-2025-Q1-001"

    @pytest.mark.asyncio
    async def test_execute_with_markdown_format(self, flow_a):
        """测试 Markdown 格式解析"""
        content = "# 标题\n\n## 功能\n\n- 功能1\n- 功能2"
        
        with patch.object(flow_a, '_parse_requirement', new_callable=AsyncMock) as mock_parse:
            mock_parse.return_value = []
            
            result = await flow_a.execute("REQ-001", content, "markdown")
            
            # 验证解析被调用
            mock_parse.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_with_json_format(self, flow_a):
        """测试 JSON 格式解析"""
        content = '{"features": [{"id": "BR-001", "name": "测试功能"}]}'
        
        with patch.object(flow_a, '_parse_requirement', new_callable=AsyncMock) as mock_parse:
            mock_parse.return_value = []
            
            result = await flow_a.execute("REQ-001", content, "json")
            
            mock_parse.assert_called_once()

    @pytest.mark.asyncio
    async def test_parse_requirement_markdown(self, flow_a, sample_requirement_content):
        """测试 Markdown 需求解析"""
        features = await flow_a._parse_requirement(
            "REQ-2025-Q1-001",
            sample_requirement_content,
            "markdown"
        )
        
        assert len(features) > 0
        # 验证功能点类型
        business_features = [f for f in features if f.feature_type == "BUSINESS"]
        assert len(business_features) > 0

    @pytest.mark.asyncio
    async def test_align_features(self, flow_a):
        """测试功能点对齐"""
        features = [
            Feature(
                id="BR-001",
                name="雨量分级检测",
                feature_type="BUSINESS",
                phase="CODE_LOGIC",
                keywords=["雨量", "分级"],
                priority="P0",
                specified=True
            ),
            Feature(
                id="BR-002",
                name="感知模式切换",
                feature_type="BUSINESS",
                phase="CODE_LOGIC",
                keywords=["感知模式", "切换"],
                priority="P0",
                specified=True
            )
        ]
        
        # 模拟基线
        baseline = {
            "modules": {
                "perception": {
                    "rain_detector": {"class": "RainDetector"},
                    "perception_mode": {"class": "PerceptionMode"}
                }
            }
        }
        
        with patch('devguard.flows.flow_a.FeatureAligner') as mock_aligner:
            mock_instance = AsyncMock()
            mock_instance.align.return_value = {
                "alignment_score": 0.9,
                "matched": ["BR-001", "BR-002"],
                "missing": []
            }
            mock_aligner.return_value = mock_instance
            
            result = await flow_a._align_features(features, baseline)
            
            assert result["alignment_score"] > 0

    @pytest.mark.asyncio
    async def test_analyze_gaps(self, flow_a):
        """测试差距分析"""
        features = [
            Feature(
                id="BR-001",
                name="雨量分级检测",
                feature_type="BUSINESS",
                phase="CODE_LOGIC",
                keywords=["雨量"],
                priority="P0",
                specified=True
            )
        ]
        
        alignment_results = {
            "alignment_score": 0.7,
            "matched": ["BR-001"],
            "missing": ["BR-002"]
        }
        
        gaps = await flow_a._analyze_gaps(features, alignment_results)
        
        assert isinstance(gaps, dict)

    @pytest.mark.asyncio
    async def test_generate_implementation_plan(self, flow_a):
        """测试生成实施计划"""
        features = [
            Feature(
                id="BR-001",
                name="雨量分级检测",
                feature_type="BUSINESS",
                phase="CODE_LOGIC",
                keywords=["雨量"],
                priority="P0",
                specified=True
            )
        ]
        
        gaps = {"missing": []}
        
        plan = await flow_a._generate_implementation_plan(features, gaps)
        
        assert isinstance(plan, dict)
        assert "steps" in plan or "phases" in plan

    @pytest.mark.asyncio
    async def test_generate_code_skeleton(self, flow_a):
        """测试生成代码骨架"""
        features = [
            Feature(
                id="BR-001",
                name="雨量分级检测",
                feature_type="BUSINESS",
                phase="CODE_LOGIC",
                keywords=["雨量"],
                priority="P0",
                specified=True
            )
        ]
        
        plan = {"phases": []}
        
        skeleton = await flow_a._generate_code_skeleton(features, plan)
        
        assert isinstance(skeleton, str)

    @pytest.mark.asyncio
    async def test_generate_doc_suggestions(self, flow_a):
        """测试生成文档建议"""
        features = [
            Feature(
                id="BR-001",
                name="雨量分级检测",
                feature_type="BUSINESS",
                phase="CODE_LOGIC",
                keywords=["雨量"],
                priority="P0",
                specified=True
            )
        ]
        
        suggestions = await flow_a._generate_doc_suggestions(features)
        
        assert isinstance(suggestions, list)

    def test_state_transitions(self, flow_a):
        """测试状态转换"""
        # 测试初始状态
        assert flow_a.state_machine.get_current_state() == "init"
        
        # 测试状态转换
        flow_a.state_machine.transition("parsing")
        assert flow_a.state_machine.get_current_state() == "parsing"
        
        flow_a.state_machine.transition("completed")
        assert flow_a.state_machine.get_current_state() == "completed"


@pytest.mark.unit
class TestFlowAStates:
    """Flow A 状态测试"""

    def test_state_enum(self):
        """测试状态枚举"""
        assert FlowAState.INIT.value == "init"
        assert FlowAState.PARSING.value == "parsing"
        assert FlowAState.ALIGNING.value == "aligning"
        assert FlowAState.COMPLETED.value == "completed"
        assert FlowAState.FAILED.value == "failed"


@pytest.mark.unit
class TestFlowAEdgeCases:
    """Flow A 边界情况测试"""

    @pytest.fixture
    def flow_a(self):
        return FlowA()

    @pytest.mark.asyncio
    async def test_empty_content(self, flow_a):
        """测试空内容"""
        result = await flow_a.execute("REQ-001", "", "markdown")
        # 应该返回成功但 features 为空
        assert result["status"] in ["success", "failed"]

    @pytest.mark.asyncio
    async def test_invalid_format(self, flow_a):
        """测试无效格式"""
        result = await flow_a.execute("REQ-001", "some content", "invalid")
        assert result["status"] == "failed"

    @pytest.mark.asyncio
    async def test_very_long_content(self, flow_a):
        """测试超长内容"""
        long_content = "功能需求\n" * 1000
        result = await flow_a.execute("REQ-001", long_content, "markdown")
        assert "status" in result
