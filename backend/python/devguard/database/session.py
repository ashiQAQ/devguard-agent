"""
数据库会话管理
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
import logging

from devguard.config import settings
from devguard.database.models import Base

logger = logging.getLogger(__name__)

# 创建数据库引擎
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.SQLALCHEMY_ECHO,
    pool_pre_ping=True,  # 连接前检查
    pool_size=10,
    max_overflow=20,
)

# 创建会话工厂
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库"""
    logger.info("初始化数据库...")
    Base.metadata.create_all(bind=engine)
    logger.info("数据库初始化完成")


def drop_db():
    """删除所有表"""
    logger.warning("删除所有数据库表...")
    Base.metadata.drop_all(bind=engine)
    logger.warning("数据库表已删除")
