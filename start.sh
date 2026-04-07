#!/bin/bash
# DevGuard Agent 一键启动脚本

PROJECT=/Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent

echo "=============================================="
echo "  DevGuard Agent 启动中..."
echo "=============================================="
echo ""

# 检查 MySQL
echo "🔍 检查 MySQL..."
if lsof -i :3306 2>/dev/null | grep -q LISTEN; then
  echo "✅ MySQL 运行中"
else
  echo "⚠️  MySQL 未运行，尝试启动..."
  brew services start mysql 2>/dev/null || echo "请手动启动 MySQL"
  sleep 2
fi

# 停止旧进程
pkill -f "uvicorn devguard" 2>/dev/null
pkill -f "vite.*3000" 2>/dev/null
sleep 1

# 启动后端
echo ""
echo "🚀 启动后端..."
cd $PROJECT/backend/python
nohup ./venv/bin/uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000 --reload \
  > /tmp/devguard-backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ 后端已启动 (PID: $BACKEND_PID)"

# 等待后端就绪
sleep 3
if curl -s http://localhost:8000/api/req-docs/docs > /dev/null 2>&1; then
  echo "✅ 后端 API 正常"
else
  echo "⚠️  后端启动中，请稍候..."
fi

# 启动前端
echo ""
echo "🚀 启动前端..."
cd $PROJECT/frontend
nohup npx vite --port 3000 > /tmp/devguard-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ 前端已启动 (PID: $FRONTEND_PID)"

sleep 3

echo ""
echo "=============================================="
echo "  ✅ DevGuard Agent 启动完成！"
echo "=============================================="
echo ""
echo "🌐 访问地址:"
echo "   前端:     http://localhost:3000"
echo "   后端 API: http://localhost:8000"
echo "   API 文档: http://localhost:8000/docs"
echo ""
echo "📋 日志文件:"
echo "   后端: /tmp/devguard-backend.log"
echo "   前端: /tmp/devguard-frontend.log"
echo ""
echo "🛑 停止服务:"
echo "   pkill -f 'uvicorn devguard'"
echo "   pkill -f 'vite.*3000'"
echo "=============================================="
