"""
GitHub Webhook 处理器
"""

from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import hmac
import hashlib
import logging
import asyncio
import json

from devguard.flows.flow_b import FlowB

logger = logging.getLogger(__name__)

router = APIRouter()


class GitHubWebhookEvent(BaseModel):
    """GitHub Webhook 事件"""
    action: str
    number: int
    pull_request: Dict[str, Any]
    repository: Dict[str, Any]


class GitHubCommit(BaseModel):
    """GitHub Commit"""
    id: str
    message: str
    author: Dict[str, Any]


async def verify_github_signature(
    payload: bytes,
    signature: str,
    secret: str
) -> bool:
    """验证 GitHub Webhook 签名"""
    if not signature:
        return False
    
    # 获取签名算法和哈希值
    if signature.startswith("sha256="):
        algorithm = "sha256"
        hash_value = signature[7:]
    elif signature.startswith("sha1="):
        algorithm = "sha1"
        hash_value = signature[5:]
    else:
        return False
    
    # 计算 HMAC
    if algorithm == "sha256":
        mac = hmac.new(
            key=secret.encode(),
            msg=payload,
            digestmod=hashlib.sha256
        ).hexdigest()
    else:
        mac = hmac.new(
            key=secret.encode(),
            msg=payload,
            digestmod=hashlib.sha1
        ).hexdigest()
    
    return hmac.compare_digest(mac, hash_value)


async def get_pr_commits(
    owner: str,
    repo: str,
    pr_number: int,
    github_token: str
) -> List[Dict[str, Any]]:
    """获取 PR 的 commits"""
    import aiohttp
    
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}/commits"
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as resp:
            if resp.status == 200:
                return await resp.json()
            else:
                logger.error(f"获取 commits 失败: {resp.status}")
                return []


async def get_pr_details(
    owner: str,
    repo: str,
    pr_number: int,
    github_token: str
) -> Dict[str, Any]:
    """获取 PR 详情"""
    import aiohttp
    
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as resp:
            if resp.status == 200:
                return await resp.json()
            else:
                logger.error(f"获取 PR 详情失败: {resp.status}")
                return {}


async def post_pr_comment(
    owner: str,
    repo: str,
    pr_number: int,
    body: str,
    github_token: str
) -> bool:
    """在 PR 下发评论"""
    import aiohttp
    
    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{pr_number}/comments"
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
    }
    data = {"body": body}
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=data) as resp:
            if resp.status == 201:
                logger.info(f"PR 评论已下发: #{pr_number}")
                return True
            else:
                logger.error(f"PR 评论下发失败: {resp.status}")
                return False


@router.post("/github/webhook")
async def handle_github_webhook(
    request: Request,
    x_github_event: str = Header(None),
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_delivery: Optional[str] = Header(None),
):
    """
    处理 GitHub Webhook 事件
    
    支持的事件:
    - pull_request: PR 创建/更新
    - push: 代码推送
    """
    logger.info(f"收到 GitHub Webhook: {x_github_event}")
    
    try:
        # 获取请求体
        payload = await request.body()
        body = await request.json()
        
        # 验证签名 (生产环境应该验证)
        # github_secret = os.getenv("GITHUB_WEBHOOK_SECRET", "")
        # if not await verify_github_signature(payload, x_hub_signature_256, github_secret):
        #     logger.warning("GitHub Webhook 签名验证失败")
        #     raise HTTPException(status_code=401, detail="Invalid signature")
        
        # 处理不同事件
        if x_github_event == "pull_request":
            return await handle_pull_request_event(body)
        elif x_github_event == "push":
            return await handle_push_event(body)
        else:
            logger.info(f"忽略事件类型: {x_github_event}")
            return {"status": "ignored", "event": x_github_event}
    
    except Exception as e:
        logger.error(f"处理 GitHub Webhook 失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


async def handle_pull_request_event(body: Dict[str, Any]):
    """处理 PR 事件"""
    action = body.get("action", "")
    pr = body.get("pull_request", {})
    
    # 只处理打开的 PR
    if action not in ["opened", "reopened", "synchronize"]:
        logger.info(f"忽略 PR action: {action}")
        return {"status": "ignored", "action": action}
    
    pr_number = pr.get("number")
    title = pr.get("title", "")
    body_text = pr.get("body", "")
    author = pr.get("user", {}).get("login", "")
    head_branch = pr.get("head", {}).get("ref", "")
    
    repo = body.get("repository", {})
    owner = repo.get("owner", {}).get("login", "")
    repo_name = repo.get("name", "")
    
    logger.info(f"处理 PR #{pr_number}: {title}")
    
    # 获取 GitHub Token
    from devguard.config import settings
    github_token = settings.GITHUB_TOKEN
    
    # 获取 commits
    commits = await get_pr_commits(owner, repo_name, pr_number, github_token)
    
    # 构建 PR 事件
    pr_event = {
        "number": pr_number,
        "title": title,
        "description": body_text,
        "author": author,
        "branch": head_branch,
        "commits": [
            {
                "sha": commit.get("sha", ""),
                "message": commit.get("commit", {}).get("message", ""),
                "author": commit.get("commit", {}).get("author", {}).get("name", ""),
            }
            for commit in commits
        ],
        "changed_files": pr.get("changed_files", 0),
        "additions": pr.get("additions", 0),
        "deletions": pr.get("deletions", 0),
    }
    
    # 执行 Flow B 分析
    flow_b = FlowB()
    result = await flow_b.execute(pr_event)
    
    # 在 PR 下发评论
    if result.get("status") == "completed":
        comment = flow_b._generate_pr_comment()
        await post_pr_comment(owner, repo_name, pr_number, comment, github_token)
    
    return {
        "status": "success",
        "pr_number": pr_number,
        "can_merge": result.get("can_merge", False),
    }


async def handle_push_event(body: Dict[str, Any]):
    """处理 push 事件"""
    ref = body.get("ref", "")
    commits = body.get("commits", [])
    
    logger.info(f"处理 push: {ref}, {len(commits)} commits")
    
    # TODO: 分析 push 的 commits 是否需要 Flow B 处理
    
    return {"status": "success", "commits": len(commits)}


@router.get("/github/status")
async def github_webhook_status():
    """检查 Webhook 状态"""
    return {
        "status": "ok",
        "supported_events": ["pull_request", "push"],
    }
