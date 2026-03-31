// ─── Utilities ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const showToast = (msg, type='info') => {
  const c = document.createElement('div');
  c.className = `toast toast-${type}`;
  c.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> ${msg}`;
  document.getElementById('toastContainer').appendChild(c);
  setTimeout(() => c.remove(), 4000);
};
const setLoading = (btn, loading) => {
  if (!btn) return;
  if (loading) { btn.disabled = true; btn.classList.add('loading'); }
  else { btn.disabled = false; btn.classList.remove('loading'); }
};
const renderMarkdown = (text) => {
  if (!text) return '<div style="color:var(--text3)">暂无结果</div>';
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```[\w]*\n([\s\S]+?)```/g, '<pre><code>$1</code></pre>')
    .replace(/^\| (.+) \|$/gm, (m) => {
      const cells = m.split('|').slice(1, -1).map(c => c.trim());
      if (cells.some(c => c.match(/^[-:]+$/))) return '';
      return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
    })
    .replace(/(<tr>[\s\S]+?<\/tr>)+/g, m => `<table>${m}</table>`)
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)+/g, m => `<ul>${m}</ul>`)
    .replace(/^(\d+)\. (.+)$/gm, '<li><strong>$1.</strong> $2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/<\/ul><br><ul>/g, '');
};
const formatTime = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const copyResult = (id) => {
  const el = $(id);
  if (!el) return;
  const text = el.textContent;
  navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板', 'success')).catch(() => showToast('复制失败', 'error'));
};

// Skeleton loader HTML
const skeleton = (lines=5) => Array(lines).fill(0).map((_,i) => `<div class="skeleton skeleton-text ${i%2?'medium':'short'}" style="width:${60+Math.random()*35}%"></div>`).join('');

// ─── Tab navigation ───────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tab = document.getElementById(btn.dataset.tab);
    if (tab) tab.classList.add('active');
  });
});

// ─── API calls ────────────────────────────────────────────────────────────────
async function callAPI(endpoint, body) {
  const res = await fetch(`/api/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ─── Module: 需求分析 ─────────────────────────────────────────────────────────
async function runRequirement() {
  const btn = $('btn-req');
  const title = $('req-title').value.trim();
  const tech = $('req-tech').value.trim();
  const repo = $('req-repo').value.trim();
  const desc = $('req-desc').value.trim();
  const prd = $('req-prd').value.trim();

  if (!title && !desc && !prd) { showToast('请至少填写需求标题或需求描述', 'error'); return; }

  setLoading(btn, true);
  $('req-result').innerHTML = `<div class="empty-state"><div class="skeleton" style="height:200px;border-radius:12px"></div><br>${skeleton(4)}<div style="font-size:.78rem;color:var(--text3);margin-top:8px">AI 分析中，请稍候...</div></div>`;
  $('req-time').textContent = '分析中...';

  try {
    const data = await callAPI('analyze/requirement', { title, description: desc, prdContent: prd, techStack: tech, repoContext: repo });
    if (data.success) {
      $('req-result').innerHTML = renderMarkdown(data.result);
      $('req-time').textContent = `✅ ${formatTime()}`;
      markFlow(1);
      showToast('需求分析完成', 'success');
    } else { throw new Error(data.error); }
  } catch (e) { $('req-result').innerHTML = `<div style="color:var(--red);padding:20px">❌ 分析失败: ${e.message}</div>`; showToast(e.message, 'error'); }
  setLoading(btn, false);
}

// ─── Module: 需求-代码一致性 ─────────────────────────────────────────────────
async function runReqVsCode() {
  const btn = $('btn-rvc');
  const req = $('rvc-req').value.trim();
  if (!req) { showToast('请填写需求文档内容', 'error'); return; }

  setLoading(btn, true);
  $('rvc-result').innerHTML = `<div class="empty-state"><div class="skeleton" style="height:120px;border-radius:8px"></div><br>${skeleton(3)}</div>`;

  try {
    const data = await callAPI('analyze/requirement-vs-code', { requirement: req, codeFiles: $('rvc-code').value.trim() });
    $('rvc-result').innerHTML = renderMarkdown(data.result);
    showToast('一致性分析完成', 'success');
  } catch (e) { $('rvc-result').innerHTML = `<div style="color:var(--red);padding:16px">❌ ${e.message}</div>`; }
  setLoading(btn, false);
}

