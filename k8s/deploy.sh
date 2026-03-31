#!/bin/bash
set -euo pipefail

# DevGuard Agent Kubernetes 部署脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    local missing=()

    if ! command -v kubectl &> /dev/null; then
        missing+=("kubectl")
    fi

    if ! command -v kustomize &> /dev/null; then
        missing+=("kustomize")
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "缺少以下工具: ${missing[*]}"
        log_info "安装指南:"
        log_info "  kubectl: https://kubernetes.io/docs/tasks/tools/"
        log_info "  kustomize: https://kustomize.io/"
        exit 1
    fi

    log_success "所有依赖已安装"
}

# 检查集群连接
check_cluster() {
    log_info "检查 Kubernetes 集群连接..."

    if ! kubectl cluster-info &> /dev/null; then
        log_error "无法连接到 Kubernetes 集群"
        log_info "请确保已配置正确的 kubeconfig"
        exit 1
    fi

    log_success "集群连接正常"
}

# 创建 secrets.env
create_secrets_template() {
    local env=$1
    local secrets_file="${SCRIPT_DIR}/overlays/${env}/secrets.env"

    if [ -f "$secrets_file" ]; then
        log_warning "secrets.env 已存在，跳过创建"
        return
    fi

    log_info "创建 secrets.env 模板..."

    cat > "$secrets_file" << EOF
# DevGuard Agent Secrets
# 请填写以下配置项

# GitHub Token (必需)
GITHUB_TOKEN=ghp_your_github_token_here

# GitLab Token (可选)
GITLAB_TOKEN=glpat_your_gitlab_token_here

# OpenAI API Key (必需)
OPENAI_API_KEY=sk_your_openai_api_key_here

# GitHub Webhook Secret (必需)
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here

# PostgreSQL Password (必需)
POSTGRES_PASSWORD=your_secure_password_here
EOF

    log_success "已创建 $secrets_file"
    log_warning "请编辑该文件并填写正确的值"
}

# 部署到开发环境
deploy_dev() {
    log_info "部署到开发环境..."

    create_secrets_template "dev"

    cd "${SCRIPT_DIR}/overlays/dev"

    # 构建并应用
    kustomize build . | kubectl apply -f -

    # 等待部署完成
    kubectl rollout status deployment/devguard-api -n devguard --timeout=300s
    kubectl rollout status deployment/devguard-frontend -n devguard --timeout=300s

    log_success "开发环境部署完成"
    log_info "访问地址:"
    log_info "  API: http://localhost:8000 (kubectl port-forward -n devguard svc/devguard-api 8000:80)"
    log_info "  Frontend: http://localhost:3000 (kubectl port-forward -n devguard svc/devguard-frontend 3000:80)"
}

# 部署到生产环境
deploy_prod() {
    log_info "部署到生产环境..."

    create_secrets_template "prod"

    # 确认部署
    log_warning "即将部署到生产环境!"
    read -p "确认继续? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log_info "已取消部署"
        exit 0
    fi

    cd "${SCRIPT_DIR}/overlays/prod"

    # 构建并应用
    kustomize build . | kubectl apply -f -

    # 等待部署完成
    kubectl rollout status deployment/devguard-api -n devguard-prod --timeout=600s
    kubectl rollout status deployment/devguard-cpp-engine -n devguard-prod --timeout=600s
    kubectl rollout status deployment/devguard-frontend -n devguard-prod --timeout=300s

    log_success "生产环境部署完成"
    log_info "请配置 DNS 并等待 TLS 证书生成"
}

# 删除部署
undeploy() {
    local env=$1
    local namespace="devguard"

    if [ "$env" == "prod" ]; then
        namespace="devguard-prod"
    fi

    log_warning "即将删除 $env 环境部署!"
    read -p "确认继续? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log_info "已取消"
        exit 0
    fi

    log_info "删除 $env 环境部署..."
    kustomize build "${SCRIPT_DIR}/overlays/${env}" | kubectl delete -f - --ignore-not-found=true

    log_success "删除完成"
}

# 查看 Pod 状态
status() {
    local env=${1:-dev}
    local namespace="devguard"

    if [ "$env" == "prod" ]; then
        namespace="devguard-prod"
    fi

    log_info "$env 环境 Pod 状态:"
    kubectl get pods -n "$namespace"

    log_info "服务状态:"
    kubectl get svc -n "$namespace"

    log_info "Ingress 状态:"
    kubectl get ingress -n "$namespace"
}

# 查看日志
logs() {
    local env=${1:-dev}
    local component=${2:-api}
    local namespace="devguard"

    if [ "$env" == "prod" ]; then
        namespace="devguard-prod"
    fi

    kubectl logs -f "deployment/devguard-${component}" -n "$namespace"
}

# 端口转发
port_forward() {
    local env=${1:-dev}
    local namespace="devguard"

    if [ "$env" == "prod" ]; then
        namespace="devguard-prod"
    fi

    log_info "设置端口转发..."
    log_info "API: http://localhost:8000"
    log_info "Frontend: http://localhost:3000"

    kubectl port-forward -n "$namespace" svc/devguard-api 8000:80 &
    kubectl port-forward -n "$namespace" svc/devguard-frontend 3000:80 &

    wait
}

# 帮助信息
usage() {
    cat << EOF
DevGuard Agent Kubernetes 部署脚本

用法: $0 <command> [options]

命令:
  check           检查依赖和集群连接
  deploy-dev      部署到开发环境
  deploy-prod     部署到生产环境
  undeploy <env>  删除部署 (dev|prod)
  status <env>    查看状态 (默认: dev)
  logs <env> <component>  查看日志 (默认: dev api)
  port-forward <env>      端口转发 (默认: dev)

示例:
  $0 check
  $0 deploy-dev
  $0 deploy-prod
  $0 status prod
  $0 logs dev api
  $0 port-forward

EOF
}

# 主函数
main() {
    local command=${1:-help}

    case "$command" in
        check)
            check_dependencies
            check_cluster
            ;;
        deploy-dev)
            check_dependencies
            check_cluster
            deploy_dev
            ;;
        deploy-prod)
            check_dependencies
            check_cluster
            deploy_prod
            ;;
        undeploy)
            undeploy "${2:-dev}"
            ;;
        status)
            status "${2:-dev}"
            ;;
        logs)
            logs "${2:-dev}" "${3:-api}"
            ;;
        port-forward)
            port_forward "${2:-dev}"
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "未知命令: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
