/**
 * 自动化 Pipeline — 全自动分析引擎
 *
 * 流程：
 * 1. Webhook 接收事件（GitHub PR / GitLab MR）
 * 2. 自动获取 PR/MR 详情 + Diff + 变更文件
 * 3. 自动选择/更新基线
 * 4. 自动执行需求对齐分析（基于 PR 标题+描述）
 * 5. 自动执行代码评审（基于 Diff）
 * 6. 自动在 PR 下评论结果
 * 7. 记录分析历史
 */
const fs = require('fs');
const path = require('path');
const GitClient = require('./git-client');
const {
  generateBaseline,
  saveBaseline,
  loadBaseline,
  listBaselines,
  buildDefaultADModules,
} = require('./schema');
const { alignRequirement } = require('./aligner');
const ai = require('../ai-provider');
const config = require('../config');

// Analysis history store
const HISTORY_DIR = path.resolve(__dirname, '../../data/history');
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

const git = new GitClient();

/**
 * 自动化分析 Pipeline
 */
class AutomationPipeline {
  constructor() {
    this.git = git;
  }

  /**
   * 处理 PR/MR 事件
   * @param {Object} event - Webhook 事件数据
   * @param {string} projectId - 配置中的项目 ID
   */
  async handleEvent(event, projectId) {
    const project = config.getProject(projectId);
    if (!project) {
      console.warn(`Project ${projectId} not found in config`);
      return { status: 'skipped', reason: 'project_not_found' };
    }

    if (!config.shouldAutoAnalyze(event.type, projectId)) {
      return { status: 'skipped', reason: 'trigger_disabled' };
    }

    console.log(`🤖 Auto-pipeline triggered: ${event.type} for ${project.name}`);

    // 更新项目触发时间
    config.updateProject(projectId, { lastTrigger: new Date().toISOString() });

    try {
      // Step 1: 获取 PR/MR 完整信息
      const prInfo = await this._fetchPRInfo(project, event);

      // Step 2: 确保有基线（自动生成或选择已有）
      const baseline = await this._ensureBaseline(project);

      // Step 3: 执行自动分析
      const results = await this._runAnalysis(prInfo, baseline, project);

      // Step 4: 自动评论到 PR
      if (config.shouldAutoPipeline('comment', projectId)) {
        await this._postComment(project, prInfo, results);
      }

      // Step 5: 记录历史
      this._saveHistory(projectId, project.name, prInfo, results);

      // Step 6: 通知（如配置了）
      if (config.get('notifications.slack') || config.get('notifications.webhook')) {
        await this._notify(project, prInfo, results);
      }

      return {
        status: 'success',
        project: project.name,
        pr: prInfo.number,
        results: {
          moduleHits: results.align?.structured?.moduleHits?.map(h => h.module) || [],
          riskLevel: results.riskLevel,
          linesAnalyzed: prInfo.diff?.split('\n').length || 0,
        },
      };
    } catch (e) {
      console.error(`Pipeline error for ${project.name}:`, e);
      return { status: 'error', error: e.message, project: project.name };
    }
  }

