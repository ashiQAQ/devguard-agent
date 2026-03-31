"""
AI 需求分析引擎
支持多模型接入：OpenAI / Azure / 本地模型 / Mock
"""

import os
import json
import re
import logging
import asyncio
import hashlib
import math
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field, asdict
from abc import ABC, abstractmethod
import time

from devguard.config import settings

logger = logging.getLogger(__name__)


# ============================================================
# 数据模型
# ============================================================

@dataclass
class ExtractedFeature:
    """AI 提取的功能点"""
    id: str
    name: str
    description: str
    type: str = "BUSINESS"
    priority: str = "P1"
    keywords: List[str] = field(default_factory=list)
    acceptance_criteria: List[str] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)
    related_modules: List[str] = field(default_factory=list)
    asil_implication: str = ""
    estimated_complexity: str = "MEDIUM"
    dependencies: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class RequirementInsight:
    """需求洞察"""
    requirement_id: str = ""
    summary: str = ""
    key_entities: List[str] = field(default_factory=list)
    action_verbs: List[str] = field(default_factory=list)
    quality_attributes: List[str] = field(default_factory=list)
    potential_risks: List[str] = field(default_factory=list)
    missing_info: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    test_scenarios: List[str] = field(default_factory=list)


@dataclass
class SemanticAlignment:
    """语义对齐结果"""
    feature_id: str
    code_element: str
    element_type: str
    similarity_score: float
    match_type: str
    confidence: float
    rationale: str


@dataclass
class AIAnalysisResult:
    """AI 分析结果"""
    success: bool
    model: str
    tokens_used: int
    latency_ms: float
    content: str
    structured_data: Dict = field(default_factory=dict)
    error: str = ""


# ============================================================
# AI 提供者
# ============================================================

class AIProvider(ABC):
    """AI 提供者抽象基类"""
    
    @abstractmethod
    async def analyze(self, prompt: str, system_prompt: str = "") -> AIAnalysisResult:
        pass
    
    @abstractmethod
    async def embed(self, text: str) -> List[float]:
        pass
    
    @abstractmethod
    def get_model_name(self) -> str:
        pass


class MockAIProvider(AIProvider):
    """Mock 提供者（测试用）"""
    
    def __init__(self):
        self.model = "mock-model-v1"
    
    async def analyze(self, prompt: str, system_prompt: str = "") -> AIAnalysisResult:
        start = time.time()
        
        if "功能点" in prompt or "feature" in prompt.lower():
            content = json.dumps({
                "features": [{
                    "id": "BR-2025-001",
                    "name": "速度控制功能",
                    "description": "实现车辆速度闭环控制",
                    "type": "BUSINESS",
                    "priority": "P1",
                    "keywords": ["速度", "控制", "闭环"],
                    "acceptance_criteria": ["速度误差 ±1km/h", "响应时间 <100ms"],
                    "constraints": ["ASIL-B"],
                    "asil_implication": "B",
                    "estimated_complexity": "MEDIUM",
                }],
                "summary": "提取了 1 个功能点"
            }, ensure_ascii=False, indent=2)
        elif "风险" in prompt or "risk" in prompt.lower():
            content = json.dumps({
                "risks": [{
                    "type": "SAFETY",
                    "description": "速度控制失效可能导致车辆失控",
                    "severity": "HIGH",
                    "mitigation": "增加冗余传感器和故障检测机制"
                }],
                "missing_info": ["传感器故障处理逻辑"],
                "questions": ["是否需要支持紧急制动?"]
            }, ensure_ascii=False, indent=2)
        elif "代码" in prompt or "code" in prompt.lower():
            content = json.dumps({
                "suggested_classes": [{
                    "name": "SpeedController",
                    "responsibility": "车辆速度闭环控制",
                    "methods": ["setTargetSpeed", "getCurrentSpeed", "calculateThrottle"]
                }],
                "test_cases": ["测试正常速度控制", "测试超速保护", "测试传感器故障"]
            }, ensure_ascii=False, indent=2)
        else:
            content = json.dumps({
                "summary": "需求分析完成",
                "key_entities": ["车辆", "速度", "控制"],
                "suggestions": ["建议增加异常处理流程"]
            }, ensure_ascii=False, indent=2)
        
        return AIAnalysisResult(
            success=True,
            model=self.model,
            tokens_used=len(prompt) // 4,
            latency_ms=(time.time() - start) * 1000,
            content=content,
        )
    
    async def embed(self, text: str) -> List[float]:
        h = hashlib.md5(text.encode()).hexdigest()
        return [float(int(h[i:i+2], 16)) / 255.0 for i in range(0, 64, 2)]
    
    def get_model_name(self) -> str:
        return self.model


