#!/usr/bin/env python3
"""
启动脚本
"""

import sys
import os
import subprocess

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def check_dependencies():
    """检查依赖是否安装"""
    print("检查 Python 依赖...")
    
    try:
        import fastapi
        import sqlalchemy
        import pydantic
        import aiohttp
        import uvicorn
        print("  ✅ 所有 Python 依赖已安装")
        return True
    except ImportError as e:
        print(f"  ❌ 缺少依赖: {e}")
        print("  请运行: pip install -r requirements.txt")
        return False


def init_database():
    """初始化数据库"""
    print("初始化数据库...")
    
    try:
        from devguard.database.session import init_db
        init_db()
        print("  ✅ 数据库初始化完成")
        return True
    except Exception as e:
        print(f"  ❌ 数据库初始化失败: {e}")
        return False


def start_api_server(host="0.0.0.0", port=8000, reload=False):
    """启动 API 服务"""
    print(f"启动 API 服务: http://{host}:{port}")
    print(f"API 文档: http://{host}:{port}/docs")
    print(f"Swagger: http://{host}:{port}/swagger")
    print("")
    
    try:
        import uvicorn
        from devguard.api.app import app
        
        uvicorn.run(
            app,
            host=host,
            port=port,
            reload=reload,
            log_level="info",
        )
    except KeyboardInterrupt:
        print("\n服务已停止")
    except Exception as e:
        print(f"服务启动失败: {e}")
        return False
    
    return True


def start_worker():
    """启动后台工作进程"""
    print("启动后台工作进程...")
    
    try:
        # TODO: 实现后台 worker
        print("  ⚠️  Worker 功能待实现")
        return True
    except Exception as e:
        print(f"Worker 启动失败: {e}")
        return False


def check_cpp_engine():
    """检查 C++ 引擎"""
    print("检查 C++ 引擎...")
    
    try:
        import socket
        from devguard.config import settings
        
        host = settings.CPP_ENGINE_HOST
        port = settings.CPP_ENGINE_PORT
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex((host, port))
        sock.close()
        
        if result == 0:
            print(f"  ✅ C++ 引擎已就绪 ({host}:{port})")
            return True
        else:
            print(f"  ⚠️  C++ 引擎未运行 ({host}:{port})")
            print("  请运行: cd ../cpp && mkdir build && cd build && cmake .. && make")
            return False
    except Exception as e:
        print(f"  ⚠️  C++ 引擎检查失败: {e}")
        return False


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="DevGuard Agent 启动脚本")
    parser.add_argument("--host", default="0.0.0.0", help="API 服务地址")
    parser.add_argument("--port", type=int, default=8000, help="API 服务端口")
    parser.add_argument("--reload", action="store_true", help="启用热重载")
    parser.add_argument("--init-db", action="store_true", help="初始化数据库")
    parser.add_argument("--check", action="store_true", help="仅检查依赖")
    parser.add_argument("--worker", action="store_true", help="启动后台 Worker")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("DevGuard Agent v2.4.0")
    print("=" * 60)
    print("")
    
    # 检查依赖
    if not check_dependencies():
        sys.exit(1)
    
    # 检查 C++ 引擎
    check_cpp_engine()
    print("")
    
    # 初始化数据库
    if args.init_db:
        init_database()
        print("")
    
    # 仅检查
    if args.check:
        print("检查完成")
        sys.exit(0)
    
    # 启动 Worker
    if args.worker:
        start_worker()
        sys.exit(0)
    
    # 启动 API 服务
    start_api_server(args.host, args.port, args.reload)


if __name__ == "__main__":
    main()
