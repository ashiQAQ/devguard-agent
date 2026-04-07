# DevGuard Agent 启动手册 - macOS

> AI 驱动的全链路开发质量守护系统

---

## 1. 环境要求

| 依赖 | 版本要求 |
|------|----------|
| Python | 3.9+ |
| Node.js | 16+ |
| MySQL | 5.7+ / 8.0+ |

### 安装依赖（Homebrew）

```bash
# 安装 Homebrew（如未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Python
brew install python@3.9

# 安装 Node.js
brew install node

# 安装 MySQL
brew install mysql
brew services start mysql
```

### 验证安装

```bash
python3.9 --version
node --version
npm --version
mysql --version
```

---

## 2. 数据库配置

### 2.1 创建数据库

```bash
# 登录 MySQL
mysql -u root -p
```

```sql
CREATE DATABASE devguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

### 2.2 导入表结构

```bash
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/backend/python/devguard/database
mysql -u root -p devguard < init.sql
```

### 2.3 配置 .env

编辑 `backend/python/.env`：

```bash
# 数据库
DATABASE_URL=mysql+pymysql://root:你的密码@localhost:3306/devguard?charset=utf8mb4

# AI 配置
AI_PROVIDER=mock
AI_API_KEY=
AI_MODEL=gpt-4o
```

---

## 3. 后端启动

### 3.1 创建虚拟环境

```bash
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/backend/python

# 创建虚拟环境
python3.9 -m venv venv

# 激活
source venv/bin/activate
```

### 3.2 安装依赖

```bash
pip install -r requirements.txt
pip install pymysql cryptography
```

### 3.3 启动服务

```bash
# 开发模式
uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000 --reload

# 后台运行
nohup ./venv/bin/uvicorn devguard.api.app:app \
    --host 0.0.0.0 --port 8000 --reload \
    > /tmp/devguard-backend.log 2>&1 &
```

### 3.4 验证

```bash
curl http://localhost:8000/api/req-docs/docs
open http://localhost:8000/docs
```

---

## 4. 前端启动

### 4.1 安装依赖

```bash
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/frontend
npm install
```

### 4.2 启动服务

```bash
# 开发模式
npm run dev

# 或指定端口
npx vite --port 3000

# 后台运行
nohup npx vite --port 3000 > /tmp/devguard-frontend.log 2>&1 &
```

### 4.3 访问

```bash
open http://localhost:3000
```

---

## 5. 一键启动脚本

### `start.sh`

```bash
#!/bin/bash
# DevGuard Agent 一键启动脚本 (macOS)

PROJECT=/Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent

echo "=============================================="
echo "  DevGuard Agent 启动中..."
echo "=============================================="

# 检查 MySQL
echo "检查 MySQL..."
if lsof -i :3306 2>/dev/null | grep -q LISTEN; then
    echo "MySQL 运行中"
else
    echo "启动 MySQL..."
    brew services start mysql
    sleep 3
fi

# 停止旧进程
pkill -f "uvicorn devguard" 2>/dev/null
pkill -f "vite.*3000" 2>/dev/null
sleep 1

# 启动后端
echo "启动后端..."
cd $PROJECT/backend/python
nohup ./venv/bin/uvicorn devguard.api.app:app \
    --host 0.0.0.0 --port 8000 --reload \
    > /tmp/devguard-backend.log 2>&1 &
BACKEND_PID=$!
echo "后端已启动 (PID: $BACKEND_PID)"

sleep 3

# 启动前端
echo "启动前端..."
cd $PROJECT/frontend
nohup npx vite --port 3000 > /tmp/devguard-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "前端已启动 (PID: $FRONTEND_PID)"

sleep 3

echo ""
echo "=============================================="
echo "  启动完成！"
echo "=============================================="
echo ""
echo "访问地址:"
echo "  前端:     http://localhost:3000"
echo "  后端 API: http://localhost:8000"
echo "  API 文档: http://localhost:8000/docs"
echo ""
echo "日志文件:"
echo "  后端: /tmp/devguard-backend.log"
echo "  前端: /tmp/devguard-frontend.log"
echo ""
echo "停止服务:"
echo "  pkill -f 'uvicorn devguard'"
echo "  pkill -f 'vite.*3000'"
```

### 停止脚本 `stop.sh`

```bash
#!/bin/bash
pkill -f "uvicorn devguard"
pkill -f "vite.*3000"
echo "DevGuard Agent 已停止"
```

---

## 6. LaunchAgent 配置（开机自启）

### 后端服务 `~/Library/LaunchAgents/com.devguard.backend.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.devguard.backend</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/backend/python/venv/bin/uvicorn</string>
        <string>devguard.api.app:app</string>
        <string>--host</string>
        <string>0.0.0.0</string>
        <string>--port</string>
        <string>8000</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/backend/python</string>
    <key>StandardOutPath</key>
    <string>/tmp/devguard-backend.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/devguard-backend.log</string>
</dict>
</plist>
```

### 加载服务

```bash
launchctl load ~/Library/LaunchAgents/com.devguard.backend.plist
launchctl start com.devguard.backend
```

---

## 7. 常见问题

### Q: Homebrew 安装慢

```bash
# 使用国内镜像
export HOMEBREW_BREW_GIT_REMOTE="https://mirrors.ustc.edu.cn/brew.git"
export HOMEBREW_CORE_GIT_REMOTE="https://mirrors.ustc.edu.cn/homebrew-core.git"
brew update
```

### Q: pip 安装慢

```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### Q: npm 安装慢

```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### Q: MySQL root 密码

```bash
# 首次安装无密码
mysql -u root

# 设置密码
ALTER USER 'root'@'localhost' IDENTIFIED BY 'your_password';
FLUSH PRIVILEGES;
```

### Q: 端口被占用

```bash
# 查看
lsof -i :8000
lsof -i :3000

# 结束
kill -9 <PID>
```

### Q: Apple Silicon M1/M2 问题

```bash
# 安装 x86_64 版本（如需要）
arch -x86_64 /usr/local/bin/brew install mysql

# 或使用原生 ARM 版本
brew install mysql
```

---

## 快速命令参考

```bash
# 后端
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/backend/python
source venv/bin/activate
uvicorn devguard.api.app:app --port 8000 --reload

# 前端
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent/frontend
npm run dev

# 数据库
mysql -u root -p devguard < backend/python/devguard/database/init.sql

# MySQL 服务
brew services start mysql
brew services stop mysql
brew services restart mysql
```

---

*文档版本: v2.4.0 | 平台: macOS*
