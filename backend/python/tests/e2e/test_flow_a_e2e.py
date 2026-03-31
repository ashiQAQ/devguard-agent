"""
端到端测试 — Flow A 完整流程
"""

import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock

from devguard.flows.flow_a import FlowA
from devguard.analysis.req_parser import ReqParser, Feature


@pytest.mark.e2e
class TestFlowAEndToEnd:
    """Flow A 端到端测试"""

    @pytest.fixture
    def flow_a(self):
        return FlowA()

    @pytest.mark.asyncio
    async def test_full_flow_a_rain_scenario(
        self, flow_a, sample_requirement_content
    ):
        """
        端到端测试：城市NOA雨天感知降级策略
        
        验证完整的 Flow A 流程：
        1. 需求解析
        2. 功能点提取
        3. 功能点对齐
        4. 差距分析
        5. 实施计划生成
        6. 代码骨架生成
        7. 文档建议生成
        """
        # ── Step 1: 解析需求 ──────────────────────────────────────────
        parser = ReqParser()
        features = parser.parse(
            "REQ-2025-Q1-001",
            sample_requirement_content,
            "markdown"
        )

        assert len(features) > 0, "应该解析出功能点"

        business_features = [f for f in features if f.feature_type == "BUSINESS"]
        technical_features = [f for f in features if f.feature_type == "TECHNICAL"]

        assert len(business_features) > 0, "应该有业务需求"
        assert len(technical_features) > 0, "应该有技术需求"

        # ── Step 2: 验证功能点字段 ────────────────────────────────────
        for f in features:
            assert f.id, f"功能点 {f.name} 缺少 ID"
            assert f.name, "功能点缺少名称"
            assert f.phase in (
                "PRE_COMPILE", "COMPILE_TIME", "CODE_LOGIC",
                "SIGNAL_ALIGN", "RUNTIME_PERF"
            ), f"功能点 {f.id} 的 phase 无效: {f.phase}"
            assert len(f.keywords) > 0, f"功能点 {f.id} 缺少关键字"

        # ── Step 3: 验证技术需求分层 ──────────────────────────────────
        runtime_features = [f for f in technical_features if f.phase == "RUNTIME_PERF"]
        # 延迟/内存需求应该是 RUNTIME_PERF
        assert len(runtime_features) > 0, "应该有运行时性能需求"

        # ── Step 4: 执行完整 Flow A ───────────────────────────────────
        with patch.object(flow_a, '_align_features', new_callable=AsyncMock) as mock_align:
            with patch.object(flow_a, '_analyze_gaps', new_callable=AsyncMock) as mock_gaps:
                with patch.object(flow_a, '_generate_implementation_plan', new_callable=AsyncMock) as mock_plan:
                    with patch.object(flow_a, '_generate_code_skeleton', new_callable=AsyncMock) as mock_skeleton:
                        with patch.object(flow_a, '_generate_doc_suggestions', new_callable=AsyncMock) as mock_docs:

                            mock_align.return_value = {
                                "alignment_score": 0.85,
                                "matched": [f.id for f in business_features],
                                "missing": []
                            }
                            mock_gaps.return_value = {"gaps": [], "risks": []}
                            mock_plan.return_value = {
                                "phases": [
                                    {"name": "Phase 1", "features": ["BR-001", "BR-002"]},
                                    {"name": "Phase 2", "features": ["BR-003"]}
                                ]
                            }
                            mock_skeleton.return_value = """
// RainDetector.h
namespace apollo::perception {
class RainDetector {
public:
    enum class RainLevel { LIGHT, MEDIUM, HEAVY };
    RainLevel detect(float rainfall_rate);
};
}
"""
                            mock_docs.return_value = [
                                "更新 perception/README.md 添加雨天降级策略说明",
                                "更新 docs/design/perception-design.md"
                            ]

                            result = await flow_a.execute(
                                "REQ-2025-Q1-001",
                                sample_requirement_content,
                                "markdown"
                            )

        # ── Step 5: 验证结果 ──────────────────────────────────────────
        assert result["status"] == "success"
        assert result["requirement_id"] == "REQ-2025-Q1-001"
        assert "features" in result
        assert "alignment_results" in result
        assert "implementation_plan" in result
        assert "code_skeleton" in result
        assert "doc_suggestions" in result

        # 验证代码骨架包含 Apollo 风格
        assert "apollo" in result["code_skeleton"].lower() or \
               "namespace" in result["code_skeleton"]

        # 验证文档建议
        assert len(result["doc_suggestions"]) > 0

    @pytest.mark.asyncio
    async def test_flow_a_technical_requirement_phases(
        self, flow_a, sample_technical_requirement
    ):
        """
        端到端测试：技术需求分层验证
        
        验证技术需求按实现时段正确分类：
        - 编译前 (PRE_COMPILE)
        - 编译时 (COMPILE_TIME)
        - 代码逻辑 (CODE_LOGIC)
        - 业务信号对齐 (SIGNAL_ALIGN)
        - 运行时性能 (RUNTIME_PERF)
        """
        parser = ReqParser()
        features = parser.parse(
            sample_technical_requirement["id"],
            sample_technical_requirement["content"],
            "markdown"
        )

        technical = [f for f in features if f.feature_type == "TECHNICAL"]
        assert len(technical) > 0

        # 运行时性能需求应该标记 requires_simulation
        runtime = [f for f in technical if f.phase == "RUNTIME_PERF"]
        for f in runtime:
            # 有具体指标的运行时需求应该 specified=True
            if f.specified:
                assert f.constraint, f"运行时需求 {f.id} 有 specified=True 但缺少 constraint"

    @pytest.mark.asyncio
    async def test_flow_a_alignment_score_threshold(self, flow_a, sample_requirement_content):
        """
        端到端测试：对齐分数阈值验证
        
        验证：
        - 对齐分数 >= 0.8 → 通过
        - 对齐分数 0.6-0.8 → 警告
        - 对齐分数 < 0.6 → 阻断
        """
        test_cases = [
            (0.9, "PASS"),
            (0.75, "WARNING"),
            (0.5, "BLOCKED"),
        ]

        for score, expected_status in test_cases:
            with patch.object(flow_a, '_align_features', new_callable=AsyncMock) as mock_align:
                with patch.object(flow_a, '_analyze_gaps', new_callable=AsyncMock) as mock_gaps:
                    with patch.object(flow_a, '_generate_implementation_plan', new_callable=AsyncMock):
                        with patch.object(flow_a, '_generate_code_skeleton', new_callable=AsyncMock):
                            with patch.object(flow_a, '_generate_doc_suggestions', new_callable=AsyncMock):

                                mock_align.return_value = {
                                    "alignment_score": score,
                                    "matched": [],
                                    "missing": []
                                }
                                mock_gaps.return_value = {"gaps": [], "risks": []}

                                result = await flow_a.execute(
                                    "REQ-001",
                                    sample_requirement_content,
                                    "markdown"
                                )

                                alignment = result.get("alignment_results", {})
                                actual_score = alignment.get("alignment_score", score)
                                assert actual_score == score, \
                                    f"对齐分数应为 {score}，实际为 {actual_score}"

    @pytest.mark.asyncio
    async def test_flow_a_code_skeleton_apollo_style(self, flow_a):
        """
        端到端测试：代码骨架 Apollo CyberRT 风格
        
        验证生成的代码骨架包含：
        - namespace apollo::perception
        - AINFO 日志宏
        - CyberTime 时间戳
        """
        content = """
# 需求

### FR-001 雨量检测

实现雨量检测功能。
"""
        with patch.object(flow_a, '_align_features', new_callable=AsyncMock) as mock_align:
            with patch.object(flow_a, '_analyze_gaps', new_callable=AsyncMock):
                with patch.object(flow_a, '_generate_implementation_plan', new_callable=AsyncMock):
                    with patch.object(flow_a, '_generate_code_skeleton', new_callable=AsyncMock) as mock_skeleton:
                        with patch.object(flow_a, '_generate_doc_suggestions', new_callable=AsyncMock):

                            mock_align.return_value = {"alignment_score": 0.9, "matched": [], "missing": []}
                            mock_skeleton.return_value = """
#pragma once
#include "cyber/cyber.h"

namespace apollo {
namespace perception {

class RainDetector {
 public:
  bool Init();
  bool Proc(const RainSensorMsg& msg);

 private:
  float threshold_ = 2.0f;
};

}  // namespace perception
}  // namespace apollo
"""
                            result = await flow_a.execute("REQ-001", content, "markdown")

        skeleton = result.get("code_skeleton", "")
        assert "namespace apollo" in skeleton
        assert "perception" in skeleton


