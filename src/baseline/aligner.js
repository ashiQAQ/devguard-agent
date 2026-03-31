/**
 * 需求-基线对齐分析引擎
 * 核心：自动驾驶场景专项分析
 *
 * 分析维度：
 * 1. 模块命中 — 需求涉及哪些模块
 * 2. 影响范围 — 直接/间接影响链路
 * 3. 风险叠加 — 新需求叠加现有风险
 * 4. 技术债务关联 — 触及哪些已知债务
 * 5. ASIL 合规性 — 功能安全等级检查
 * 6. 实时性评估 — 延迟要求是否满足
 * 7. 接口变更分析 — 哪些接口需要调整
 */

const ai = require('../ai-provider');

// 自动驾驶专用关键词映射
const AD_KEYWORDS = {
  // ─── 感知 ──────────────────────────────────────────────────────────
  perception: {
    keywords: ['感知', '检测', '识别', '分割', 'fusion', 'perception', 'detection', 'camera', 'lidar', 'radar', 'sensor', '目标检测', '障碍物', '车道线', '交通标志', '红绿灯', 'freespace', 'occupancy', 'tracking', '跟踪'],
    modules: ['perception', 'sensor'],
  },
  // ─── 定位 ─────────────────────────────────────────────────────────
  localization: {
    keywords: ['定位', 'localization', 'gnss', 'gps', 'imu', '惯导', 'RTK', 'ekf', 'kalman', 'pose', '位置', '坐标', '地图匹配', 'map_matching'],
    modules: ['localization'],
  },
  // ─── 规划 ─────────────────────────────────────────────────────────
  planning: {
    keywords: ['规划', 'planning', 'trajectory', 'path', 'route', 'routing', '轨迹', '路径', '速度规划', '行为决策', 'behavior', 'scenario', '场景', '决策', 'decision', '避障', 'obstacle_avoidance', '换道', 'lane_change', '超车', 'overtake'],
    modules: ['planning', 'prediction'],
  },
  // ─── 控制 ─────────────────────────────────────────────────────────
  control: {
    keywords: ['控制', 'control', '纵向', 'lateral', 'longitudinal', '横向', 'pid', 'lqr', 'mpc', '方向盘', 'steering', 'throttle', '制动', 'brake', 'acc', 'aeb', 'lka', '横向控制', '纵向控制', '车辆动力学', '动力学'],
    modules: ['control', 'vehicle', 'canbus'],
  },
  // ─── 高精地图 ─────────────────────────────────────────────────────
  hdmap: {
    keywords: ['地图', 'map', 'hdmap', '高精', 'routing', '拓扑', 'semantic', 'lane', 'road', '道路', '交叉口', 'junction'],
    modules: ['hdmap', 'routing'],
  },
  // ─── 仿真测试 ─────────────────────────────────────────────────────
  simulation: {
    keywords: ['仿真', 'simulation', 'scenario', '测试', 'test', ' SIL', 'HIL', 'mil', 'sil', 'hil', '回灌', '回放', 'replay', 'scenarios', '测试场景', '覆盖率', 'coverage'],
    modules: ['simulation'],
  },
  // ─── 功能安全 ─────────────────────────────────────────────────────
  safety: {
    keywords: ['安全', 'safety', 'ASIL', '功能安全', '看门狗', 'watchdog', '故障', 'fault', 'diagnosis', '诊断', '冗余', 'redundancy', 'MRC', '最小风险', 'fallback', '降级', 'degradation', 'emergency', '紧急'],
    modules: ['safety'],
  },
  // ─── 预测 ─────────────────────────────────────────────────────────
  prediction: {
    keywords: ['预测', 'prediction', '轨迹预测', 'intent', '意图', '多Agent', 'multi_agent', '交互', 'interaction', '运动预测'],
    modules: ['prediction'],
  },
  // ─── 数据/标定 ────────────────────────────────────────────────────
  calibration: {
    keywords: ['标定', 'calibration', ' extrinsic', '内参', '外参', 'camera_calib', 'lidar_calib', '传感器标定', '参数调整'],
    modules: ['perception'],
  },
};

/**
 * 需求对齐分析主函数
 * @param {Object} options
 * @param {Object} options.baseline 架构基线
 * @param {string} options.requirement 需求文本
 * @param {string} options.prdContent PRD原文（可选）
 * @param {string} options.modulePriority 优先涉及模块（可选）
 */
