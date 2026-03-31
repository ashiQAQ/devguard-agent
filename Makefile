.PHONY: help install dev test lint format clean docker-build docker-up docker-down k8s-check k8s-deploy-dev k8s-deploy-prod k8s-status k8s-logs k8s-undeploy

help:
	@echo "DevGuard Agent 开发命令"
	@echo ""
	@echo "Python 开发:"
	@echo "  make install       - 安装 Python 依赖"
	@echo "  make dev           - 启动开发服务器"
	@echo "  make test          - 运行测试"
	@echo "  make lint          - 代码检查"
	@echo "  make format        - 代码格式化"
	@echo ""
	@echo "C++ 开发:"
	@echo "  make cpp-build     - 编译 C++ 模块"
	@echo "  make cpp-test      - 运行 C++ 测试"
	@echo "  make cpp-clean     - 清理 C++ 编译"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build  - 构建 Docker 镜像"
	@echo "  make docker-up     - 启动 Docker 容器"
	@echo "  make docker-down   - 停止 Docker 容器"
	@echo ""
	@echo "Kubernetes:"
	@echo "  make k8s-check     - 检查 K8s 环境"
	@echo "  make k8s-deploy-dev   - 部署到开发环境"
	@echo "  make k8s-deploy-prod  - 部署到生产环境"
	@echo "  make k8s-status     - 查看 K8s 状态"
	@echo "  make k8s-logs       - 查看 K8s 日志"
	@echo "  make k8s-undeploy   - 删除 K8s 部署"
	@echo ""
	@echo "其他:"
	@echo "  make clean         - 清理所有临时文件"

# Python 开发
install:
	cd backend/python && pip install -r requirements.txt

dev:
	cd backend/python && python -m devguard.main --reload --init-db

test:
	cd backend/python && pytest tests/ -v --cov=devguard

lint:
	cd backend/python && flake8 devguard/ && mypy devguard/

format:
	cd backend/python && black devguard/ && isort devguard/

# C++ 开发
cpp-build:
	cd backend/cpp && mkdir -p build && cd build && cmake .. && make -j$$(nproc)

cpp-test:
	cd backend/cpp/build && ctest --output-on-failure

cpp-clean:
	rm -rf backend/cpp/build

# Docker
docker-build:
	docker-compose -f backend/docker/docker-compose.yml build

docker-up:
	docker-compose -f backend/docker/docker-compose.yml up -d

docker-down:
	docker-compose -f backend/docker/docker-compose.yml down

docker-logs:
	docker-compose -f backend/docker/docker-compose.yml logs -f api

# Kubernetes
k8s-check:
	@./k8s/deploy.sh check

k8s-deploy-dev:
	@./k8s/deploy.sh deploy-dev

k8s-deploy-prod:
	@./k8s/deploy.sh deploy-prod

k8s-status:
	@./k8s/deploy.sh status dev

k8s-logs:
	@./k8s/deploy.sh logs dev api

k8s-undeploy:
	@./k8s/deploy.sh undeploy dev

# 清理
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	rm -rf backend/cpp/build
	rm -rf logs/*
	rm -rf .coverage htmlcov/

# 完整初始化
init: install cpp-build
	@echo "✅ 初始化完成"

# 运行所有检查
check: lint test
	@echo "✅ 所有检查通过"
