"""
Git 平台抽象基类
支持 GitHub、GitLab、Bitbucket 等多个代码托管平台
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum


class PlatformType(Enum):
    """平台类型"""
    GITHUB = "github"
    GITLAB = "gitlab"
    BITBUCKET = "bitbucket"


@dataclass
class PullRequest:
    """统一的 Pull Request 数据结构"""
    id: str
    number: int
    title: str
    description: str
    source_branch: str
    target_branch: str
    author: str
    url: str
    status: str  # open, closed, merged
    commits: List[Dict[str, Any]]
    files: List[Dict[str, Any]]
    platform: PlatformType
    raw_data: Optional[Dict] = None


@dataclass
class WebhookEvent:
    """统一的 Webhook 事件数据结构"""
    event_type: str  # push, pull_request, merge
    platform: PlatformType
    action: str  # opened, closed, merged, etc.
    repository: str
    branch: Optional[str]
    pull_request: Optional[PullRequest]
    raw_data: Dict


class GitPlatformClient(ABC):
    """Git 平台客户端抽象基类"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.platform_type: PlatformType = None
    
    @abstractmethod
    async def get_pull_request(
        self, 
        repo: str, 
        pr_number: int
    ) -> PullRequest:
        """
        获取 Pull Request 详情
        
        Args:
            repo: 仓库名 (格式: owner/repo)
            pr_number: PR 编号
        
        Returns:
            PullRequest 对象
        """
        pass
    
    @abstractmethod
    async def list_pull_requests(
        self,
        repo: str,
        state: str = "open",
        limit: int = 20
    ) -> List[PullRequest]:
        """
        列出 Pull Requests
        
        Args:
            repo: 仓库名
            state: 状态 (open, closed, all)
            limit: 数量限制
        
        Returns:
            PullRequest 列表
        """
        pass
    
    @abstractmethod
    async def create_pr_comment(
        self,
        repo: str,
        pr_number: int,
        comment: str
    ) -> Dict[str, Any]:
        """
        创建 PR 评论
        
        Args:
            repo: 仓库名
            pr_number: PR 编号
            comment: 评论内容
        
        Returns:
            创建结果
        """
        pass
    
    @abstractmethod
    async def set_pr_status(
        self,
        repo: str,
        commit_sha: str,
        state: str,  # success, failure, pending
        description: str,
        context: str = "devguard"
    ) -> Dict[str, Any]:
        """
        设置 Commit 状态
        
        Args:
            repo: 仓库名
            commit_sha: Commit SHA
            state: 状态
            description: 描述
            context: 上下文
        
        Returns:
            设置结果
        """
        pass
    
    @abstractmethod
    async def merge_pull_request(
        self,
        repo: str,
        pr_number: int,
        merge_method: str = "merge"  # merge, squash, rebase
    ) -> Dict[str, Any]:
        """
        合并 Pull Request
        
        Args:
            repo: 仓库名
            pr_number: PR 编号
            merge_method: 合并方式
        
        Returns:
            合并结果
        """
        pass
    
    @abstractmethod
    async def parse_webhook_event(
        self,
        payload: Dict,
        headers: Dict
    ) -> WebhookEvent:
        """
        解析 Webhook 事件
        
        Args:
            payload: Webhook 负载
            headers: HTTP 头
        
        Returns:
            WebhookEvent 对象
        """
        pass
    
    @abstractmethod
    async def verify_webhook_signature(
        self,
        payload: bytes,
        signature: str
    ) -> bool:
        """
        验证 Webhook 签名
        
        Args:
            payload: 原始负载
            signature: 签名
        
        Returns:
            是否验证通过
        """
        pass
    
    @abstractmethod
    async def get_file_content(
        self,
        repo: str,
        file_path: str,
        ref: str = "main"
    ) -> Optional[str]:
        """
        获取文件内容
        
        Args:
            repo: 仓库名
            file_path: 文件路径
            ref: 分支或 Commit SHA
        
        Returns:
            文件内容
        """
        pass
    
    @abstractmethod
    async def create_branch(
        self,
        repo: str,
        branch_name: str,
        base_branch: str = "main"
    ) -> Dict[str, Any]:
        """
        创建分支
        
        Args:
            repo: 仓库名
            branch_name: 分支名
            base_branch: 基础分支
        
        Returns:
            创建结果
        """
        pass
    
    @abstractmethod
    async def create_file(
        self,
        repo: str,
        file_path: str,
        content: str,
        message: str,
        branch: str = "main"
    ) -> Dict[str, Any]:
        """
        创建文件
        
        Args:
            repo: 仓库名
            file_path: 文件路径
            content: 文件内容
            message: Commit 消息
            branch: 分支
        
        Returns:
            创建结果
        """
        pass
    
    @abstractmethod
    async def get_commits(
        self,
        repo: str,
        pr_number: int
    ) -> List[Dict[str, Any]]:
        """
        获取 PR 的所有 Commits
        
        Args:
            repo: 仓库名
            pr_number: PR 编号
        
        Returns:
            Commit 列表
        """
        pass
    
    @abstractmethod
    async def get_repository_info(
        self,
        repo: str
    ) -> Dict[str, Any]:
        """
        获取仓库信息
        
        Args:
            repo: 仓库名
        
        Returns:
            仓库信息
        """
        pass


class GitPlatformFactory:
    """Git 平台客户端工厂"""
    
    _clients: Dict[PlatformType, type] = {}
    
    @classmethod
    def register(cls, platform_type: PlatformType, client_class: type):
        """
        注册平台客户端类
        
        Args:
            platform_type: 平台类型
            client_class: 客户端类
        """
        cls._clients[platform_type] = client_class
    
    @classmethod
    def create(
        cls,
        platform_type: PlatformType,
        config: Dict[str, Any]
    ) -> GitPlatformClient:
        """
        创建平台客户端实例
        
        Args:
            platform_type: 平台类型
            config: 配置
        
        Returns:
            客户端实例
        
        Raises:
            ValueError: 不支持的平台类型
        """
        if platform_type not in cls._clients:
            raise ValueError(
                f"Unsupported platform: {platform_type}. "
                f"Supported: {list(cls._clients.keys())}"
            )
        
        client_class = cls._clients[platform_type]
        return client_class(config)
    
    @classmethod
    def create_from_config(cls, config: Dict[str, Any]) -> GitPlatformClient:
        """
        从配置创建客户端
        
        Args:
            config: 配置字典，包含 platform 字段
        
        Returns:
            客户端实例
        """
        platform_str = config.get("platform", "github")
        platform_type = PlatformType(platform_str)
        return cls.create(platform_type, config)