async function alignRequirement(options) {
  const { baseline, requirement, prdContent, modulePriority } = options;
  const text = `${requirement} ${prdContent || ''}`;

  // Step 1: 关键词匹配 → 模块命中
  const moduleHits = detectModuleHits(text);

  // Step 2: 基于基线构建影响范围图
  const impactScope = buildImpactScope(moduleHits, baseline);

  // Step 3: 风险叠加评估
  const riskAssessment = assessRisks(moduleHits, baseline);

  // Step 4: 技术债务关联
  const debtAssociation = associateTechDebts(moduleHits, baseline);

  // Step 5: ASIL 合规性检查
  const asilCheck = checkASILCompliance(moduleHits, baseline);

  // Step 6: 实时性评估
  const rtAssessment = assessRealtime(moduleHits, baseline);

  // Step 7: 接口变更分析
  const interfaceChanges = analyzeInterfaceChanges(moduleHits, baseline);

  // Step 8: AI 增强分析（调用 LLM 理解需求语义）
  const aiAnalysis = await enhanceWithAI(text, baseline, moduleHits);

  // 组装最终报告
  return buildAlignmentReport({
    moduleHits,
    impactScope,
    riskAssessment,
    debtAssociation,
    asilCheck,
    rtAssessment,
    interfaceChanges,
    aiAnalysis,
    baseline,
    text,
  });
}

/**
 * 检测需求涉及哪些模块（关键词匹配）
 */
function detectModuleHits(text) {
  const hits = [];
  const lowerText = text.toLowerCase();

  for (const [moduleKey, config] of Object.entries(AD_KEYWORDS)) {
    let score = 0;
    const matchedKeywords = [];

    for (const kw of config.keywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        score += 1;
        matchedKeywords.push(kw);
      }
    }

    if (score > 0) {
      hits.push({
        module: moduleKey,
        keywords: AD_KEYWORDS[moduleKey].keywords,
        matchedKeywords: [...new Set(matchedKeywords)],
        score,
        hitRate: score / config.keywords.length,
        baselineModules: config.modules,
      });
    }
  }

  // 按命中分数排序
  return hits.sort((a, b) => b.score - a.score);
}

/**
 * 构建影响范围图（基于依赖关系）
 */
function buildImpactScope(hits, baseline) {
  const directModules = hits.map(h => h.module);
  const allAffected = new Set(directModules);

  // 递归查找间接依赖
  const addDependents = (modules, depth = 0) => {
    if (depth > 3) return; // 最多3层深度
    for (const modKey of modules) {
      const mod = baseline.modules?.[modKey];
      if (!mod) continue;

      // 添加依赖者（当前模块依赖的模块）
      for (const dep of (mod.dependencies || [])) {
        allAffected.add(dep);
      }

      // 添加被依赖者（依赖当前模块的模块）
      for (const [otherKey, otherMod] of Object.entries(baseline.modules || {})) {
        if ((otherMod.dependencies || []).includes(modKey)) {
          allAffected.add(otherKey);
        }
      }
    }
  };

  addDependents(directModules, 0);

  // 分类
  const scope = {
    direct: directModules,
    indirect: [...allAffected].filter(m => !directModules.includes(m)),
    all: [...allAffected],
    depth: {},
  };

  // 计算影响深度
  for (const mod of scope.all) {
    const path = findImpactPath(mod, directModules, baseline);
    scope.depth[mod] = path.length;
  }

  return scope;
}

/**
 * 查找影响路径
 */
function findImpactPath(targetModule, directModules, baseline) {
  // BFS 查找从直接模块到目标模块的路径
  const visited = new Set();
  const queue = directModules.map(m => ({ mod: m, path: [m] }));

  while (queue.length > 0) {
    const { mod, path } = queue.shift();
    if (visited.has(mod)) continue;
    visited.add(mod);

    if (mod === targetModule) return path;

    const bmod = baseline.modules?.[mod];
    if (!bmod) continue;

    // 探索依赖
    for (const dep of (bmod.dependencies || [])) {
      if (!visited.has(dep)) {
        queue.push({ mod: dep, path: [...path, dep] });
      }
    }

    // 探索被依赖
    for (const [otherKey, otherMod] of Object.entries(baseline.modules || {})) {
      if ((otherMod.dependencies || []).includes(mod) && !visited.has(otherKey)) {
        queue.push({ mod: otherKey, path: [...path, otherKey] });
      }
    }
  }

  return [];
}

/**
 * 风险叠加评估
 */
