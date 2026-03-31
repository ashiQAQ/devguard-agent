"""
端到端测试 — Flow B 完整流程
"""

import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock

from devguard.flows.flow_b import FlowB, CommitValidationResult, ReverseConfirmation


@pytest.mark.e2e
class TestFlowBEndToEnd:
    """Flow B 端到端测试"""

    @pytest.fixture
    def flow_b(self):
        return FlowB()

    @pytest.mark.asyncio
    async def test_full_flow_b_matching_pr(self, flow_b, sample_pr_event):
        """
        端到端测试：PR 与需求匹配 → 可合并
        
        场景：PR #9152 实现了雨天感知降级策略
        预期：Commit 语义对齐通过，需求负责人确认，可合并
        """
        # ── Step 1: 解析 PR 事件 ──────────────────────────────────────
        await flow_b._parse_pr_event(sample_pr_event)

        assert flow_b.pr_number == 9152
        assert len(flow_b.commits) == 3

        # ── Step 2: Commit 语义对齐校验 ───────────────────────────────
        requirements_keywords = {
            "REQ-2025-Q1-001": {
                "title": "城市NOA雨天感知降级策略",
                "keywords": ["雨量", "分级", "检测", "感知模式", "切换", "预警", "推送"]
            }
        }

        with patch.object(
            flow_b, '_extract_required_keywords',
            return_value={"REQ-2025-Q1-001": ["雨量", "分级", "检测"]}
        ):
            validations = await flow_b._validate_commits(requirements_keywords)

        assert len(validations) == 3

        # 验证至少有一个 PASS
        passed = [v for v in validations if v.status == "PASS"]
        assert len(passed) > 0, "至少应有一个 commit 通过校验"

        # 验证没有 BLOCKED
        blocked = [v for v in validations if v.status == "BLOCKED"]
        assert len(blocked) == 0, f"不应有 BLOCKED 的 commit: {[v.commit_sha for v in blocked]}"

        # ── Step 3: 模拟完整流程 ──────────────────────────────────────
        with patch.object(flow_b, '_validate_commits', new_callable=AsyncMock) as mock_validate:
            with patch.object(flow_b, '_analyze_code_changes', new_callable=AsyncMock) as mock_analyze:
                with patch.object(flow_b, '_detect_doc_gaps', new_callable=AsyncMock) as mock_gaps:
                    with patch.object(flow_b, '_trace_requirements', new_callable=AsyncMock) as mock_trace:
                        with patch.object(flow_b, '_request_reverse_confirmation', new_callable=AsyncMock) as mock_confirm:

                            mock_validate.return_value = [
                                CommitValidationResult(
                                    commit_sha=c["sha"],
                                    commit_message=c["message"],
                                    status="PASS",
                                    semantic_match_score=0.85,
                                    matched_keywords=["雨量", "感知"],
                                    missing_keywords=[]
                                )
                                for c in sample_pr_event["commits"]
                            ]
                            mock_analyze.return_value = [
                                {"file": "perception/rain_detector.cc", "type": "added", "lines": 120}
                            ]
                            mock_gaps.return_value = []
                            mock_trace.return_value = ["REQ-2025-Q1-001"]
                            mock_confirm.return_value = [
                                ReverseConfirmation(
                                    requirement_id="REQ-2025-Q1-001",
                                    owner="张三",
                                    status="APPROVE",
                                    comment="功能实现符合需求"
                                )
                            ]

                            result = await flow_b.execute(sample_pr_event)

        # ── Step 4: 验证结果 ──────────────────────────────────────────
        assert result["status"] == "completed"
        assert result["can_merge"] == True
        assert result["pr_number"] == 9152
        assert len(result["commit_validations"]) == 3
        assert len(result["traced_requirements"]) == 1
        assert result["traced_requirements"][0] == "REQ-2025-Q1-001"

    @pytest.mark.asyncio
    async def test_full_flow_b_blocked_by_commit(self, flow_b, sample_pr_event_no_matching):
        """
        端到端测试：Commit 不匹配 → 阻断
        
        场景：PR 的 commit message 与需求无关
        预期：Commit 语义对齐失败，PR 被阻断
        """
        with patch.object(flow_b, '_validate_commits', new_callable=AsyncMock) as mock_validate:
            with patch.object(flow_b, '_analyze_code_changes', new_callable=AsyncMock):
                with patch.object(flow_b, '_detect_doc_gaps', new_callable=AsyncMock):
                    with patch.object(flow_b, '_trace_requirements', new_callable=AsyncMock):
                        with patch.object(flow_b, '_request_reverse_confirmation', new_callable=AsyncMock):

                            mock_validate.return_value = [
                                CommitValidationResult(
                                    commit_sha="d4e5f6",
                                    commit_message="fix: 修复某个无关的bug",
                                    status="BLOCKED",
                                    semantic_match_score=0.15,
                                    matched_keywords=[],
                                    missing_keywords=["雨量", "感知", "检测"],
                                    suggestion="Commit message 缺少核心功能词"
                                )
                            ]

                            result = await flow_b.execute(sample_pr_event_no_matching)

        assert result["status"] == "blocked"
        assert result["can_merge"] == False
        assert "block_reason" in result

    @pytest.mark.asyncio
    async def test_full_flow_b_rejected_by_owner(self, flow_b, sample_pr_event):
        """
        端到端测试：需求负责人拒绝 → 阻断
        
        场景：Commit 通过校验，但需求负责人行使一票否决权
        预期：PR 被阻断，不可合并
        """
        with patch.object(flow_b, '_validate_commits', new_callable=AsyncMock) as mock_validate:
            with patch.object(flow_b, '_analyze_code_changes', new_callable=AsyncMock):
                with patch.object(flow_b, '_detect_doc_gaps', new_callable=AsyncMock):
                    with patch.object(flow_b, '_trace_requirements', new_callable=AsyncMock) as mock_trace:
                        with patch.object(flow_b, '_request_reverse_confirmation', new_callable=AsyncMock) as mock_confirm:

                            mock_validate.return_value = [
                                CommitValidationResult(
                                    commit_sha="abc123",
                                    commit_message="feat: 实现雨量检测",
                                    status="PASS",
                                    semantic_match_score=0.88,
                                    matched_keywords=["雨量", "检测"],
                                    missing_keywords=[]
                                )
                            ]
                            mock_trace.return_value = ["REQ-2025-Q1-001"]
                            mock_confirm.return_value = [
                                ReverseConfirmation(
                                    requirement_id="REQ-2025-Q1-001",
                                    owner="张三",
                                    status="REJECT",
                                    comment="实现方式不符合架构设计，请重新设计"
                                )
                            ]

                            result = await flow_b.execute(sample_pr_event)

        assert result["can_merge"] == False
        assert result["status"] == "blocked"

    @pytest.mark.asyncio
    async def test_full_flow_b_conditional_approval(self, flow_b, sample_pr_event):
        """
        端到端测试：条件确认 → 可合并（附条件）
        
        场景：需求负责人给出条件确认
        预期：PR 可合并，但附带条件说明
        """
        with patch.object(flow_b, '_validate_commits', new_callable=AsyncMock) as mock_validate:
            with patch.object(flow_b, '_analyze_code_changes', new_callable=AsyncMock):
                with patch.object(flow_b, '_detect_doc_gaps', new_callable=AsyncMock):
                    with patch.object(flow_b, '_trace_requirements', new_callable=AsyncMock) as mock_trace:
                        with patch.object(flow_b, '_request_reverse_confirmation', new_callable=AsyncMock) as mock_confirm:

                            mock_validate.return_value = [
                                CommitValidationResult(
                                    commit_sha="abc123",
                                    commit_message="feat: 实现雨量检测",
                                    status="PASS",
                                    semantic_match_score=0.82,
                                    matched_keywords=["雨量", "检测"],
                                    missing_keywords=[]
                                )
                            ]
                            mock_trace.return_value = ["REQ-2025-Q1-001"]
                            mock_confirm.return_value = [
                                ReverseConfirmation(
                                    requirement_id="REQ-2025-Q1-001",
                                    owner="张三",
                                    status="CONDITIONAL",
                                    comment="可以合并，但需要在下个迭代补充单元测试"
                                )
                            ]

                            result = await flow_b.execute(sample_pr_event)

        # CONDITIONAL 应该允许合并
        assert result["can_merge"] == True
        # 但应该有条件说明
        confirmations = result.get("confirmations", [])
        conditional = [c for c in confirmations if c.get("status") == "CONDITIONAL"]
        assert len(conditional) > 0

    @pytest.mark.asyncio
    async def test_flow_b_doc_gap_blocks_merge(self, flow_b, sample_pr_event):
        """
        端到端测试：高严重性文档缺口 → 阻断
        
        场景：代码变更缺少对应的设计文档更新
        预期：PR 被阻断
        """
        with patch.object(flow_b, '_validate_commits', new_callable=AsyncMock) as mock_validate:
            with patch.object(flow_b, '_analyze_code_changes', new_callable=AsyncMock):
                with patch.object(flow_b, '_detect_doc_gaps', new_callable=AsyncMock) as mock_gaps:
                    with patch.object(flow_b, '_trace_requirements', new_callable=AsyncMock):
                        with patch.object(flow_b, '_request_reverse_confirmation', new_callable=AsyncMock):

                            mock_validate.return_value = [
                                CommitValidationResult(
                                    commit_sha="abc123",
                                    commit_message="feat: 实现雨量检测",
                                    status="PASS",
                                    semantic_match_score=0.85,
                                    matched_keywords=["雨量"],
                                    missing_keywords=[]
                                )
                            ]
                            mock_gaps.return_value = [
                                {
                                    "type": "missing_design_doc",
                                    "severity": "HIGH",
                                    "file": "perception/rain_detector.cc",
                                    "message": "缺少对应的设计文档 docs/design/rain-detector.md"
                                }
                            ]

                            result = await flow_b.execute(sample_pr_event)

        assert result["can_merge"] == False

    @pytest.mark.asyncio
    async def test_flow_b_pr_comment_format(self, flow_b, sample_pr_event):
        """
        端到端测试：PR 评论格式验证
        
        验证生成的 PR 评论包含所有必要信息
        """
        with patch.object(flow_b, '_validate_commits', new_callable=AsyncMock) as mock_validate:
            with patch.object(flow_b, '_analyze_code_changes', new_callable=AsyncMock):
                with patch.object(flow_b, '_detect_doc_gaps', new_callable=AsyncMock):
                    with patch.object(flow_b, '_trace_requirements', new_callable=AsyncMock) as mock_trace:
                        with patch.object(flow_b, '_request_reverse_confirmation', new_callable=AsyncMock) as mock_confirm:

                            mock_validate.return_value = [
                                CommitValidationResult(
                                    commit_sha="abc123",
                                    commit_message="feat: 实现雨量检测",
                                    status="PASS",
                                    semantic_match_score=0.85,
                                    matched_keywords=["雨量"],
                                    missing_keywords=[]
                                )
                            ]
                            mock_trace.return_value = ["REQ-2025-Q1-001"]
                            mock_confirm.return_value = [
                                ReverseConfirmation(
                                    requirement_id="REQ-2025-Q1-001",
                                    owner="张三",
                                    status="APPROVE"
                                )
                            ]

                            result = await flow_b.execute(sample_pr_event)

        comment = flow_b._generate_pr_comment()

        # 验证评论包含关键信息
        assert "DevGuard" in comment or "devguard" in comment.lower()
        assert "Commit" in comment or "commit" in comment.lower()
        assert "REQ" in comment or "需求" in comment