// ─── Module: 代码评审 ─────────────────────────────────────────────────────────
async function runReview() {
  const btn = $('btn-review');
  const title = $('pr-title').value.trim();
  const desc = $('pr-desc').value.trim();
  const source = $('pr-source').value.trim();
  const target = $('pr-target').value.trim() || 'main';
  const files = $('pr-files').value.trim().split('\n').filter(f => f.trim());
  const diff = $('pr-diff').value.trim();

  if (!title && !diff) { showToast('请填写 PR 标题或代码 Diff', 'error'); return; }

  setLoading(btn, true);
  $('review-result').innerHTML = `<div class="empty-state"><div class="skeleton" style="height:300px;border-radius:12px"></div><br>${skeleton(6)}<div style="font-size:.78rem;color:var(--text3);margin-top:8px">七维度评审进行中...</div></div>`;
  $('review-time').textContent = '评审中...';

  try {
    const data = await callAPI('analyze/review', { prTitle: title, prDescription: desc, diff, files, targetBranch: target, sourceBranch: source });
    if (data.success) {
      $('review-result').innerHTML = renderMarkdown(data.result);
      $('review-time').textContent = `✅ ${formatTime()}`;
      markFlow(3);
      showToast('代码评审完成', 'success');
    } else { throw new Error(data.error); }
  } catch (e) { $('review-result').innerHTML = `<div style="color:var(--red);padding:20px">❌ 评审失败: ${e.message}</div>`; showToast(e.message, 'error'); }
  setLoading(btn, false);
}

// ─── Module: 测试生成 ─────────────────────────────────────────────────────────
async function runTests() {
  const btn = $('btn-test');
  const req = $('test-req').value.trim();
  const code = $('test-code').value.trim();
  const lang = $('test-lang').value;
  const fw = $('test-framework').value;

  if (!req && !code) { showToast('请填写需求描述或代码', 'error'); return; }

  setLoading(btn, true);
  $('test-result').innerHTML = `<div class="empty-state"><div class="skeleton" style="height:250px;border-radius:12px"></div><br>${skeleton(5)}<div style="font-size:.78rem;color:var(--text3);margin-top:8px">生成测试用例中...</div></div>`;
  $('test-time').textContent = '生成中...';

  try {
    const data = await callAPI('analyze/tests', { requirement: req, codeContent: code, language: lang });
    if (data.success) {
      $('test-result').innerHTML = renderMarkdown(data.result);
      $('test-time').textContent = `✅ ${formatTime()}`;
      markFlow(4);
      showToast('测试用例生成完成', 'success');
    } else { throw new Error(data.error); }
  } catch (e) { $('test-result').innerHTML = `<div style="color:var(--red);padding:20px">❌ 生成失败: ${e.message}</div>`; showToast(e.message, 'error'); }
  setLoading(btn, false);
}

// ─── Module: 部署检查 ─────────────────────────────────────────────────────────
async function runDeploy() {
  const btn = $('btn-deploy');
  const review = $('deploy-review').value.trim();
  const changes = $('deploy-changes').value.trim();
  const env = $('deploy-env').value.trim();

  if (!changes && !review) { showToast('请填写变更内容或代码评审摘要', 'error'); return; }

  setLoading(btn, true);
  $('deploy-result').innerHTML = `<div class="empty-state"><div class="skeleton" style="height:200px;border-radius:12px"></div><br>${skeleton(4)}<div style="font-size:.78rem;color:var(--text3);margin-top:8px">生成部署清单中...</div></div>`;
  $('deploy-time').textContent = '生成中...';

  try {
    const data = await callAPI('analyze/deploy', { prAnalysis: review, changes, envInfo: env });
    if (data.success) {
      $('deploy-result').innerHTML = renderMarkdown(data.result);
      $('deploy-time').textContent = `✅ ${formatTime()}`;
      markFlow(5);
      showToast('部署检查清单生成完成', 'success');
    } else { throw new Error(data.error); }
  } catch (e) { $('deploy-result').innerHTML = `<div style="color:var(--red);padding:20px">❌ 生成失败: ${e.message}</div>`; showToast(e.message, 'error'); }
  setLoading(btn, false);
}

