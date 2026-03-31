"""
GitHub 客户端实现
支持 GitHub.com 和 GitHub Enterprise 的完整集成
"""

import hmac
import hashlib
import logging
from typing import Dict, List, Any, Optional

import aiohttp

from .base import (
    GitPlatformClient,
    PullRequest,
    WebhookEvent,
    PlatformType,
    GitPlatformFactory
)

logger = logging.getLogger(__name__)


class GitHubClient(GitPlatformClient):
    """GitHub 客户端"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.platform_type = PlatformType.GITHUB
        
        # GitHub 配置
        self.url = config.get("url", "https://api.github.com")
        self.token = config.get("token")
        self.webhook_secret = config.get("webhook_secret", "")
        
        # API 配置
        self.api_url = self.url if "api.github.com" in self.url else f"{self.url}/api/v3"
        self.headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        }
    
    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Dict[str, Any]:
        """发送 API 请求"""
        url = f"{self.api_url}{endpoint}"
        
        async with aiohttp.ClientSession() as session:
            async with session.request(
                method,
                url,
                headers=self.headers,
                **kwargs
            ) as response:
                if response.status >= 400:
                    error_text = await response.text()
                    logger.error(f"GitHub API error: {response.status} - {error_text}")
                    raise Exception(f"GitHub API error: {response.status}")
                
                # 处理空响应
                if response.status == 204:
                    return {}
                
                return await response.json()
    
    async def get_pull_request(
        self,
        repo: str,
        pr_number: int
    ) -> PullRequest:
        """获取 Pull Request 详情"""
        # 获取 PR 详情
        pr_data = await self._request(
            "GET",
            f"/repos/{repo}/pulls/{pr_number}"
        )
        
        # 获取 Commits
        commits_data = await self._request(
            "GET",
            f"/repos/{repo}/pulls/{pr_number}/commits"
        )
        
        # 获取变更文件
        files_data = await self._request(
            "GET",
            f"/repos/{repo}/pulls/{pr_number}/files"
        )
        
        commits = [
            {
                "sha": c["sha"],
                "message": c["commit"]["message"],
                "author": c["commit"]["author"]["name"],
                "timestamp": c["commit"]["author"]["date"]
            }
            for c in commits_data
        ]
        
        files = [
            {
                "path": f["filename"],
                "old_path": f.get("previous_filename"),
                "status": f["status"],
                "additions": f.get("additions", 0),
                "deletions": f.get("deletions", 0)
            }
            for f in files_data
        ]
        
        return PullRequest(
            id=str(pr_data["id"]),
            number=pr_data["number"],
            title=pr_data["title"],
            description=pr_data.get("body", ""),
            source_branch=pr_data["head"]["ref"],
            target_branch=pr_data["base"]["ref"],
            author=pr_data["user"]["login"],
            url=pr_data["html_url"],
            status=pr_data["state"],
            commits=commits,
            files=files,
            platform=PlatformType.GITHUB,
            raw_data=pr_data
        )
    
    async def list_pull_requests(
        self,
        repo: str,
        state: str = "open",
        limit: int = 20
    ) -> List[PullRequest]:
        """列出 Pull Requests"""
        params = {
            "state": state,
            "per_page": limit
        }
        
        prs_data = await self._request(
            "GET",
            f"/repos/{repo}/pulls",
            params=params
        )
        
        prs = []
        for pr in prs_data:
            prs.append(PullRequest(
                id=str(pr["id"]),
                number=pr["number"],
                title=pr["title"],
                description=pr.get("body", ""),
                source_branch=pr["head"]["ref"],
                target_branch=pr["base"]["ref"],
                author=pr["user"]["login"],
                url=pr["html_url"],
                status=pr["state"],
                commits=[],  # 需要额外请求
                files=[],    # 需要额外请求
                platform=PlatformType.GITHUB,
                raw_data=pr
            ))
        
        return prs
    
    async def create_pr_comment(
        self,
        repo: str,
        pr_number: int,
        comment: str
    ) -> Dict[str, Any]:
        """创建 PR 评论"""
        data = {"body": comment}
        
        result = await self._request(
            "POST",
            f"/repos/{repo}/issues/{pr_number}/comments",
            json=data
        )
        
        return {
            "id": str(result["id"]),
            "body": result["body"],
            "author": result["user"]["login"],
            "created_at": result["created_at"]
        }
    
    async def set_pr_status(
        self,
        repo: str,
        commit_sha: str,
        state: str,
        description: str,
        context: str = "devguard"
    ) -> Dict[str, Any]:
        """设置 Commit 状态"""
        data = {
            "state": state,  # success, failure, pending, error
            "description": description,
            "context": context,
            "target_url": f"https://github.com/{repo}/commit/{commit_sha}"
        }
        
        result = await self._request(
            "POST",
            f"/repos/{repo}/statuses/{commit_sha}",
            json=data
        )
        
        return {
            "id": str(result["id"]),
            "sha": result["sha"],
            "state": result["state"],
            "description": result.get("description"),
            "context": result.get("context")
        }
    
    async def merge_pull_request(
        self,
        repo: str,
        pr_number: int,
        merge_method: str = "merge"
    ) -> Dict[str, Any]:
        """合并 Pull Request"""
        data = {
            "merge_method": merge_method,  # merge, squash, rebase
            "commit_message": f"Merge pull request #{pr_number}"
        }
        
        result = await self._request(
            "PUT",
            f"/repos/{repo}/pulls/{pr_number}/merge",
            json=data
        )
        
        return {
            "sha": result.get("sha"),
            "merged": result.get("merged", False),
            "message": result.get("message", "")
        }
    
    async def parse_webhook_event(
        self,
        payload: Dict,
        headers: Dict
    ) -> WebhookEvent:
        """解析 GitHub Webhook 事件"""
        event_type = headers.get("X-GitHub-Event", "")
        
        if event_type == "pull_request":
            pr_data = payload.get("pull_request", {})
            
            pr = PullRequest(
                id=str(pr_data.get("id")),
                number=pr_data.get("number"),
                title=pr_data.get("title", ""),
                description=pr_data.get("body", ""),
                source_branch=pr_data.get("head", {}).get("ref"),
                target_branch=pr_data.get("base", {}).get("ref"),
                author=pr_data.get("user", {}).get("login", ""),
                url=pr_data.get("html_url", ""),
                status=pr_data.get("state", ""),
                commits=[],  # 需要额外请求
                files=[],
                platform=PlatformType.GITHUB,
                raw_data=pr_data
            )
            
            return WebhookEvent(
                event_type="pull_request",
                platform=PlatformType.GITHUB,
                action=payload.get("action", ""),
                repository=payload.get("repository", {}).get("full_name", ""),
                branch=pr_data.get("base", {}).get("ref"),
                pull_request=pr,
                raw_data=payload
            )
        
        elif event_type == "push":
            return WebhookEvent(
                event_type="push",
                platform=PlatformType.GITHUB,
                action="push",
                repository=payload.get("repository", {}).get("full_name", ""),
                branch=payload.get("ref", "").replace("refs/heads/", ""),
                pull_request=None,
                raw_data=payload
            )
        
        else:
            raise ValueError(f"Unsupported GitHub event: {event_type}")
    
    async def verify_webhook_signature(
        self,
        payload: bytes,
        signature: str
    ) -> bool:
        """验证 GitHub Webhook 签名"""
        if not self.webhook_secret:
            return True
        
        # GitHub 使用 HMAC-SHA256
        expected = "sha256=" + hmac.new(
            self.webhook_secret.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(signature, expected)
    
    async def get_file_content(
        self,
        repo: str,
        file_path: str,
        ref: str = "main"
    ) -> Optional[str]:
        """获取文件内容"""
        try:
            import base64
            
            result = await self._request(
                "GET",
                f"/repos/{repo}/contents/{file_path}",
                params={"ref": ref}
            )
            
            # GitHub 返回 base64 编码内容
            content = result.get("content", "")
            return base64.b64decode(content).decode("utf-8")
        
        except Exception as e:
            logger.error(f"Failed to get file content: {e}")
            return None
    
    async def create_branch(
        self,
        repo: str,
        branch_name: str,
        base_branch: str = "main"
    ) -> Dict[str, Any]:
        """创建分支"""
        # 获取基础分支的 commit SHA
        ref_data = await self._request(
            "GET",
            f"/repos/{repo}/git/refs/heads/{base_branch}"
        )
        
        base_sha = ref_data["object"]["sha"]
        
        data = {
            "ref": f"refs/heads/{branch_name}",
            "sha": base_sha
        }
        
        result = await self._request(
            "POST",
            f"/repos/{repo}/git/refs",
            json=data
        )
        
        return {
            "name": branch_name,
            "commit_sha": base_sha
        }
    
    async def create_file(
        self,
        repo: str,
        file_path: str,
        content: str,
        message: str,
        branch: str = "main"
    ) -> Dict[str, Any]:
        """创建文件"""
        import base64
        
        # GitHub 需要 base64 编码
        encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")
        
        data = {
            "message": message,
            "content": encoded_content,
            "branch": branch
        }
        
        result = await self._request(
            "PUT",
            f"/repos/{repo}/contents/{file_path}",
            json=data
        )
        
        return {
            "file_path": file_path,
            "branch": branch,
            "commit_sha": result["commit"]["sha"]
        }
    
    async def get_commits(
        self,
        repo: str,
        pr_number: int
    ) -> List[Dict[str, Any]]:
        """获取 PR 的所有 Commits"""
        commits_data = await self._request(
            "GET",
            f"/repos/{repo}/pulls/{pr_number}/commits"
        )
        
        return [
            {
                "sha": c["sha"],
                "message": c["commit"]["message"],
                "author": c["commit"]["author"]["name"],
                "author_email": c["commit"]["author"]["email"],
                "timestamp": c["commit"]["author"]["date"]
            }
            for c in commits_data
        ]
    
    async def get_repository_info(
        self,
        repo: str
    ) -> Dict[str, Any]:
        """获取仓库信息"""
        result = await self._request(
            "GET",
            f"/repos/{repo}"
        )
        
        return {
            "id": str(result["id"]),
            "name": result["name"],
            "full_name": result["full_name"],
            "description": result.get("description", ""),
            "url": result["html_url"],
            "default_branch": result.get("default_branch", "main"),
            "visibility": "private" if result.get("private") else "public"
        }


# 注册到工厂
GitPlatformFactory.register(PlatformType.GITHUB, GitHubClient)
