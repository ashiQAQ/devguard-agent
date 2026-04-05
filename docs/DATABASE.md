# DevGuard Agent 数据库配置指南

## 支持的数据库

| 数据库 | 配置示例 | 用途 |
|--------|----------|------|
| **MySQL** | `mysql+pymysql://root:root@localhost:3306/devguard` | 生产环境 |
| **SQLite** | `sqlite:////path/to/devguard.db` | 开发环境 |
| **PostgreSQL** | `postgresql://user:pass@localhost:5432/devguard` | 生产环境 |

## MySQL 快速开始

### 1. 安装 MySQL（如果未安装）

```bash
# macOS
brew install mysql
brew services start mysql

# Ubuntu
sudo apt install mysql-server
sudo systemctl start mysql
```

### 2. 配置 MySQL

```bash
# 登录 MySQL
mysql -u root -p

# 创建数据库
CREATE DATABASE devguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 退出
EXIT;
```

### 3. 导入初始化脚本

```bash
# 进入项目目录
cd /Users/fengxinfeng/.qclaw/workspace/aa/devguard-agent

# 导入 SQL（根据实际情况修改用户名密码）
mysql -u root -p devguard < backend/python/devguard/database/init.sql
```

### 4. 配置 .env 文件

```bash
# 复制示例配置
cp backend/python/.env.example backend/python/.env

# 编辑配置（确保 DATABASE_URL 正确）
vim backend/python/.env
```

`.env 文件内容：
```bash
DATABASE_URL=mysql+pymysql://root:root@localhost:3306/devguard
AI_PROVIDER=mock
```

### 5. 安装依赖

```bash
cd backend/python
./venv/bin/pip install pymysql cryptography
```

### 6. 启动后端

```bash
cd backend/python
./venv/bin/uvicorn devguard.api.app:app --host 0.0.0.0 --port 8000 --reload
```

## 从 SQLite 迁移数据

如果已有 SQLite 数据，可以导出后导入 MySQL：

```bash
# 1. 导出 SQLite 数据
sqlite3 data/devguard.db ".dump" > sqlite_dump.sql

# 2. 转换为 MySQL 格式（需要手动处理一些语法差异）

# 3. 导入 MySQL
mysql -u root -p devguard < sqlite_dump.sql
```

## 常见问题

### 连接被拒绝

```bash
# 检查 MySQL 是否运行
lsof -i :3306

# 启动 MySQL（macOS）
brew services start mysql

# 或（Ubuntu）
sudo systemctl start mysql
```

### 权限问题

```bash
# 登录 MySQL 并授权
mysql -u root -p

GRANT ALL PRIVILEGES ON devguard.* TO 'root'@'localhost';
FLUSH PRIVILEGES;
```

## 数据库文件

| 文件 | 说明 |
|------|------|
| `backend/python/devguard/database/init.sql` | MySQL 建表脚本 |
| `backend/python/devguard/database/models.py` | SQLAlchemy ORM 模型 |
| `data/devguard.db` | SQLite 数据库文件（开发用） |
| `data/devguard_dump.sql` | SQLite 完整导出 |