function assessRisks(hits, baseline) {
  const assessment = {
    newRisks: [],        // 需求引入的新风险
    riskEscalation: [],  // 现有风险升级
    overallScore: 0,
    maxSeverity: 'minor',
    criticalModules: [],
  };

  const severityOrder = { critical: 4, major: 3, minor: 2, info: 1 };

  for (const hit of hits) {
    const mod = baseline.modules?.[hit.module];
    if (!mod?.risks) continue;

    for (const risk of mod.risks) {
      assessment.newRisks.push({
        module: hit.module,
        moduleName: mod.name,
        ...risk,
        matchedFrom: hit.matchedKeywords,
      });

      const severity = severityOrder[risk.severity] || 1;
      if (severity >= 3) {
        assessment.criticalModules.push({ module: hit.module, risk });
        assessment.maxSeverity = risk.severity;
      }
    }
  }

  // 计算综合风险分 (0-1)
  const maxRiskScore = assessment.newRisks.length * 0.15;
  assessment.overallScore = Math.min(1, maxRiskScore);

  return assessment;
}

/**
 * 技术债务关联
 */
function associateTechDebts(hits, baseline) {
  const associations = [];
  const affectedModules = hits.map(h => h.module);

  for (const debt of (baseline.techDebts || [])) {
    // 简单路径匹配
    for (const mod of affectedModules) {
      if (debt.file?.includes(mod)) {
        associations.push({
          ...debt,
          relatedModule: mod,
          relation: 'direct',
        });
      }
    }

    // 检查全局债务
    if (debt.severity === 'critical' || debt.severity === 'major') {
      if (!associations.find(a => a.id === debt.id)) {
        associations.push({
          ...debt,
          relatedModule: 'global',
          relation: 'potential',
          note: '高严重性债务，建议一并处理',
        });
      }
    }
  }

  return {
    associations,
    mustFix: associations.filter(a => a.severity === 'critical' || a.severity === 'major'),
    optional: associations.filter(a => a.severity === 'minor'),
  };
}

/**
 * ASIL 合规性检查
 */
function checkASILCompliance(hits, baseline) {
  const results = [];
  const requiredASIL = { D: 4, C: 3, B: 2, A: 1 };

  for (const hit of hits) {
    const mod = baseline.modules?.[hit.module];
    if (!mod || !mod.asil || mod.asil === 'N/A') continue;

    const asilLevel = requiredASIL[mod.asil] || 0;

    results.push({
      module: hit.module,
      moduleName: mod.name,
      requiredASIL: mod.asil,
      level: asilLevel,
      realtime: mod.rt,
      concern: asilLevel >= 3 ? '高ASIL等级，需严格代码评审和验证' :
               asilLevel >= 2 ? '中等ASIL等级，需功能测试覆盖' :
               '低ASIL等级，标准测试流程即可',
    });
  }

  // 高ASIL模块汇总
  const highASIL = results.filter(r => r.level >= 3);

  return {
    results,
    highASILModules: highASIL,
    complianceRequired: highASIL.length > 0,
    summary: highASIL.length > 0
      ? `涉及 ${highASIL.length} 个高ASIL等级模块（ASIL-C/D），需功能安全专项评审`
      : '所有涉及模块均为低ASIL等级，标准评审流程即可',
  };
}

/**
 * 实时性评估
 */
function assessRealtime(hits, baseline) {
  const rtModules = hits.filter(h => {
    const mod = baseline.modules?.[h.module];
    return mod?.rt;
  });

  const results = [];

  for (const hit of rtModules) {
    const mod = baseline.modules?.[hit.module];
    results.push({
      module: hit.module,
      moduleName: mod.name,
      latencyTarget: mod.latency?.target || 'N/A',
      latencyMax: mod.latency?.max || 'N/A',
      concern: mod.latency?.max
        ? `延迟上限 ${mod.latency.max}，需评估新增逻辑影响`
        : '无明确延迟要求',
    });
  }

  return {
    rtModules: results,
    totalRTModules: rtModules.length,
    latencyCritical: results.filter(r => r.latencyMax && r.latencyMax !== 'N/A').length,
    assessment: rtModules.length > 0
      ? `涉及 ${rtModules.length} 个实时模块，新增逻辑必须在延迟上限内执行`
      : '不涉及实时性要求模块',
  };
}

/**
 * 接口变更分析
 */
