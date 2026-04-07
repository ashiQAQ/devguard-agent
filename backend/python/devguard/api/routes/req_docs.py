"""
需求文档 API 路由 - 数据库版本
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging
import uuid
import os

from sqlalchemy.orm import Session
from devguard.database import get_db, init_db
from devguard.database.models import RequirementDoc, Requirement, Feature
from devguard.analysis.ai_analyzer import RequirementAnalyzer

logger = logging.getLogger(__name__)
router = APIRouter()

# 初始化数据库
init_db()


# ============================================================
# 请求模型
# ============================================================

class CreateDocRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    content: str = ""
    format: str = "markdown"
    doc_type: str = "PRD"
    project: Optional[str] = ""
    module: Optional[str] = ""
    author: Optional[str] = ""
    status: str = "draft"


class UpdateDocRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None


class CreateRequirementRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    req_type: str = "BR"
    priority: str = "P1"
    module: Optional[str] = ""
    asil: Optional[str] = ""
    doc_id: Optional[str] = None


class UpdateRequirementRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    req_type: Optional[str] = None
    priority: Optional[str] = None
    module: Optional[str] = None
    asil: Optional[str] = None
    status: Optional[str] = None


# ============================================================
# 辅助函数
# ============================================================

def generate_doc_id(db: Session) -> str:
    year = datetime.now().year
    prefix = f"DOC-{year}-"
    result = db.query(RequirementDoc.doc_id).filter(
        RequirementDoc.doc_id.like(f"{prefix}%")
    ).order_by(RequirementDoc.doc_id.desc()).first()
    if result:
        try:
            last_seq = int(result[0].split("-")[-1])
            return f"DOC-{year}-{last_seq + 1:03d}"
        except: pass
    return f"DOC-{year}-001"


def generate_req_id(db: Session, req_type: str = "BR") -> str:
    year = datetime.now().year
    prefix = f"{req_type}-{year}-"
    result = db.query(Requirement.req_id).filter(
        Requirement.req_id.like(f"{prefix}%")
    ).order_by(Requirement.req_id.desc()).first()
    if result:
        try:
            last_seq = int(result[0].split("-")[-1])
            return f"{req_type}-{year}-{last_seq + 1:03d}"
        except: pass
    return f"{req_type}-{year}-001"


def doc_to_dict(doc: RequirementDoc) -> Dict:
    return {
        "id": doc.id, "doc_id": doc.doc_id, "title": doc.title,
        "description": doc.description, "content": doc.content,
        "format": doc.format, "version": doc.version,
        "version_major": doc.version_major, "version_minor": doc.version_minor,
        "version_note": doc.version_note, "parent_doc_id": doc.parent_doc_id,
        "doc_type": doc.doc_type, "project": doc.project, "module": doc.module,
        "status": doc.status, "req_count": doc.req_count, "feature_count": doc.feature_count,
        "author": doc.author, "reviewer": doc.reviewer, "approved_by": doc.approved_by,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }


def req_to_dict(req: Requirement) -> Dict:
    return {
        "id": req.id, "req_id": req.req_id, "doc_id": req.doc_id,
        "seq_no": req.seq_no, "title": req.title, "description": req.description,
        "content": req.content, "req_type": req.req_type, "priority": req.priority,
        "module": req.module, "asil": req.asil, "status": req.status, "source": req.source,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
    }


# ============================================================
# 文档 CRUD
# ============================================================

@router.post("/docs")
def create_doc(req: CreateDocRequest, db: Session = Depends(get_db)):
    doc_id = generate_doc_id(db)
    now = datetime.utcnow()
    doc = RequirementDoc(
        id=str(uuid.uuid4()), doc_id=doc_id, title=req.title,
        description=req.description or "", content=req.content or "",
        format=req.format, doc_type=req.doc_type, project=req.project or "",
        module=req.module or "", status=req.status, author=req.author or "",
        req_count=0, feature_count=0, created_at=now, updated_at=now,
    )
    db.add(doc); db.commit(); db.refresh(doc)
    logger.info(f"创建文档: {doc_id}")
    return {"status": "success", "doc": doc_to_dict(doc)}


@router.get("/docs")
def list_docs(
    status: Optional[str] = None, doc_type: Optional[str] = None,
    page: int = 1, page_size: int = 20, db: Session = Depends(get_db)
):
    query = db.query(RequirementDoc)
    if status: query = query.filter(RequirementDoc.status == status)
    if doc_type: query = query.filter(RequirementDoc.doc_type == doc_type)
    query = query.order_by(RequirementDoc.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "docs": [doc_to_dict(d) for d in items]}


@router.get("/docs/{doc_id}")
def get_doc(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(RequirementDoc).filter(RequirementDoc.doc_id == doc_id).first()
    if not doc: raise HTTPException(404, "文档不存在")
    reqs = db.query(Requirement).filter(Requirement.doc_id == doc.id).order_by(Requirement.seq_no).all()
    return {"doc": doc_to_dict(doc), "requirements": [req_to_dict(r) for r in reqs], "req_count": len(reqs)}


@router.put("/docs/{doc_id}")
def update_doc(doc_id: str, req: UpdateDocRequest, db: Session = Depends(get_db)):
    doc = db.query(RequirementDoc).filter(RequirementDoc.doc_id == doc_id).first()
    if not doc: raise HTTPException(404, "文档不存在")
    if req.title is not None: doc.title = req.title
    if req.description is not None: doc.description = req.description
    if req.content is not None: doc.content = req.content
    if req.status is not None: doc.status = req.status
    doc.updated_at = datetime.utcnow()
    db.commit(); db.refresh(doc)
    return {"status": "success", "doc": doc_to_dict(doc)}


@router.delete("/docs/{doc_id}")
def delete_doc(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(RequirementDoc).filter(RequirementDoc.doc_id == doc_id).first()
    if not doc: raise HTTPException(404, "文档不存在")
    db.delete(doc); db.commit()
    return {"status": "success", "message": f"文档 {doc_id} 已删除"}


@router.post("/docs/{doc_id}/save-markdown")
def save_doc_markdown(doc_id: str, body: Dict, db: Session = Depends(get_db)):
    doc = db.query(RequirementDoc).filter(RequirementDoc.doc_id == doc_id).first()
    if not doc: raise HTTPException(404, "文档不存在")
    doc.content = body.get("content", "")
    doc.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "文档已保存"}


# ============================================================
# 需求条目
# ============================================================

@router.post("/requirements")
def create_requirement(req: CreateRequirementRequest, db: Session = Depends(get_db)):
    req_id = generate_req_id(db, req.req_type[:2].upper())
    now = datetime.utcnow()
    requirement = Requirement(
        id=str(uuid.uuid4()), req_id=req_id, doc_id=req.doc_id, seq_no=0,
        title=req.title, description=req.description or "", content=req.description or "",
        req_type=req.req_type, priority=req.priority, module=req.module or "",
        asil=req.asil or "", status="pending", source="manual",
        created_at=now, updated_at=now,
    )
    db.add(requirement); db.commit(); db.refresh(requirement)
    return {"status": "success", "requirement": req_to_dict(requirement)}


@router.get("/requirements")
def list_requirements(
    doc_id: Optional[str] = None, req_type: Optional[str] = None,
    priority: Optional[str] = None, status: Optional[str] = None,
    page: int = 1, page_size: int = 20, db: Session = Depends(get_db)
):
    query = db.query(Requirement)
    if doc_id: query = query.filter(Requirement.doc_id == doc_id)
    if req_type: query = query.filter(Requirement.req_type == req_type)
    if priority: query = query.filter(Requirement.priority == priority)
    if status: query = query.filter(Requirement.status == status)
    query = query.order_by(Requirement.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "requirements": [req_to_dict(r) for r in items]}


@router.get("/requirements/{req_id}")
def get_requirement(req_id: str, db: Session = Depends(get_db)):
    req = db.query(Requirement).filter(Requirement.req_id == req_id).first()
    if not req: raise HTTPException(404, "需求不存在")
    return {"requirement": req_to_dict(req)}


@router.put("/requirements/{req_id}")
def update_requirement(req_id: str, data: UpdateRequirementRequest, db: Session = Depends(get_db)):
    req = db.query(Requirement).filter(Requirement.req_id == req_id).first()
    if not req: raise HTTPException(404, "需求不存在")
    if data.title is not None: req.title = data.title
    if data.description is not None: req.description = data.description
    if data.req_type is not None: req.req_type = data.req_type
    if data.priority is not None: req.priority = data.priority
    if data.module is not None: req.module = data.module
    if data.asil is not None: req.asil = data.asil
    if data.status is not None: req.status = data.status
    req.updated_at = datetime.utcnow()
    db.commit(); db.refresh(req)
    return {"status": "success", "requirement": req_to_dict(req)}


@router.delete("/requirements/{req_id}")
def delete_requirement(req_id: str, db: Session = Depends(get_db)):
    req = db.query(Requirement).filter(Requirement.req_id == req_id).first()
    if not req: raise HTTPException(404, "需求不存在")
    db.delete(req); db.commit()
    return {"status": "success", "message": f"需求 {req_id} 已删除"}


# ============================================================
# AI 分析
# ============================================================

@router.post("/docs/{doc_id}/extract")
async def extract_requirements(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(RequirementDoc).filter(RequirementDoc.doc_id == doc_id).first()
    if not doc: raise HTTPException(404, "文档不存在")
    try:
        analyzer = RequirementAnalyzer()
        features = await analyzer.extract_features(doc.content)
        extracted = []
        for i, f in enumerate(features):
            req_id = generate_req_id(db, f.type[:2].upper() if f.type else "BR")
            req = Requirement(
                id=str(uuid.uuid4()), req_id=req_id, doc_id=doc.id, seq_no=i+1,
                title=f.name or f"需求 {i+1}", description=f.description or "",
                content=f.description or "", req_type=f.type or "BUSINESS",
                priority=f.priority or "P1", status="pending", source="ai_extracted",
                created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
            )
            db.add(req); extracted.append(req)
        doc.req_count = len(extracted); doc.last_parsed_at = datetime.utcnow()
        db.commit()
        return {"status": "success", "doc_id": doc_id, "extracted_count": len(extracted),
                "requirements": [req_to_dict(r) for r in extracted]}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/docs/{doc_id}/ai-summary")
async def get_ai_summary(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(RequirementDoc).filter(RequirementDoc.doc_id == doc_id).first()
    if not doc: raise HTTPException(404, "文档不存在")
    try:
        analyzer = RequirementAnalyzer()
        insight = await analyzer.generate_insight(doc.content)
        return {"doc_id": doc_id, "summary": insight.summary, "key_entities": insight.key_entities,
                "action_verbs": insight.action_verbs, "quality_attributes": insight.quality_attributes,
                "potential_risks": insight.potential_risks, "missing_info": insight.missing_info,
                "suggestions": insight.suggestions}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/requirements/{req_id}/extract-features")
async def extract_features(req_id: str, db: Session = Depends(get_db)):
    req = db.query(Requirement).filter(Requirement.req_id == req_id).first()
    if not req: raise HTTPException(404, "需求不存在")
    try:
        analyzer = RequirementAnalyzer()
        features = await analyzer.extract_features(req.content or req.title)
        extracted = []
        for f in features:
            feat = Feature(
                id=str(uuid.uuid4()), requirement_id=req.id,
                feature_id=f.id or f"FEAT-{req_id}-{len(extracted)+1}",
                name=f.name, description=f.description, feature_type=f.type,
                priority=f.priority, keywords=f.keywords, asil_implication=f.asil_implication,
                estimated_complexity=f.estimated_complexity, created_at=datetime.utcnow(),
            )
            db.add(feat); extracted.append(feat)
        db.commit()
        return {"req_id": req_id, "feature_count": len(extracted),
                "features": [{"feature_id": f.feature_id, "name": f.name, "description": f.description} for f in extracted]}
    except Exception as e:
        raise HTTPException(500, str(e))


# ============================================================
# 导出
# ============================================================

@router.get("/docs/{doc_id}/export")
def export_doc(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(RequirementDoc).filter(RequirementDoc.doc_id == doc_id).first()
    if not doc: raise HTTPException(404, "文档不存在")
    reqs = db.query(Requirement).filter(Requirement.doc_id == doc.id).order_by(Requirement.seq_no).all()
    lines = [f"# {doc.title}", "", f"**文档ID:** {doc.doc_id}", f"**版本:** {doc.version}",
             f"**状态:** {doc.status}", "", "## 概述", "", doc.description or "", "", f"## 需求条目 ({len(reqs)} 项)", ""]
    for r in reqs:
        lines.extend([f"### {r.req_id}: {r.title}", "",
                     f"**类型:** {r.req_type} | **优先级:** {r.priority} | **状态:** {r.status}",
                     "", r.description or "", ""])
    return {"markdown": "\n".join(lines), "doc": doc_to_dict(doc), "req_count": len(reqs)}


@router.post("/docs/batch-link")
def batch_link(doc_id: str, req_ids: List[str], db: Session = Depends(get_db)):
    doc = db.query(RequirementDoc).filter(RequirementDoc.doc_id == doc_id).first()
    if not doc: raise HTTPException(404, "文档不存在")
    linked = []
    for req_id in req_ids:
        req = db.query(Requirement).filter(Requirement.req_id == req_id).first()
        if req: req.doc_id = doc.id; linked.append(req_id)
    doc.req_count = db.query(Requirement).filter(Requirement.doc_id == doc.id).count()
    db.commit()
    return {"status": "success", "linked_count": len(linked), "linked": linked}