class OpenAIProvider(AIProvider):
    """OpenAI 提供者"""
    
    def __init__(self):
        self.api_key = settings.AI_API_KEY
        self.model = settings.AI_MODEL
        self.base_url = settings.AI_BASE_URL
        self.embedding_model = settings.AI_EMBEDDING_MODEL
        self.timeout = settings.AI_TIMEOUT
        self.max_tokens = settings.AI_MAX_TOKENS
        self.temperature = settings.AI_TEMPERATURE
        self._client = None
    
    def _get_client(self):
        if self._client is None:
            try:
                from openai import AsyncOpenAI
                self._client = AsyncOpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url,
                    timeout=self.timeout,
                )
            except ImportError:
                raise RuntimeError("请安装 openai: pip install openai")
        return self._client
    
    async def analyze(self, prompt: str, system_prompt: str = "") -> AIAnalysisResult:
        start = time.time()
        
        try:
            client = self._get_client()
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            
            response = await client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
            
            return AIAnalysisResult(
                success=True,
                model=self.model,
                tokens_used=response.usage.total_tokens,
                latency_ms=(time.time() - start) * 1000,
                content=response.choices[0].message.content,
            )
        except Exception as e:
            logger.error(f"OpenAI API 调用失败: {e}")
            return AIAnalysisResult(
                success=False,
                model=self.model,
                tokens_used=0,
                latency_ms=0,
                content="",
                error=str(e),
            )
    
    async def embed(self, text: str) -> List[float]:
        client = self._get_client()
        response = await client.embeddings.create(
            model=self.embedding_model,
            input=text,
        )
        return response.data[0].embedding
    
    def get_model_name(self) -> str:
        return f"openai/{self.model}"


class AzureOpenAIProvider(AIProvider):
    """Azure OpenAI 提供者"""
    
    def __init__(self):
        self.api_key = settings.AI_API_KEY
        self.endpoint = settings.AI_BASE_URL  # Azure endpoint
        self.deployment = settings.AI_MODEL   # deployment name
        self.api_version = settings.AI_API_VERSION
        self._client = None
    
    def _get_client(self):
        if self._client is None:
            try:
                from openai import AsyncAzureOpenAI
                self._client = AsyncAzureOpenAI(
                    api_key=self.api_key,
                    azure_endpoint=self.endpoint,
                    api_version=self.api_version,
                )
            except ImportError:
                raise RuntimeError("请安装 openai: pip install openai")
        return self._client
    
    async def analyze(self, prompt: str, system_prompt: str = "") -> AIAnalysisResult:
        start = time.time()
        
        try:
            client = self._get_client()
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            
            response = await client.chat.completions.create(
                model=self.deployment,
                messages=messages,
                temperature=settings.AI_TEMPERATURE,
                max_tokens=settings.AI_MAX_TOKENS,
            )
            
            return AIAnalysisResult(
                success=True,
                model=self.deployment,
                tokens_used=response.usage.total_tokens,
                latency_ms=(time.time() - start) * 1000,
                content=response.choices[0].message.content,
            )
        except Exception as e:
            return AIAnalysisResult(
                success=False,
                model=self.deployment,
                tokens_used=0,
                latency_ms=0,
                content="",
                error=str(e),
            )
    
    async def embed(self, text: str) -> List[float]:
        client = self._get_client()
        response = await client.embeddings.create(
            model=self.deployment,
            input=text,
        )
        return response.data[0].embedding
    
    def get_model_name(self) -> str:
        return f"azure/{self.deployment}"


