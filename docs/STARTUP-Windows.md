# DevGuard Agent 启动手册 - Windows

> AI 驱动的全链路开发质量守护系统，专为自动驾驶等高安全性软件项目设计。

---

## 目录

1. [环境要求](#1-环境要求)
2. [数据库配置](#2-数据库配置)
3. [后端启动](#3-后端启动)
4. [前端启动](#4-前端启动)
5. [一键启动脚本](#5-一键启动脚本)
6. [常见问题](#6-常见问题)

---

## 1. 环境要求

| 依赖 | 版本要求 | 下载地址 |
|------|----------|----------|
| Python | 3.9+ | https://www.python.org/downloads/ |
| Node.js | 16+ | https://nodejs.org/ |
| MySQL | 5.7+ / 8.0+ | https://dev.mysql.com/downloads/mysql/ |

### 1.1 安装 Python

1. 下载 Python 安装包，**勾选 "Add Python to PATH"**
2. 打开 PowerShell 验证：
   ```powershell
   python --version
   pip --version
   ```

### 1.2 安装 Node.js

1. 下载 LTS 版本安装包
2. 验证：
   ```powershell
   node --version
   npm --version
   ```

### 1.3 安装 MySQL

1. 下载 MySQL Installer
2. 选择 "Developer Default" 或 "Server only"
3. 设置 root 密码（记住此密码）
4. 完成后验证：
   ```powershell
   mysql -u root -p
   ```

---

## 2. 数据库配置

### 2.1 创建数据库

```powershell
# 登录 MySQL
mysql -u root -p

# 创建数据库
CREATE DATABASE devguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 退出
EXIT;
```

### 2.2 导入表结构

```powershell
cd C:\devguard-agent\backend\python\devguard\database
mysql -u root -p devguard < init.sql
```

### 2.3 配置 .env

编辑 `backend\python\.env`：

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

```powershell
cd C:\devguard-agent\backend\python

# 创建虚拟环境
python -m venv venv

# 激活（PowerShell）
.\venv\Scripts\Activate.ps1

# 激活（CMD）
venv\Scripts\activate.bat
```

如果 PowerShell 报错执行策略，运行：
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 3.2 安装依赖

```powershell
# 激活虚拟环境后
pip install -r requirements.txt
pip install pymysql cryptography
```

### 3.3 启动服务

```powershell
# 激活虚拟环境
.\venv\Scripts\Activate.ps1

# 启动后端
uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000 --reload
```

### 3.4 验证

```powershell
# 访问 API 文档
start http://localhost:8000/docs

# 或用 curl
curl http://localhost:8000/api/req-docs/docs
```

---

## 4. 前端启动

### 4.1 安装依赖

```powershell
cd C:\devguard-agent\frontend

npm install
```

### 4.2 启动服务

```powershell
npm run dev

# 或指定端口
npx vite --port 3000
```

### 4.3 访问

```powershell
start http://localhost:3000
```

---

## 5. 一键启动脚本

### PowerShell 脚本 `start.ps1`

```powershell
# start.ps1 - DevGuard Agent 一键启动脚本 (Windows)

$PROJECT = "C:\devguard-agent"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  DevGuard Agent 启动中..." -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# 检查 MySQL
Write-Host "检查 MySQL..." -ForegroundColor Yellow
$mysql = Get-Process -Name mysqld -ErrorAction SilentlyContinue
if ($mysql) {
    Write-Host "MySQL 运行中" -ForegroundColor Green
} else {
    Write-Host "请先启动 MySQL 服务" -ForegroundColor Red
    Write-Host "在服务管理器中启动 MySQL 或运行: net start mysql" -ForegroundColor Yellow
    exit 1
}

# 停止旧进程
Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*uvicorn*" } | Stop-Process -Force
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*vite*" } | Stop-Process -Force
Start-Sleep -Seconds 1

# 启动后端
Write-Host ""
Write-Host "启动后端..." -ForegroundColor Yellow
Set-Location "$PROJECT\backend\python"
Start-Process -FilePath ".\venv\Scripts\python.exe" `
    -ArgumentList "-m", "uvicorn", "devguard.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--reload" `
    -WindowStyle Minimized
Write-Host "后端已启动" -ForegroundColor Green

Start-Sleep -Seconds 3

# 启动前端
Write-Host ""
Write-Host "启动前端..." -ForegroundColor Yellow
Set-Location "$PROJECT\frontend"
Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WindowStyle Minimized
Write-Host "前端已启动" -ForegroundColor Green

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  启动完成！" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "访问地址:" -ForegroundColor White
Write-Host "  前端:     http://localhost:3000" -ForegroundColor Cyan
Write-Host "  后端 API: http://localhost:8000" -ForegroundColor Cyan
Write-Host "  API 文档: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "停止服务:" -ForegroundColor White
Write-Host "  关闭终端窗口或运行: stop.ps1" -ForegroundColor Yellow
```

### 执行脚本

```powershell
# 首次需要允许执行策略
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 运行启动脚本
.\start.ps1
```

### 停止脚本 `stop.ps1`

```powershell
# 停止后端
Get-Process -Name python -ErrorAction SilentlyContinue | 
    Where-Object { $_.CommandLine -like "*uvicorn*" } | 
    Stop-Process -Force

# 停止前端
Get-Process -Name node -ErrorAction SilentlyContinue | 
    Where-Object { $_.CommandLine -like "*vite*" } | 
    Stop-Process -Force

Write-Host "DevGuard Agent 已停止" -ForegroundColor Green
```

---

## 6. 常见问题

### Q: pip 安装速度慢

```powershell
# 使用国内镜像
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### Q: npm 安装速度慢

```powershell
# 使用淘宝镜像
npm config set registry https://registry.npmmirror.com
npm install
```

### Q: MySQL 连接被拒绝

```powershell
# 检查 MySQL 服务状态
Get-Service MySQL*

# 启动 MySQL 服务
net start MySQL80
```

### Q: PowerShell 执行策略错误

```powershell
# 设置当前用户执行策略
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Q: 端口被占用

```powershell
# 查看端口占用
netstat -ano | findstr :8000
netstat -ano | findstr :3000

# 结束进程（PID 从上一步获取）
taskkill /PID <PID> /F
```

---

## 快速命令参考

```powershell
# 后端
cd C:\devguard-agent\backend\python
.\venv\Scripts\Activate.ps1
uvicorn devguard.api.app:app --port 8000 --reload

# 前端
cd C:\devguard-agent\frontend
npm run dev

# 数据库
mysql -u root -p devguard < init.sql
```

---

*文档版本: v2.4.0 | 平台: Windows*
