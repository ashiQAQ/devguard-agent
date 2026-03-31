"""
FastAPI 应用主入口
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from devguard.config import settings
from devguard.api.routes import requirements, analysis, simulation, baselines, ai_analysis, req_docs

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("DevGuard Agent 启动")
    yield
    logger.info("DevGuard Agent 关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="DevGuard Agent API",
    description="AI-powered full-cycle dev quality guardian",
    version="2.4.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(requirements.router, prefix="/api/requirements", tags=["需求管理"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["分析"])
app.include_router(simulation.router, prefix="/api/simulation", tags=["仿真"])
app.include_router(baselines.router, prefix="/api/baselines", tags=["基线"])
app.include_router(ai_analysis.router, prefix="/api/ai", tags=["AI 分析"])
app.include_router(req_docs.router, prefix="/api/req-docs", tags=["需求文档"])


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "version": "2.4.0"}


@app.get("/")
async def root():
    """根路由"""
    return {
        "name": "DevGuard Agent",
        "version": "2.4.0",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=settings.API_HOST,
        port=settings.API_PORT,
        log_level="info",
    )
