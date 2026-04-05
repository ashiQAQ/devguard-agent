#!/usr/bin/env python3
"""
数据库初始化脚本
用法: python setup-db.py [--create-db] [--init-tables] [--seed]

选项:
  --create-db   创建 devguard 数据库（如不存在）
  --init-tables 创建所有表
  --seed        插入测试数据
  --all         执行全部（默认）
"""
import sys
import argparse
import pymysql

# 数据库配置
DB_HOST = "localhost"
DB_PORT = 3306
DB_USER = "root"
DB_PASS = "Abc123456Abc123456"
DB_NAME = "devguard"


def create_database():
    """创建 devguard 数据库"""
    conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS, charset="utf8mb4")
    try:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            print(f"✅ 数据库 '{DB_NAME}' 就绪")
    finally:
        conn.close()


def init_tables():
    """通过 SQLAlchemy 创建所有表"""
    import os
    os.environ.setdefault("DATABASE_URL", f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4")
    
    from devguard.database.models import Base
    from devguard.database.session import engine
    from sqlalchemy import inspect
    
    print("📋 检查并创建所有表...")
    Base.metadata.create_all(bind=engine)
    
    # 检查 requirements 表是否缺少新字段，补上 ALTER
    conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS, database=DB_NAME, charset="utf8mb4")
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM requirements")
            existing_cols = {row[0] for row in cur.fetchall()}
            missing = []
            for col, col_type in [
                ("prev_req_id", "VARCHAR(36) DEFAULT NULL"),
                ("next_req_id", "VARCHAR(36) DEFAULT NULL"),
                ("created_seq", "INT DEFAULT 0"),
            ]:
                if col not in existing_cols:
                    cur.execute(f"ALTER TABLE requirements ADD COLUMN {col} {col_type}")
                    missing.append(col)
            if missing:
                print(f"   ➕ requirements 表补充字段: {missing}")
    finally:
        conn.close()
    
    # 列出已创建的表
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"✅ {len(tables)} 张表就绪:")
    for t in tables:
        print(f"   - {t}")


def seed_data():
    """插入测试数据"""
    import os
    os.environ.setdefault("DATABASE_URL", f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4")
    
    from devguard.database.session import SessionLocal
    from devguard.database.models import Requirement, RequirementDoc
    from datetime import datetime
    import uuid
    
    db = SessionLocal()
    try:
        # 检查是否已有数据
        count = db.query(Requirement).count()
        if count > 0:
            print(f"⚠️  数据库已有 {count} 条需求，跳过测试数据插入")
            return
        
        # 检查文档是否已存在（init.sql 可能已插入）
        doc_count = db.query(RequirementDoc).count()
        
        # 插入测试文档（仅当不存在时）
        docs = [
            RequirementDoc(
                id=str(uuid.uuid4()),
                doc_id="DOC-2026-001",
                title="L3自动驾驶系统需求规范 v2.1",
                description="支持高速公路场景的L3级别自动驾驶系统完整需求规范",
                content="# L3自动驾驶系统需求规范\n\n## 功能需求\n\n**BR-2026-001**: 系统应能在0-130km/h范围内自动维持设定车速\n\n**BR-2026-002**: 系统应能自动跟随前车，保持安全跟车距离",
                doc_type="SRS",
                status="archived",
                author="自动驾驶架构组",
            ),
            RequirementDoc(
                id=str(uuid.uuid4()),
                doc_id="DOC-2026-002",
                title="感知系统接口需求规范 v1.3",
                description="定义感知系统与规划控制模块之间的数据接口规范",
                content="# 感知系统接口需求规范\n\n## 目标检测接口\n\n**IR-2026-001**: 感知系统应以10Hz频率输出目标列表",
                doc_type="ICD",
                status="archived",
                author="感知算法组",
            ),
        ]
        if doc_count == 0:
            db.add_all(docs)
        
        # 插入测试需求
        reqs = [
            Requirement(
                id=str(uuid.uuid4()),
                req_id="BR-2026-001",
                title="自动车速维持",
                description="系统应能在0-130km/h范围内自动维持设定车速",
                content="## 功能描述\n\n当驾驶员开启自动驾驶模式后，系统应能根据设定的目标车速自动控制车辆纵向运动，使实际车速保持在设定值的±2km/h范围内。",
                req_type="BUSINESS",
                priority="P0",
                module="动力控制",
                asil="B",
                status="confirmed",
                source="manual",
                created_seq=1,
            ),
            Requirement(
                id=str(uuid.uuid4()),
                req_id="BR-2026-002",
                title="安全跟车距离",
                description="系统应能自动跟随前车，保持安全跟车距离",
                content="## 功能描述\n\n当检测到前方有车辆时，系统应自动控制本车速度，保持与前车的安全跟车距离。安全距离按 TTC（碰撞时间）模型计算。",
                req_type="BUSINESS",
                priority="P0",
                module="动力控制",
                asil="B",
                status="in_progress",
                source="manual",
                created_seq=2,
            ),
            Requirement(
                id=str(uuid.uuid4()),
                req_id="TR-2026-001",
                title="目标检测延迟",
                description="感知系统目标检测端到端延迟不超过100ms",
                content="## 性能指标\n\n从传感器原始数据输入到目标列表输出的全链路延迟不超过100ms（99分位）。",
                req_type="TECHNICAL",
                priority="P1",
                module="感知",
                asil="B",
                status="pending",
                source="manual",
                created_seq=3,
            ),
        ]
        db.add_all(reqs)
        db.commit()
        
        # 建立需求链（prev → next）
        reqs[0].next_req_id = reqs[1].id
        reqs[1].prev_req_id = reqs[0].id
        reqs[1].next_req_id = reqs[2].id
        reqs[2].prev_req_id = reqs[1].id
        db.commit()
        
        print(f"✅ 已插入 {len(docs)} 份文档 + {len(reqs)} 条需求")
        
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DevGuard 数据库初始化")
    parser.add_argument("--create-db", action="store_true", help="创建数据库")
    parser.add_argument("--init-tables", action="store_true", help="创建所有表")
    parser.add_argument("--seed", action="store_true", help="插入测试数据")
    parser.add_argument("--all", action="store_true", help="执行全部")
    args = parser.parse_args()
    
    # 默认执行全部
    do_all = args.all or not any([args.create_db, args.init_tables, args.seed])
    
    print("🚀 DevGuard 数据库初始化\n")
    
    if do_all or args.create_db:
        create_database()
    
    if do_all or args.init_tables:
        init_tables()
    
    if do_all or args.seed:
        seed_data()
    
    print("\n✅ 初始化完成！")
    print(f"   数据库: mysql://{DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}")
    print(f"   API:    http://localhost:8000/api/requirements/list")