// ─── Module: 监测方案 ─────────────────────────────────────────────────────────
async function runMonitor() {
  const btn = $('btn-monitor');
  const deploy = $('mon-deploy').value.trim();
  const service = $('mon-service').value.trim();
  const type = $('mon-type').value;

  setLoading(btn, true);
  $('monitor-result').innerHTML = `<div class="empty-state"><div class="skeleton" style="height:200px;border-radius:12px"></div><br>${skeleton(4)}</div>`;
  $('monitor-time').textContent = '生成中...';

  try {
    const data = await callAPI('analyze/monitoring', { deployment: deploy, serviceName: service, serviceInfo: `类型: ${type}` });
    if (data.success) {
      $('monitor-result').innerHTML = renderMarkdown(data.result);
      $('monitor-time').textContent = `✅ ${formatTime()}`;
      markFlow(6);
      showToast('监测方案生成完成', 'success');
    } else { throw new Error(data.error); }
  } catch (e) { $('monitor-result').innerHTML = `<div style="color:var(--red);padding:20px">❌ ${e.message}</div>`; }
  setLoading(btn, false);
}

// ─── Module: 全链路 ──────────────────────────────────────────────────────────
async function runFullCycle() {
  const btn = $('btn-full');
  const title = $('full-title').value.trim();
  const content = $('full-content').value.trim();

  if (!title && !content) { showToast('请填写需求标题和内容', 'error'); return; }

  setLoading(btn, true);

  // Mark all as loading
  ['req-result','review-result','test-result','full-summary'].forEach(id => {
    if (id === 'full-summary') {
      $(id).innerHTML = `<div class="empty-state"><div class="skeleton" style="height:80px;border-radius:8px"></div><br>${skeleton(3)}<div style="font-size:.78rem;color:var(--text3);margin-top:8px">综合评估中...</div></div>`;
    } else {
      $(id).innerHTML = `<div class="empty-state"><div class="skeleton" style="height:200px;border-radius:12px"></div><br>${skeleton(5)}</div>`;
    }
  });

  // Reset flow
  [1,2,3,4,5,6].forEach(i => { const el = $(`flow-${i}`); if (el) el.className = 'flow-step'; });

  try {
    const data = await callAPI('analyze/full-cycle', { title, description: content, prdContent: content, codeContent: content, diff: content, files: [] });
    if (data.success) {
      $('full-req-result').innerHTML = renderMarkdown(data.result.requirement);
      $('full-review-result').innerHTML = renderMarkdown(data.result.codeReview);
      $('full-test-result').innerHTML = renderMarkdown(data.result.tests);

      // Generate summary
      const summary = generateSummary(data.result);
      $('full-summary').innerHTML = renderMarkdown(summary);

      [1,2,3,4,5,6].forEach(i => markFlow(i));
      showToast('全链路分析完成！', 'success');
    } else { throw new Error(JSON.stringify(data)); }
  } catch (e) {
    ['req-result','review-result','test-result','full-summary'].forEach(id => {
      $(id).innerHTML = `<div style="color:var(--red);padding:16px">❌ ${e.message}</div>`;
    });
    showToast('分析失败: ' + e.message, 'error');
  }
  setLoading(btn, false);
}

function generateSummary(result) {
  return `## ⚡ 全链路分析总结

### 📋 整体评估

| 阶段 | 状态 | 关键发现 |
|------|------|---------|
| 需求分析 | ✅ 完成 | 详见上方报告 |
| 代码评审 | ✅ 完成 | 详见上方报告 |
| 测试生成 | ✅ 完成 | 详见上方报告 |

### 🎯 综合建议

基于以上分析，建议按以下优先级推进：

1. **立即处理** — 代码评审中标识的 Blocker/Critical 项
2. **本周处理** — Major 项优化和缺失需求补充
3. **后续迭代** — Minor 项和测试覆盖率提升

### 📊 风险概览
- 整体风险等级：🟡 中等
- 建议在上线前完成 Blocker 项修复
- 建议测试覆盖率提升至 80% 以上再上线`;
}

// ─── Flow diagram ────────────────────────────────────────────────────────────
function markFlow(step) {
  const el = $(`flow-${step}`);
  if (!el) return;
  el.classList.remove('active');
  el.classList.add('done');
  const next = $(`flow-${step + 1}`);
  if (next) next.classList.add('active');
}

// ─── Init: check health ──────────────────────────────────────────────────────
(async () => {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const badge = $('statusBadge');
    if (data.mode === 'ai') {
      badge.className = 'mode-badge ai';
      badge.innerHTML = '<span class="status-dot"></span> AI 模式 · ' + data.provider;
    }
    // Uptime
    const updateUptime = () => {
      const s = Math.floor(data.uptime + (Date.now() / 1000 - Date.now() / 1000));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      $('uptimeText').textContent = `运行 ${h}h ${m}m`;
    };
    updateUptime();
  } catch (e) {
    console.warn('Health check failed, demo mode:', e);
  }
})();
</script>
</body>
</html>
