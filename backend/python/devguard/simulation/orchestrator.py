"""
仿真编排器 — 协调 ADCU 数据回灌 + 性能采集
"""

import asyncio
import subprocess
import json
import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class SimulationState(Enum):
    """仿真状态"""
    IDLE = "idle"
    DEPLOYING = "deploying"
    PLAYING_BACK = "playing_back"
    COLLECTING = "collecting"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class PerformanceResult:
    """性能测试结果"""
    req_id: str
    metric: str
    constraint: str
    measured: float
    unit: str
    passed: bool
    deviation: float  # 偏离百分比
    bottleneck: str = ""


@dataclass
class SimulationConfig:
    """仿真配置"""
    scenario_path: str       # 场景数据路径
    adcu_binary: str         # ADCU 可执行文件路径
    playback_speed: float    # 回放速度 (1.0 = 实时)
    duration_sec: int        # 仿真时长
    collect_interval_ms: int # 采集间隔


class SimulationOrchestrator:
    """
    仿真编排器
    
    职责:
    1. 启动 ADCU 域控进程 (C++)
    2. 触发数据回灌 (C++)
    3. 采集性能指标 (C++)
    4. 分析结果 (Python)
    5. 生成报告 + 回传
    """

    def __init__(self, config: SimulationConfig):
        self.config = config
        self.state = SimulationState.IDLE
        self._adcu_process: Optional[subprocess.Popen] = None
        self._playback_process: Optional[subprocess.Popen] = None
        self._collector_process: Optional[subprocess.Popen] = None

    async def run(self, requirements: list) -> Dict[str, Any]:
        """
        执行完整仿真验证流程

        Args:
            requirements: 运行时性能需求列表

        Returns:
            仿真验证结果
        """
        logger.info("[Simulation] 开始仿真验证")
        results = []

        try:
            # Step 1: 部署到仿真环境
            await self._deploy_to_simulation()

            # Step 2: 数据回灌
            await self._start_data_playback()

            # Step 3: 性能采集
            raw_metrics = await self._collect_performance_metrics()

            # Step 4: 分析结果
            results = await self._analyze_results(raw_metrics, requirements)

            # Step 5: 生成报告
            report = self._generate_report(results)

            self.state = SimulationState.COMPLETED
            logger.info(f"[Simulation] 仿真验证完成，{len(results)} 项指标")

            return {
                "status": "completed",
                "results": [r.__dict__ for r in results],
                "report": report,
                "passed": all(r.passed for r in results),
            }

        except Exception as e:
            self.state = SimulationState.FAILED
            logger.error(f"[Simulation] 仿真验证失败: {str(e)}")
            return {"status": "failed", "error": str(e)}

        finally:
            await self._cleanup()

    async def _deploy_to_simulation(self):
        """Step 1: 部署到仿真环境 (启动 C++ ADCU 进程)"""
        self.state = SimulationState.DEPLOYING
        logger.info("[Simulation] 启动 ADCU 域控进程")

        # 启动 C++ ADCU 模拟器
        self._adcu_process = subprocess.Popen(
            [self.config.adcu_binary, "--sim-mode"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        # 等待 ADCU 就绪
        await asyncio.sleep(2.0)
        logger.info("[Simulation] ADCU 域控进程已就绪")

    async def _start_data_playback(self):
        """Step 2: 数据回灌 (调用 C++ DataPlayback)"""
        self.state = SimulationState.PLAYING_BACK
        logger.info(f"[Simulation] 开始数据回灌: {self.config.scenario_path}")

        # 调用 C++ 数据回灌引擎
        self._playback_process = subprocess.Popen(
            [
                "devguard-playback",
                "--scenario", self.config.scenario_path,
                "--speed", str(self.config.playback_speed),
                "--duration", str(self.config.duration_sec),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        # 等待回灌完成
        await asyncio.sleep(self.config.duration_sec)
        logger.info("[Simulation] 数据回灌完成")

    async def _collect_performance_metrics(self) -> Dict[str, Any]:
        """Step 3: 性能采集 (调用 C++ PerfCollector)"""
        self.state = SimulationState.COLLECTING
        logger.info("[Simulation] 开始性能采集")

        # 调用 C++ 性能采集器，通过 stdout 获取 JSON 结果
        result = subprocess.run(
            [
                "devguard-perf-collector",
                "--interval", str(self.config.collect_interval_ms),
                "--output", "json",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise RuntimeError(f"性能采集失败: {result.stderr}")

        metrics = json.loads(result.stdout)
        logger.info(f"[Simulation] 性能采集完成: {list(metrics.keys())}")
        return metrics

    async def _analyze_results(
        self, raw_metrics: Dict[str, Any], requirements: list
    ) -> list:
        """Step 4: 分析结果 (Python pandas/numpy)"""
        self.state = SimulationState.ANALYZING
        logger.info("[Simulation] 分析性能结果")

        import numpy as np

        results = []
        for req in requirements:
            metric_key = req.get("metric_key", "")
            if metric_key not in raw_metrics:
                continue

            values = raw_metrics[metric_key]
            measured = float(np.percentile(values, 99))  # P99

            constraint_str = req.get("constraint", "")
            constraint_val = self._parse_constraint(constraint_str)
            passed = measured <= constraint_val if constraint_val else True
            deviation = ((measured - constraint_val) / constraint_val * 100
                         if constraint_val else 0.0)

            result = PerformanceResult(
                req_id=req.get("id", ""),
                metric=req.get("name", ""),
                constraint=constraint_str,
                measured=measured,
                unit=req.get("unit", "ms"),
                passed=passed,
                deviation=deviation,
                bottleneck=self._identify_bottleneck(raw_metrics, metric_key),
            )
            results.append(result)

        return results

    def _parse_constraint(self, constraint_str: str) -> Optional[float]:
        """解析约束值，如 '< 80ms' → 80.0"""
        import re
        match = re.search(r"[\d.]+", constraint_str)
        return float(match.group()) if match else None

    def _identify_bottleneck(self, metrics: Dict, metric_key: str) -> str:
        """识别性能瓶颈"""
        # 简单实现：找到耗时最长的阶段
        if "stages" in metrics:
            stages = metrics["stages"]
            if stages:
                bottleneck = max(stages, key=lambda s: s.get("duration", 0))
                return f"{bottleneck.get('name', '')} ({bottleneck.get('duration', 0):.1f}ms)"
        return ""

    def _generate_report(self, results: list) -> Dict[str, Any]:
        """生成性能报告"""
        passed = [r for r in results if r.passed]
        failed = [r for r in results if not r.passed]

        return {
            "summary": {
                "total": len(results),
                "passed": len(passed),
                "failed": len(failed),
                "pass_rate": len(passed) / len(results) if results else 0,
            },
            "failed_items": [
                {
                    "req_id": r.req_id,
                    "metric": r.metric,
                    "constraint": r.constraint,
                    "measured": f"{r.measured:.1f}{r.unit}",
                    "deviation": f"+{r.deviation:.1f}%",
                    "bottleneck": r.bottleneck,
                    "options": [
                        "优化代码 → 重新仿真验证",
                        "技术负责人确认接受偏离 (需签字)",
                        "修改需求约束 (需 PM 确认)",
                    ],
                }
                for r in failed
            ],
        }

    async def _cleanup(self):
        """清理进程"""
        for proc in [self._adcu_process, self._playback_process, self._collector_process]:
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        logger.info("[Simulation] 仿真环境已清理")
