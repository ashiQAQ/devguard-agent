"""
需求管理 API 路由
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime
import logging
import uuid

from devguard.database.session import get_db
from devguard.database.models import Requirement, RequirementDoc
from devguard.flows.flow_a import FlowA
from devguard.analysis.req_parser import ReqParser
from devguard.analysis.req_validator import (
    RequirementValidator,
    parse_symbolic_conditions,
)

logger = logging.getLogger(__name__)
router = APIRouter()
_validator = RequirementValidator()


# ============================================================
# 数据模型
# ============================================================

class RequirementInput(BaseModel):
    id: str
    title: str
    content: str = ""
    format: str = "markdown"
    priority: str = "P1"
    module: str = ""
    asil: str = ""
    description: str = ""
    req_type: str = "BUSINESS"
    phase: str = ""
    conditions: str = ""
    prev_req_id: Optional[str] = None


class RequirementResponse(BaseModel):
    status: str
    requirement_id: str
    features: List[dict]
    alignment_results: dict
    implementation_plan: dict
    code_skeleton: str
    doc_suggestions: List[dict]


# ─── 辅助函数 ─────────────────────────────────────────────────────────────────

def _req_to_dict(req: Requirement) -> dict:
    """SQLAlchemy 模型 → dict"""
    return {
        "id": req.id,
        "req_id": req.req_id,
        "doc_id": req.doc_id,
        "title": req.title,
        "description": req.description,
        "content": req.content,
        "req_type": req.req_type,
        "priority": req.priority,
        "module": req.module,
        "asil": req.asil,
        "symbolic_conditions": req.symbolic_conditions,
        "status": req.status,
        "source": req.source,
        "prev_req_id": req.prev_req_id,
        "next_req_id": req.next_req_id,
        "created_seq": req.created_seq,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
        "confirmed_at": req.confirmed_at.isoformat() if req.confirmed_at else None,
    }


def _generate_diff_from_db(current: dict, prev: Requirement) -> dict:
    """基于数据库真实数据生成差异"""
    diffs = []
    compare_fields = [
        ("title", "标题"),
        ("priority", "优先级"),
        ("module", "模块"),
        ("asil", "ASIL"),
        ("req_type", "类型"),
    ]

    for field, label in compare_fields:
        cur_val = str(current.get(field) or "")
        prev_val = str(getattr(prev, field, None) or "")
        if cur_val != prev_val:
            diffs.append({
                "field": field,
                "label": label,
                "from": prev_val or "（未设置）",
                "to": cur_val or "（未设置）",
                "direction": "changed",
            })

    cur_content = current.get("content", "") or ""
    prev_content = prev.content or ""
    if cur_content != prev_content:
        diffs.append({
            "field": "content",
            "label": "内容",
            "from": f"{len(prev_content)} 字" if prev_content else "（空）",
            "to": f"{len(cur_content)} 字" if cur_content else "（空）",
            "direction": "changed" if prev_content else "new",
        })

    return {
        "prev_req_id": prev.id,
        "prev_req": {
            "id": prev.id,
            "req_id": prev.req_id,
            "title": prev.title,
            "priority": prev.priority,
            "module": prev.module,
            "asil": prev.asil,
            "req_type": prev.req_type,
        },
        "diff_count": len(diffs),
        "diffs": diffs,
        "summary": f"与上一条需求 '{prev.req_id}' 对比，共 {len(diffs)} 处变化",
    }


# ============================================================
# 校验接口
# ============================================================

@router.post("/validate")
async def validate_requirement(req: RequirementInput, db: Session = Depends(get_db)):
    logger.info(f"校验需求: {req.id}")
    req_data = req.model_dump()
    report = _validator.validate(req_data)
    return report.to_dict()


@router.post("/parse-symbolic")
async def parse_symbolic_req(req: RequirementInput, db: Session = Depends(get_db)):
    logger.info(f"解析符号条件: {req.id} - {req.conditions}")
    try:
        conditions = parse_symbolic_conditions(req.conditions)
        results = [_validator.symbolic_parser.validate_condition(c).to_dict() for c in conditions]
        return {
            "status": "success",
            "requirement_id": req.id,
            "conditions": [c.to_dict() for c in conditions],
            "validation_results": results,
            "has_errors": any(r["level"] == "error" for r in results),
        }
    except Exception as e:
        logger.error(f"符号解析失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 创建 / 更新
# ============================================================

@router.post("/create")
async def create_requirement(req: RequirementInput, db: Session = Depends(get_db)):
    logger.info(f"创建需求: {req.id} - {req.title}")

    # 强校验
    req_data = req.model_dump()
    report = _validator.validate(req_data)
    if not report.is_valid:
        errors = [r.to_dict() for r in report.results if r.level.value == "error"]
        raise HTTPException(status_code=422, detail={
            "status": "validation_failed", "requirement_id": req.id,
            "errors": errors, "summary": report.summary,
        })

    # ── 自动找上一条，构造需求链 ──────────────────────────────────────────────
    prev_req_id = req.prev_req_id
    diff_result = None

    # 如果没有指定 prev_req_id，自动找 created_seq 最大的那条
    if not prev_req_id:
        last_req = db.query(Requirement).order_by(desc(Requirement.created_seq)).first()
        if last_req:
            prev_req_id = last_req.id

    # 生成 created_seq = max + 1
    max_seq = db.query(func.max(Requirement.created_seq)).scalar() or 0
    new_seq = max_seq + 1

    # 构造需求对象
    new_req = Requirement(
        id=str(uuid.uuid4()),
        req_id=req.id,
        title=req.title,
        description=req.description,
        content=req.content,
        format=req.format,
        req_type=req.req_type,
        priority=req.priority,
        module=req.module,
        asil=req.asil,
        symbolic_conditions={"raw": req.conditions} if req.conditions else None,
        status="pending",
        source="manual",
        prev_req_id=prev_req_id,
        created_seq=new_seq,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(new_req)

    # 回填上一条的 next_req_id
    if prev_req_id:
        prev = db.query(Requirement).filter(Requirement.id == prev_req_id).first()
        if prev:
            prev.next_req_id = new_req.id
            # 生成差异对比（基于真实数据库数据）
            diff_result = _generate_diff_from_db(req_data, prev)

    db.commit()
    db.refresh(new_req)

    return {
        "status": "success",
        "data": _req_to_dict(new_req),
        "validation_report": report.summary,
        "diff": diff_result,
    }


@router.put("/{requirement_id}")
async def update_requirement(requirement_id: str, req: RequirementInput, db: Session = Depends(get_db)):
    logger.info(f"更新需求: {requirement_id}")
    req_data = req.model_dump()
    report = _validator.validate(req_data)
    if not report.is_valid:
        errors = [r.to_dict() for r in report.results if r.level.value == "error"]
        raise HTTPException(status_code=422, detail={
            "status": "validation_failed", "requirement_id": requirement_id,
            "errors": errors, "summary": report.summary,
        })

    req_obj = db.query(Requirement).filter(Requirement.id == requirement_id).first()
    if not req_obj:
        raise HTTPException(status_code=404, detail=f"需求 {requirement_id} 不存在")

    for field in ["title", "description", "content", "req_type", "priority",
                  "module", "asil", "symbolic_conditions"]:
        if field in req_data:
            setattr(req_obj, field, req_data[field])
    req_obj.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(req_obj)
    return {"status": "success", "data": _req_to_dict(req_obj), "validation_report": report.summary}


# ============================================================
# 列表 / 详情 / 删除 / 状态
# ============================================================

@router.get("/list")
async def list_requirements(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status: str = Query(None),
    priority: str = Query(None),
    module: str = Query(None),
    db: Session = Depends(get_db),
):
    """列出需求列表（按创建时间倒序），最新一条标记 is_newest"""
    q = db.query(Requirement)
    if status:
        q = q.filter(Requirement.status == status)
    if priority:
        q = q.filter(Requirement.priority == priority)
    if module:
        q = q.filter(Requirement.module == module)

    total = q.count()
    reqs = q.order_by(desc(Requirement.created_at)).offset(skip).limit(limit).all()

    # 找最新的
    latest = db.query(Requirement).order_by(desc(Requirement.created_seq)).first()

    result = []
    for r in reqs:
        d = _req_to_dict(r)
        d["is_newest"] = (latest is not None) and (r.id == latest.id)
        result.append(d)

    return {"status": "success", "total": total, "requirements": result, "latest_id": latest.id if latest else None}


@router.post("/diff")
async def diff_requirements(body: Dict[str, Any], db: Session = Depends(get_db)):
    """对比两个需求条目"""
    req_id = body.get("req_id")
    prev_req_id = body.get("prev_req_id")
    if not req_id or not prev_req_id:
        raise HTTPException(status_code=400, detail="req_id 和 prev_req_id 必填")

    curr = db.query(Requirement).filter(Requirement.id == req_id).first()
    prev = db.query(Requirement).filter(Requirement.id == prev_req_id).first()
    if not prev:
        raise HTTPException(status_code=404, detail=f"上一条需求 {prev_req_id} 不存在")

    if curr:
        return {"status": "success", "diff": _generate_diff_from_db(_req_to_dict(curr), prev)}
    return {"status": "success", "diff": _generate_diff_from_db({"id": req_id}, prev)}


@router.get("/{requirement_id}")
async def get_requirement(requirement_id: str, db: Session = Depends(get_db)):
    req = db.query(Requirement).filter(Requirement.id == requirement_id).first()
    if not req:
        # 尝试按 req_id 查找
        req = db.query(Requirement).filter(Requirement.req_id == requirement_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"需求 {requirement_id} 不存在")

    d = _req_to_dict(req)
    # 查上一条做对比
    if req.prev_req_id:
        prev = db.query(Requirement).filter(Requirement.id == req.prev_req_id).first()
        if prev:
            d["diff"] = _generate_diff_from_db(d, prev)
    return {"status": "success", "requirement": d}


@router.delete("/{requirement_id}")
async def delete_requirement(requirement_id: str, db: Session = Depends(get_db)):
    logger.info(f"删除需求: {requirement_id}")
    req = db.query(Requirement).filter(Requirement.id == requirement_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"需求 {requirement_id} 不存在")

    # 修复前后链
    if req.prev_req_id:
        prev = db.query(Requirement).filter(Requirement.id == req.prev_req_id).first()
        if prev:
            prev.next_req_id = req.next_req_id
    if req.next_req_id:
        next_req = db.query(Requirement).filter(Requirement.id == req.next_req_id).first()
        if next_req:
            next_req.prev_req_id = req.prev_req_id

    db.delete(req)
    db.commit()
    return {"status": "success", "message": f"需求 {requirement_id} 已删除"}


@router.post("/{requirement_id}/confirm")
async def confirm_requirement(requirement_id: str, db: Session = Depends(get_db)):
    req = db.query(Requirement).filter(Requirement.id == requirement_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"需求 {requirement_id} 不存在")
    req.status = "confirmed"
    req.confirmed_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": f"需求 {requirement_id} 已确认"}


@router.post("/{requirement_id}/reject")
async def reject_requirement(requirement_id: str, reason: str = "", db: Session = Depends(get_db)):
    req = db.query(Requirement).filter(Requirement.id == requirement_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"需求 {requirement_id} 不存在")
    req.status = "rejected"
    db.commit()
    return {"status": "success", "message": f"需求 {requirement_id} 已驳回"}


# ============================================================
# 分析接口（保持 Flow A 逻辑不变）
# ============================================================

@router.post("/analyze", response_model=RequirementResponse)
async def analyze_requirement(req: RequirementInput, db: Session = Depends(get_db)):
    logger.info(f"分析需求: {req.id} - {req.title}")
    try:
        flow_a = FlowA()
        result = await flow_a.execute(req.id, req.content, req.format)
        if result["status"] != "success":
            raise HTTPException(status_code=400, detail=result.get("error", "分析失败"))
        return RequirementResponse(
            status="success", requirement_id=req.id,
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
async def parse_requirement(req: RequirementInput, db: Session = Depends(get_db)):
    logger.info(f"解析需求: {req.id}")
    try:
        parser = ReqParser()
        features = parser.parse(req.content, req.format)
        return {
            "status": "success", "requirement_id": req.id,
            "features": [
                {
                    "id": f.id, "name": f.name, "description": f.description,
                    "type": f.type, "phase": f.phase, "keywords": f.keywords,
                    "priority": f.priority, "specified": f.specified,
                    "constraint": f.constraint, "acceptance": f.acceptance,
                } for f in features
            ],
        }
    except Exception as e:
        logger.error(f"需求解析失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
