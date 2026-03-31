"""
需求文档 API 路由
核心：一篇需求文档 → 包含多个需求条目 → 每个条目可提取功能点
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging
import uuid

from devguard.analysis.ai_analyzer import RequirementAnalyzer, ExtractedFeature

logger = logging.getLogger(__name__)
router = APIRouter()

# ============================================================
# 内存存储（后续替换为数据库）
# ============================================================

_docs: Dict[str, Dict] = {}
_reqs: Dict[str, Dict] = {}
_seq_counters: Dict[str, int] = {}


# ============================================================
# 请求/响应模型
# ============================================================

class CreateDocRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    content: str
    format: str = "markdown"
    doc_type: str = "PRD"
    project: Optional[str] = ""
    module: Optional[str] = ""
    author: Optional[str] = ""


class UpdateDocRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None


class ExtractReqsRequest(BaseModel):
    """从文档中提取需求条目"""
    pass  # 使用文档现有内容


class CreateRequirementRequest(BaseModel):
    """创建独立需求条目（不绑定文档）"""
    title: str
    description: Optional[str] = ""
    req_type: str = "BUSINESS"
    priority: str = "P1"
    module: Optional[str] = ""
    asil: Optional[str] = ""
    symbolic_conditions: Optional[List[Dict]] = []


class LinkReqToDocRequest(BaseModel):
    """将现有需求条目关联到文档"""
    req_id: str


# ============================================================
# 辅助函数
# ============================================================

def generate_doc_id() -> str:
    year = datetime.now().year
    seq = _seq_counters.get(f"doc-{year}", 0) + 1
    _seq_counters[f"doc-{year}"] = seq
    return f"DOC-{year}-{seq:03d}"


def generate_req_id(req_type: str = "BR") -> str:
    year = datetime.now().year
    seq = _seq_counters.get(f"req-{req_type}-{year}", 0) + 1
    _seq_counters[f"req-{req_type}-{year}"] = seq
    return f"{req_type}-{year}-{seq:03d}"


# ============================================================
# 文档 CRUD
# ============================================================

@router.post("/docs")
async def create_doc(req: CreateDocRequest):
    """创建需求文档"""
    doc_id = generate_doc_id()
    now = datetime.utcnow().isoformat()
    
    doc = {
        "id": str(uuid.uuid4()),
        "doc_id": doc_id,
        "title": req.title,
        "description": req.description,
        "content": req.content,
        "format": req.format,
        "doc_type": req.doc_type,
        "project": req.project,
        "module": req.module,
        "status": "draft",
        "req_count": 0,
        "feature_count": 0,
        "author": req.author,
        "created_at": now,
        "updated_at": now,
    }
    
    _docs[doc_id] = doc
    logger.info(f"创建需求文档: {doc_id}")
    
    return {"status": "success", "doc": doc}


@router.get("/docs")
async def list_docs(
    status: Optional[str] = None,
    doc_type: Optional[str] = None,
    project: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """列出需求文档"""
    docs = list(_docs.values())
    
    # 过滤
    if status:
        docs = [d for d in docs if d.get("status") == status]
    if doc_type:
        docs = [d for d in docs if d.get("doc_type") == doc_type]
    if project:
        docs = [d for d in docs if d.get("project") == project]
    
    # 排序（最新优先）
    docs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    # 分页
    total = len(docs)
    start = (page - 1) * page_size
    end = start + page_size
    items = docs[start:end]
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "docs": items,
    }


@router.get("/docs/{doc_id}")
async def get_doc(doc_id: str):
    """获取需求文档"""
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 关联的需求条目
    reqs = [r for r in _reqs.values() if r.get("doc_id") == doc["id"]]
    
    return {
        "doc": doc,
        "requirements": reqs,
        "req_count": len(reqs),
    }


@router.put("/docs/{doc_id}")
async def update_doc(doc_id: str, req: UpdateDocRequest):
    """更新需求文档"""
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    if req.title is not None:
        doc["title"] = req.title
    if req.description is not None:
        doc["description"] = req.description
    if req.content is not None:
        doc["content"] = req.content
    if req.status is not None:
        doc["status"] = req.status
    
    doc["updated_at"] = datetime.utcnow().isoformat()
    
    return {"status": "success", "doc": doc}


@router.delete("/docs/{doc_id}")
async def delete_doc(doc_id: str):
    """删除需求文档（同时删除关联的需求条目）"""
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 删除关联的需求
    doc_reqs = [r for r in _reqs.values() if r.get("doc_id") == doc["id"]]
    for r in doc_reqs:
        _reqs.pop(r["req_id"], None)
    
    _docs.pop(doc_id)
    
    return {"status": "success", "message": f"文档 {doc_id} 已删除"}


# ============================================================
# AI 提取需求条目
# ============================================================

@router.post("/docs/{doc_id}/extract")
async def extract_requirements_from_doc(doc_id: str):
    """
    AI 从文档中提取需求条目
    
    流程：
    1. 调用 AI 分析文档内容
    2. 将提取的需求条目存入数据库
    3. 建立与文档的关联
    """
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    try:
        analyzer = RequirementAnalyzer()
        features = await analyzer.extract_features(doc["content"])
        
        extracted_reqs = []
        for i, f in enumerate(features):
            req_id = generate_req_id(f.type[:2].upper() if f.type else "BR")
            req = {
                "id": str(uuid.uuid4()),
                "req_id": req_id,
                "doc_id": doc["id"],
                "seq_no": i + 1,
                "title": f.name,
                "description": f.description,
                "content": f.description,
                "req_type": f.type,
                "priority": f.priority,
                "module": ",".join(f.related_modules) if f.related_modules else None,
                "status": "pending",
                "source": "ai_extracted",
                "feature_count": 0,
                "created_at": datetime.utcnow().isoformat(),
            }
            
            # 存储需求
            _reqs[req_id] = req
            extracted_reqs.append(req)
        
        # 更新文档统计
        doc["req_count"] = len(extracted_reqs)
        doc["last_parsed_at"] = datetime.utcnow().isoformat()
        
        logger.info(f"从文档 {doc_id} 提取了 {len(extracted_reqs)} 个需求条目")
        
        return {
            "status": "success",
            "doc_id": doc_id,
            "extracted_count": len(extracted_reqs),
            "requirements": extracted_reqs,
        }
        
    except Exception as e:
        logger.error(f"AI 提取失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/docs/{doc_id}/ai-summary")
async def get_doc_ai_summary(doc_id: str):
    """
    获取文档的 AI 分析摘要
    
    不提取条目，只对文档进行整体分析
    """
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    try:
        analyzer = RequirementAnalyzer()
        insight = await analyzer.generate_insight(doc["content"])
        
        return {
            "doc_id": doc_id,
            "summary": insight.summary,
            "key_entities": insight.key_entities,
            "action_verbs": insight.action_verbs,
            "quality_attributes": insight.quality_attributes,
            "potential_risks": insight.potential_risks,
            "missing_info": insight.missing_info,
            "suggestions": insight.suggestions,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 独立需求条目管理
# ============================================================

@router.post("/requirements")
async def create_requirement(req: CreateRequirementRequest):
    """创建独立需求条目（不绑定文档）"""
    req_id = generate_req_id(req.req_type[:2].upper())
    
    requirement = {
        "id": str(uuid.uuid4()),
        "req_id": req_id,
        "doc_id": None,
        "seq_no": 0,
        "title": req.title,
        "description": req.description,
        "content": req.description,
        "req_type": req.req_type,
        "priority": req.priority,
        "module": req.module,
        "asil": req.asil,
        "status": "pending",
        "source": "manual",
        "symbolic_conditions": req.symbolic_conditions,
        "created_at": datetime.utcnow().isoformat(),
    }
    
    _reqs[req_id] = requirement
    
    return {"status": "success", "requirement": requirement}


@router.get("/requirements")
async def list_requirements(
    doc_id: Optional[str] = None,
    req_type: Optional[str] = None,
    priority: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """列出需求条目"""
    reqs = list(_reqs.values())
    
    # 过滤
    if doc_id:
        reqs = [r for r in reqs if r.get("doc_id") == doc_id]
    if req_type:
        reqs = [r for r in reqs if r.get("req_type") == req_type]
    if priority:
        reqs = [r for r in reqs if r.get("priority") == priority]
    if status:
        reqs = [r for r in reqs if r.get("status") == status]
    
    # 排序
    reqs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    # 分页
    total = len(reqs)
    start = (page - 1) * page_size
    end = start + page_size
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "requirements": reqs[start:end],
    }


@router.get("/requirements/{req_id}")
async def get_requirement(req_id: str):
    """获取需求详情"""
    req = _reqs.get(req_id)
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")
    
    return {"requirement": req}


@router.put("/requirements/{req_id}")
async def update_requirement(req_id: str, data: Dict):
    """更新需求"""
    req = _reqs.get(req_id)
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")
    
    # 允许更新的字段
    allowed = ["title", "description", "req_type", "priority", "module", "asil", "status", "symbolic_conditions"]
    for k, v in data.items():
        if k in allowed:
            req[k] = v
    
    req["updated_at"] = datetime.utcnow().isoformat()
    
    return {"status": "success", "requirement": req}


@router.delete("/requirements/{req_id}")
async def delete_requirement(req_id: str):
    """删除需求"""
    if req_id not in _reqs:
        raise HTTPException(status_code=404, detail="需求不存在")
    
    _reqs.pop(req_id)
    
    return {"status": "success", "message": f"需求 {req_id} 已删除"}


# ============================================================
# 需求 → 功能点 提取
# ============================================================

@router.post("/requirements/{req_id}/extract-features")
async def extract_features_from_requirement(req_id: str):
    """
    AI 从需求条目中提取功能点
    """
    req = _reqs.get(req_id)
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")
    
    try:
        analyzer = RequirementAnalyzer()
        features = await analyzer.extract_features(req.get("content", req.get("title", "")))
        
        extracted = []
        for f in features:
            extracted.append({
                "feature_id": f.id or f"FEAT-{req_id}-{len(extracted)+1}",
                "name": f.name,
                "description": f.description,
                "type": f.type,
                "priority": f.priority,
                "keywords": f.keywords,
                "acceptance_criteria": f.acceptance_criteria,
                "constraints": f.constraints,
                "asil_implication": f.asil_implication,
                "estimated_complexity": f.estimated_complexity,
            })
        
        return {
            "req_id": req_id,
            "feature_count": len(extracted),
            "features": extracted,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 批量操作
# ============================================================

@router.post("/docs/batch-link")
async def batch_link_requirements(doc_id: str, req_ids: List[str]):
    """
    批量将需求条目关联到文档
    """
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    linked = []
    for req_id in req_ids:
        req = _reqs.get(req_id)
        if req:
            req["doc_id"] = doc["id"]
            linked.append(req_id)
    
    doc["req_count"] = len([r for r in _reqs.values() if r.get("doc_id") == doc["id"]])
    
    return {
        "status": "success",
        "linked_count": len(linked),
        "linked": linked,
    }


@router.get("/docs/{doc_id}/export")
async def export_doc_as_markdown(doc_id: str):
    """
    导出文档及其需求条目为完整 Markdown
    """
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    reqs = [r for r in _reqs.values() if r.get("doc_id") == doc["id"]]
    reqs.sort(key=lambda x: x.get("seq_no", 0))
    
    # 构建 Markdown
    lines = [
        f"# {doc['title']}",
        "",
        f"**文档ID:** {doc['doc_id']}",
        f"**版本:** {doc.get('version', '1.0.0')}",
        f"**状态:** {doc.get('status', 'draft')}",
        f"**类型:** {doc.get('doc_type', 'PRD')}",
        "",
        f"## 概述",
        "",
        doc.get("description", ""),
        "",
        f"## 需求条目 ({len(reqs)} 项)",
        "",
    ]
    
    for r in reqs:
        lines.extend([
            f"### {r['req_id']}: {r['title']}",
            "",
            f"**类型:** {r.get('req_type', 'BUSINESS')} | **优先级:** {r.get('priority', 'P1')} | **状态:** {r.get('status', 'pending')}",
            "",
            r.get("description", ""),
            "",
        ])
    
    return {
        "markdown": "\n".join(lines),
        "doc": doc,
        "req_count": len(reqs),
    }


# ============================================================
# 文件上传和管理
# ============================================================

from fastapi import UploadFile, File
from fastapi.responses import Response
import os

@router.post("/docs/{doc_id}/upload")
async def upload_doc_file(doc_id: str, file: UploadFile = File(...)):
    """
    上传文档文件 (.docx, .doc, .md)
    """
    from devguard.api.routes.doc_files import save_uploaded_file, docx_to_markdown, get_file_info
    
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 验证文件类型
    allowed = ['.docx', '.doc', '.md', '.markdown']
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}")
    
    # 保存文件
    content = await file.read()
    file_path = save_uploaded_file(content, file.filename, doc_id)
    
    # 如果是 markdown 或 docx，提取内容
    text_content = ""
    if ext in ['.md', '.markdown']:
        with open(file_path, 'r', encoding='utf-8') as f:
            text_content = f.read()
    elif ext == '.docx':
        try:
            text_content = docx_to_markdown(file_path)
        except Exception as e:
            logger.warning(f"docx 转换失败: {e}")
    
    # 更新文档内容
    if text_content:
        doc["content"] = text_content
        doc["updated_at"] = datetime.utcnow().isoformat()
    
    file_info = get_file_info(file_path)
    
    return {
        "status": "success",
        "file": file_info,
        "content_extracted": bool(text_content),
    }


@router.get("/docs/{doc_id}/files")
async def list_doc_files(doc_id: str):
    """
    列出文档关联的文件
    """
    from devguard.api.routes.doc_files import list_doc_files as _list_files
    
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    files = _list_files(doc_id)
    
    return {
        "doc_id": doc_id,
        "files": files,
        "count": len(files),
    }


@router.get("/docs/{doc_id}/files/{filename}")
async def get_doc_file(doc_id: str, filename: str):
    """
    获取文档文件（作为 Markdown 返回）
    """
    from devguard.api.routes.doc_files import DOCS_DIR, read_file_content
    
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    file_path = os.path.join(DOCS_DIR, doc_id, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    content = read_file_content(file_path, as_text=True)
    
    return {
        "filename": filename,
        "content": content,
        "format": "markdown",
    }


@router.get("/docs/{doc_id}/download/{filename}")
async def download_doc_file(doc_id: str, filename: str):
    """
    下载原始文档文件
    """
    from devguard.api.routes.doc_files import DOCS_DIR, read_file_content
    
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    file_path = os.path.join(DOCS_DIR, doc_id, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    content = read_file_content(file_path, as_text=False)
    
    return Response(
        content=content,
        media_type='application/octet-stream',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )


@router.post("/docs/{doc_id}/save-markdown")
async def save_doc_as_markdown(doc_id: str, content: str):
    """
    将编辑后的 Markdown 保存到文档
    
    Args:
        doc_id: 文档 ID
        content: Markdown 内容
    """
    from devguard.api.routes.doc_files import DOCS_DIR
    
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 更新文档内容
    doc["content"] = content
    doc["updated_at"] = datetime.utcnow().isoformat()
    
    # 保存到文件
    md_path = os.path.join(DOCS_DIR, doc_id, f"{doc_id}.md")
    os.makedirs(os.path.dirname(md_path), exist_ok=True)
    
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    return {
        "status": "success",
        "message": "文档已保存",
        "path": md_path,
    }


@router.post("/docs/{doc_id}/export-docx")
async def export_doc_as_docx(doc_id: str):
    """
    导出文档为 docx 文件
    """
    from devguard.api.routes.doc_files import create_docx_from_markdown, DOCS_DIR
    
    doc = _docs.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 获取 Markdown 内容
    content = doc.get("content", "")
    
    # 生成文件名
    safe_title = doc["title"].replace("/", "_").replace("\\", "_").replace(" ", "_")
    output_path = os.path.join(DOCS_DIR, doc_id, f"{safe_title}.docx")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    try:
        create_docx_from_markdown(content, output_path)
        
        return {
            "status": "success",
            "filename": f"{safe_title}.docx",
            "path": output_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
