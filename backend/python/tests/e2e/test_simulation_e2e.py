"""
端到端测试 — 仿真验证流程
"""

import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock

from devguard.simulation.orchestrator import SimulationOrchestrator, SimulationConfig


@pytest.mark.e2e
class TestSimulationEndToEnd:
    """仿真验证端到端测试"""

    @pytest.fixture
    def sim_config(self, sample_simulation_config):
        return SimulationConfig(
            scenario_path=sample_simulation_config["scenario_path"],
            adcu_binary="/usr/local/bin/devguard-adcu",
            playback_speed=sample_simulation_config["playback_speed"],
            duration_sec=sample_simulation_config["duration_sec"],
            collect_interval_ms=sample_simulation_config["collect_interval_ms"],
        )

    @pytest.fixture
    def orchestrator(self, sim_config):
        return SimulationOrchestrator(sim_config)

    @pytest.mark.asyncio
    async def test_simulation_all_pass(self, orchestrator, sample_simulation_config):
        """
        端到端测试：仿真全部通过
        
        场景：所有性能指标均满足约束
        预期：仿真通过，可以合入
        """
        requirements = sample_simulation_config["requirements"]

        with patch.object(orchestrator, '_start_adcu', new_callable=AsyncMock):
            with patch.object(orchestrator, '_start_playback', new_callable=AsyncMock):
                with patch.object(orchestrator, '_collect_metrics', new_callable=AsyncMock) as mock_collect:
                    with patch.object(orchestrator, '_stop_simulation', new_callable=AsyncMock):

                        # 模拟采集到的性能数据（全部通过）
                        mock_collect.return_value = {
                            "latency_p99": 75.3,   # < 80ms ✅
                            "memory_usage": 420,    # < 500MB ✅
                            "cpu_usage": 65.0,      # < 80% ✅
                            "throughput": 12.5      # > 10fps ✅
                        }

                        result = await orchestrator.run(requirements)

        assert result["passed"] == True
        assert len(result["results"]) == len(requirements)

        for r in result["results"]:
            assert r["passed"] == True, f"指标 {r['metric']} 应该通过"

    @pytest.mark.asyncio
    async def test_simulation_latency_fail(self, orchestrator, sample_simulation_config):
        """
        端到端测试：延迟超标 → 失败
        
        场景：P99 延迟超过 80ms
        预期：仿真失败，需要技术负责人确认
        """
        requirements = sample_simulation_config["requirements"]

        with patch.object(orchestrator, '_start_adcu', new_callable=AsyncMock):
            with patch.object(orchestrator, '_start_playback', new_callable=AsyncMock):
                with patch.object(orchestrator, '_collect_metrics', new_callable=AsyncMock) as mock_collect:
                    with patch.object(orchestrator, '_stop_simulation', new_callable=AsyncMock):

                        # 延迟超标
                        mock_collect.return_value = {
                            "latency_p99": 95.0,   # > 80ms ❌
                            "memory_usage": 420,
                            "cpu_usage": 65.0,
                            "throughput": 12.5
                        }

                        result = await orchestrator.run(requirements)

        assert result["passed"] == False

        # 找到延迟指标
        latency_result = next(
            (r for r in result["results"] if "延迟" in r["metric"] or "latency" in r["metric"].lower()),
            None
        )
        assert latency_result is not None
        assert latency_result["passed"] == False
        assert latency_result["deviation"] > 0  # 正偏离 = 超标

    @pytest.mark.asyncio
    async def test_simulation_memory_fail(self, orchestrator, sample_simulation_config):
        """
        端到端测试：内存超标 → 失败
        """
        requirements = sample_simulation_config["requirements"]

        with patch.object(orchestrator, '_start_adcu', new_callable=AsyncMock):
            with patch.object(orchestrator, '_start_playback', new_callable=AsyncMock):
                with patch.object(orchestrator, '_collect_metrics', new_callable=AsyncMock) as mock_collect:
                    with patch.object(orchestrator, '_stop_simulation', new_callable=AsyncMock):

                        mock_collect.return_value = {
                            "latency_p99": 75.0,
                            "memory_usage": 560,   # > 500MB ❌
                            "cpu_usage": 65.0,
                            "throughput": 12.5
                        }

                        result = await orchestrator.run(requirements)

        assert result["passed"] == False

    @pytest.mark.asyncio
    async def test_simulation_report_structure(self, orchestrator, sample_simulation_config):
        """
        端到端测试：验证仿真报告结构
        """
        requirements = sample_simulation_config["requirements"]

        with patch.object(orchestrator, '_start_adcu', new_callable=AsyncMock):
            with patch.object(orchestrator, '_start_playback', new_callable=AsyncMock):
                with patch.object(orchestrator, '_collect_metrics', new_callable=AsyncMock) as mock_collect:
                    with patch.object(orchestrator, '_stop_simulation', new_callable=AsyncMock):

                        mock_collect.return_value = {
                            "latency_p99": 75.0,
                            "memory_usage": 420,
                        }

                        result = await orchestrator.run(requirements)

        # 验证报告结构
        assert "requirement_id" in result
        assert "passed" in result
        assert "results" in result
        assert "report" in result

        report = result["report"]
        assert isinstance(report, dict)

    @pytest.mark.asyncio
    async def test_simulation_deviation_calculation(self, orchestrator, sample_simulation_config):
        """
        端到端测试：偏离度计算
        
        验证偏离度计算公式：
        deviation = (measured - threshold) / threshold * 100
        """
        requirements = [
            {
                "id": "TR-PERF-001",
                "name": "感知延迟 P99",
                "metric_key": "latency_p99",
                "constraint": "< 80ms",
                "unit": "ms"
            }
        ]

        with patch.object(orchestrator, '_start_adcu', new_callable=AsyncMock):
            with patch.object(orchestrator, '_start_playback', new_callable=AsyncMock):
                with patch.object(orchestrator, '_collect_metrics', new_callable=AsyncMock) as mock_collect:
                    with patch.object(orchestrator, '_stop_simulation', new_callable=AsyncMock):

                        mock_collect.return_value = {"latency_p99": 72.0}

                        result = await orchestrator.run(requirements)

        latency = result["results"][0]
        # 72ms < 80ms，偏离度应为负数（低于阈值）
        assert latency["deviation"] < 0
        assert latency["passed"] == True

    @pytest.mark.asyncio
    async def test_simulation_timeout_handling(self, orchestrator, sample_simulation_config):
        """
        端到端测试：仿真超时处理
        """
        requirements = sample_simulation_config["requirements"]

        with patch.object(orchestrator, '_start_adcu', new_callable=AsyncMock):
            with patch.object(orchestrator, '_start_playback', new_callable=AsyncMock):
                with patch.object(
                    orchestrator, '_collect_metrics',
                    new_callable=AsyncMock,
                    side_effect=asyncio.TimeoutError("仿真超时")
                ):
                    with patch.object(orchestrator, '_stop_simulation', new_callable=AsyncMock):

                        result = await orchestrator.run(requirements)

        assert result["passed"] == False
        assert "error" in result or result.get("status") == "failed"


