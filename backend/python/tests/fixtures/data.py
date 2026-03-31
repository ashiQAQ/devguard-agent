"""
Pytest 配置和 fixtures
"""

import pytest
import asyncio
import sys
import os
from typing import Generator
from datetime import datetime

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


@pytest.fixture(scope="session")
def event_loop():
    """创建事件循环"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def sample_requirement_content():
    """示例需求文档内容"""
    return """
# 城市NOA雨天感知降级策略

## 1. 需求概述

当检测到降雨量达到中雨及以上级别时，系统应自动启用雨天感知降级策略，确保在恶劣天气条件下的安全驾驶。

## 2. 功能需求

### FR-001 雨量分级检测

系统应具备实时检测降雨强度的能力，划分为以下三个等级：
- 细雨 (Light): 0-2mm/h
- 中雨 (Medium): 2-10mm/h  
- 暴雨 (Heavy): >10mm/h

### FR-002 感知模式切换

根据雨量等级自动切换感知模式：
- 细雨模式：保持正常感知配置
- 中雨模式：启用防水畸变算法
- 暴雨模式：降低感知频率，启用安全冗余

### FR-003 预警信息推送

当切换到暴雨模式时，应向驾驶舱推送预警信息，包括：
- 当前雨量等级
- 感知模式状态
- 建议车速

## 3. 技术需求

### TR-001 感知延迟 P99

系统感知延迟 P99 应小于 80ms。

### TR-002 内存占用

内存占用应控制在 500MB 以内。

### TR-003 故障检测

系统应具备自检能力，能检测传感器故障并上报。
"""


@pytest.fixture
def sample_requirement_json():
    """示例需求 JSON 格式"""
    return {
        "id": "REQ-2025-Q1-001",
        "title": "城市NOA雨天感知降级策略",
        "content": """
# 城市NOA雨天感知降级策略

## 1. 需求概述

当检测到降雨量达到中雨及以上级别时，系统应自动启用雨天感知降级策略。

## 2. 功能需求

### FR-001 雨量分级检测

系统应具备实时检测降雨强度的能力，划分为以下三个等级：
- 细雨 (Light): 0-2mm/h
- 中雨 (Medium): 2-10mm/h  
- 暴雨 (Heavy): >10mm/h
""",
        "format": "markdown",
        "priority": "P0",
        "module": "perception",
        "asil": "B",
        "req_type": "BUSINESS"
    }


@pytest.fixture
def sample_pr_event():
    """示例 PR 事件"""
    return {
        "number": 9152,
        "title": "feat: 城市NOA雨天感知降级策略实现",
        "description": "实现雨天感知降级策略，包括雨量分级检测、感知模式切换和预警推送",
        "author": "zhangsan-dev",
        "branch": "feat/rain-perception-degradation",
        "commits": [
            {
                "sha": "a1b2c3d4e5f6g7h8i9j0",
                "message": "feat(perception): 添加雨量分级检测模块\n\n实现 FR-001 雨量分级检测功能\n- 细雨检测阈值: 0-2mm/h\n- 中雨检测阈值: 2-10mm/h\n- 暴雨检测阈值: >10mm/h",
                "author": "zhangsan-dev",
                "timestamp": "2026-03-30T10:00:00Z"
            },
            {
                "sha": "b2c3d4e5f6g7h8i9j0k1",
                "message": "feat(perception): 添加感知模式切换逻辑\n\n实现 FR-002 感知模式切换功能\n- 细雨模式配置\n- 中雨防水畸变算法\n- 暴雨安全冗余模式",
                "author": "zhangsan-dev",
                "timestamp": "2026-03-30T10:30:00Z"
            },
            {
                "sha": "c3d4e5f6g7h8i9j0k1l2",
                "message": "feat(hmi): 添加预警信息推送\n\n实现 FR-003 预警信息推送功能\n- 推送当前雨量等级\n- 推送感知模式状态\n- 推送建议车速",
                "author": "zhangsan-dev",
                "timestamp": "2026-03-30T11:00:00Z"
            }
        ],
        "changed_files": 5,
        "additions": 230,
        "deletions": 15
    }


@pytest.fixture
def sample_pr_event_no_matching():
    """示例不匹配的 PR 事件"""
    return {
        "number": 9153,
        "title": "fix: 修复某个无关的bug",
        "description": "修复了一个与需求无关的 bug",
        "author": "lisi-dev",
        "branch": "fix/unrelated-bug",
        "commits": [
            {
                "sha": "d4e5f6g7h8i9j0k1l2m3",
                "message": "fix: 修复某个无关的bug\n\n这个提交与任何需求都无关",
                "author": "lisi-dev",
                "timestamp": "2026-03-30T12:00:00Z"
            }
        ],
        "changed_files": 1,
        "additions": 10,
        "deletions": 5
    }


@pytest.fixture
def sample_technical_requirement():
    """示例技术需求"""
    return {
        "id": "REQ-2025-Q1-002",
        "title": "感知延迟优化",
        "content": """
# 感知延迟优化需求

## 技术需求

### TR-PERF-001 感知延迟 P99

系统感知延迟 P99 应小于 80ms（实测应 < 75ms 以留有裕度）。

