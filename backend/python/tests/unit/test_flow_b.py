"""
Flow B 单元测试
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock

from devguard.flows.flow_b import (
    FlowB, 
    FlowBState, 
    CommitValidationResult,
    ReverseConfirmation
)


@pytest.mark.unit
class TestFlowB:
    """Flow B 单元测试"""

    @pytest.fixture
    def flow_b(self):
        """创建 Flow B 实例"""
        return FlowB()

    def test_initialization(self, flow_b):
        """测试初始化"""
        assert flow_b.state_machine is not None
        assert flow_b.pr_number == 0
        assert flow_b.commits == []
        assert flow_b.commit_validations == []
        assert flow_b.can_merge == False

    @pytest.mark.asyncio
    async def test_execute_success(self, flow_b, sample_pr_event):
        """测试成功执行"""
        with patch.object(flow_b, '_parse_pr_event', new_callable=AsyncMock) as mock_parse:
            with patch.object(flow_b, '_validate_commits', new_callable=AsyncMock) as mock_validate:
                with patch.object(flow_b, '_analyze_code_changes', new_callable=AsyncMock) as mock_analyze:
                    with patch.object(flow_b, '_detect_doc_gaps', new_callable=AsyncMock) as mock_gaps:
                        with patch.object(flow_b, '_trace_requirements', new_callable=AsyncMock) as mock_trace:
                            with patch.object(flow_b, '_request_reverse_confirmation', new_callable=AsyncMock) as mock_confirm:
                                with patch.object(flow_b, '_evaluate_merge_gate', new_callable=AsyncMock) as mock_gate:
                                    # 设置返回值
                                    mock_validate.return_value = [
                                        CommitValidationResult(
                                            commit_sha="abc123",
                                            commit_message="feat: 添加功能",
                                            status="PASS",
                                            semantic_match_score=0.85,
                                            matched_keywords=["功能"],
                                            missing_keywords=[]
                                        )
                                    ]
                                    mock_analyze.return_value = []
                                    mock_gaps.return_value = []
                                    mock_trace.return_value = ["REQ-2025-Q1-001"]
                                    mock_confirm.return_value = [
                                        ReverseConfirmation(
                                            requirement_id="REQ-2025-Q1-001",
                                            owner="张三",
                                            status="APPROVE"
                                        )
                                    ]
                                    mock_gate.return_value = True

                                    # 执行
                                    result = await flow_b.execute(sample_pr_event)

                                    # 验证
                                    assert result["status"] in ["completed", "blocked"]
                                    assert "can_merge" in result

    @pytest.mark.asyncio
    async def test_parse_pr_event(self, flow_b, sample_pr_event):
        """测试 PR 事件解析"""
        await flow_b._parse_pr_event(sample_pr_event)
        
        assert flow_b.pr_number == 9152
        assert flow_b.pr_title == "feat: 城市NOA雨天感知降级策略实现"
        assert len(flow_b.commits) == 3

    @pytest.mark.asyncio
    async def test_validate_commits_matching(self, flow_b, sample_pr_event):
        """测试 Commit 校验 - 匹配"""
        await flow_b._parse_pr_event(sample_pr_event)
        
        # 模拟需求中的关键字
        requirements_keywords = {
            "REQ-2025-Q1-001": {
                "title": "城市NOA雨天感知降级策略",
                "keywords": ["雨量", "分级", "检测", "感知模式", "切换", "预警", "推送"]
            }
        }
        
        with patch.object(flow_b, '_extract_required_keywords', return_value=["雨量", "分级", "检测"]):
            results = await flow_b._validate_commits(requirements_keywords)
            
            assert len(results) > 0
            # 验证至少有一个 commit 通过
            passed = [r for r in results if r.status == "PASS"]
            assert len(passed) > 0

    @pytest.mark.asyncio
    async def test_validate_commits_no_matching(self, flow_b, sample_pr_event_no_matching):
        """测试 Commit 校验 - 不匹配"""
        await flow_b._parse_pr_event(sample_pr_event_no_matching)
        
        requirements_keywords = {
            "REQ-2025-Q1-001": {
                "title": "城市NOA雨天感知降级策略",
                "keywords": ["雨量", "分级", "检测"]
            }
        }
        
        with patch.object(flow_b, '_extract_required_keywords', return_value=["雨量", "分级", "检测"]):
            results = await flow_b._validate_commits(requirements_keywords)
            
            assert len(results) > 0
            # 不匹配的 commit 应该是 WARNING 或 BLOCKED
            blocked_or_warning = [r for r in results if r.status in ["WARNING", "BLOCKED"]]
            assert len(blocked_or_warning) > 0

    @pytest.mark.asyncio
    async def test_validate_commits_semantic_match(self, flow_b):
        """测试语义匹配计算"""
        commit_message = "feat(perception): 添加夜间场景车道线检测功能"
        required_keywords = ["车道线", "检测", "夜间"]
        
        score = await flow_b._calculate_semantic_match(commit_message, required_keywords)
        
        assert 0.0 <= score <= 1.0

    @pytest.mark.asyncio
    async def test_extract_required_keywords(self, flow_b, sample_features):
        """测试提取需求关键字"""
        keywords = await flow_b._extract_required_keywords(sample_features)
        
        assert isinstance(keywords, dict)
        assert len(keywords) > 0

    @pytest.mark.asyncio
    async def test_analyze_code_changes(self, flow_b, sample_pr_event):
        """测试代码变更分析"""
        await flow_b._parse_pr_event(sample_pr_event)
        
        changes = await flow_b._analyze_code_changes()
        
        assert isinstance(changes, list)

    @pytest.mark.asyncio
    async def test_detect_doc_gaps(self, flow_b, sample_pr_event):
        """测试文档缺口检测"""
        await flow_b._parse_pr_event(sample_pr_event)
        
        gaps = await flow_b._detect_doc_gaps()
        
        assert isinstance(gaps, list)

    @pytest.mark.asyncio
    async def test_trace_requirements(self, flow_b, sample_pr_event):
        """测试需求追溯"""
        await flow_b._parse_pr_event(sample_pr_event)
        
        requirements = await flow_b._trace_requirements()
        
        assert isinstance(requirements, list)

    @pytest.mark.asyncio
    async def test_request_reverse_confirmation(self, flow_b):
        """测试反向确认请求"""
        traced_requirements = ["REQ-2025-Q1-001"]
        
        confirmations = await flow_b._request_reverse_confirmation(traced_requirements)
        
        assert isinstance(confirmations, list)

    @pytest.mark.asyncio
    async def test_evaluate_merge_gate_all_pass(self, flow_b):
        """测试合入门禁 - 全部通过"""
        commit_validations = [
            CommitValidationResult(
                commit_sha="abc123",
                commit_message="feat: 添加功能",
                status="PASS",
                semantic_match_score=0.85,
                matched_keywords=["功能"],
                missing_keywords=[]
            )
        ]
        
        doc_gaps = []
        confirmations = [
            ReverseConfirmation(
                requirement_id="REQ-2025-Q1-001",
                owner="张三",
                status="APPROVE"
            )
        ]
        
        can_merge = await flow_b._evaluate_merge_gate(
            commit_validations,
            doc_gaps,
            confirmations
        )
        
        assert can_merge == True

    @pytest.mark.asyncio
    async def test_evaluate_merge_gate_blocked(self, flow_b):
        """测试合入门禁 - 阻断"""
        commit_validations = [
            CommitValidationResult(
                commit_sha="abc123",
                commit_message="fix: 修复bug",
                status="BLOCKED",
                semantic_match_score=0.3,
                matched_keywords=[],
                missing_keywords=["核心功能"]
            )
        ]
        
        doc_gaps = []
        confirmations = [
            ReverseConfirmation(
                requirement_id="REQ-2025-Q1-001",
                owner="张三",
                status="APPROVE"
            )
        ]
        
        can_merge = await flow_b._evaluate_merge_gate(
            commit_validations,
            doc_gaps,
            confirmations
        )
        
        assert can_merge == False

    @pytest.mark.asyncio
    async def test_evaluate_merge_gate_rejected(self, flow_b):
        """测试合入门禁 - 拒绝"""
        commit_validations = [
            CommitValidationResult(
                commit_sha="abc123",
                commit_message="feat: 添加功能",
                status="PASS",
                semantic_match_score=0.85,
                matched_keywords=["功能"],
                missing_keywords=[]
            )
        ]
        
        doc_gaps = []
        confirmations = [
            ReverseConfirmation(
                requirement_id="REQ-2025-Q1-001",
                owner="张三",
                status="REJECT",
                comment="功能实现不符合需求"
            )
        ]
        
        can_merge = await flow_b._evaluate_merge_gate(
            commit_validations,
            doc_gaps,
            confirmations
        )
        
        assert can_merge == False

    @pytest.mark.asyncio
    async def test_generate_pr_comment(self, flow_b):
        """测试生成 PR 评论"""
        flow_b.can_merge = True
        flow_b.commit_validations = [
            CommitValidationResult(
                commit_sha="abc123",
                commit_message="feat: 添加功能",
                status="PASS",
                semantic_match_score=0.85,
                matched_keywords=["功能"],
                missing_keywords=[]
            )
        ]
        flow_b.traced_requirements = ["REQ-2025-Q1-001"]
        flow_b.confirmations = [
            ReverseConfirmation(
                requirement_id="REQ-2025-Q1-001",
                owner="张三",
                status="APPROVE"
            )
        ]
        
        comment = flow_b._generate_pr_comment()
        
        assert isinstance(comment, str)
        assert len(comment) > 0
        assert "✅" in comment or "❌" in comment


@pytest.mark.unit
class TestFlowBStates:
    """Flow B 状态测试"""

    def test_state_enum(self):
        """测试状态枚举"""
        assert FlowBState.INIT.value == "init"
        assert FlowBState.COMMIT_VALIDATION.value == "commit_validation"
        assert FlowBState.COMPLETED.value == "completed"
        assert FlowBState.BLOCKED.value == "blocked"


@pytest.mark.unit
class TestCommitValidationResult:
    """Commit 校验结果测试"""

    def test_creation(self):
        """测试创建"""
        result = CommitValidationResult(
            commit_sha="abc123",
            commit_message="feat: 添加功能",
            status="PASS",
            semantic_match_score=0.85,
            matched_keywords=["功能"],
            missing_keywords=[]
        )
        
        assert result.commit_sha == "abc123"
        assert result.status == "PASS"
        assert result.semantic_match_score == 0.85

    def test_default_values(self):
        """测试默认值"""
        result = CommitValidationResult(
            commit_sha="abc123",
            commit_message="feat: 添加功能",
            status="PASS",
            semantic_match_score=0.85,
            matched_keywords=[],
            missing_keywords=[]
        )
        
        assert result.suggestion == ""


@pytest.mark.unit
class TestReverseConfirmation:
    """反向确认测试"""

    def test_creation(self):
        """测试创建"""
        confirmation = ReverseConfirmation(
            requirement_id="REQ-2025-Q1-001",
            owner="张三",
            status="APPROVE",
            comment="功能实现符合需求"
        )
        
        assert confirmation.requirement_id == "REQ-2025-Q1-001"
        assert confirmation.owner == "张三"
        assert confirmation.status == "APPROVE"


@pytest.mark.unit
class TestFlowBEdgeCases:
    """Flow B 边界情况测试"""

    @pytest.fixture
    def flow_b(self):
        return FlowB()

    @pytest.mark.asyncio
    async def test_empty_commits(self, flow_b):
        """测试空提交"""
        pr_event = {
            "number": 1,
            "title": "Empty PR",
            "commits": []
        }
        
        result = await flow_b.execute(pr_event)
        
        assert result["status"] in ["completed", "blocked"]

    @pytest.mark.asyncio
    async def test_very_long_commit_message(self, flow_b):
        """测试超长提交信息"""
        long_message = "feat: " + "添加功能 " * 100
        
        score = await flow_b._calculate_semantic_match(long_message, ["功能"])
        
        assert 0.0 <= score <= 1.0

    @pytest.mark.asyncio
    async def test_special_characters_in_message(self, flow_b):
        """测试提交信息中的特殊字符"""
        message = "feat: 添加功能 [WIP] 🚀 #123"
        
        score = await flow_b._calculate_semantic_match(message, ["功能"])
        
        assert 0.0 <= score <= 1.0

    @pytest.mark.asyncio
    async def test_chinese_keywords(self, flow_b):
        """测试中文关键字"""
        message = "feat(感知): 添加雨量分级检测功能"
        
        score = await flow_b._calculate_semantic_match(message, ["雨量", "分级", "检测"])
        
        assert score > 0
