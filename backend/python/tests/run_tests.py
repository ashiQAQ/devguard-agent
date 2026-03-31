"""
测试运行脚本和配置
"""

import pytest
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def run_all_tests():
    """运行所有测试"""
    args = [
        "-v",
        "--tb=short",
        "--strict-markers",
        "-m", "not slow",  # 跳过慢速测试
        "tests/"
    ]
    return pytest.main(args)


def run_unit_tests():
    """运行单元测试"""
    args = [
        "-v",
        "--tb=short",
        "-m", "unit",
        "tests/unit/"
    ]
    return pytest.main(args)


def run_integration_tests():
    """运行集成测试"""
    args = [
        "-v",
        "--tb=short",
        "-m", "integration",
        "tests/integration/"
    ]
    return pytest.main(args)


def run_e2e_tests():
    """运行端到端测试"""
    args = [
        "-v",
        "--tb=short",
        "-m", "e2e",
        "tests/e2e/"
    ]
    return pytest.main(args)


def run_with_coverage():
    """运行测试并生成覆盖率报告"""
    args = [
        "-v",
        "--cov=devguard",
        "--cov-report=html",
        "--cov-report=term-missing",
        "tests/"
    ]
    return pytest.main(args)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="运行 DevGuard Agent 测试")
    parser.add_argument(
        "--type",
        choices=["all", "unit", "integration", "e2e", "coverage"],
        default="all",
        help="测试类型"
    )
    
    args = parser.parse_args()
    
    test_runners = {
        "all": run_all_tests,
        "unit": run_unit_tests,
        "integration": run_integration_tests,
        "e2e": run_e2e_tests,
        "coverage": run_with_coverage,
    }
    
    exit_code = test_runners[args.type]()
    sys.exit(exit_code)