@pytest.mark.e2e
class TestSimulationWithTechnicalRequirements:
    """技术需求分层仿真测试"""

    @pytest.mark.asyncio
    async def test_runtime_perf_requires_simulation(self, sample_technical_requirement):
        """
        验证运行时性能需求必须通过仿真验证
        """
        from devguard.analysis.req_parser import ReqParser

        parser = ReqParser()
        features = parser.parse(
            sample_technical_requirement["id"],
            sample_technical_requirement["content"],
            "markdown"
        )

        runtime_features = [
            f for f in features
            if f.phase == "RUNTIME_PERF" and f.specified
        ]

        # 运行时性能需求应该标记需要仿真
        for f in runtime_features:
            # 有具体约束的运行时需求应该需要仿真验证
            assert f.constraint, f"运行时需求 {f.id} 应有具体约束"

    @pytest.mark.asyncio
    async def test_compile_time_no_simulation_needed(self):
        """
        验证编译时需求不需要仿真验证
        """
        from devguard.analysis.req_parser import ReqParser

        content = """
# 技术需求

### TR-001 代码规范

所有代码必须通过 clang-tidy 检查，符合 C++17 标准。
"""
        parser = ReqParser()
        features = parser.parse("REQ-001", content, "markdown")

        compile_features = [
            f for f in features
            if f.phase in ("PRE_COMPILE", "COMPILE_TIME")
        ]

        # 编译时需求不需要仿真
        for f in compile_features:
            requires_sim = getattr(f, 'requires_simulation', False)
            assert not requires_sim, \
                f"编译时需求 {f.id} 不应需要仿真验证"