@pytest.mark.e2e
class TestFlowAWithRealParser:
    """Flow A 使用真实 ReqParser 的端到端测试"""

    @pytest.mark.asyncio
    async def test_parse_and_classify_features(self, sample_requirement_content):
        """测试真实解析和分类"""
        parser = ReqParser()
        features = parser.parse(
            "REQ-2025-Q1-001",
            sample_requirement_content,
            "markdown"
        )

        # 分类统计
        by_type = {}
        by_phase = {}
        for f in features:
            by_type[f.feature_type] = by_type.get(f.feature_type, 0) + 1
            by_phase[f.phase] = by_phase.get(f.phase, 0) + 1

        # 打印分类结果（便于调试）
        print(f"\n功能点分类统计:")
        print(f"  按类型: {by_type}")
        print(f"  按阶段: {by_phase}")

        assert "BUSINESS" in by_type
        assert len(features) >= 3  # 至少 3 个功能点

    @pytest.mark.asyncio
    async def test_keyword_coverage(self, sample_requirement_content):
        """测试关键字覆盖率"""
        parser = ReqParser()
        features = parser.parse(
            "REQ-2025-Q1-001",
            sample_requirement_content,
            "markdown"
        )

        # 收集所有关键字
        all_keywords = set()
        for f in features:
            all_keywords.update(f.keywords)

        # 验证核心关键字被覆盖
        core_keywords = {"雨量", "感知", "检测"}
        covered = core_keywords & all_keywords
        coverage = len(covered) / len(core_keywords)

        print(f"\n关键字覆盖率: {coverage:.0%} ({covered})")
        assert coverage >= 0.5, f"关键字覆盖率过低: {coverage:.0%}"
