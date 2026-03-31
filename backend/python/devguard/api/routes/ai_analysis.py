"""
AI 需求分析 API 路由
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging
import os

from devguard.analysis.ai_analyzer import (
    RequirementAnalyzer,
    RequirementAnalysisPipeline,
    OpenAIProvider,
    MockAIProvider,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# 全局实例
_analyzer: Optional[RequirementAnalyzer] = None
_pipeline: Optional[RequirementAnalysisPipeline] = None


def get_analyzer() -> RequirementAnalyzer:
    global _analyzer
    if _analyzer is None:
        api_key = os.getenv("OPENAI_API_KEY", "")
        provider = OpenAIProvider(api_key=api_key) if api_key else MockAIProvider()
        _analyzer = RequirementAnalyzer(provider)
    return _analyzer


def get_pipeline() -> RequirementAnalysisPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = RequirementAnalysisPipeline()
    return _pipeline


# ============================================================
# 请求/响应模型
# ============================================================

class AnalyzeRequest(BaseModel):
    requirement_id: str
    content: str
    format: str = "markdown"
    code_context: Optional[List[Dict[str, Any]]] = None


class ExtractFeaturesRequest(BaseModel):
    content: str
    format: str = "markdown"


class AnalyzeRisksRequest(BaseModel):
    requirement_id: str
    content: str


class CodeSuggestionRequest(BaseModel):
    requirement: str
    language: str = "cpp"


class SimilarityRequest(BaseModel):
    text1: str
    text2: str


class BatchAnalyzeRequest(BaseModel):
    requirements: List[Dict[str, str]]


# ============================================================
# API 路由
# ============================================================

@router.post("/analyze")
async def analyze_requirement(req: AnalyzeRequest):
    """
    完整需求分析
    
    执行:
    1. 功能点提取
    2. 风险分析
    3. 需求洞察
    4. 代码建议
    5. 功能点对齐
    """
    logger.info(f"分析需求: {req.requirement_id}")
    
    try:
        pipeline = get_pipeline()
        result = await pipeline.analyze(
            requirement_id=req.requirement_id,
            requirement_content=req.content,
            format=req.format,
            code_context=req.code_context,
        )
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"分析失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-features")
async def extract_features(req: ExtractFeaturesRequest):
    """提取功能点"""
    try:
        analyzer = get_analyzer()
        features = await analyzer.extract_features(req.content)
        return {
            "status": "success",
            "feature_count": len(features),
            "features": [f.to_dict() for f in features],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-risks")
async def analyze_risks(req: AnalyzeRisksRequest):
    """风险分析"""
    try:
        analyzer = get_analyzer()
        result = await analyzer.analyze_risks(req.requirement_id, req.content)
        return {
            "status": "success",
            "requirement_id": req.requirement_id,
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/code-suggestions")
async def get_code_suggestions(req: CodeSuggestionRequest):
    """生成代码建议"""
    try:
        analyzer = get_analyzer()
        result = await analyzer.generate_code_suggestions(req.requirement)
        return {
            "status": "success",
            "language": req.language,
            "suggestions": result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/similarity")
async def compute_similarity(req: SimilarityRequest):
    """计算语义相似度"""
    try:
        analyzer = get_analyzer()
        similarity = await analyzer.compute_semantic_similarity(req.text1, req.text2)
        
        interpretation = (
            "高度相似" if similarity >= 0.85 else
            "部分相似" if similarity >= 0.65 else
            "语义相关" if similarity >= 0.45 else
            "无明显关联"
        )
        
        return {
            "status": "success",
            "similarity": round(similarity, 4),
            "interpretation": interpretation,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/insight")
async def generate_insight(req: ExtractFeaturesRequest):
    """生成需求洞察"""
    try:
        analyzer = get_analyzer()
        insight = await analyzer.generate_insight(req.content)
        return {
            "status": "success",
            "insight": {
                "summary": insight.summary,
                "key_entities": insight.key_entities,
                "action_verbs": insight.action_verbs,
                "quality_attributes": insight.quality_attributes,
                "potential_risks": insight.potential_risks,
                "missing_info": insight.missing_info,
                "suggestions": insight.suggestions,
                "test_scenarios": insight.test_scenarios,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch")
async def batch_analyze(req: BatchAnalyzeRequest, background_tasks: BackgroundTasks):
    """批量分析（后台执行）"""
    import uuid
    task_id = str(uuid.uuid4())
    
    async def run_batch():
        try:
            from devguard.analysis.ai_analyzer import batch_analyze_requirements
            await batch_analyze_requirements(req.requirements)
        except Exception as e:
            logger.error(f"批量分析失败: {e}")
    
    background_tasks.add_task(run_batch)
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "total": len(req.requirements),
    }


@router.get("/models")
async def list_models():
    """列出当前 AI 配置"""
    from devguard.config import settings
    
    return {
        "status": "success",
        "config": {
            "provider": settings.AI_PROVIDER,
            "model": settings.AI_MODEL,
            "base_url": settings.AI_BASE_URL,
            "api_key_configured": bool(settings.AI_API_KEY),
            "max_tokens": settings.AI_MAX_TOKENS,
            "temperature": settings.AI_TEMPERATURE,
        },
        "available_providers": [
            {"name": "openai", "description": "OpenAI API (gpt-4o, gpt-4-turbo)"},
            {"name": "azure", "description": "Azure OpenAI"},
            {"name": "local", "description": "本地模型 (Ollama, LocalAI)"},
            {"name": "mock", "description": "Mock 提供者（测试用）"},
        ],
    }
