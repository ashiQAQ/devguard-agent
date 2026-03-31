"""
需求管理 API 路由
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
import json

from devguard.flows.flow_a import FlowA
from devguard.analysis.req_parser import ReqParser
from devguard.analysis.req_validator import (
    RequirementValidator,
    parse_symbolic_conditions,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# 全局校验器实例
_validator = RequirementValidator()


# ============================================================
# 数据模型
# ============================================================

class RequirementInput(BaseModel):
    """需求输入"""
    id: str
    title: str
    content: str = ""
    format: str = "markdown"  # markdown / json / yaml
    priority: str = "P1"
    module: str = ""
    asil: str = ""
    description: str = ""
    req_type: str = "BUSINESS"  # BUSINESS / TECHNICAL / SYMBOLIC
    phase: str = ""             # PRE_COMPILE / COMPILE_TIME / CODE_LOGIC / SIGNAL_ALIGN / RUNTIME_PERF
    conditions: str = ""        # 符号条件文本


class SymbolicRequirementInput(BaseModel):
    """符号需求输入（如 carSpeed=1, geer=D）"""
    id: str
    title: str
    conditions: str  # 符号条件文本，逗号/分号分隔
    description: str = ""
    priority: str = "P1"
    module: str = ""


class RequirementResponse(BaseModel):
    """需求分析响应"""
    status: str
    requirement_id: str
    features: List[dict]
    alignment_results: dict
    implementation_plan: dict
    code_skeleton: str
    doc_suggestions: List[dict]


# ============================================================
# 校验接口
# ============================================================

@router.post("/validate")
async def validate_requirement(req: RequirementInput):
    """
    需求强校验接口
    
    校验内容:
    1. 必需字段检查
    2. 字段格式校验（ID格式、ASIL等级、优先级、时段）
    3. 语义校验（标题长度、内容长度、ASIL-优先级匹配）
    4. 符号条件校验（变量注册、类型、范围、单位、枚举值）
    5. 交叉字段校验（业务需求-ASIL、技术需求-时段）
    """
    logger.info(f"校验需求: {req.id}")
    
    try:
        req_data = req.model_dump()
        report = _validator.validate(req_data)
        return report.to_dict()
    except Exception as e:
        logger.error(f"需求校验失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/parse-symbolic")
async def parse_symbolic_req(req: SymbolicRequirementInput):
    """
    解析符号条件
    
    支持格式:
    - carSpeed=100km/h
    - geer=D
    - throttle>=50%
    - carSpeed=1, geer=D
    - carSpeed=100km/h; geer=D; throttle=50%
    """
    logger.info(f"解析符号条件: {req.id} - {req.conditions}")
    
    try:
        conditions = parse_symbolic_conditions(req.conditions)
        
        # 对每个条件做校验
        results = []
        for cond in conditions:
            result = _validator.symbolic_parser.validate_condition(cond)
            results.append(result.to_dict())
        
        has_errors = any(r["level"] == "error" for r in results)
        
        return {
            "status": "success",
            "requirement_id": req.id,
            "conditions": [c.to_dict() for c in conditions],
            "validation_results": results,
            "has_errors": has_errors,
        }
    except Exception as e:
        logger.error(f"符号解析失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 创建 / 更新（带强校验）
# ============================================================

@router.post("/create")
async def create_requirement(req: RequirementInput):
    """
    创建需求（带强校验）
    
    流程: 校验 → 阻断(422) / 通过 → 存储
    """
    logger.info(f"创建需求: {req.id} - {req.title}")
    
    # 强校验
    req_data = req.model_dump()
    report = _validator.validate(req_data)
    
    if not report.is_valid:
        errors = [r.to_dict() for r in report.results if r.level.value == "error"]
        raise HTTPException(
            status_code=422,
            detail={
                "status": "validation_failed",
                "requirement_id": req.id,
                "errors": errors,
                "summary": report.summary,
            }
        )
    
    # 校验通过，存储（模拟）
    # TODO: 写入数据库
    
    result = {
        **req_data,
        "status": "pending",
        "id": req.id,
        "created_at": "2026-03-30T18:00:00Z",
        "updated_at": "2026-03-30T18:00:00Z",
    }
    
    return {
        "status": "success",
        "data": result,
        "validation_report": report.summary,
    }


@router.put("/{requirement_id}")
async def update_requirement(requirement_id: str, req: RequirementInput):
    """
    更新需求（带强校验）
    
    流程: 校验 → 阻断(422) / 通过 → 更新
    """
    logger.info(f"更新需求: {requirement_id}")
    
    # 强校验
    req_data = req.model_dump()
    req_data["id"] = requirement_id
    report = _validator.validate(req_data)
    
    if not report.is_valid:
        errors = [r.to_dict() for r in report.results if r.level.value == "error"]
        raise HTTPException(
            status_code=422,
            detail={
                "status": "validation_failed",
                "requirement_id": requirement_id,
                "errors": errors,
                "summary": report.summary,
            }
        )
    
    # 校验通过，更新（模拟）
    # TODO: 更新数据库
    # TODO: 触发需求变更涟漪效应
    
    result = {
        **req_data,
        "id": requirement_id,
        "updated_at": "2026-03-30T18:00:00Z",
    }
    
    return {
        "status": "success",
        "data": result,
        "validation_report": report.summary,
        "message": f"需求 {requirement_id} 已更新",
    }


# ============================================================
# 分析接口
# ============================================================

@router.post("/analyze", response_model=RequirementResponse)
async def analyze_requirement(req: RequirementInput):
    """
    分析需求文档 (Flow A)
    """
    logger.info(f"分析需求: {req.id} - {req.title}")
    
    try:
        flow_a = FlowA()
        result = await flow_a.execute(req.id, req.content, req.format)
        
        if result["status"] != "success":
            raise HTTPException(status_code=400, detail=result.get("error", "分析失败"))
        
        return RequirementResponse(
            status="success",
            requirement_id=req.id,
            features=result["features"],
            alignment_results=result["alignment_results"],
            implementation_plan=result["implementation_plan"],
            code_skeleton=result["code_skeleton"],
            doc_suggestions=result["doc_suggestions"],
        )
    
    except Exception as e:
        logger.error(f"需求分析失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/parse")
async def parse_requirement(req: RequirementInput):
    """
    仅解析需求文档，不进行完整分析
    """
    logger.info(f"解析需求: {req.id}")
    
    try:
        parser = ReqParser()
        features = parser.parse(req.content, req.format)
        
        return {
            "status": "success",
            "requirement_id": req.id,
            "features": [
                {
                    "id": f.id,
                    "name": f.name,
                    "description": f.description,
                    "type": f.type,
                    "phase": f.phase,
                    "keywords": f.keywords,
                    "priority": f.priority,
                    "specified": f.specified,
                    "constraint": f.constraint,
                    "acceptance": f.acceptance,
                }
                for f in features
            ],
        }
    
    except Exception as e:
        logger.error(f"需求解析失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 列表 / 详情 / 删除 / 状态
# ============================================================

@router.get("/list")
async def list_requirements(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
):
    """列出需求列表"""
    # TODO: 从数据库查询
    return {
        "status": "success",
        "total": 0,
        "requirements": [],
    }


@router.get("/{requirement_id}")
async def get_requirement(requirement_id: str):
    """获取需求详情"""
    # TODO: 从数据库查询
    return {
        "status": "success",
        "requirement": {
            "id": requirement_id,
            "title": "",
            "content": "",
            "status": "pending",
        },
    }


@router.delete("/{requirement_id}")
async def delete_requirement(requirement_id: str):
    """删除需求"""
    logger.info(f"删除需求: {requirement_id}")
    # TODO: 删除数据库记录
    return {
        "status": "success",
        "message": f"需求 {requirement_id} 已删除",
    }


@router.get("/{requirement_id}/status")
async def get_requirement_status(requirement_id: str):
    """获取需求实施状态"""
    # TODO: 从数据库查询
    return {
        "status": "success",
        "requirement_id": requirement_id,
        "implementation_status": "in_progress",
        "completion_rate": 0.65,
        "phases": [
            {"phase": 0, "name": "需求确认", "status": "completed"},
            {"phase": 1, "name": "设计评审", "status": "completed"},
            {"phase": 2, "name": "代码实现", "status": "in_progress"},
            {"phase": 3, "name": "测试验证", "status": "pending"},
        ],
    }


@router.post("/{requirement_id}/confirm")
async def confirm_requirement(requirement_id: str):
    """确认需求（需求负责人）"""
    logger.info(f"确认需求: {requirement_id}")
    # TODO: 更新数据库状态 + 发送通知
    return {
        "status": "success",
        "message": f"需求 {requirement_id} 已确认",
    }


@router.post("/{requirement_id}/reject")
async def reject_requirement(requirement_id: str, reason: str = ""):
    """驳回需求（需求负责人）"""
    logger.info(f"驳回需求: {requirement_id}, 原因: {reason}")
    # TODO: 更新数据库状态 + 发送通知
    return {
        "status": "success",
        "message": f"需求 {requirement_id} 已驳回",
    }