class LocalModelProvider(AIProvider):
    """本地模型提供者 (Ollama / LocalAI)"""
    
    def __init__(self):
        self.url = settings.AI_BASE_URL
        self.model = settings.AI_MODEL
        self._client = None
    
    async def _call_api(self, endpoint: str, data: Dict) -> Dict:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.url}/{endpoint}",
                json=data,
                timeout=aiohttp.ClientTimeout(total=settings.AI_TIMEOUT),
            ) as resp:
                return await resp.json()
    
    async def analyze(self, prompt: str, system_prompt: str = "") -> AIAnalysisResult:
        start = time.time()
        
        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            
            result = await self._call_api("chat/completions", {
                "model": self.model,
                "messages": messages,
                "temperature": settings.AI_TEMPERATURE,
            })
            
            return AIAnalysisResult(
                success=True,
                model=self.model,
                tokens_used=result.get("usage", {}).get("total_tokens", 0),
                latency_ms=(time.time() - start) * 1000,
                content=result["choices"][0]["message"]["content"],
            )
        except Exception as e:
            return AIAnalysisResult(
                success=False,
                model=self.model,
                tokens_used=0,
                latency_ms=0,
                content="",
                error=str(e),
            )
    
    async def embed(self, text: str) -> List[float]:
        result = await self._call_api("embeddings", {
            "model": self.model,
            "input": text,
        })
        return result["data"][0]["embedding"]
    
    def get_model_name(self) -> str:
        return f"local/{self.model}"


# ============================================================
# 提供者工厂
# ============================================================

def create_provider(provider_type: str = None) -> AIProvider:
    """
    创建 AI 提供者
    
    Args:
        provider_type: openai / azure / local / mock
    
    配置示例 (.env):
        # OpenAI
        AI_PROVIDER=openai
        AI_API_KEY=sk-xxx
        AI_MODEL=gpt-4o
        
        # Azure OpenAI（注释 OpenAI，取消注释以下）
        # AI_PROVIDER=azure
        # AI_API_KEY=xxx
        # AI_BASE_URL=https://your-resource.openai.azure.com/
        # AI_MODEL=gpt-4o-deployment
        # AI_API_VERSION=2024-02-01
        
        # 本地模型 Ollama（注释其他，取消注释以下）
        # AI_PROVIDER=local
        # AI_BASE_URL=http://localhost:11434/v1
        # AI_MODEL=llama3
    """
    provider_type = provider_type or settings.AI_PROVIDER
    
    if provider_type == "openai":
        if not settings.AI_API_KEY:
            logger.warning("AI_API_KEY 未配置，降级到 Mock")
            return MockAIProvider()
        return OpenAIProvider()
    
    elif provider_type == "azure":
        if not settings.AI_API_KEY:
            logger.warning("AI_API_KEY 未配置，降级到 Mock")
            return MockAIProvider()
        return AzureOpenAIProvider()
    
    elif provider_type == "local":
        return LocalModelProvider()
    
    else:
        return MockAIProvider()


# ============================================================
# 需求分析器
# ============================================================

