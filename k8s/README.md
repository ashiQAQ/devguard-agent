# DevGuard Agent Kubernetes 部署文档

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Ingress (nginx)                       │
│                  devguard.yourcompany.com                │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
   ┌────▼─────┐           ┌────▼─────┐
   │ Frontend │           │   API    │
   │  (Vue 3) │           │ (FastAPI)│
   │ Replicas:3│           │Replicas:5│
   └──────────┘           └────┬─────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
        │PostgreSQL │   │   Redis   │   │ C++ Engine│
        │ (Primary) │   │  (Cache)  │   │Replicas:3 │
        └───────────┘   └───────────┘   └───────────┘
```

## 快速开始

### 前置要求

- Kubernetes 1.24+
- kubectl 1.24+
- Helm 3.0+ (可选)
- 8GB+ 可用内存
- 4 CPU+ 可用

### 安装 kustomize

```bash
# macOS
brew install kustomize

# Linux
curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh"  | bash
```

### 部署步骤

#### 1. 准备 Secret 配置

```bash
# 创建 secrets.env 文件
cd k8s/base

cat > secrets.env << EOF
GITHUB_TOKEN=ghp_your_github_token_here
GITLAB_TOKEN=glpat-your_gitlab_token_here
OPENAI_API_KEY=sk-your_openai_api_key_here
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
POSTGRES_PASSWORD=your_secure_password_here
EOF
```

#### 2. 开发环境部署

```bash
# 部署到开发环境
kustomize build overlays/dev | kubectl apply -f -

# 查看部署状态
kubectl get pods -n devguard

# 查看日志
kubectl logs -f deployment/devguard-api -n devguard
```

#### 3. 生产环境部署

```bash
# 1. 更新 Ingress 域名
# 编辑 overlays/prod/ingress-host.yaml，修改 devguard.yourcompany.com

# 2. 创建 TLS 证书 (使用 cert-manager)
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@yourcompany.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# 3. 部署到生产环境
kustomize build overlays/prod | kubectl apply -f -

# 4. 验证部署
kubectl get all -n devguard-prod
```

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| DATABASE_URL | PostgreSQL 连接串 | - | ✅ |
| REDIS_URL | Redis 连接串 | - | ✅ |
| GITHUB_TOKEN | GitHub API Token | - | ✅ |
| OPENAI_API_KEY | OpenAI API Key | - | ✅ |
| GITHUB_WEBHOOK_SECRET | Webhook 密钥 | - | ✅ |
| API_HOST | API 监听地址 | 0.0.0.0 | ❌ |
| API_PORT | API 端口 | 8000 | ❌ |
| LOG_LEVEL | 日志级别 | INFO | ❌ |
| MAX_WORKERS | Worker 数量 | 4 | ❌ |

### 资源配置

#### 开发环境

| 组件 | Replicas | CPU | 内存 |
|------|----------|-----|------|
| API | 1 | 500m | 512Mi |
| C++ Engine | 1 | 1000m | 1Gi |
| Frontend | 1 | 100m | 128Mi |
| PostgreSQL | 1 | 250m | 512Mi |
| Redis | 1 | 100m | 128Mi |

#### 生产环境

| 组件 | Replicas | CPU | 内存 |
|------|----------|-----|------|
| API | 5 | 1000m-4000m | 1Gi-4Gi |
| C++ Engine | 3 | 2000m-8000m | 2Gi-8Gi |
| Frontend | 3 | 100m-500m | 128Mi-512Mi |
| PostgreSQL | 1 | 250m-1000m | 512Mi-2Gi |
| Redis | 1 | 100m-500m | 128Mi-512Mi |

## 服务访问

### 端口转发 (开发)

```bash
# API
kubectl port-forward -n devguard svc/devguard-api 8000:80

# Frontend
kubectl port-forward -n devguard svc/devguard-frontend 3000:80

# PostgreSQL
kubectl port-forward -n devguard svc/postgres 5432:5432

# Redis
kubectl port-forward -n devguard svc/redis 6379:6379
```

### 访问服务

```bash
# 通过 Ingress (生产)
https://devguard.yourcompany.com

# 通过端口转发 (开发)
http://localhost:3000  # Frontend
http://localhost:8000/api/docs  # API Docs
```

## 监控与日志

### 查看 Pod 状态

```bash
# 所有 Pod
kubectl get pods -n devguard-prod

# 详细信息
kubectl describe pod <pod-name> -n devguard-prod
```

### 查看日志

```bash
# API 日志
kubectl logs -f deployment/devguard-api -n devguard-prod

