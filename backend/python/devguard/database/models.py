"""
数据库模型 — SQLAlchemy ORM

核心概念：
  RequirementDoc  需求文档（主体，一份大而全的 Markdown/Word 文档）
    └── Requirement  需求条目（从文档中提取的单条需求，是文档的子集）
         └── Feature  功能点（从需求条目中 AI 提取的细粒度功能点）
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

Base = declarative_base()


# ============================================================
# 需求文档（主体）
# ============================================================

class RequirementDoc(Base):
    """
    需求文档
    
    一份完整的需求文档（如 PRD、SRS、技术规范），
    是所有需求条目的来源。
    """
    __tablename__ = "requirement_docs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    doc_id = Column(String(50), unique=True, nullable=False, index=True)  # DOC-2025-001
    title = Column(String(255), nullable=False)
    description = Column(Text)
    
    # 文档内容
    content = Column(Text, nullable=False)          # 原始文档内容
    format = Column(String(20), default="markdown") # markdown / word / pdf
    version = Column(String(20), default="1.0.0")
    
    # 分类
    doc_type = Column(String(30), default="PRD")    # PRD / SRS / ICD / HLD / LLD
    project = Column(String(100))
    module = Column(String(100))
    
    # 状态
    status = Column(String(20), default="draft")    # draft / review / approved / archived
    
    # 统计（AI 解析后填充）
    req_count = Column(Integer, default=0)          # 包含的需求条目数
    feature_count = Column(Integer, default=0)      # 包含的功能点数
    last_parsed_at = Column(DateTime)               # 最后一次 AI 解析时间
    
    # 作者/审核
    author = Column(String(100))
    reviewer = Column(String(100))
    approved_by = Column(String(100))
    approved_at = Column(DateTime)
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    requirements = relationship(
        "Requirement", back_populates="doc",
        cascade="all, delete-orphan",
        order_by="Requirement.seq_no"
    )
    
    def __repr__(self):
        return f"<RequirementDoc {self.doc_id}: {self.title}>"


# ============================================================
# 需求条目（文档的子集）
# ============================================================

class Requirement(Base):
    """
    需求条目
    
    从需求文档中提取的单条需求，是文档的子集。
    可以手动创建，也可以由 AI 从文档中自动提取。
    """
    __tablename__ = "requirements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    req_id = Column(String(50), unique=True, nullable=False, index=True)  # BR-2025-Q1-001
    
    # 归属文档（可为空，表示独立创建的需求）
    doc_id = Column(String(36), ForeignKey("requirement_docs.id"), nullable=True, index=True)
    seq_no = Column(Integer, default=0)             # 在文档中的顺序
    
    # 需求链（用于版本比对）
    prev_req_id = Column(String(36), nullable=True)  # 前一个需求条目的 id（创建时填入）
    next_req_id = Column(String(36), nullable=True)  # 下一个需求条目 id（由后一个创建时填入）
    created_seq = Column(Integer, default=0)         # 全局创建序号（自增）
    
    # 基本信息
    title = Column(String(255), nullable=False)
    description = Column(Text)
    content = Column(Text)                          # 该条需求的原始文本（文档片段）
    
    # 分类
    req_type = Column(String(20))                   # BUSINESS / TECHNICAL / SYMBOLIC
    priority = Column(String(10), default="P1")     # P0 / P1 / P2
    module = Column(String(100))
    asil = Column(String(10))                       # QM / A / B / C / D
    
    # 符号条件（carSpeed=100km/h, geer=D）
    symbolic_conditions = Column(JSON)              # List[SymbolicCondition]
    
    # 状态
    status = Column(String(20), default="pending")  # pending / confirmed / in_progress / done / rejected
    
    # 来源标记
    source = Column(String(20), default="manual")   # manual / ai_extracted / imported
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    confirmed_at = Column(DateTime)
    
    # 需求链（版本比对）
    prev_req_id = Column(String(36), nullable=True)   # 前一个需求条目的 id
    next_req_id = Column(String(36), nullable=True)    # 下一个需求条目 id（创建新需求时回填）
    created_seq = Column(Integer, default=0)          # 全局创建序号（越大越新）
    
    # 关系
    doc = relationship("RequirementDoc", back_populates="requirements")
    features = relationship("Feature", back_populates="requirement", cascade="all, delete-orphan")
    analyses = relationship("Analysis", back_populates="requirement", cascade="all, delete-orphan")
    confirmations = relationship("Confirmation", back_populates="requirement", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Requirement {self.req_id}>"


# ============================================================
# 功能点（需求条目的细粒度拆解）
# ============================================================

class Feature(Base):
    """
    功能点
    
    由 AI 从需求条目中提取的细粒度功能点。
    """
    __tablename__ = "features"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id = Column(String(36), ForeignKey("requirements.id"), nullable=False)
    feature_id = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    
    # 分类
    feature_type = Column(String(20))
    phase = Column(String(30))
    priority = Column(String(10), default="P1")
    asil_implication = Column(String(10))
    estimated_complexity = Column(String(10), default="MEDIUM")
    
    # 规格
    keywords = Column(JSON)
    acceptance_criteria = Column(JSON)
    constraints = Column(JSON)
    related_modules = Column(JSON)
    dependencies = Column(JSON)
    
    # 对齐结果
    aligned_module = Column(String(100))
    alignment_score = Column(Float)
    alignment_type = Column(String(20))
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    requirement = relationship("Requirement", back_populates="features")
    
    def __repr__(self):
        return f"<Feature {self.feature_id}>"


# ============================================================
# 其余模型（保持不变）
# ============================================================

class Analysis(Base):
    """分析记录"""
    __tablename__ = "analyses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id = Column(String(36), ForeignKey("requirements.id"), nullable=False)
    analysis_type = Column(String(20))
    status = Column(String(20))
    result = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    requirement = relationship("Requirement", back_populates="analyses")


class PullRequest(Base):
    """PR 记录"""
    __tablename__ = "pull_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pr_number = Column(Integer, unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    author = Column(String(100))
    branch = Column(String(255))
    changed_files = Column(Integer)
    additions = Column(Integer)
    deletions = Column(Integer)
    can_merge = Column(Boolean, default=False)
    analysis_result = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    analyzed_at = Column(DateTime)
    commits = relationship("Commit", back_populates="pr", cascade="all, delete-orphan")
    validations = relationship("CommitValidation", back_populates="pr", cascade="all, delete-orphan")


class Commit(Base):
    """Commit 记录"""
    __tablename__ = "commits"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pr_id = Column(String(36), ForeignKey("pull_requests.id"), nullable=False)
    sha = Column(String(40), unique=True, nullable=False, index=True)
    message = Column(Text, nullable=False)
    author = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
    pr = relationship("PullRequest", back_populates="commits")
    validation = relationship("CommitValidation", back_populates="commit", uselist=False, cascade="all, delete-orphan")


class CommitValidation(Base):
    """Commit 语义对齐校验"""
    __tablename__ = "commit_validations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pr_id = Column(String(36), ForeignKey("pull_requests.id"), nullable=False)
    commit_id = Column(String(36), ForeignKey("commits.id"), nullable=False)
    status = Column(String(20))
    semantic_match_score = Column(Float)
    matched_keywords = Column(JSON)
    missing_keywords = Column(JSON)
    suggestion = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    pr = relationship("PullRequest", back_populates="validations")
    commit = relationship("Commit", back_populates="validation")


class Confirmation(Base):
    """需求负责人确认"""
    __tablename__ = "confirmations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id = Column(String(36), ForeignKey("requirements.id"), nullable=False)
    owner = Column(String(100), nullable=False)
    status = Column(String(20))
    comment = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    confirmed_at = Column(DateTime)
    requirement = relationship("Requirement", back_populates="confirmations")


class Simulation(Base):
    """仿真验证记录"""
    __tablename__ = "simulations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id = Column(String(36), nullable=False, index=True)
    scenario_path = Column(String(255))
    playback_speed = Column(Float, default=1.0)
    duration_sec = Column(Integer)
    status = Column(String(20))
    passed = Column(Boolean)
    results = Column(JSON)
    report = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)


class Baseline(Base):
    """架构基线"""
    __tablename__ = "baselines"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    baseline_id = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    version = Column(String(20), default="1.0.0")
    language = Column(String(20), default="cpp")
    schema = Column(JSON)
    is_active = Column(Boolean, default=True)
    parent_id = Column(String(36))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
