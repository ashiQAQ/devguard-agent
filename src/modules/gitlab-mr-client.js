/**
 * GitLab MR Client — 获取 MR Diff + 文件内容用于 AI 对比
 */
const https = require('https');
const http = require('http');

// ─── HTTP 客户端 ─────────────────────────────────────────────────────────────
function httpReq(url, { token, method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'PRIVATE-TOKEN': token,
        ...headers,
      },
    };

    const req = mod.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── GitLab Client ────────────────────────────────────────────────────────────
class GitLabMRClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  /** 获取 MR 详情 */
  async getMR(projectId, mrIid) {
    const url = `${this.baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}`;
    const res = await httpReq(url, { token: this.token });
    if (res.status >= 400) throw new Error(`GitLab API ${res.status}: ${JSON.stringify(res.data)}`);
    return res.data;
  }

  /** 获取 MR 变更的文件列表 */
  async getMRChanges(projectId, mrIid) {
    const url = `${this.baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/changes`;
    const res = await httpReq(url, { token: this.token });
    if (res.status >= 400) throw new Error(`GitLab API ${res.status}: ${JSON.stringify(res.data)}`);
    return res.data;
  }

  /** 获取单个文件在特定版本的原始内容 */
  async getFile(projectId, filePath, { ref = 'main', maxLines = 2000 } = {}) {
    const encoded = encodeURIComponent(filePath);
    const url = `${this.baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/repository/files/${encoded}/raw?ref=${ref}`;
    const res = await httpReq(url, { token: this.token });
    if (res.status === 404) return null;
    if (res.status >= 400) throw new Error(`GitLab file API ${res.status}`);
    // res.data might be raw string
    return typeof res.data === 'string' ? res.data.substring(0, maxLines * 200) : null;
  }

  /** 获取 commit 列表 */
  async getCommits(projectId, mrIid) {
    const url = `${this.baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/commits`;
    const res = await httpReq(url, { token: this.token });
    if (res.status >= 400) throw new Error(`GitLab API ${res.status}`);
    return res.data || [];
  }

  /** 获取 diff 列表 */
  async getMRDiffs(projectId, mrIid) {
    const url = `${this.baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/diffs`;
    const res = await httpReq(url, { token: this.token });
    if (res.status >= 400) throw new Error(`GitLab API ${res.status}`);
    return res.data || [];
  }

  /** 完整 MR 上下文（diff + 变更文件内容） */
  async getMRContext(projectId, mrIid) {
    const [mr, diffs] = await Promise.all([
      this.getMR(projectId, mrIid),
      this.getMRDiffs(projectId, mrIid),
    ]);

    // 获取变更文件的旧版本内容（从 source_branch）
    const fileContents = {};
    const fetches = diffs.slice(0, 20).map(async diff => {
      if (diff.old_path) {
        const content = await this.getFile(projectId, diff.old_path, { ref: mr.source_branch });
        if (content) fileContents[diff.old_path] = content;
      }
    });
    await Promise.all(fetches).catch(() => {}); // ignore individual errors

    return { mr, diffs, fileContents };
  }

  /** 构造语义化 diff 用于 AI 对比 */
  formatSemanticDiff(diffs, fileContents = {}) {
    return diffs.map(diff => {
      const isNew = diff.new_file;
      const isDeleted = diff.diff == null || diff.diff === '';
      return {
        path: diff.new_path || diff.old_path,
        status: isNew ? 'added' : isDeleted ? 'deleted' : 'modified',
        oldPath: diff.old_path,
        newPath: diff.new_path,
        diff: diff.diff,
        // 附上旧版本上下文（用于 AI 理解修改前逻辑）
        oldContext: fileContents[diff.old_path] || null,
        additions: (diff.diff || '').split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length,
        deletions: (diff.diff || '').split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length,
      };
    });
  }

  /** 发表评论 */
  async postComment(projectId, mrIid, body) {
    const url = `${this.baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/notes`;
    const res = await httpReq(url, { token: this.token, method: 'POST', body: { body } });
    if (res.status >= 400) throw new Error(`GitLab comment ${res.status}`);
    return res.data;
  }
}

module.exports = { GitLabMRClient };
