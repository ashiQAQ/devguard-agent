"""
GitLab 客户端实现
支持 GitLab CE/EE 的完整集成
"""

import hmac
import hashlib
import logging
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse

import aiohttp

from .base import (
    GitPlatformClient,
    PullRequest,
    WebhookEvent,
    PlatformType,
    GitPlatformFactory
)

logger = logging.getLogger(__name__)


class GitLabClient(GitPlatformClient):
    """GitLab 客户端"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.platform_type = PlatformType.GITLAB
        
        # GitLab 配置
        self.url = config.get("url", "https://gitlab.com")
        self.token = config.get("token")
        self.webhook_secret = config.get("webhook_secret", "")
        
        # API 配置
        self.api_url = f"{self.url}/api/v4"
        self.headers = {
            "Private-Token": self.token,
            "Content-Type": "application/json"
        }
    
    def _parse_repo(self, repo: str) -> tuple:
        """
        解析仓库名为 owner/repo 格式
        
        GitLab 使用 project_id 或 namespace/project 格式
        """
        # URL encode the project path
        return repo.replace("/", "%2F")
    
    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        发送 API 请求
        
        Args:
            method: HTTP 方法
            endpoint: API 端点
            **kwargs: 请求参数
        
        Returns:
            响应数据
        """
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
                    logger.error(f"GitLab API error: {response.status} - {error_text}")
                    raise Exception(f"GitLab API error: {response.status}")
                
                return await response.json()
    
    async def get_pull_request(
        self,
        repo: str,
        pr_number: int
    ) -> PullRequest:
        """获取 Merge Request 详情"""
        project_id = self._parse_repo(repo)
        
        # 获取 MR 详情
        mr_data = await self._request(
            "GET",
            f"/projects/{project_id}/merge_requests/{pr_number}"
        )
        
        # 获取 Commits
        commits_data = await self._request(
            "GET",
            f"/projects/{project_id}/merge_requests/{pr_number}/commits"
        )
        
        # 获取变更文件
        changes_data = await self._request(
            "GET",
            f"/projects/{project_id}/merge_requests/{pr_number}/changes"
        )
        
        commits = [
            {
                "sha": c["id"],
                "message": c["message"],
                "author": c["author_name"],
                "timestamp": c["created_at"]
            }
            for c in commits_data
        ]
        
        files = [
            {
                "path": f["new_path"],
                "old_path": f["old_path"],
                "status": f["new_file"] and "added" or f["deleted_file"] and "deleted" or "modified",
                "additions": f.get("diff", "").count("\n+"),
                "deletions": f.get("diff", "").count("\n-")
            }
            for f in changes_data.get("changes", [])
        ]
        
        return PullRequest(
            id=str(mr_data["id"]),
            number=mr_data["iid"],
            title=mr_data["title"],
            description=mr_data["description"] or "",
            source_branch=mr_data["source_branch"],
            target_branch=mr_data["target_branch"],
            author=mr_data["author"]["username"],
            url=mr_data["web_url"],
            status=mr_data["state"],
            commits=commits,
            files=files,
            platform=PlatformType.GITLAB,
            raw_data=mr_data
        )
    
    async def list_pull_requests(
        self,
        repo: str,
        state: str = "opened",
        limit: int = 20
    ) -> List[PullRequest]:
        """列出 Merge Requests"""
        project_id = self._parse_repo(repo)
        
        # GitLab 使用 "opened" 而不是 "open"
        state_map = {
            "open": "opened",
            "closed": "closed",
            "merged": "merged",
            "all": "all"
        }
        gitlab_state = state_map.get(state, state)
        
        params = {
            "state": gitlab_state,
            "per_page": limit
        }
        
        mrs_data = await self._request(
            "GET",
            f"/projects/{project_id}/merge_requests",
            params=params
        )
        
        prs = []
        for mr in mrs_data:
            prs.append(PullRequest(
                id=str(mr["id"]),
                number=mr["iid"],
                title=mr["title"],
                description=mr.get("description", ""),
                source_branch=mr["source_branch"],
                target_branch=mr["target_branch"],
                author=mr["author"]["username"],
                url=mr["web_url"],
                status=mr["state"],
                commits=[],  # 需要额外请求
                files=[],    # 需要额外请求
                platform=PlatformType.GITLAB,
                raw_data=mr
            ))
        
        return prs
    
    async def create_pr_comment(
        self,
        repo: str,
        pr_number: int,
        comment: str
    ) -> Dict[str, Any]:
        """创建 MR 评论"""
        project_id = self._parse_repo(repo)
        
        data = {"body": comment}
        
        result = await self._request(
            "POST",
            f"/projects/{project_id}/merge_requests/{pr_number}/notes",
            json=data
        )
        
        return {
            "id": str(result["id"]),
            "body": result["body"],
            "author": result["author"]["username"],
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
        """设置 Commit 状态 (GitLab Commit Status)"""
        project_id = self._parse_repo(repo)
        
        # GitLab 状态映射
        state_map = {
            "success": "success",
            "failure": "failed",
            "pending": "running",
            "error": "failed"
        }
        gitlab_state = state_map.get(state, state)
        
        data = {
            "state": gitlab_state,
            "description": description,
            "name": context,
            "target_url": f"{self.url}/{repo}/-/pipelines"
        }
        
        result = await self._request(
            "POST",
            f"/projects/{project_id}/statuses/{commit_sha}",
            json=data
        )
        
        return {
            "id": str(result["id"]),
            "sha": result["sha"],
            "state": result["status"],
            "description": result.get("description"),
            "context": result.get("name")
        }
    
    async def merge_pull_request(
        self,
        repo: str,
        pr_number: int,
        merge_method: str = "merge"
    ) -> Dict[str, Any]:
        """合并 Merge Request"""
        project_id = self._parse_repo(repo)
        
        # GitLab 合并方法
        # merge_commit, squash, rebase_merge
        method_map = {
            "merge": "merge_commit",
            "squash": "squash",
            "rebase": "rebase_merge"
        }
        gitlab_method = method_map.get(merge_method, "merge_commit")
        
        data = {
            "merge_commit_message": f"Merge branch into target",
            "squash_commit_message": None,
            "squash": merge_method == "squash",
            "should_remove_source_branch": False
        }
        
        result = await self._request(
            "PUT",
            f"/projects/{project_id}/merge_requests/{pr_number}/merge",
            json=data
        )
        
        return {
            "sha": result.get("merge_commit_sha"),
            "merged": result.get("state") == "merged",
            "message": "Merge successful"
        }
    
    async def parse_webhook_event(
        self,
        payload: Dict,
        headers: Dict
    ) -> WebhookEvent:
        """解析 GitLab Webhook 事件"""
        # GitLab 事件类型
        object_kind = payload.get("object_kind", "")
        
        # GitLab 使用 "Merge Request" 而不是 "Pull Request"
        if object_kind == "merge_request":
            mr_data = payload.get("object_attributes", {})
            
            # 构建 PullRequest 对象
            pr = PullRequest(
                id=str(mr_data.get("id")),
                number=mr_data.get("iid"),
                title=mr_data.get("title", ""),
                description=mr_data.get("description", ""),
                source_branch=mr_data.get("source_branch"),
                target_branch=mr_data.get("target_branch"),
                author=payload.get("user", {}).get("username", ""),
                url=mr_data.get("url", ""),
                status=mr_data.get("state", ""),
                commits=[],  # 需要额外请求
                files=[],
                platform=PlatformType.GITLAB,
                raw_data=mr_data
            )
            
            return WebhookEvent(
                event_type="merge_request",
                platform=PlatformType.GITLAB,
                action=mr_data.get("action", ""),
                repository=mr_data.get("target", {}).get("path_with_namespace", ""),
                branch=mr_data.get("target_branch"),
                pull_request=pr,
                raw_data=payload
            )
        
        elif object_kind == "push":
            return WebhookEvent(
                event_type="push",
                platform=PlatformType.GITLAB,
                action="push",
                repository=payload.get("project", {}).get("path_with_namespace", ""),
                branch=payload.get("ref", "").replace("refs/heads/", ""),
                pull_request=None,
                raw_data=payload
            )
        
        else:
            raise ValueError(f"Unsupported GitLab event: {object_kind}")
    
    async def verify_webhook_signature(
        self,
        payload: bytes,
        signature: str
    ) -> bool:
        """验证 GitLab Webhook 签名"""
        if not self.webhook_secret:
            return True
        
        # GitLab 使用 X-Gitlab-Token 头进行简单验证
        expected = self.webhook_secret
        return hmac.compare_digest(signature, expected)
    
    async def get_file_content(
        self,
        repo: str,
        file_path: str,
        ref: str = "main"
    ) -> Optional[str]:
        """获取文件内容"""
        project_id = self._parse_repo(repo)
        
        try:
            import base64
            from urllib.parse import quote
            
            # URL encode file path
            encoded_path = quote(file_path, safe="")
            
            result = await self._request(
                "GET",
                f"/projects/{project_id}/repository/files/{encoded_path}",
                params={"ref": ref}
            )
            
            # GitLab 返回 base64 编码内容
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
        project_id = self._parse_repo(repo)
        
        data = {
            "branch": branch_name,
            "ref": base_branch
        }
        
        result = await self._request(
            "POST",
            f"/projects/{project_id}/repository/branches",
            json=data
        )
        
        return {
            "name": result["name"],
            "commit_sha": result["commit"]["id"]
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
        from urllib.parse import quote
        
        project_id = self._parse_repo(repo)
        encoded_path = quote(file_path, safe="")
        
        # GitLab 需要 base64 编码
        encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")
        
        data = {
            "branch": branch,
            "content": encoded_content,
            "commit_message": message,
            "encoding": "base64"
        }
        
        result = await self._request(
            "POST",
            f"/projects/{project_id}/repository/files/{encoded_path}",
            json=data
        )
        
        return {
            "file_path": result["file_path"],
            "branch": result["branch"]
        }
    
    async def get_commits(
        self,
        repo: str,
        pr_number: int
    ) -> List[Dict[str, Any]]:
        """获取 MR 的所有 Commits"""
        project_id = self._parse_repo(repo)
        
        commits_data = await self._request(
            "GET",
            f"/projects/{project_id}/merge_requests/{pr_number}/commits"
        )
        
        return [
            {
                "sha": c["id"],
                "message": c["message"],
                "author": c["author_name"],
                "author_email": c["author_email"],
                "timestamp": c["created_at"]
            }
            for c in commits_data
        ]
    
    async def get_repository_info(
        self,
        repo: str
    ) -> Dict[str, Any]:
        """获取仓库信息"""
        project_id = self._parse_repo(repo)
        
        result = await self._request(
            "GET",
            f"/projects/{project_id}"
        )
        
        return {
            "id": str(result["id"]),
            "name": result["name"],
            "full_name": result["path_with_namespace"],
            "description": result.get("description", ""),
            "url": result["web_url"],
            "default_branch": result.get("default_branch", "main"),
            "visibility": result.get("visibility", "private")
        }


# 注册到工厂
GitPlatformFactory.register(PlatformType.GITLAB, GitLabClient)
