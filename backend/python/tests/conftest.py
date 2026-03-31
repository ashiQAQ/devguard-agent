"""
pytest 配置文件
"""

import pytest
import asyncio
import sys
import os

# 添加项目路径到 sys.path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, project_root)


def pytest_configure(config):
    """pytest 配置钩子"""
    # 注册自定义标记
    config.addinivalue_line("markers", "unit: 单元测试")
    config.addinivalue_line("markers", "integration: 集成测试")
    config.addinivalue_line("markers", "e2e: 端到端测试")
    config.addinivalue_line("markers", "slow: 慢速测试")
    config.addinivalue_line("markers", "requires_db: 需要数据库")
    config.addinivalue_line("markers", "requires_api: 需要 API 服务")


@pytest.fixture(scope="session")
def project_root_path():
    """返回项目根目录路径"""
    return project_root


@pytest.fixture(scope="session")
def backend_path():
    """返回后端目录路径"""
    return os.path.join(project_root, "backend", "python")


@pytest.fixture(scope="session")
def cpp_path():
    """返回 C++ 目录路径"""
    return os.path.join(project_root, "backend", "cpp")


@pytest.fixture(scope="function")
def temp_dir(tmp_path):
    """返回临时目录"""
    return tmp_path


# 设置日志
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)


# 添加自定义断言消息
def pytest_assertrepr_compare(op, left, right):
    """自定义断言失败消息"""
    if isinstance(left, dict) and isinstance(right, dict) and op == "==":
        return [
            "字典比较失败:",
            f"左边: {left}",
            f"右边: {right}",
        ]