### TR-PERF-002 内存占用

内存占用应控制在 500MB 以内。

## 验证方式

- 使用仿真环境进行数据回灌验证
- 在 ADCU 域控上进行实测验证
""",
        "format": "markdown",
        "priority": "P1",
        "module": "perception",
        "asil": "C",
        "req_type": "TECHNICAL"
    }


@pytest.fixture
def sample_features():
    """示例功能点列表"""
    return [
        {
            "id": "BR-001",
            "name": "雨量分级检测",
            "type": "BUSINESS",
            "phase": "CODE_LOGIC",
            "keywords": ["雨量", "分级", "检测", "降雨强度", "细雨", "中雨", "暴雨"],
            "priority": "P0",
            "specified": True,
            "constraint": "0-2mm/h 细雨, 2-10mm/h 中雨, >10mm/h 暴雨"
        },
        {
            "id": "BR-002",
            "name": "感知模式切换",
            "type": "BUSINESS",
            "phase": "CODE_LOGIC",
            "keywords": ["感知模式", "切换", "防水畸变", "安全冗余", "降级"],
            "priority": "P0",
            "specified": True,
            "constraint": "根据雨量等级自动切换"
        },
        {
            "id": "BR-003",
            "name": "预警信息推送",
            "type": "BUSINESS",
            "phase": "CODE_LOGIC",
            "keywords": ["预警", "推送", "驾驶舱", "建议车速"],
            "priority": "P1",
            "specified": True,
            "constraint": "暴雨模式时推送预警"
        },
        {
            "id": "TR-001",
            "name": "感知延迟 P99",
            "type": "TECHNICAL",
            "phase": "RUNTIME_PERF",
            "keywords": ["延迟", "P99", "80ms"],
            "priority": "P0",
            "specified": True,
            "constraint": "P99 < 80ms",
            "requires_simulation": True
        },
        {
            "id": "TR-002",
            "name": "内存占用",
            "type": "TECHNICAL",
            "phase": "RUNTIME_PERF",
            "keywords": ["内存", "占用", "500MB"],
            "priority": "P1",
            "specified": True,
            "constraint": "< 500MB",
            "requires_simulation": True
        }
    ]


@pytest.fixture
def sample_alignment_results():
    """示例对齐结果"""
    return {
        "perception": {
            "modules": ["rain_detector", "perception_mode", "warning_publisher"],
            "alignment_score": 0.85,
            "matched_features": ["BR-001", "BR-002", "BR-003"],
            "missing_features": [],
            "new_modules": []
        },
        "hmi": {
            "modules": ["warning_display"],
            "alignment_score": 0.9,
            "matched_features": ["BR-003"],
            "missing_features": [],
            "new_modules": []
        }
    }


@pytest.fixture
def sample_simulation_config():
    """示例仿真配置"""
    return {
        "requirement_id": "REQ-2025-Q1-001",
        "scenario_path": "/data/scenarios/rain_heavy.bag",
        "playback_speed": 1.0,
        "duration_sec": 60,
        "collect_interval_ms": 100,
        "requirements": [
            {
                "id": "TR-PERF-001",
                "name": "感知延迟 P99",
                "metric_key": "latency_p99",
                "constraint": "< 80ms",
                "unit": "ms"
            },
            {
                "id": "TR-PERF-002",
                "name": "内存占用",
                "metric_key": "memory_usage",
                "constraint": "< 500MB",
                "unit": "MB"
            }
        ]
    }


@pytest.fixture
def sample_simulation_result():
    """示例仿真结果"""
    return {
        "requirement_id": "REQ-2025-Q1-001",
        "passed": True,
        "results": [
            {
                "req_id": "TR-PERF-001",
                "metric": "感知延迟 P99",
                "constraint": "< 80ms",
                "measured": 75.3,
                "unit": "ms",
                "passed": True,
                "deviation": -5.875
            },
            {
                "req_id": "TR-PERF-002",
                "metric": "内存占用",
                "constraint": "< 500MB",
                "measured": 420,
                "unit": "MB",
                "passed": True,
                "deviation": -16.0
            }
        ],
        "report": "仿真验证通过。所有性能指标均符合要求。"
    }


@pytest.fixture
def sample_baseline():
    """示例架构基线"""
    return {
        "id": "BL-2025-Q1-001",
        "baseline_id": "BL-2025-Q1-001",
        "name": "感知系统基线 v1.0",
        "version": "1.0.0",
        "language": "cpp",
        "schema": {
            "modules": {
                "perception": {
                    "rain_detector": {
                        "file": "rain_detector.cc",
                        "class": "RainDetector",
                        "asil": "B"
                    },
                    "perception_mode": {
                        "file": "perception_mode.cc",
                        "class": "PerceptionModeManager",
                        "asil": "B"
                    }
                }
            }
        },
        "is_active": True,
        "created_at": "2026-03-01T00:00:00Z",
        "updated_at": "2026-03-30T00:00:00Z"
    }


@pytest.fixture
def mock_database():
    """模拟数据库（实际测试中使用 SQLite 内存数据库）"""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from devguard.database.models import Base

    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()

    yield session

    session.close()
