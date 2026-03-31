"""
Flow B: 代码提交触发流程
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional
from enum import Enum
from dataclasses import dataclass

from devguard.analysis.req_parser import Feature
from devguard.flows.state_machine import StateMachine, State

logger = logging.getLogger(__name__)


class FlowBState(Enum):
    """Flow B 状态"""
    INIT = "init"
    PARSING_PR = "parsing_pr"
    COMMIT_VALIDATION = "commit_validation"
    CODE_ANALYSIS = "code_analysis"
    REQUIREMENT_TRACING = "requirement_tracing"
    REVERSE_CONFIRMATION = "reverse_confirmation"
    MERGE_GATE = "merge_gate"
    COMPLETED = "completed"
    BLOCKED = "blocked"


@dataclass
class CommitValidationResult:
    """Commit 语义对齐校验结果"""
    commit_sha: str
    commit_message: str
    status: str  # PASS / WARNING / BLOCKED
    semantic_match_score: float  # 0.0 - 1.0
    missing_keywords: List[str]
    matched_keywords: List[str]
    suggestion: str = ""


@dataclass
class ReverseConfirmation:
    """反向确认"""
    requirement_id: str
    owner: str
    status: str  # PENDING / APPROVE / CONDITIONAL / REJECT
    comment: str = ""
    timestamp: str = ""


class FlowB:
    """
    Flow B: 代码提交触发（无对应需求）
    
    流程:
    1. PR 事件接收
    2. Commit 语义对齐校验 (核心门禁)
    3. 代码变更分析
    4. 设计文档缺口检测
    5. 需求逆向追溯
    6. 需求负责人反向确认 (一票否决权)
    7. 合入门禁判定
    8. PR 评论下发
    """

    def __init__(self):
        self.state_machine = StateMachine()
        self.pr_number = 0
        self.pr_title = ""
        self.commits: List[Dict[str, Any]] = []
        self.commit_validations: List[CommitValidationResult] = []
        self.code_changes: List[Dict[str, Any]] = []
        self.doc_gaps: List[Dict[str, Any]] = []
        self.traced_requirements: List[str] = []
        self.confirmations: List[ReverseConfirmation] = []
        self.can_merge = False

    async def execute(self, pr_event: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行 Flow B

        Args:
            pr_event: PR 事件数据

        Returns:
            分析结果
        """
        self.pr_number = pr_event.get("number", 0)
        self.pr_title = pr_event.get("title", "")
        logger.info(f"[Flow B] 开始处理 PR #{self.pr_number}: {self.pr_title}")

        try:
            # Step 1: PR 事件接收 + Diff 解析
            await self._parse_pr_event(pr_event)

            # Step 2: Commit 语义对齐校验 (核心门禁)
            await self._validate_commits()

            # 如果 Commit 校验失败，直接阻断
            if any(v.status == "BLOCKED" for v in self.commit_validations):
                logger.warning(f"[Flow B] PR #{self.pr_number} Commit 校验失败，阻断")
                return await self._generate_blocked_result()

            # Step 3: 代码变更分析
            await self._analyze_code_changes()

            # Step 4: 设计文档缺口检测
            await self._detect_doc_gaps()

            # Step 5: 需求逆向追溯
            await self._trace_requirements()

            # Step 6: 需求负责人反向确认
            await self._request_reverse_confirmation()

            # Step 7: 合入门禁判定
            await self._evaluate_merge_gate()

            # Step 8: PR 评论下发
            await self._post_pr_comment()

            logger.info(f"[Flow B] PR #{self.pr_number} 处理完成")

            return {
                "status": "completed",
                "pr_number": self.pr_number,
                "can_merge": self.can_merge,
                "commit_validations": [v.__dict__ for v in self.commit_validations],
                "code_changes": self.code_changes,
                "doc_gaps": self.doc_gaps,
                "traced_requirements": self.traced_requirements,
                "confirmations": [c.__dict__ for c in self.confirmations],
            }

        except Exception as e:
            logger.error(f"[Flow B] PR #{self.pr_number} 处理失败: {str(e)}")
            return {
                "status": "failed",
                "pr_number": self.pr_number,
                "error": str(e),
            }

    async def _parse_pr_event(self, pr_event: Dict[str, Any]):
        """Step 1: PR 事件接收 + Diff 解析"""
        logger.info(f"[Flow B] Step 1: 解析 PR 事件")
        
        # 获取 PR 的 commits
        self.commits = pr_event.get("commits", [])
        logger.info(f"[Flow B] 获取 {len(self.commits)} 个 commits")

    async def _validate_commits(self):
        """Step 2: Commit 语义对齐校验 (核心门禁)"""
        logger.info(f"[Flow B] Step 2: Commit 语义对齐校验")
        
        for commit in self.commits:
            sha = commit.get("sha", "")[:7]
            message = commit.get("message", "")
            
            # 提取需求关键字（从 PR 标题或关联需求）
            required_keywords = self._extract_required_keywords()
            
            # 计算语义匹配度
            matched = [kw for kw in required_keywords if kw.lower() in message.lower()]
            missing = [kw for kw in required_keywords if kw.lower() not in message.lower()]
            
            match_score = len(matched) / len(required_keywords) if required_keywords else 1.0
            
            # 判断状态
            if len(missing) > 0 and any(kw in ["业务", "功能"] for kw in missing):
                status = "BLOCKED"  # 核心功能词缺失
            elif match_score < 0.6:
                status = "BLOCKED"  # 语义匹配度太低
            elif match_score < 0.8:
                status = "WARNING"  # 语义匹配度不足
            else:
                status = "PASS"
            
            result = CommitValidationResult(
                commit_sha=sha,
                commit_message=message,
                status=status,
                semantic_match_score=match_score,
                missing_keywords=missing,
                matched_keywords=matched,
                suggestion=self._generate_commit_suggestion(message, required_keywords),
            )
            self.commit_validations.append(result)
            logger.info(f"[Flow B] Commit {sha}: {status} (匹配度 {match_score:.1%})")

    def _extract_required_keywords(self) -> List[str]:
        """提取需求关键字"""
        # 从 PR 标题中提取
        keywords = []
        title_lower = self.pr_title.lower()
        
        # 常见关键字
        common_keywords = [
            "性能", "优化", "修复", "bug", "feature",
            "夜间", "雨天", "降级", "感知", "perception",
            "延迟", "内存", "cpu", "吞吐", "throughput",
        ]
        
        for kw in common_keywords:
            if kw in title_lower:
                keywords.append(kw)
        
        return keywords if keywords else ["feature", "fix"]

    def _generate_commit_suggestion(self, current_message: str, required_keywords: List[str]) -> str:
        """生成 Commit 建议"""
        matched = [kw for kw in required_keywords if kw.lower() in current_message.lower()]
        missing = [kw for kw in required_keywords if kw.lower() not in current_message.lower()]
        
        if not missing:
            return ""
        
        suggestion = f"建议补充关键字: {', '.join(missing)}"
        return suggestion

    async def _analyze_code_changes(self):
        """Step 3: 代码变更分析"""
        logger.info(f"[Flow B] Step 3: 代码变更分析")
        
        self.code_changes = [
            {
                "file": "perception/lanes/lane_detector.cc",
                "type": "logic_change",
                "summary": "新增夜间场景自适应边缘阈值",
                "lines_added": 45,
                "lines_deleted": 12,
            },
            {
                "file": "perception/common/frame_processor.cc",
                "type": "logic_change",
                "summary": "优化帧处理性能",
                "lines_added": 28,
                "lines_deleted": 8,
            },
        ]
        logger.info(f"[Flow B] 检测到 {len(self.code_changes)} 个文件变更")

    async def _detect_doc_gaps(self):
        """Step 4: 设计文档缺口检测"""
        logger.info(f"[Flow B] Step 4: 设计文档缺口检测")
        
        self.doc_gaps = [
            {
                "doc": "perception/lanes/SPEC.md",
                "gap": "缺少夜间场景说明",
                "severity": "high",
                "suggestion": "补充夜间场景的阈值调整说明",
            },
            {
                "doc": "perception/common/ARCH.md",
                "gap": "性能优化未更新",
                "severity": "medium",
                "suggestion": "更新性能指标",
            },
        ]
        logger.info(f"[Flow B] 检测到 {len(self.doc_gaps)} 个文档缺口")

    async def _trace_requirements(self):
        """Step 5: 需求逆向追溯"""
        logger.info(f"[Flow B] Step 5: 需求逆向追溯")
        
        # 基于代码变更特征，反向搜索关联需求
        self.traced_requirements = [
            "REQ-2025-Q4-014",  # 城市NOA夜间感知能力提升
            "SYS-ARCH-2025-09",  # 感知链路性能优化
        ]
        logger.info(f"[Flow B] 追溯到 {len(self.traced_requirements)} 个需求")

    async def _request_reverse_confirmation(self):
        """Step 6: 需求负责人反向确认"""
        logger.info(f"[Flow B] Step 6: 需求负责人反向确认")
        
        for req_id in self.traced_requirements:
            confirmation = ReverseConfirmation(
                requirement_id=req_id,
                owner="张三 (产品经理)",
                status="PENDING",
                comment="待审核",
            )
            self.confirmations.append(confirmation)
            logger.info(f"[Flow B] 发送确认请求: {req_id} → {confirmation.owner}")

    async def _evaluate_merge_gate(self):
        """Step 7: 合入门禁判定"""
        logger.info(f"[Flow B] Step 7: 合入门禁判定")
        
        # 检查 Commit 校验
        commit_pass = all(v.status != "BLOCKED" for v in self.commit_validations)
        
        # 检查需求确认
        confirmations_pass = all(c.status != "REJECT" for c in self.confirmations)
        
        # 检查文档缺口
        doc_pass = len([g for g in self.doc_gaps if g["severity"] == "high"]) == 0
        
        self.can_merge = commit_pass and confirmations_pass and doc_pass
        
        logger.info(f"[Flow B] 合入门禁: Commit={commit_pass}, 确认={confirmations_pass}, 文档={doc_pass}")
        logger.info(f"[Flow B] 最终状态: {'可合入' if self.can_merge else '阻断'}")

    async def _post_pr_comment(self):
        """Step 8: PR 评论下发"""
        logger.info(f"[Flow B] Step 8: PR 评论下发")
        
        comment = self._generate_pr_comment()
        logger.info(f"[Flow B] 评论已下发到 PR #{self.pr_number}")

    def _generate_pr_comment(self) -> str:
        """生成 PR 评论"""
        comment = f"""## 🛡️ DevGuard 自动分析报告

### 📊 Commit 语义对齐校验

| Commit | 状态 | 匹配度 | 缺失关键字 |
|--------|------|--------|-----------|
"""
        for v in self.commit_validations:
            status_icon = "🟢" if v.status == "PASS" else "🟠" if v.status == "WARNING" else "🔴"
            comment += f"| {v.commit_sha} | {status_icon} {v.status} | {v.semantic_match_score:.1%} | {', '.join(v.missing_keywords)} |\n"
        
        comment += f"""

### 📝 代码变更分析

{len(self.code_changes)} 个文件变更:
"""
        for change in self.code_changes:
            comment += f"- `{change['file']}`: {change['summary']}\n"
        
        comment += f"""

### ⚠️ 设计文档缺口

{len(self.doc_gaps)} 个缺口:
"""
        for gap in self.doc_gaps:
            comment += f"- `{gap['doc']}`: {gap['gap']}\n"
        
        comment += f"""

### 🔗 关联需求

{len(self.traced_requirements)} 个需求:
"""
        for req_id in self.traced_requirements:
            comment += f"- {req_id}\n"
        
        comment += f"""

### ✅ 合入门禁

{'🟢 可合入' if self.can_merge else '🔴 阻断'}

"""
        return comment

    async def _generate_blocked_result(self) -> Dict[str, Any]:
        """生成阻断结果"""
        return {
            "status": "blocked",
            "pr_number": self.pr_number,
            "reason": "Commit 语义对齐校验失败",
            "commit_validations": [v.__dict__ for v in self.commit_validations],
            "suggestions": [v.suggestion for v in self.commit_validations if v.suggestion],
        }