function analyzeInterfaceChanges(hits, baseline) {
  const changes = {
    internal: [],  // 内部接口变更
    external: [],  // 外部接口变更（ROS Topic / Service / API）
    dataSchema: [], // 数据结构变更
  };

  // 外部接口映射（自动驾驶典型接口）
  const knownInterfaces = {
    perception: [
      '/perception/obstacles', '/perception/lanes', '/perception/traffic_lights',
      '/perception/signs', '/sensor/points_raw', '/sensor/images'
    ],
    localization: [
      '/localization/pose', '/localization/gnss', '/localization/map_pose'
    ],
    planning: [
      '/planning/trajectory', '/planning/path', '/planning/behavior'
    ],
    control: [
      '/control/cmd', '/control/throttle_cmd', '/control/brake_cmd', '/control/steer_cmd'
    ],
  };

  for (const hit of hits) {
    const mod = hit.module;

    // 内部接口
    if (baseline.interfaces) {
      const modInterfaces = baseline.interfaces.filter(i =>
        i.file?.includes(mod) || i.name?.toLowerCase().includes(mod)
      );
      changes.internal.push(...modInterfaces.slice(0, 10).map(i => ({
        name: i.name,
        file: i.file,
        changeType: 'modify',
        note: '建议审查接口签名变更兼容性',
      })));
    }

    // 外部接口（ROS Topic）
    if (knownInterfaces[mod]) {
      for (const topic of knownInterfaces[mod]) {
        changes.external.push({
          topic,
          type: 'ROS2 Topic',
          direction: baseline.modules?.[mod]?.dependents?.length > 0 ? 'output' : 'input',
          changeType: 'review',
        });
      }
    }
  }

  // 数据结构变更检查
  changes.dataSchema = hits.map(h => ({
    module: h.module,
    schemas: ['建议检查相关 msg/srv/action 定义是否需要变更'],
    backwardCompat: '需评估向后兼容性',
  }));

  return changes;
}

/**
 * AI 增强分析
 */
async function enhanceWithAI(text, baseline, hits) {
  const systemPrompt = `你是自动驾驶系统的资深架构师和功能安全专家。
基于以下基线模块信息和需求文本，进行深度语义分析。

模块清单（基线）:
${Object.entries(baseline.modules || {}).map(([k, v]) =>
  `【${k}】${v.name} | ASIL: ${v.asil} | 延迟: ${v.latency?.target} | 风险: ${v.risks?.map(r => r.type).join(', ') || '无'}`
).join('\n')}

请输出：
1. 需求的深层语义理解（业务意图、技术影响）
2. 遗漏的关联模块（基线中未直接命中但实际相关的）
3. 特别注意事项（安全、兼容、性能）
4. 实现建议（优先级、路径、风险缓解）

使用 Markdown 格式输出。`;

  const result = await ai.chat(systemPrompt, `## 需求文本\n${text}\n\n## 已检测到的模块\n${hits.map(h => `- ${h.module}: ${h.matchedKeywords.join(', ')}`).join('\n')}`);

  return result || 'AI 分析未可用（请配置 API Key）';
}

/**
 * 构建最终对齐报告
 */
function buildAlignmentReport(data) {
  const { moduleHits, impactScope, riskAssessment, debtAssociation,
          asilCheck, rtAssessment, interfaceChanges, aiAnalysis, baseline, text } = data;

  // Markdown 渲染辅助
  const severityColor = { critical: '🔴', major: '🟠', minor: '🟡', info: '🔵' };

  // 生成模块命中表格
  const moduleHitsMd = moduleHits.map(h => [
    h.module,
    baseline.modules?.[h.module]?.name || h.module,
    h.matchedKeywords.slice(0, 3).join(', '),
    `${h.score}次`,
    h.hitRate > 0.1 ? '🟢 高' : h.hitRate > 0.05 ? '🟡 中' : '🔵 低',
  ]);

  // 生成影响范围树
  const impactTree = buildImpactTree(impactScope, baseline);

  // 生成风险表
  const riskMd = riskAssessment.newRisks.map(r => [
    severityColor[r.severity] || '⚪',
    baseline.modules?.[r.module]?.name || r.module,
    r.type,
    r.description || r.mitigation,
    r.severity,
  ]);

  // 生成债务表
  const debtMd = debtAssociation.mustFix.map(d => [
    d.id,
    d.file?.split('/').pop() || 'global',
    d.type,
    d.description,
    d.severity,
    d.relation === 'direct' ? '🔴 直接' : '🟡 可能',
  ]);

  // 生成 ASIL 表
  const asilMd = asilCheck.results.map(r => [
    baseline.modules?.[r.module]?.name || r.module,
    `ASIL-${r.requiredASIL}`,
    r.latencyTarget,
    r.concern,
  ]);

  return {
    // 结构化数据
    structured: {
      moduleHits,
      impactScope,
      riskAssessment,
      debtAssociation,
      asilCheck,
      rtAssessment,
      interfaceChanges,
    },

    // Markdown 报告
    markdown: generateMarkdown({
      moduleHits, moduleHitsMd, impactScope, impactTree,
      riskAssessment, riskMd, debtAssociation, debtMd,
      asilCheck, asilMd, rtAssessment, interfaceChanges,
      aiAnalysis, baseline,
    }),
  };
}