@pytest.mark.e2e
class TestFlowBSemanticMatching:
    """Flow B 语义匹配端到端测试"""

    @pytest.fixture
    def flow_b(self):
        return FlowB()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("message,keywords,expected_min_score", [
        # 完全匹配
        ("feat(perception): 添加雨量分级检测功能", ["雨量", "分级", "检测"], 0.8),
        # 部分匹配
        ("feat: 优化感知模块", ["雨量", "分级", "检测"], 0.2),
        # 不匹配
        ("fix: 修复拼写错误", ["雨量", "分级", "检测"], 0.0),
        # 英文关键字
        ("feat: add night scene lane detection", ["night", "lane", "detection"], 0.7),
        # 中英混合
        ("feat(perception): 夜间 night scene 车道线 lane detection", ["夜间", "night", "车道线"], 0.8),
    ])
    async def test_semantic_match_scores(
        self, flow_b, message, keywords, expected_min_score
    ):
        """测试语义匹配分数"""
        score = await flow_b._calculate_semantic_match(message, keywords)

        assert 0.0 <= score <= 1.0, f"分数应在 [0, 1] 范围内，实际: {score}"
        assert score >= expected_min_score, \
            f"消息 '{message}' 对关键字 {keywords} 的匹配分数应 >= {expected_min_score}，实际: {score:.2f}"

    @pytest.mark.asyncio
    async def test_blocking_threshold(self, flow_b):
        """测试阻断阈值"""
        # 分数 < 0.6 → BLOCKED
        low_score_message = "fix: 修复无关bug"
        keywords = ["雨量", "感知", "检测", "降级"]

        with patch.object(
            flow_b, '_calculate_semantic_match',
            new_callable=AsyncMock,
            return_value=0.3
        ):
            flow_b.commits = [{"sha": "abc", "message": low_score_message}]
            flow_b.pr_number = 1

            validations = await flow_b._validate_commits(
                {"REQ-001": {"title": "雨天感知", "keywords": keywords}}
            )

        blocked = [v for v in validations if v.status == "BLOCKED"]
        assert len(blocked) > 0

    @pytest.mark.asyncio
    async def test_warning_threshold(self, flow_b):
        """测试警告阈值"""
        # 0.6 <= 分数 < 0.8 → WARNING
        with patch.object(
            flow_b, '_calculate_semantic_match',
            new_callable=AsyncMock,
            return_value=0.7
        ):
            flow_b.commits = [{"sha": "abc", "message": "feat: 部分相关功能"}]
            flow_b.pr_number = 1

            validations = await flow_b._validate_commits(
                {"REQ-001": {"title": "雨天感知", "keywords": ["雨量"]}}
            )

        warnings = [v for v in validations if v.status == "WARNING"]
        assert len(warnings) > 0

    @pytest.mark.asyncio
    async def test_pass_threshold(self, flow_b):
        """测试通过阈值"""
        # 分数 >= 0.8 → PASS
        with patch.object(
            flow_b, '_calculate_semantic_match',
            new_callable=AsyncMock,
            return_value=0.9
        ):
            flow_b.commits = [{"sha": "abc", "message": "feat: 实现雨量分级检测"}]
            flow_b.pr_number = 1

            validations = await flow_b._validate_commits(
                {"REQ-001": {"title": "雨天感知", "keywords": ["雨量"]}}
            )

        passed = [v for v in validations if v.status == "PASS"]
        assert len(passed) > 0
