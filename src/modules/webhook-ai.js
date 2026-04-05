/**
 * GitLab Webhook Handler — AI 增强版
 * 在 PR/MR 事件上触发：AI 合并风险评估 → 自动评论
 */
const crypto = require('crypto');
const { GitLabMRClient } = require('./gitlab-mr-client');
const { AIPipeline } = require('../ai-pipeline/engine');

// ─── Token 验证 ──────────────────────────────────────────────────────────────
function verifyGitLab(token, secret) {
  if (!secret) return true;
  return token === secret;
}

function normalizeGitLab(body) {
  if (!body.object_attributes) return null;
  const pr = body.object_attributes;
  return {
    platform: 'gitlab',
    event: body.object_kind,
    prNumber: pr.iid,
    projectId: body.project?.path_with_namespace,
    projectPath: body.project?.path_with_namespace,
    projectUrl: body.project?.web_url,
    title: pr.title,
    description: pr.description || '',
    author: body.user?.username,
    sourceBranch: pr.source_branch,
    targetBranch: pr.target_branch,
    url: pr.url,
    changedFiles: body.changes_count || 0,
    state: pr.state,
    timestamp: new Date().toISOString(),
  };
}

// In-memory history
const history = [];
const MAX = 100;

async function handleGitLabWebhookAI(req, res) {
  const secret = process.env.GITLAB_WEBHOOK_SECRET;
  const token = req.headers['x-gitlab-token'];

  if (secret && token !== secret) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const parsed = normalizeGitLab(req.body);
  if (!parsed) return res.status(400).json({ error: 'Invalid payload' });

  history.unshift(parsed);
  if (history.length > MAX) history.pop();

  // 只处理 MR 打开/更新事件
  if (parsed.state === 'closed' || parsed.state === 'merged') {
    return res.json({ status: 'ignored', reason: `${parsed.state} event` });
  }

  const gitlabUrl = process.env.GITLAB_URL || 'https://gitlab.com';
  const gitlabToken = process.env.GITLAB_TOKEN || process.env.GITLAB_WEBHOOK_SECRET;

  if (!gitlabToken) {
    return res.json({ status: 'accepted', message: 'No GITLAB_TOKEN, AI review skipped' });
  }

  // 异步触发 AI 评估，不阻塞响应
  setImmediate(async () => {
    try {
      const pipeline = new AIPipeline();
      const client = new GitLabMRClient(gitlabUrl, gitlabToken);

      // 获取 MR diff
      const diffs = await client.getMRDiffs(parsed.projectId, parsed.prNumber);
      if (!diffs || diffs.length === 0) {
        console.log(`[Webhook] No diffs for MR !${parsed.prNumber}`);
        return;
      }

      const semanticDiffs = client.formatSemanticDiff(diffs);
      const diffText = semanticDiffs
        .map(d => `### ${d.path} (${d.status})\n\`\`\`diff\n${(d.diff || '').substring(0, 5000)}\n\`\`\``)
        .join('\n\n');

      // AI 合并风险评估
      const task = {
        title: parsed.title,
        module: _inferModule(parsed.title, diffs),
        ASIL: _inferASIL(parsed.title, diffs),
        description: parsed.description,
      };

      const result = await pipeline.assessMergeRisk({
        task,
        codeSuggestion: null,
        actualDiff: diffText,
      });

      // 构造评论内容
      const diffStats = semanticDiffs.reduce((acc, d) => {
        acc.additions += d.additions;
        acc.deletions += d.deletions;
        return acc;
      }, { additions: 0, deletions: 0 });

      const comment = buildReviewComment(result, { diffs: semanticDiffs, diffStats });

      // 发表评论
      await client.postComment(parsed.projectId, parsed.prNumber, comment);
      console.log(`✅ AI review posted for MR !${parsed.prNumber}: ${result.riskLevel}`);

    } catch (e) {
      console.error(`[Webhook] AI review failed for MR !${parsed.prNumber}:`, e.message);
    }
  });

  res.json({
    status: 'accepted',
    message: `MR !${parsed.prNumber} received, AI review in progress`,
    mr: { iid: parsed.prNumber, title: parsed.title, url: parsed.url }
  });
}

function _inferModule(title, diffs) {
  const t = (title + ' ' + diffs.map(d => d.new_path).join(' ')).toLowerCase();
  if (/perception|感知|lidar|camera|vision/i.test(t)) return '感知';
  if (/planning|规划|trajectory|path/i.test(t)) return '规划';
  if (/control|控制|steer|throttle|brake/i.test(t)) return '控制';
  if (/prediction|预测/i.test(t)) return '预测';
  if (/localization|定位|map|地图/i.test(t)) return '定位';
  return '通用';
}

function _inferASIL(title, diffs) {
  const t = (title + ' ' + diffs.map(d => d.new_path).join(' ')).toLowerCase();
  if (/brake|braking|制动|转向|steering|emergency|紧急/i.test(t)) return 'B';
  if (/safety|安全|critical|关键/i.test(t)) return 'B';
  return 'NONE';
}

function buildReviewComment(result, { diffs, diffStats }) {
  const { riskLevel, assessment } = result;

  const diffSummary = diffs.map(d => {
    const icon = d.status === 'added' ? '➕' : d.status === 'deleted' ? '🗑️' : '✏️';
    return `${icon} \`${d.path}\` (+\`${d.additions}\` -\`${d.deletions}\`)`;
  }).slice(0, 15);

  return `## 🤖 DevGuard AI 合入风险评估

${riskLevel} **风险等级**

---

### 📊 变更概览
| 指标 | 值 |
|------|-----|
| 文件数 | ${diffs.length} |
| 新增行 | +${diffStats.additions} |
| 删除行 | -${diffStats.deletions} |

### 变更文件
${diffSummary.join('\n')}${diffs.length > 15 ? '\n_...等文件_' : ''}

---

### 🔍 AI 评估结果

${assessment.substring(0, 3000)}

---

_⚠️ 本评估仅供参考，实际合入决策请结合团队评审。_`;
}

function getWebhookHistory() {
  return history.slice(0, 20);
}

module.exports = { handleGitLabWebhookAI, getWebhookHistory };