# C++ Engine 日志
kubectl logs -f deployment/devguard-cpp-engine -n devguard-prod

# 所有容器日志
kubectl logs -f -l app=devguard-api -n devguard-prod --all-containers
```

### 监控指标

```bash
# 安装 Prometheus (可选)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring

# 访问 Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
```

## 扩缩容

### 手动扩缩容

```bash
# API 扩容到 10 个副本
kubectl scale deployment devguard-api -n devguard-prod --replicas=10

# C++ Engine 扩容
kubectl scale deployment devguard-cpp-engine -n devguard-prod --replicas=5
```

### 自动扩缩容 (HPA)

已配置 HPA，自动根据 CPU/内存使用率扩缩容：

```bash
# 查看 HPA 状态
kubectl get hpa -n devguard-prod

# 详细信息
kubectl describe hpa devguard-api -n devguard-prod
```

## 更新与回滚

### 更新镜像

```bash
# 更新 API 镜像
kubectl set image deployment/devguard-api \
  api=devguard/api:2.4.1 \
  -n devguard-prod

# 查看更新状态
kubectl rollout status deployment/devguard-api -n devguard-prod
```

### 回滚

```bash
# 查看历史版本
kubectl rollout history deployment/devguard-api -n devguard-prod

# 回滚到上一版本
kubectl rollout undo deployment/devguard-api -n devguard-prod

# 回滚到指定版本
kubectl rollout undo deployment/devguard-api -n devguard-prod --to-revision=2
```

## 备份与恢复

### PostgreSQL 备份

```bash
# 备份数据库
kubectl exec -n devguard-prod statefulset/postgres -- \
  pg_dump -U devguard devguard > backup.sql

# 恢复数据库
kubectl exec -i -n devguard-prod statefulset/postgres -- \
  psql -U devguard devguard < backup.sql
```

### 持久化数据备份

```bash
# 创建快照 (需要存储类支持)
kubectl get pvc -n devguard-prod
```

## 故障排查

### Pod 启动失败

```bash
# 查看 Pod 事件
kubectl describe pod <pod-name> -n devguard-prod

# 查看容器日志
kubectl logs <pod-name> -n devguard-prod --previous
```

### 服务无法访问

```bash
# 检查 Service
kubectl get svc -n devguard-prod
kubectl describe svc devguard-api -n devguard-prod

# 检查 Endpoints
kubectl get endpoints -n devguard-prod

# 检查 Ingress
kubectl describe ingress devguard -n devguard-prod
```

### 数据库连接失败

```bash
# 进入 API Pod 测试连接
kubectl exec -it deployment/devguard-api -n devguard-prod -- sh
python -c "from devguard.database import engine; print(engine.url)"

# 检查 PostgreSQL
kubectl logs statefulset/postgres -n devguard-prod
```

## 安全加固

### Network Policy

已配置 Network Policy，限制 Pod 间通信：

```yaml
# 仅允许 Ingress 访问 API
# 仅允许 API 访问数据库和 Redis
# 禁止其他命名空间访问
```

### RBAC

已配置最小权限 RBAC：

```bash
# 查看权限
kubectl describe role devguard -n devguard-prod
kubectl describe rolebinding devguard -n devguard-prod
```

### Secret 管理

建议使用外部 Secret 管理：

```bash
# 使用 External Secrets Operator
# 或使用 HashiCorp Vault
```

## 清理资源

```bash
# 删除开发环境
kustomize build overlays/dev | kubectl delete -f -

# 删除生产环境
kustomize build overlays/prod | kubectl delete -f -

# 删除命名空间 (谨慎!)
kubectl delete namespace devguard-prod
```

## 常见问题

### Q: 如何查看资源使用情况？

```bash
kubectl top pods -n devguard-prod
kubectl top nodes
```

### Q: 如何调试 API 问题？

```bash
# 进入 Pod
kubectl exec -it deployment/devguard-api -n devguard-prod -- sh

# 运行 Python 命令
python -m devguard.main --debug
```

### Q: 如何更新 ConfigMap？

```bash
kubectl create configmap devguard-config \
  --from-literal=LOG_LEVEL=DEBUG \
  -n devguard-prod \
  --dry-run=client -o yaml | kubectl apply -f -

# 重启 Pod 使配置生效
kubectl rollout restart deployment/devguard-api -n devguard-prod
```

## 参考资料

- [Kubernetes 官方文档](https://kubernetes.io/docs/)
- [Kustomize 文档](https://kustomize.io/)
- [Nginx Ingress 控制器](https://kubernetes.github.io/ingress-nginx/)
- [cert-manager 文档](https://cert-manager.io/docs/)
