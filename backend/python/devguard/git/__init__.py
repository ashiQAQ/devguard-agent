"""
Git 平台集成模块
支持 GitHub、GitLab、Bitbucket 等多个代码托管平台
"""

from .base import (
    PlatformType,
    PullRequest,
    WebhookEvent,
    GitPlatformClient,
    GitPlatformFactory
)

from .github_client import GitHubClient
from .gitlab_client import GitLabClient

__all__ = [
    # 枚举
    "PlatformType",
    
    # 数据类
    "PullRequest",
    "WebhookEvent",
    
    # 客户端
    "GitPlatformClient",
    "GitHubClient",
    "GitLabClient",
    
    # 工厂
    "GitPlatformFactory",
]
