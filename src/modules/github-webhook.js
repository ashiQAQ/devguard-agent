const crypto = require('crypto');
const { reviewCode } = require('./agent');

// Simple HMAC verification
function verifySignature(payload, signature, secret) {
  if (!secret) return true; // Skip if no secret configured
  const expected = 'sha1=' + crypto.createHmac('sha1', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Parse GitHub webhook payload into our standard format
function parseGitHubPR(body) {
  if (body.action === 'opened' || body.action === 'synchronize' || body.action === 'reopened') {
    const pr = body.pull_request;
    return {
      event: 'pull_request',
      action: body.action,
      data: {
        prTitle: pr.title,
        prDescription: pr.body || '',
        diff: null, // Would need to fetch from GitHub API
        files: pr.changed_files ? [] : [],
        targetBranch: pr.base.ref,
        sourceBranch: pr.head.ref,
        author: pr.user?.login,
        prNumber: pr.number,
        repo: body.repository?.full_name,
        url: pr.html_url,
      },
    };
  }
  return null;
}

// Auto-review endpoint handler
async function handleWebhook(req, res) {
  try {
    const signature = req.headers['x-hub-signature'];
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (secret && signature && !verifySignature(JSON.stringify(req.body), signature, secret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const parsed = parseGitHubPR(req.body);
    if (!parsed) {
      return res.json({ status: 'ignored', reason: 'Event not supported' });
    }

    // In real implementation, would fetch the actual diff here
    // For now, trigger review with available info
    const review = await reviewCode({
      ...parsed.data,
      diff: parsed.data.diff || `// GitHub PR #${parsed.data.prNumber}\n// 请配置 GitHub Token 以获取完整 diff`,
    });

    return res.json({
      status: 'reviewed',
      pr: parsed.data.prNumber,
      review,
    });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { handleWebhook, parseGitHubPR };