  /**
   * 获取 PR/MR 完整信息
   * 优先使用 GitHub API，API 失败时使用 webhook 携带的数据
   */
  async _fetchPRInfo(project, event) {
    // 从 webhook payload 中提取 PR 数据作为备用
    const webhookPR = event.pull_request || event.prData || {};
    const webhookRepo = event.repository || {};

    try {
      if (project.type === 'github') {
        const { owner, repo } = GitClient.parseGitHubURL(project.url);
        const prNumber = event.prNumber || webhookPR.number;

        if (!prNumber) throw new Error('No PR number available');

        // 尝试并行获取
        const results = await Promise.allSettled([
          git.getPR(owner, repo, prNumber, project.token),
          git.getPRDiff(owner, repo, prNumber, project.token).catch(() => ''),
          git.getPRFiles(owner, repo, prNumber, project.token).catch(() => []),
        ]);

        const [prData, diff, files] = results.map(r => r.status === 'fulfilled' ? r.value : null);

        if (prData) {
          return GitClient.normalizePR('github', prData, diff || '', files || []);
        }
      }
    } catch (e) {
      console.warn(`GitHub API failed: ${e.message}, using webhook payload data`);
    }

    // Fallback: 使用 webhook payload 中的数据
    console.log('Using webhook payload data (no GitHub API)');

    return {
      platform: project.type,
      number: webhookPR.number || event.prNumber || 0,
      title: webhookPR.title || 'Unknown PR',
      body: webhookPR.body || '',
      author: webhookPR.user?.login || webhookPR.author || '',
      sourceBranch: webhookPR.head?.ref || '',
      targetBranch: webhookPR.base?.ref || 'main',
      state: webhookPR.state || 'open',
      url: webhookPR.html_url || webhookPR.url || '',
      repo: webhookRepo.full_name || project.url,
      additions: webhookPR.additions || 0,
      deletions: webhookPR.deletions || 0,
      changedFiles: webhookPR.changed_files || 0,
      createdAt: webhookPR.created_at,
      updatedAt: webhookPR.updated_at,
      diff: '',
      files: [],
    };
  }

  /**
   * 确保有可用基线
   */
  async _ensureBaseline(project) {
    // 1. 尝试加载项目关联的基线
    if (project.baselineId) {
      const existing = loadBaseline(project.baselineId);
      if (existing) return existing;
    }

    // 2. 尝试查找同名基线
    const allBaselines = listBaselines();
    const named = allBaselines.find(b => b.name.includes(project.name));
    if (named) {
      const loaded = loadBaseline(named.id);
      if (loaded) {
        config.updateProject(project.id, { baselineId: named.id });
        return loaded;
      }
    }

    // 3. 自动生成新基线
    console.log(`📦 Auto-generating baseline for ${project.name}`);
    const baseline = {
      id: require('crypto').randomUUID(),
      name: `${project.name} 基线`,
      version: '1.0.0',
      language: project.language || 'cpp',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      modules: buildDefaultADModules(project.language || 'cpp'),
      architecture: {
        pattern: 'distributed-real-time',
        rosVersion: 'ROS2',
        realtime: true,
        safetyLevel: 'ASIL-D',
      },
      stats: { totalModules: Object.keys(buildDefaultADModules(project.language || 'cpp')).length },
    };

    saveBaseline(baseline);
    config.updateProject(project.id, { baselineId: baseline.id });
    console.log(`✅ Baseline generated: ${baseline.id}`);

    return baseline;
  }

  /**
   * 执行自动分析
   */
  async _runAnalysis(prInfo, baseline, project) {
    const analyzers = project.autoAnalyzers || ['align', 'review'];
    const results = {};

    // ── 1. 需求对齐分析（基于 PR 标题+描述）──────────────────────────────
    if (analyzers.includes('align') || analyzers.includes('all')) {
      console.log('🎯 Running alignment analysis...');
      const requirement = `${prInfo.title} ${prInfo.body}`.trim();

      if (requirement.length > 10) {
        const alignResult = await alignRequirement({
          baseline,
          requirement,
          prdContent: prInfo.body,
        });
        results.align = alignResult;

        // 计算综合风险等级
        results.riskLevel = this._computeRiskLevel(alignResult.structured);
      } else {
        results.align = null;
        results.riskLevel = 'low';
      }
    }

    // ── 2. 代码评审（基于 Diff）──────────────────────────────────────────
    if (analyzers.includes('review') || analyzers.includes('all')) {
      console.log('🔍 Running code review...');
      const reviewPrompt = this._buildReviewPrompt(prInfo);
      const reviewText = await ai.chat(reviewPrompt.system, reviewPrompt.user);
      results.review = reviewText || this._demoReview(prInfo);
    }

    // ── 3. 影响范围摘要 ────────────────────────────────────────────────
    if (results.align?.structured) {
      const s = results.align.structured;
      results.summary = this._buildSummary(prInfo, s);
    }

    return results;
  }