class RequirementAnalyzer:
    """需求分析器"""
    
    SYSTEM_PROMPT = """你是一位专业的需求分析专家，精通汽车自动驾驶系统开发。
分析需求文档，提取关键信息，给出专业建议。
输出使用 JSON 格式，确保准确识别需求类型、关键实体、风险和复杂度。"""

    FEATURE_PROMPT = """分析以下需求文档，提取所有功能点：

{content}

按以下 JSON 格式输出：
{{
  "features": [
    {{
      "id": "BR-2025-Q1-001",
      "name": "功能名称",
      "description": "功能描述",
      "type": "BUSINESS 或 TECHNICAL",
      "priority": "P0/P1/P2",
      "keywords": ["关键词"],
      "acceptance_criteria": ["验收标准"],
      "constraints": ["约束条件"],
      "related_modules": ["相关模块"],
      "asil_implication": "A/B/C/D/QM",
      "estimated_complexity": "LOW/MEDIUM/HIGH",
      "dependencies": ["依赖项"]
    }}
  ]
}}"""

    RISK_PROMPT = """分析需求的风险：

需求ID: {req_id}
内容: {content}

输出 JSON：
{{
  "risks": [
    {{"type": "TECHNICAL/SAFETY/PERFORMANCE/INTEGRATION", "description": "描述", "severity": "HIGH/MEDIUM/LOW", "mitigation": "缓解措施"}}
  ],
  "missing_info": ["缺失信息"],
  "questions": ["需澄清问题"]
}}"""

    CODE_PROMPT = """基于需求生成代码建议：

需求: {requirement}

输出 JSON：
{{
  "suggested_classes": [{{"name": "类名", "responsibility": "职责", "methods": ["方法"]}}],
  "suggested_interfaces": ["接口"],
  "key_algorithms": ["算法建议"],
  "test_cases": ["测试用例"]
}}"""

    INSIGHT_PROMPT = """分析需求生成洞察：

{content}

输出 JSON：
{{
  "summary": "概述",
  "key_entities": ["关键实体"],
  "action_verbs": ["动作动词"],
  "quality_attributes": ["质量属性"],
  "potential_risks": ["潜在风险"],
  "missing_info": ["缺失信息"],
  "suggestions": ["建议"],
  "test_scenarios": ["测试场景"]
}}"""

    def __init__(self, provider: AIProvider = None):
        self.provider = provider or create_provider()
        self._cache: Dict[str, AIAnalysisResult] = {}
        self._cache_enabled = settings.AI_CACHE_ENABLED
    
    async def extract_features(self, content: str) -> List[ExtractedFeature]:
        """提取功能点"""
        max_len = settings.AI_MAX_CONTENT_LENGTH
        prompt = self.FEATURE_PROMPT.format(content=content[:max_len])
        result = await self.provider.analyze(prompt, self.SYSTEM_PROMPT)
        
        if not result.success:
            logger.error(f"AI 分析失败: {result.error}")
            return []
        
        try:
            json_match = re.search(r'\{[\s\S]*\}', result.content)
            if not json_match:
                return []
            
            data = json.loads(json_match.group())
            features = []
            
            for item in data.get("features", []):
                features.append(ExtractedFeature(
                    id=item.get("id", ""),
                    name=item.get("name", ""),
                    description=item.get("description", ""),
                    type=item.get("type", "BUSINESS"),
                    priority=item.get("priority", "P1"),
                    keywords=item.get("keywords", []),
                    acceptance_criteria=item.get("acceptance_criteria", []),
                    constraints=item.get("constraints", []),
                    related_modules=item.get("related_modules", []),
                    asil_implication=item.get("asil_implication", ""),
                    estimated_complexity=item.get("estimated_complexity", "MEDIUM"),
                    dependencies=item.get("dependencies", []),
                ))
            
            logger.info(f"提取了 {len(features)} 个功能点 (model={self.provider.get_model_name()})")
            return features
            
        except Exception as e:
            logger.error(f"解析失败: {e}")
            return []
    
    async def analyze_risks(self, req_id: str, content: str) -> Dict:
        """风险分析"""
        max_len = settings.AI_MAX_CONTENT_LENGTH
        prompt = self.RISK_PROMPT.format(req_id=req_id, content=content[:max_len])
        result = await self.provider.analyze(prompt, self.SYSTEM_PROMPT)
        
        if result.success:
            try:
                json_match = re.search(r'\{[\s\S]*\}', result.content)
                if json_match:
                    return json.loads(json_match.group())
            except:
                pass
        
        return {"risks": [], "missing_info": [], "questions": []}
    
    async def generate_code_suggestions(self, requirement: str) -> Dict:
        """代码建议"""
        max_len = settings.AI_MAX_CONTENT_LENGTH
        prompt = self.CODE_PROMPT.format(requirement=requirement[:max_len])
        result = await self.provider.analyze(prompt, self.SYSTEM_PROMPT)
        
        if result.success:
            try:
                json_match = re.search(r'\{[\s\S]*\}', result.content)
                if json_match:
                    return json.loads(json_match.group())
            except:
                pass
        
        return {"suggested_classes": [], "suggested_interfaces": [], "key_algorithms": [], "test_cases": []}
    
    async def generate_insight(self, content: str) -> RequirementInsight:
        """需求洞察"""
        max_len = settings.AI_MAX_CONTENT_LENGTH
        prompt = self.INSIGHT_PROMPT.format(content=content[:max_len])
        result = await self.provider.analyze(prompt, self.SYSTEM_PROMPT)
        
        if result.success:
            try:
                json_match = re.search(r'\{[\s\S]*\}', result.content)
                if json_match:
                    data = json.loads(json_match.group())
                    return RequirementInsight(
                        summary=data.get("summary", ""),
                        key_entities=data.get("key_entities", []),
                        action_verbs=data.get("action_verbs", []),
                        quality_attributes=data.get("quality_attributes", []),
                        potential_risks=data.get("potential_risks", []),
                        missing_info=data.get("missing_info", []),
                        suggestions=data.get("suggestions", []),
                        test_scenarios=data.get("test_scenarios", []),
                    )
            except:
                pass
        
        return RequirementInsight()
    
    async def compute_semantic_similarity(self, text1: str, text2: str) -> float:
        """计算语义相似度"""
        vec1 = await self.provider.embed(text1)
        vec2 = await self.provider.embed(text2)
        
        dot = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot / (norm1 * norm2)
    
    async def align_feature_to_code(
        self, 
        feature: ExtractedFeature, 
        code_elements: List[Dict]
    ) -> List[SemanticAlignment]:
        """功能点与代码对齐"""
        alignments = []
        
        for elem in code_elements:
            elem_name = elem.get("name", "")
            elem_type = elem.get("type", "function")
            
            similarity = await self.compute_semantic_similarity(
                f"{feature.name}: {feature.description}",
                f"{elem_name}: {elem.get('docstring', elem.get('description', ''))}"
            )
            
            if similarity < 0.45:
                continue
            
            match_type = "EXACT" if similarity >= 0.85 else "PARTIAL" if similarity >= 0.65 else "SEMANTIC"
            
            alignments.append(SemanticAlignment(
                feature_id=feature.id,
                code_element=elem_name,
                element_type=elem_type,
                similarity_score=similarity,
                match_type=match_type,
                confidence=similarity,
                rationale=f"语义相似度: {similarity:.2f}",
            ))
        
        alignments.sort(key=lambda x: x.similarity_score, reverse=True)
        return alignments


