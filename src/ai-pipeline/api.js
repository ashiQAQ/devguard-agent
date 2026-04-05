/**
 * AI Pipeline API Routes
 * 全链路 AI 开发自动化
 */
const express = require('express');
const { AIPipeline } = require('./engine');
const { GitLabMRClient } = require('../modules/gitlab-mr-client');
const path = require('path');

const router = express.Router();

// 单例 pipeline（全局复用）
let _pipeline = null;
function getPipeline() {
  if (!_pipeline) _pipeline = new AIPipeline();
  return _pipeline;
}

// ─── 知识库管理 ───────────────────────────────────────────────────────────────

/** POST /api/ai-pipeline/index — 为仓库建立向量索引 */
router.post('/index', async (req, res) => {
  try {
    const { repoId, repoPath, extensions, excludeDirs } = req.body;
    if (!repoId || !repoPath) {
      return res.status(400).json({ success: false, error: 'repoId 和 repoPath 必填' });
    }
    const pipeline = getPipeline();
    const result = await pipeline.indexRepo(repoId, repoPath, { extensions, excludeDirs,
      onProgress: (info) => {
        // 可通过 SSE 推送进度（暂时忽略）
      }
    });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** GET /api/ai-pipeline/index-status — 索引状态 */
router.get('/index-status', (req, res) => {
  const pipeline = getPipeline();
  const stats = pipeline.store.size;
  const metaSet = new Set(pipeline.store.metadata.map(m => m.repoId));
  res.json({ success: true, totalVectors: stats, indexedRepos: [...metaSet] });
});

/** GET /api/ai-pipeline/index-stats/:repoId */
router.get('/index-stats/:repoId', (req, res) => {
  const pipeline = getPipeline();
  const stats = pipeline.getIndexStats(req.params.repoId);
  res.json({ success: true, ...stats });
});

// ─── 需求分析 ─────────────────────────────────────────────────────────────────

/** POST /api/ai-pipeline/analyze — AI 需求分析 + 代码检索 */
router.post('/analyze', async (req, res) => {
  try {
    const { title, description, content, repoIds } = req.body;
    if (!title && !description && !content) {
      return res.status(400).json({ success: false, error: '至少需要提供 title/description/content 之一' });
    }
    const pipeline = getPipeline();
    const result = await pipeline.analyzeRequirement({ title, description, content, repoIds });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── 任务下发 ─────────────────────────────────────────────────────────────────

/** POST /api/ai-pipeline/tasks — 基于需求生成开发任务 */
router.post('/tasks', async (req, res) => {
  try {
    const { features, gapAnalysis, repoId } = req.body;
    if ((!features || !features.length) && (!gapAnalysis || !gapAnalysis.length)) {
      return res.status(400).json({ success: false, error: 'features 或 gapAnalysis 必填' });
    }
    const pipeline = getPipeline();
    const tasks = await pipeline.generateTasks({ features, gapAnalysis, repoId });
    res.json({ success: true, tasks });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── 代码建议 ────────────────────────────────────────────────────────────────

/** POST /api/ai-pipeline/code-suggest — 为单个任务生成代码建议 */
router.post('/code-suggest', async (req, res) => {
  try {
    const { task, relatedCode, codeStyle } = req.body;
    if (!task) return res.status(400).json({ success: false, error: 'task 必填' });
    const pipeline = getPipeline();
    const result = await pipeline.generateCode({ task, relatedCode, codeStyle });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── 测试用例 ────────────────────────────────────────────────────────────────

/** POST /api/ai-pipeline/tests — 为任务生成测试用例 */
router.post('/tests', async (req, res) => {
  try {
    const { task, codeSuggestion, language } = req.body;
    if (!task) return res.status(400).json({ success: false, error: 'task 必填' });
    const pipeline = getPipeline();
    const result = await pipeline.generateTests({ task, codeSuggestion, language });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── 全链路分析 ───────────────────────────────────────────────────────────────

/** POST /api/ai-pipeline/full — 完整链路分析（需求→任务→代码→测试） */
router.post('/full', async (req, res) => {
  try {
    const { title, description, content, repoIds, outputLevel } = req.body;
    if (!title && !description && !content) {
      return res.status(400).json({ success: false, error: '至少需要提供 title/description/content 之一' });
    }
    const pipeline = getPipeline();
    const result = await pipeline.fullPipeline({ title, description, content, repoIds, outputLevel });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── MR 合并风险评估 ─────────────────────────────────────────────────────────

/** POST /api/ai-pipeline/merge-risk — 获取 MR diff 与代码建议对比评估 */
router.post('/merge-risk', async (req, res) => {
  try {
    const { gitlabUrl, gitlabToken, projectId, mrIid, task, codeSuggestion } = req.body;
    if (!gitlabUrl || !gitlabToken || !projectId || !mrIid) {
      return res.status(400).json({ success: false, error: 'gitlabUrl/gitlabToken/projectId/mrIid 必填' });
    }

    // 从 GitLab 获取 MR diff
    const client = new GitLabMRClient(gitlabUrl, gitlabToken);
    const diffs = await client.getMRDiffs(projectId, mrIid);

    // 格式化 diff
    const semanticDiffs = client.formatSemanticDiff(diffs);
    const diffText = semanticDiffs.map(d => `### ${d.path} (${d.status})\n\`\`\`diff\n${d.diff || ''}\n\`\`\``).join('\n\n');

    const pipeline = getPipeline();
    const result = await pipeline.assessMergeRisk({
      task: task || { title: `MR !${mrIid}`, module: '通用', ASIL: 'NONE' },
      codeSuggestion,
      actualDiff: diffText,
    });

    // 如果提供了 task，可选地发表 MR 评论
    if (req.body.postComment) {
      try {
        await client.postComment(projectId, mrIid,
          `## 🤖 DevGuard AI 合并风险评估\n\n${result.riskLevel} **${result.assessment.substring(0, 1000)}**\n\n_由 DevGuard AI Pipeline 生成_`
        );
        result.commentPosted = true;
      } catch (e) {
        result.commentError = e.message;
      }
    }

    res.json({ success: true, result, diffSummary: { total: diffs.length, stats: semanticDiffs.map(d => ({ path: d.path, status: d.status, additions: d.additions, deletions: d.deletions })) } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── 语义搜索 ─────────────────────────────────────────────────────────────────

/** GET /api/ai-pipeline/search — 在代码库中语义搜索 */
router.get('/search', async (req, res) => {
  try {
    const { q, repoId, topK = 10, minScore = 0.5 } = req.body;
    if (!q) return res.status(400).json({ success: false, error: 'q 必填' });
    const pipeline = getPipeline();
    const results = await pipeline.store.semanticSearch(pipeline.embedder, q, {
      topK: parseInt(topK), minScore: parseFloat(minScore),
      filter: repoId ? m => m.repoId === repoId : undefined,
    });
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