  /**
   * 构建代码评审 Prompt
   */
  _buildReviewPrompt(prInfo) {
    const system = `你是自动驾驶系统的资深代码评审专家。请对以下代码变更进行全面评审。
评审维度：代码质量、安全性（特别是ISO26262/ASIL）、性能、实时性、架构设计。
风险分级：🔴 Blocker / 🟠 Critical / 🟡 Major / 🔵 Minor。
输出 Markdown 格式，重点标注高ASIL区域（ASIL-C/D）的代码变更。`;

    const fileList = prInfo.files?.map(f => `${f.status} ${f.filename} (${f.additions}+/${f.deletions}-)`).join('\n') || '无文件信息';

    const user = `## PR 信息
**标题**: ${prInfo.title}
**分支**: ${prInfo.sourceBranch} → ${prInfo.targetBranch}
**作者**: ${prInfo.author}
**变更文件**:
${fileList}

## 代码 Diff
\`\`\`diff
${(prInfo.diff || '').substring(0, 8000)}
\`\`\``;

    return { system, user };
  }

  /**
   * Demo 模式评审（无 API Key 时）
   */
  _demoReview(prInfo) {
    const files = prInfo.files || [];
    const totalAdd = files.reduce((s, f) => s + (f.additions || 0), 0);
    const totalDel = files.reduce((s, f) => s + (f.deletions || 0), 0);

    return `## 🔍 自动代码评审报告

**PR**: ${prInfo.title}
**分支**: ${prInfo.sourceBranch} → ${prInfo.targetBranch}

### 📊 统计
| 指标 | 数值 |
|------|------|
| 变更文件 | ${files.length} 个 |
| 新增行 | +${totalAdd} |
| 删除行 | -${totalDel} |

### ⚠️ 自动评审结果
> ⚡ Demo 模式 — 配置 API Key 后将执行真实 AI 代码评审

**建议**:
- 检查新增代码的 ASIL 等级覆盖
- 确认新增函数的单元测试覆盖率
- 审查外部依赖引入风险`;
  }

  /**
   * 计算综合风险等级
   */
  _computeRiskLevel(structured) {
    if (!structured) return 'low';
    const risks = structured.riskAssessment?.newRisks || [];
    const highASIL = structured.asilCheck?.highASILModules?.length || 0;

    if (risks.some(r => r.severity === 'critical') || highASIL >= 2) return 'critical';
    if (risks.some(r => r.severity === 'major') || highASIL >= 1) return 'high';
    if (risks.length > 0) return 'medium';
    return 'low';
  }

  /**
   * 构建综合摘要
   */
  _buildSummary(prInfo, structured) {
    const hits = structured.moduleHits || [];
    const scope = structured.impactScope || {};
    const risks = structured.riskAssessment?.newRisks || [];

    const emoji = {
      critical: '🔴', high: '🟠', medium: '🟡', low: '🟢',
    };

    return {
      riskLevel: this._computeRiskLevel(structured),
      modules: hits.map(h => h.module),
      impactCount: scope.all?.length || 0,
      riskCount: risks.length,
      summary: `${emoji[this._computeRiskLevel(structured)]} 风险等级: ${this._computeRiskLevel(structured).toUpperCase()}
涉及 ${hits.length} 个模块，影响 ${scope.all?.length || 0} 个模块（含间接）
${risks.length > 0 ? `新增 ${risks.length} 项风险` : '未检测到显著风险'}`,
    };
  }

  /**
   * 在 PR 下发表评论
   */
  async _postComment(project, prInfo, results) {
    if (project.type !== 'github' && project.type !== 'gitlab') return;

    const { owner, repo } = GitClient.parseGitHubURL(project.url);
    const comment = this._formatComment(prInfo, results);

    try {
      if (project.type === 'github') {
        await git.postPRComment(owner, repo, prInfo.number, comment, project.token);
        console.log(`✅ Comment posted to PR #${prInfo.number}`);
      } else if (project.type === 'gitlab') {
        const { projectId } = GitClient.parseGitLabURL(project.url);
        await git.postMRComment(projectId, prInfo.number, comment, project.token);
      }
    } catch (e) {
      console.error('Failed to post comment:', e.message);
    }
  }

