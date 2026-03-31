/**
 * GitHub Webhook + GitLab Webhook Handler
 */
const crypto = require('crypto');
const { reviewCode } = require('./agent');

function verifyGitHub(payload, signature, secret) {
  if (!secret) return true;
  try {
    const expected = 'sha1=' + crypto.createHmac('sha1', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { return false; }
}

function verifyGitLab(token, secret) {
  if (!secret) return true;
  return token === secret;
}

// Normalize different webhook formats to unified format
function normalizeGitHub(body) {
  if (!body.pull_request) return null;
  const pr = body.pull_request;
  return {
    platform: 'github',
    event: body.action,
    prNumber: pr.number,
    repo: body.repository?.full_name,
    title: pr.title,
    description: pr.body || '',
    author: pr.user?.login,
    sourceBranch: pr.head?.ref,
    targetBranch: pr.base?.ref,
    url: pr.html_url,
    changedFiles: pr.changed_files,
    additions: pr.additions,
    deletions: pr.deletions,
    timestamp: new Date().toISOString(),
  };
}

function normalizeGitLab(body) {
  if (!body.object_attributes) return null;
  const pr = body.object_attributes;
  return {
    platform: 'gitlab',
    event: body.object_kind,
    prNumber: pr.iid,
    repo: body.project?.path_with_namespace,
    title: pr.title,
    description: pr.description || '',
    author: body.user?.username,
    sourceBranch: pr.source_branch,
    targetBranch: pr.target_branch,
    url: pr.url,
    changedFiles: body.changes_count || 0,
    timestamp: new Date().toISOString(),
  };
}

// Store recent webhooks for history (in-memory, simple)
const webhookHistory = [];
const MAX_HISTORY = 100;

async function handleGitHubWebhook(req, res) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const sig = req.headers['x-hub-signature'];
  const event = req.headers['x-github-event'];

  if (secret && sig && !verifyGitHub(JSON.stringify(req.body), sig, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Only process PR events
  if (event !== 'pull_request' && event !== 'pull_request_review') {
    return res.json({ status: 'ignored', event });
  }

  const parsed = normalizeGitHub(req.body);
  if (!parsed) return res.status(400).json({ error: 'Invalid payload' });

  // Store in history
  webhookHistory.unshift(parsed);
  if (webhookHistory.length > MAX_HISTORY) webhookHistory.pop();

  // Trigger code review asynchronously
  setImmediate(async () => {
    try {
      const review = await reviewCode({
        prTitle: parsed.title,
        prDescription: parsed.description,
        diff: `// PR #${parsed.prNumber}\n// ${parsed.url}\n// 完整diff请通过GitHub API获取，请配置 GITHUB_TOKEN`,
        files: [],
        targetBranch: parsed.targetBranch,
        sourceBranch: parsed.sourceBranch,
      });
      console.log(`✅ Review completed for PR #${parsed.prNumber}: ${review.substring(0, 80)}...`);
    } catch (e) {
      console.error('Review failed:', e.message);
    }
  });

  res.json({
    status: 'accepted',
    message: `PR #${parsed.prNumber} received, review in progress`,
    pr: { number: parsed.prNumber, title: parsed.title, url: parsed.url }
  });
}

async function handleGitLabWebhook(req, res) {
  const secret = process.env.GITLAB_WEBHOOK_SECRET;
  const token = req.headers['x-gitlab-token'];

  if (secret && token !== secret) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const parsed = normalizeGitLab(req.body);
  if (!parsed) return res.status(400).json({ error: 'Invalid payload' });

  webhookHistory.unshift(parsed);
  if (webhookHistory.length > MAX_HISTORY) webhookHistory.pop();

  setImmediate(async () => {
    try {
      const review = await reviewCode({
        prTitle: parsed.title,
        prDescription: parsed.description,
        diff: `// MR !${parsed.prNumber}\n// ${parsed.url}`,
        files: [],
        targetBranch: parsed.targetBranch,
        sourceBranch: parsed.sourceBranch,
      });
      console.log(`✅ Review completed for MR !${parsed.prNumber}`);
    } catch (e) {
      console.error('Review failed:', e.message);
    }
  });

  res.json({
    status: 'accepted',
    message: `MR !${parsed.prNumber} received`,
    mr: { iid: parsed.prNumber, title: parsed.title, url: parsed.url }
  });
}

function getWebhookHistory() {
  return webhookHistory.slice(0, 20);
}

module.exports = { handleGitHubWebhook, handleGitLabWebhook, getWebhookHistory };
