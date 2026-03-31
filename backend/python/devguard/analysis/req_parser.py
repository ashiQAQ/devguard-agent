"""
需求解析模块
"""

import re
from typing import List, Dict, Any
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class Feature:
    """功能点"""
    id: str
    name: str
    description: str
    type: str  # BUSINESS / TECHNICAL
    phase: str  # PRE_COMPILE / COMPILE_TIME / CODE_LOGIC / SIGNAL_ALIGN / RUNTIME_PERF
    keywords: List[str]
    priority: str  # P0 / P1 / P2
    specified: bool
    constraint: str = ""
    acceptance: List[str] = None

    def __post_init__(self):
        if self.acceptance is None:
            self.acceptance = []


class ReqParser:
    """需求文档解析器"""

    def __init__(self):
        self.features: List[Feature] = []

    def parse(self, content: str, format: str = "markdown") -> List[Feature]:
        """
        解析需求文档

        Args:
            content: 文档内容
            format: 文档格式 (markdown / json / yaml)

        Returns:
            功能点列表
        """
        if format == "markdown":
            return self._parse_markdown(content)
        elif format == "json":
            return self._parse_json(content)
        elif format == "yaml":
            return self._parse_yaml(content)
        else:
            raise ValueError(f"Unsupported format: {format}")

    def _parse_markdown(self, content: str) -> List[Feature]:
        """解析 Markdown 格式的需求文档"""
        features = []
        lines = content.split("\n")

        current_feature = None
        i = 0

        while i < len(lines):
            line = lines[i].strip()

            # 检测功能点标题 (## FR-xxx 或 ### BR-xxx)
            if line.startswith("##") or line.startswith("###"):
                # 保存前一个功能点
                if current_feature:
                    features.append(current_feature)

                # 解析新功能点
                match = re.match(r"#+\s+([A-Z]+-\d+)\s*:\s*(.*)", line)
                if match:
                    feature_id = match.group(1)
                    feature_name = match.group(2)

                    # 判断类型
                    feature_type = "BUSINESS" if feature_id.startswith("BR-") else "TECHNICAL"

                    # 判断时段
                    phase = self._infer_phase(feature_name)

                    current_feature = Feature(
                        id=feature_id,
                        name=feature_name,
                        description="",
                        type=feature_type,
                        phase=phase,
                        keywords=[],
                        priority="P1",
                        specified=True,
                    )

            # 提取描述
            elif current_feature and line and not line.startswith("#"):
                if not line.startswith("-") and not line.startswith("*"):
                    current_feature.description += line + " "

            # 提取关键词 (- keyword)
            elif current_feature and (line.startswith("-") or line.startswith("*")):
                keyword = line.lstrip("-* ").strip()
                if keyword and not keyword.startswith("http"):
                    current_feature.keywords.append(keyword)

            i += 1

        # 保存最后一个功能点
        if current_feature:
            features.append(current_feature)

        self.features = features
        logger.info(f"解析了 {len(features)} 个功能点")
        return features

    def _parse_json(self, content: str) -> List[Feature]:
        """解析 JSON 格式的需求文档"""
        import json
        data = json.loads(content)
        features = []

        for item in data.get("features", []):
            feature = Feature(
                id=item.get("id", ""),
                name=item.get("name", ""),
                description=item.get("description", ""),
                type=item.get("type", "BUSINESS"),
                phase=item.get("phase", "CODE_LOGIC"),
                keywords=item.get("keywords", []),
                priority=item.get("priority", "P1"),
                specified=item.get("specified", True),
                constraint=item.get("constraint", ""),
                acceptance=item.get("acceptance", []),
            )
            features.append(feature)

        self.features = features
        return features

    def _parse_yaml(self, content: str) -> List[Feature]:
        """解析 YAML 格式的需求文档"""
        import yaml
        data = yaml.safe_load(content)
        features = []

        for item in data.get("features", []):
            feature = Feature(
                id=item.get("id", ""),
                name=item.get("name", ""),
                description=item.get("description", ""),
                type=item.get("type", "BUSINESS"),
                phase=item.get("phase", "CODE_LOGIC"),
                keywords=item.get("keywords", []),
                priority=item.get("priority", "P1"),
                specified=item.get("specified", True),
                constraint=item.get("constraint", ""),
                acceptance=item.get("acceptance", []),
            )
            features.append(feature)

        self.features = features
        return features

    def _infer_phase(self, name: str) -> str:
        """推断技术需求的时段"""
        name_lower = name.lower()

        if any(kw in name_lower for kw in ["规范", "命名", "注释", "style"]):
            return "PRE_COMPILE"
        elif any(kw in name_lower for kw in ["编译", "c++", "标准", "compile"]):
            return "COMPILE_TIME"
        elif any(kw in name_lower for kw in ["接口", "线程", "测试", "logic"]):
            return "CODE_LOGIC"
        elif any(kw in name_lower for kw in ["can", "ros", "信号", "signal"]):
            return "SIGNAL_ALIGN"
        elif any(kw in name_lower for kw in ["延迟", "内存", "cpu", "性能", "perf"]):
            return "RUNTIME_PERF"
        else:
            return "CODE_LOGIC"

    def extract_keywords(self) -> Dict[str, List[str]]:
        """提取所有关键词"""
        keywords_by_type = {"BUSINESS": [], "TECHNICAL": []}

        for feature in self.features:
            keywords_by_type[feature.type].extend(feature.keywords)

        return keywords_by_type