# ============================================================
# 分析流水线
# ============================================================

class RequirementAnalysisPipeline:
    """需求分析流水线"""
    
    def __init__(self, provider: AIProvider = None):
        self.analyzer = RequirementAnalyzer(provider)
    
    async def analyze(
        self,
        requirement_id: str,
        requirement_content: str,
        format: str = "markdown",
        code_context: List[Dict] = None,
    ) -> Dict[str, Any]:
        """执行完整分析"""
        logger.info(f"分析需求: {requirement_id} (provider={self.analyzer.provider.get_model_name()})")
        
        report = {
            "requirement_id": requirement_id,
            "status": "processing",
            "model": self.analyzer.provider.get_model_name(),
            "features": [],
            "risks": [],
            "insights": {},
            "code_suggestions": {},
            "alignments": [],
            "summary": {},
        }
        
        try:
            # 1. 功能点提取
            features = await self.analyzer.extract_features(requirement_content)
            report["features"] = [f.to_dict() for f in features]
            
            # 2. 风险分析
            if features:
                risks = await self.analyzer.analyze_risks(requirement_id, features[0].description)
                report["risks"] = risks.get("risks", [])
                report["missing_info"] = risks.get("missing_info", [])
            
            # 3. 需求洞察
            insight = await self.analyzer.generate_insight(requirement_content)
            report["insights"] = {
                "summary": insight.summary,
                "key_entities": insight.key_entities,
                "potential_risks": insight.potential_risks,
                "suggestions": insight.suggestions,
                "test_scenarios": insight.test_scenarios,
            }
            
            # 4. 代码建议
            code_suggestions = await self.analyzer.generate_code_suggestions(requirement_content)
            report["code_suggestions"] = code_suggestions
            
            # 5. 功能点对齐
            if code_context and features:
                for feature in features[:settings.AI_BATCH_SIZE]:
                    alignments = await self.analyzer.align_feature_to_code(feature, code_context)
                    report["alignments"].extend([{
                        "feature_id": a.feature_id,
                        "code_element": a.code_element,
                        "similarity": round(a.similarity_score, 3),
                        "match_type": a.match_type,
                    } for a in alignments[:5]])
            
            # 6. 汇总
            report["summary"] = {
                "feature_count": len(features),
                "risk_count": len(report["risks"]),
                "alignment_count": len(report["alignments"]),
                "high_priority_count": sum(1 for f in features if f.priority == "P0"),
            }
            
            report["status"] = "completed"
            
        except Exception as e:
            logger.error(f"分析失败: {e}")
            report["status"] = "failed"
            report["error"] = str(e)
        
        return report


# ============================================================
# 便捷函数
# ============================================================

async def analyze_requirement(
    requirement_id: str,
    requirement_content: str,
    provider_type: str = None,
) -> Dict[str, Any]:
    """分析单个需求"""
    provider = create_provider(provider_type)
    pipeline = RequirementAnalysisPipeline(provider)
    return await pipeline.analyze(requirement_id, requirement_content)


async def batch_analyze_requirements(
    requirements: List[Dict[str, str]],
    provider_type: str = None,
) -> List[Dict[str, Any]]:
    """批量分析"""
    provider = create_provider(provider_type)
    pipeline = RequirementAnalysisPipeline(provider)
    tasks = [
        pipeline.analyze(req.get("id", ""), req.get("content", ""))
        for req in requirements
    ]
    return await asyncio.gather(*tasks)
