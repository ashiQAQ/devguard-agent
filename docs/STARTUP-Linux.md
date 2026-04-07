# DevGuard Agent 启动手册 - Linux

> AI 驱动的全链路开发质量守护系统

---

## 1. 环境要求

| 依赖 | 版本要求 |
|------|----------|
| Python | 3.9+ |
| Node.js | 16+ |
| MySQL | 5.7+ / 8.0+ |

### Ubuntu/Debian 安装

```bash
# Python
sudo apt update
sudo apt install python3.9 python3.9-venv python3-pip -y

# Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs -y

# MySQL
sudo apt install mysql-server -y
sudo systemctl start mysql
```

### CentOS/RHEL 安装

```bash
# Python
sudo yum install python39 python39-pip -y

# Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install nodejs -y

# MySQL
sudo yum install mysql-server -y
sudo systemctl start mysqld
```

---

## 2. 数据库配置

```bash
# 创建数据库
mysql -u root -p
```

```sql
CREATE DATABASE devguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'devguard'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON devguard.* TO 'devguard'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

```bash
# 导入表结构
cd /opt/devguard-agent/backend/python/devguard/database
mysql -u devguard -p devguard < init.sql
```

---

## 3. 后端启动

```bash
cd /opt/devguard-agent/backend/python

# 创建虚拟环境
python3.9 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
pip install pymysql cryptography

# 启动
uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000 --reload
```

---

## 4. 前端启动

```bash
cd /opt/devguard-agent/frontend

npm install
npm run dev
```

---

## 5. 一键启动脚本

```bash
#!/bin/bash
# start.sh

PROJECT=/opt/devguard-agent

# 检查 MySQL
if ! systemctl is-active --quiet mysql; then
    sudo systemctl start mysql
fi

# 停止旧进程
pkill -f "uvicorn devguard" 2>/dev/null
pkill -f "vite.*3000" 2>/dev/null
sleep 1

# 启动后端
cd $PROJECT/backend/python
source venv/bin/activate
nohup uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000 \
    > /var/log/devguard-backend.log 2>&1 &
echo "后端已启动"

# 启动前端
cd $PROJECT/frontend
nohup npx vite --port 3000 > /var/log/devguard-frontend.log 2>&1 &
echo "前端已启动"

echo "访问: http://localhost:3000"
```

---

## 6. Systemd 服务配置

`/etc/systemd/system/devguard-backend.service`:

```ini
[Unit]
Description=DevGuard Agent Backend
After=network.target mysql.service

[Service]
Type=simple
User=devguard
WorkingDirectory=/opt/devguard-agent/backend/python
ExecStart=/opt/devguard-agent/backend/python/venv/bin/uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable devguard-backend
sudo systemctl start devguard-backend
```

---

## 7. 常见问题

**端口被占用：**
```bash
lsof -i :8000
kill -9 <PID>
```

**MySQL 连接失败：**
```bash
sudo systemctl status mysql
sudo ufw allow 3306/tcp
```

---

*文档版本: v2.4.0 | 平台: Linux*
