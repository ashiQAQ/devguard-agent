"""
文档文件处理模块
支持 .docx 文件的加载、解析和保存
"""

import os
import io
import logging
import subprocess
from typing import Optional, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

# 文档存储目录
DOCS_DIR = os.path.expanduser("~/.devguard/docs")
os.makedirs(DOCS_DIR, exist_ok=True)


def extract_text_from_docx(file_path: str) -> str:
    """
    从 .docx 文件提取纯文本
    
    Args:
        file_path: .docx 文件路径
    
    Returns:
        提取的文本内容
    """
    try:
        import zipfile
        from xml.etree import ElementTree as ET
        
        ns = {
            'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        }
        
        with zipfile.ZipFile(file_path, 'r') as z:
            with z.open('word/document.xml') as f:
                tree = ET.parse(f)
                root = tree.getroot()
        
        paragraphs = []
        for para in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
            texts = []
            for t in para.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
                if t.text:
                    texts.append(t.text)
            if texts:
                paragraphs.append(''.join(texts))
        
        return '\n\n'.join(paragraphs)
    
    except Exception as e:
        logger.error(f"提取 docx 文本失败: {e}")
        raise


def extract_text_from_docx_pandoc(file_path: str) -> str:
    """
    使用 pandoc 提取 docx 文本（保留更多格式信息）
    """
    try:
        result = subprocess.run(
            ['pandoc', '--from', 'docx', '--to', 'plain', file_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            return result.stdout
        else:
            raise Exception(result.stderr)
    except FileNotFoundError:
        logger.warning("pandoc 未安装，使用备用方法")
        return extract_text_from_docx(file_path)


def docx_to_markdown(file_path: str) -> str:
    """
    将 docx 转换为 Markdown
    """
    try:
        result = subprocess.run(
            ['pandoc', '--from', 'docx', '--to', 'markdown', file_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            return result.stdout
        else:
            raise Exception(result.stderr)
    except FileNotFoundError:
        logger.warning("pandoc 未安装")
        return extract_text_from_docx(file_path)


def save_uploaded_file(content: bytes, filename: str, doc_id: str = None) -> str:
    """
    保存上传的文件
    
    Args:
        content: 文件内容
        filename: 原始文件名
        doc_id: 关联的文档 ID
    
    Returns:
        保存后的文件路径
    """
    # 确定目录
    if doc_id:
        subdir = os.path.join(DOCS_DIR, doc_id)
    else:
        subdir = os.path.join(DOCS_DIR, 'uploads')
    
    os.makedirs(subdir, exist_ok=True)
    
    # 生成安全文件名
    safe_name = os.path.basename(filename)
    file_path = os.path.join(subdir, safe_name)
    
    # 如果文件已存在，添加序号
    if os.path.exists(file_path):
        name, ext = os.path.splitext(safe_name)
        counter = 1
        while os.path.exists(file_path):
            file_path = os.path.join(subdir, f"{name}_{counter}{ext}")
            counter += 1
    
    with open(file_path, 'wb') as f:
        f.write(content)
    
    logger.info(f"文件已保存: {file_path}")
    return file_path


def list_doc_files(doc_id: str = None) -> list:
    """
    列出文档文件
    
    Args:
        doc_id: 可选，列出特定文档的文件
    
    Returns:
        文件列表
    """
    if doc_id:
        directory = os.path.join(DOCS_DIR, doc_id)
    else:
        directory = DOCS_DIR
    
    if not os.path.exists(directory):
        return []
    
    files = []
    for root, dirs, filenames in os.walk(directory):
        for filename in filenames:
            if filename.endswith(('.docx', '.doc', '.md')):
                full_path = os.path.join(root, filename)
                stat = os.stat(full_path)
                files.append({
                    'name': filename,
                    'path': full_path,
                    'size': stat.st_size,
                    'modified': stat.st_mtime,
                })
    
    return sorted(files, key=lambda x: x['modified'], reverse=True)


def read_file_content(file_path: str, as_text: bool = True) -> str:
    """
    读取文件内容
    
    Args:
        file_path: 文件路径
        as_text: True 返回文本，False 返回二进制
    
    Returns:
        文件内容
    """
    if as_text:
        if file_path.endswith('.docx'):
            return docx_to_markdown(file_path)
        else:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
    else:
        with open(file_path, 'rb') as f:
            return f.read()


def create_docx_from_markdown(markdown_content: str, output_path: str) -> str:
    """
    从 Markdown 创建 docx 文件
    
    Args:
        markdown_content: Markdown 内容
        output_path: 输出文件路径
    
    Returns:
        生成的 docx 文件路径
    """
    try:
        # 写入临时 markdown 文件
        md_path = output_path + '.tmp.md'
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(markdown_content)
        
        # 使用 pandoc 转换
        result = subprocess.run(
            ['pandoc', '--from', 'markdown', '--to', 'docx', '-o', output_path, md_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        # 清理临时文件
        if os.path.exists(md_path):
            os.remove(md_path)
        
        if result.returncode == 0:
            logger.info(f"docx 已生成: {output_path}")
            return output_path
        else:
            raise Exception(result.stderr)
            
    except FileNotFoundError:
        raise Exception("pandoc 未安装，无法创建 docx 文件")


def get_file_info(file_path: str) -> dict:
    """获取文件信息"""
    stat = os.stat(file_path)
    return {
        'path': file_path,
        'name': os.path.basename(file_path),
        'size': stat.st_size,
        'size_mb': round(stat.st_size / 1024 / 1024, 2),
        'modified': stat.st_mtime,
        'created': stat.st_ctime,
        'extension': Path(file_path).suffix,
    }