  /**
   * 格式化评论内容
   */
  _formatComment(prInfo, results) {
    const summary = results.summary || {};
    const riskEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
    const riskLabel = { critical: '高风险', high: '中高风险', medium: '中等风险', low: '低风险' };
    const riskLevel = summary.riskLevel || 'low';

    let comment = `## 🛡️ DevGuard 自动分析报告

<details>
<summary><b>${riskEmoji[riskLevel]} 风险等级: ${riskLabel[riskLevel]}</b></summary>

`;

    // 模块命中
    if (summary.modules?.length > 0) {
      comment += `**涉及模块**: ${summary.modules.map(m => `\`${m}\``).join(', ')}\n`;
    }
    if (summary.impactCount) {
      comment += `**影响范围**: ${summary.impactCount} 个模块\n`;
    }

    // 风险详情
    if (results.align?.structured?.riskAssessment?.newRisks?.length > 0) {
      comment += `\n**风险提醒**:\n`;
      for (const risk of results.align.structured.riskAssessment.newRisks.slice(0, 3)) {
        const sev = risk.severity === 'critical' ? '🔴' : risk.severity === 'major' ? '🟠' : '🟡';
        comment += `- ${sev} ${risk.type}: ${risk.mitigation}\n`;
      }
    }

    // ASIL 提醒
    if (results.align?.structured?.asilCheck?.complianceRequired) {
      comment += `\n> 🛡️ **功能安全**: 涉及高 ASIL 等级模块，需执行 ISO26262 专项评审\n`;
    }

    comment += `\n</details>\n\n`;
    comment += `*[自动分析 · DevGuard Agent · ${new Date().toLocaleString('zh-CN')}]*`;

    return comment;
  }

  /**
   * 保存分析历史
   */
  _saveHistory(projectId, projectName, prInfo, results) {
    const historyFile = path.join(HISTORY_DIR, `${projectId}.json`);
    let history = [];

    if (fs.existsSync(historyFile)) {
      try {
        history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
      } catch {}
    }

    history.unshift({
      id: require('crypto').randomUUID(),
      projectId,
      projectName,
      prNumber: prInfo.number,
      prTitle: prInfo.title,
      author: prInfo.author,
      riskLevel: results.riskLevel,
      modules: results.summary?.modules || [],
      timestamp: new Date().toISOString(),
    });

    // 保留最近 200 条
    history = history.slice(0, 200);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
  }

  /**
   * 发送通知
   */
  async _notify(project, prInfo, results) {
    const summary = results.summary || {};
    const body = {
      project: project.name,
      pr: prInfo.number,
      title: prInfo.title,
      author: prInfo.author,
      riskLevel: results.riskLevel,
      modules: summary.modules || [],
      url: prInfo.url,
    };

    // Slack
    const slackUrl = config.get('notifications.slack');
    if (slackUrl && (results.riskLevel === 'critical' || config.get('notifications.notifyOnAll'))) {
      try {
        const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
        const text = `${emoji[results.riskLevel] || '⚪'} *${project.name}* | PR #${prInfo.number}: ${prInfo.title}\n` +
          `> 风险: ${results.riskLevel.toUpperCase()} | 模块: ${summary.modules?.join(', ') || 'N/A'}\n` +
          `<${prInfo.url}| 查看详情>`;

        await fetch(slackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      } catch (e) {
        console.error('Slack notification failed:', e.message);
      }
    }
  }

  /**
   * 获取项目分析历史
   */
  getHistory(projectId) {
    const file = path.join(HISTORY_DIR, `${projectId}.json`);
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return [];
    }
  }
}

module.exports = new AutomationPipeline();
