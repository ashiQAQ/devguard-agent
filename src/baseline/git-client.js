/**
 * GitHub/GitLab API 客户端 — 自动拉取代码和 PR 信息
 * 不依赖额外库，使用原生 fetch
 */
const fetch = require('node-fetch');

class GitClient {
  constructor() {}

  // ─── GitHub ──────────────────────────────────────────────────────────────────

  /**
   * 获取 GitHub PR 详情
   */
  async getPR(owner, repo, prNumber, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'DevGuard-Agent',
      },
    });
    if (!res.ok) throw new Error(`GitHub PR API failed: ${res.status}`);
    return res.json();
  }

  /**
   * 获取 PR 的完整 Diff
   */
  async getPRDiff(owner, repo, prNumber, token) {
    const res = await fetch(
      `https://github.com/${owner}/${repo}/pull/${prNumber}.diff`,
      { headers: { 'Authorization': `token ${token}`, 'User-Agent': 'DevGuard-Agent' } }
    );
    if (!res.ok) throw new Error(`Diff fetch failed: ${res.status}`);
    return res.text();
  }

  /**
   * 获取 PR 变更的文件列表
   */
  async getPRFiles(owner, repo, prNumber, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;
    const res = await fetch(url, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`Files API failed: ${res.status}`);
    const data = await res.json();
    return data.map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch || '',
      sha: f.sha,
    }));
  }

  /**
   * 获取仓库分支列表
   */
  async getBranches(owner, repo, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/branches`;
    const res = await fetch(url, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return [];
    return res.json();
  }

  /**
   * 获取仓库根目录结构（快速扫描）
   */
  async getRepoTree(owner, repo, token, branch = 'main') {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const res = await fetch(url, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`Tree API failed: ${res.status}`);
    const data = await res.json();
    return (data.tree || []).map(t => ({
      path: t.path,
      type: t.type,
      size: t.size || 0,
      sha: t.sha,
    }));
  }

  /**
   * 获取文件内容
   */
  async getFileContent(owner, repo, path, token, branch = 'main') {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return data.content;
  }

  /**
   * 获取仓库基本信息
   */
  async getRepoInfo(owner, repo, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`Repo API failed: ${res.status}`);
    return res.json();
  }

  /**
   * 在 PR 下发表评论
   */
  async postPRComment(owner, repo, prNumber, body, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`Comment post failed: ${res.status}`);
    return res.json();
  }

  /**
   * 获取最近的 Commits
   */
  async getCommits(owner, repo, token, count = 30) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${count}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return [];
    return res.json();
  }

  // ─── GitLab ──────────────────────────────────────────────────────────────────

  /**
   * GitLab: 获取 MR 详情
   */
  async getMR(projectId, mrIid, token) {
    const encoded = encodeURIComponent(projectId);
    const url = `https://gitlab.com/api/v4/projects/${encoded}/merge_requests/${mrIid}`;
    const res = await fetch(url, {
      headers: { 'PRIVATE-TOKEN': token },
    });
    if (!res.ok) throw new Error(`GitLab MR API failed: ${res.status}`);
    return res.json();
  }

  /**
   * GitLab: 获取 MR Changes
   */
  async getMRChanges(projectId, mrIid, token) {
    const encoded = encodeURIComponent(projectId);
    const url = `https://gitlab.com/api/v4/projects/${encoded}/merge_requests/${mrIid}/changes`;
    const res = await fetch(url, {
      headers: { 'PRIVATE-TOKEN': token },
    });
    if (!res.ok) throw new Error(`GitLab changes API failed: ${res.status}`);
    return res.json();
  }

  /**
   * GitLab: 发布评论
   */
  async postMRComment(projectId, mrIid, body, token) {
    const encoded = encodeURIComponent(projectId);
    const url = `https://gitlab.com/api/v4/projects/${encoded}/merge_requests/${mrIid}/notes`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`GitLab comment failed: ${res.status}`);
    return res.json();
  }

  // ─── 工具 ──────────────────────────────────────────────────────────────────────

  /**
   * 解析 GitHub URL 获取 owner/repo
   */
  static parseGitHubURL(url) {
    // 支持: https://github.com/owner/repo, github.com/owner/repo, owner/repo
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  /**
   * 解析 GitLab URL
   */
  static parseGitLabURL(url) {
    // 支持: https://gitlab.com/owner/repo, gitlab.com/owner/repo
    const match = url.match(/gitlab\.com[/:]([^/]+)\/([^/.]+)/);
    if (!match) return null;
    return { namespace: `${match[1]}/${match[2]}`, projectId: encodeURIComponent(`${match[1]}/${match[2]}`) };
  }

  /**
   * 合并 PR 信息为统一格式
   */
  static normalizePR(platform, prData, diff, files) {
    if (platform === 'github') {
      return {
        platform: 'github',
        number: prData.number,
        title: prData.title,
        body: prData.body || '',
        author: prData.user?.login || '',
        sourceBranch: prData.head?.ref || '',
        targetBranch: prData.base?.ref || '',
        state: prData.state,
        url: prData.html_url,
        repo: prData.base?.repo?.full_name || '',
        additions: prData.additions || 0,
        deletions: prData.deletions || 0,
        changedFiles: prData.changed_files || 0,
        createdAt: prData.created_at,
        updatedAt: prData.updated_at,
        diff,
        files,
      };
    } else if (platform === 'gitlab') {
      return {
        platform: 'gitlab',
        number: prData.iid,
        title: prData.title,
        body: prData.description || '',
        author: prData.author?.username || '',
        sourceBranch: prData.source_branch || '',
        targetBranch: prData.target_branch || '',
        state: prData.state,
        url: prData.web_url,
        repo: prData.references?.full || '',
        diff: diff,
        files: files || [],
      };
    }
    return null;
  }
}

module.exports = GitClient;