function buildImpactTree(scope, baseline) {
  const lines = [];
  const addLine = (mod, indent, isLast) => {
    const modInfo = baseline.modules?.[mod];
    const prefix = isLast ? '└── ' : '├── ';
    const asil = modInfo?.asil ? ` [ASIL-${modInfo.asil}]` : '';
    const rt = modInfo?.rt ? ' ⏱️' : '';
    lines.push(`${'    '.repeat(indent)}${prefix}${modInfo?.name || mod}${asil}${rt}`);
  };

  // 直接影响模块
  scope.direct.forEach((mod, i) => {
    addLine(mod, 0, i === scope.direct.length - 1 && scope.indirect.length === 0);
  });

  // 间接影响模块
  if (scope.indirect.length > 0) {
    lines.push('');
    scope.indirect.forEach((mod, i) => {
      addLine(mod, 1, i === scope.indirect.length - 1);
    });
  }

  return lines.join('\n');
}

function generateMarkdown(data) {
  const { moduleHits, moduleHitsMd, impactScope, impactTree,
          riskAssessment, riskMd, debtAssociation, debtMd,
          asilCheck, asilMd, rtAssessment, interfaceChanges, aiAnalysis, baseline } = data;

  const severityBadge = { critical: '🔴 阻断', major: '🟠 重要', minor: '🟡 次要', info: '🔵 参考' };

  let md = `# 🎯 需求-基线对齐分析报告

> 自动驾驶系统专项分析 | ${new Date().toLocaleString('zh-CN')}

---

## 📊 分析摘要

| 维度 | 结果 |
|------|------|
| 命中模块数 | ${moduleHits.length} 个 |
| 影响范围 | ${impactScope.all.length} 个模块（直接${impactScope.direct.length} + 间接${impactScope.indirect.length}） |
| 新增风险 | ${riskAssessment.newRisks.length} 项（最高: ${severityBadge[riskAssessment.maxSeverity] || '无'}) |
| 涉及技术债务 | ${debtAssociation.associations.length} 项（必须修复: ${debtAssociation.mustFix.length}） |
| 高ASIL模块 | ${asilCheck.highASILModules.length} 个 |
| 实时性模块 | ${rtAssessment.rtModules.length} 个 |

---

## 🔗 模块命中分析

### 命中详情

| 模块标识 | 模块名称 | 命中关键词 | 命中次数 | 匹配度 |
|---------|---------|-----------|---------|--------|
${moduleHitsMd.map(row => `| ${row.join(' | ')} |`).join('\n')}

${moduleHits.length === 0 ? '> ⚠️ 未检测到明确的自动驾驶模块，建议检查需求描述是否包含足够的专业术语' : ''}

---

## 📐 影响范围分析

### 直接影响（必须修改）

\`\`\`
${impactScope.direct.map((m, i) => {
  const mod = baseline.modules?.[m];
  return `📦 ${mod?.name || m} ${mod?.asil ? `[ASIL-${mod.asil}]` : ''} ${mod?.rt ? '⏱️ 实时' : ''}`;
}).join('\n')}
\`\`\`

### 间接影响（可能波及）

${impactScope.indirect.length > 0 ? `\`\`\`
${impactScope.indirect.map(m => {
  const mod = baseline.modules?.[m];
  return `↪  ${mod?.name || m}`;
}).join('\n')}
\`\`\`` : '> 无间接影响模块'}

### 影响链路图

