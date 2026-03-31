"""
仿真 API 路由
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging

from devguard.simulation.orchestrator import SimulationOrchestrator, SimulationConfig

logger = logging.getLogger(__name__)

router = APIRouter()


class SimulationRequest(BaseModel):
    """仿真请求"""
    requirement_id: str
    scenario_path: str
    adcu_binary: str = "/usr/local/bin/devguard-adcu"
    playback_speed: float = 1.0
    duration_sec: int = 60
    collect_interval_ms: int = 100
    requirements: List[Dict[str, Any]] = []


class SimulationResponse(BaseModel):
    """仿真响应"""
    status: str
    requirement_id: str
    passed: bool
    results: List[dict]
    report: dict


@router.post("/run", response_model=SimulationResponse)
async def run_simulation(
    sim_req: SimulationRequest,
    background_tasks: BackgroundTasks,
):
    """
    运行仿真验证
    
    流程:
    1. 部署到仿真环境 (ADCU 域控)
    2. 数据回灌 (CAN/ROS)
    3. 性能采集 (延迟/内存/CPU)
    4. 结果分析 + 对比基线
    5. 生成报告 + 回传
    """
    logger.info(f"运行仿真: {sim_req.requirement_id}")
    
    try:
        config = SimulationConfig(
            scenario_path=sim_req.scenario_path,
            adcu_binary=sim_req.adcu_binary,
            playback_speed=sim_req.playback_speed,
            duration_sec=sim_req.duration_sec,
            collect_interval_ms=sim_req.collect_interval_ms,
        )
        
        orchestrator = SimulationOrchestrator(config)
        result = await orchestrator.run(sim_req.requirements)
        
        if result["status"] != "completed":
            raise HTTPException(status_code=400, detail=result.get("error", "仿真失败"))
        
        return SimulationResponse(
            status="success",
            requirement_id=sim_req.requirement_id,
            passed=result["passed"],
            results=result["results"],
            report=result["report"],
        )
    
    except Exception as e:
        logger.error(f"仿真失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{simulation_id}")
async def get_simulation_status(simulation_id: str):
    """
    获取仿真状态
    """
    # TODO: 从数据库查询
    return {
        "status": "success",
        "simulation_id": simulation_id,
        "state": "running",
        "progress": 0.65,
    }


@router.get("/results/{simulation_id}")
async def get_simulation_results(simulation_id: str):
    """
    获取仿真结果
    """
    # TODO: 从数据库查询
    return {
        "status": "success",
        "simulation_id": simulation_id,
        "results": [],
    }


@router.post("/results/{simulation_id}/confirm")
async def confirm_simulation_results(
    simulation_id: str,
    owner: str,
    accept_deviation: bool = False,
    comment: str = "",
):
    """
    技术负责人确认仿真结果（性能偏离处理）
    
    accept_deviation: 是否接受性能偏离
    """
    logger.info(f"确认仿真结果: {simulation_id}, 接受偏离: {accept_deviation}")
    
    # TODO: 更新数据库
    # TODO: 触发合入流程或阻断
    
    return {
        "status": "success",
        "message": f"仿真结果已确认: {'接受偏离' if accept_deviation else '不接受偏离'}",
    }