\`\`\`
${impactTree || '// 无依赖数据'}
\`\`\`

---

## ⚠️ 风险叠加评估

### 风险总览

| 风险等级 | 数量 |
|---------|------|
| 🔴 阻断级 | ${riskAssessment.newRisks.filter(r => r.severity === 'critical').length} |
| 🟠 关键级 | ${riskAssessment.newRisks.filter(r => r.severity === 'major').length} |
| 🟡 重要级 | ${riskAssessment.newRisks.filter(r => r.severity === 'minor').length} |

### 详细风险

| 级别 | 模块 | 风险类型 | 缓解措施 | 严重性 |
|------|------|---------|---------|--------|
${riskMd.map(row => `| ${row.join(' | ')} |`).join('\n')}

${riskAssessment.criticalModules.length > 0 ? `> 🔴 **警告**: ${riskAssessment.criticalModules.length} 个关键风险，必须在上线前解决` : ''}

---

## 🔧 技术债务关联

### 必须修复

| ID | 文件 | 类型 | 描述 | 严重性 | 关联 |
|----|------|------|------|--------|------|
${debtMd.map(row => `| ${row.join(' | ')} |`).join('\n')}

${debtMd.length === 0 ? '> 所有涉及模块无已知高严重性技术债务' : ''}

---

## 🛡️ ASIL 合规性检查

> ASIL (Automotive Safety Integration Level) 汽车安全完整性等级

| 模块 | ASIL等级 | 延迟要求 | 合规建议 |
|------|---------|---------|---------|
${asilMd.map(row => `| ${row.join(' | ')} |`).join('\n')}

${asilCheck.complianceRequired
  ? `\n> 🛡️ **功能安全提示**: 涉及高ASIL等级模块，需执行 ISO26262 专项评审，代码变更必须通过 SIL${asilCheck.highASILModules[0]?.requiredASIL || 'B'} 级别测试`
  : '\n> ✅ 所有涉及模块均为低ASIL等级，使用标准评审流程'}

---

## ⏱️ 实时性评估

${rtAssessment.assessment}

| 模块 | 延迟目标 | 最大延迟 | 评估 |
|------|---------|---------|------|
${rtAssessment.rtModules.map(r => `| ${r.moduleName} | ${r.latencyTarget} | ${r.latencyMax} | ${r.concern} |`).join('\n')}

${rtAssessment.latencyCritical > 0 ? '\n> ⏱️ **实时性提示**: 需评估新增逻辑对延迟的影响，建议在目标系统上做性能测试' : ''}

---

## 🔌 接口变更分析

### 外部接口（ROS Topic / Service）

${interfaceChanges.external.length > 0 ? `| Topic | 类型 | 方向 | 变更建议 |
|------|------|------|---------|
${interfaceChanges.external.map(i => `| ${i.topic} | ${i.type} | ${i.direction} | ${i.changeType} |`).join('\n')}` : '> 无显著外部接口变更'}

### 内部接口

${interfaceChanges.internal.length > 0 ? `涉及 ${interfaceChanges.internal.length} 个内部接口变更，建议：\n- 评审接口签名变更的前向兼容性\n- 补充接口变更的版本说明\n- 确保调用方同步更新` : '> 无显著内部接口变更'}

---

## 🤖 AI 深度语义分析

${aiAnalysis}

---

## 📋 综合建议

### 🎯 实施优先级

${riskAssessment.criticalModules.length > 0 ? `1. **立即处理** — ${riskAssessment.criticalModules.map(m => m.module).join(', ')} 的关键风险
2. ` : '1. '}
2. ${debtAssociation.mustFix.length > 0 ? `清理技术债务 — ${debtAssociation.mustFix.length} 项必须修复` : '推进功能开发'}
3. ${asilCheck.complianceRequired ? '功能安全评审 — 涉及高ASIL模块，需ISO26262评审' : '按标准流程推进'}
4. ${rtAssessment.latencyCritical > 0 ? '性能测试 — 实时性模块需做延迟测试' : '完善测试覆盖'}

### 📦 推荐开发包拆分

| 包 | 包含模块 | 预估SP | 依赖关系 |
|----|---------|--------|---------|
${impactScope.direct.map((m, i) => {
  const mod = baseline.modules?.[m];
  return `| ${i + 1} | ${mod?.name || m} | ${estimateSP(mod)} | 前置: ${(mod?.dependencies || []).filter(d => impactScope.direct.includes(d)).join(', ') || '无'} |`;
}).join('\n')}

---

> 报告生成时间: ${new Date().toLocaleString('zh-CN')}
> 分析引擎: DevGuard Agent v2.0 — 自动驾驶专项
`;

  return md;
}

function estimateSP(mod) {
  if (!mod) return 3;
  if (mod.asil === 'D') return 8;
  if (mod.asil === 'C') return 5;
  if (mod.rt) return 5;
  return 3;
}

module.exports = { alignRequirement, detectModuleHits, buildImpactScope };
