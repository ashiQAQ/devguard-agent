/**
 * feature-aligner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * 功能点 vs 架构基线 — 对齐分析引擎
 *
 * 核心算法：
 *   1. 功能点关键词 + 语义 → 基线模块匹配
 *   2. 功能点 vs 基线模块功能 → 识别「相同/相似/新增/修改」
 *   3. 生成差异矩阵 + 影响分析报告
 *
 * 对齐类型：
 *   ✅ MATCH        — 功能点与基线完全匹配
 *   🔄 PARTIAL      — 部分匹配，需修改基线
 *   🆕 NEW          — 全新功能，基线中不存在
 *   🔄 MODIFIED     — 基线中存在但需变更
 *   ❌ REMOVED      — 基线中存在但需求删除
 *   ❓ UNCLEAR      — 无法确定，需要人工确认
 *
 * 输出：
 *   {
 *     summary: { matched, partial, new, modified, total },
 *     alignmentMatrix: [ { featureId, featureName, moduleId, moduleName,
 *                         matchType, confidence, reasons, risks } ],
 *     moduleImpact: { [moduleId]: { existingFeatures, changedFeatures,
 *                                    newFeatures, deletedFeatures } },
 *     recommendations: [ ...strings ],
 *     report: "Markdown report",
 *   }
 */

'use strict';

const _ = require('lodash');

// ─── AD领域知识库 ─────────────────────────────────────────────────────────────

const AD_MODULE_KEYWORDS = {
  perception: {
    name: '感知模块',
    keywords: ['感知', '检测', '识别', '分割', 'fusion', 'perception', 'camera', 'lidar', 'radar',
               'obstacle', 'lane', 'traffic', 'sign', 'light', 'freespace', 'occupancy', 'tracking',
               '传感器', '障碍物', '车道线', '红绿灯', '目标检测', '跟踪', '点云', '图像'],
    topics: ['/apollo/sensor/lidar', '/apollo/sensor/camera', '/apollo/sensor/radar', '/apollo/perception'],
    asil: 'B',
    realtime: true,
  },
  planning: {
    name: '决策规划模块',
    keywords: ['规划', 'planning', 'trajectory', 'path', 'route', 'behavior', 'decision', 'routing',
               'scenario', 'lane_change', 'overtake', 'junction', '低速', 'NOA', 'NOP',
               '变道', '超车', '匝道', '路径', '轨迹', '行为决策', '场景'],
    topics: ['/apollo/planning', '/apollo/routing'],
    asil: 'D',
    realtime: true,
  },
  control: {
    name: '车辆控制模块',
    keywords: ['控制', 'control', 'throttle', 'brake', 'steer', 'pid', 'mpc', 'actuator',
               'lateral', 'longitudinal', 'vehicle', 'aeb', 'acc', 'lcc', '横向', '纵向',
               '制动', '油门', '方向盘', '紧急制动', '自适应巡航'],
    topics: ['/apollo/control', '/apollo/canbus'],
    asil: 'D',
    realtime: true,
  },
  localization: {
    name: '定位模块',
    keywords: ['定位', 'localization', 'pose', 'gnss', 'imu', 'ins', 'rtk', 'odometry', 'slam',
               '坐标', '位置', '姿态', '里程计', '地图匹配'],
    topics: ['/apollo/localization'],
    asil: 'C',
    realtime: true,
  },
  prediction: {
    name: '轨迹预测模块',
    keywords: ['预测', 'prediction', 'predict', 'intent', 'trajectory', 'motion', 'behavior',
               '意图', '轨迹预测', '障碍物预测'],
    topics: ['/apollo/prediction'],
    asil: 'B',
    realtime: true,
  },
  hdmap: {
    name: '高精地图模块',
    keywords: ['地图', 'map', 'hdmap', 'lane_info', 'road', 'junction', 'crosswalk',
               '高精度', '拓扑', '路由', 'road_element'],
    topics: ['/apollo/map'],
    asil: 'C',
    realtime: false,
  },
  canbus: {
    name: 'CAN总线模块',
    keywords: ['canbus', 'can', 'chassis', 'vehicle', 'signal', 'message', 'CANFD',
               '总线', '底盘', '车辆信号'],
    topics: ['/apollo/canbus'],
    asil: 'D',
    realtime: true,
  },
  simulation: {
    name: '仿真测试模块',
    keywords: ['simulation', 'sim', 'mock', 'fake', 'test', 'benchmark', '回灌', '仿真', '测试'],
    topics: [],
    asil: 'N/A',
    realtime: false,
  },
  safety: {
    name: '功能安全模块',
    keywords: ['safety', 'fault', 'watchdog', 'redundant', 'failsafe', 'emergency', 'iso26262',
               '功能安全', '冗余', '故障', '监控', '看门狗', '应急', 'MRC', 'ASILD'],
    topics: [],
    asil: 'D',
    realtime: true,
  },
  monitor: {
    name: '系统监控模块',
    keywords: ['monitor', 'metric', 'health', 'status', 'heartbeat', 'diag', '监控', '诊断', '状态'],
    topics: [],
    asil: 'N/A',
    realtime: false,
  },
};

// ─── 对齐算法 ────────────────────────────────────────────────────────────────

class FeatureAligner {
  /**
   * @param {Object} baseline FeatureBaseline（来自 code-scanner.js）
   * @param {Object} config 对齐配置
   */
  constructor(baseline, config = {}) {
    this.baseline = baseline;      // 代码扫描基线
    this.config = {
      matchThreshold:   config.matchThreshold   || 0.5,
      semanticWeight:    config.semanticWeight   || 0.6,
      keywordWeight:     config.keywordWeight    || 0.4,
      showUnmatched:    config.showUnmatchedFeatures !== false,
      ...config,
    };
  }

  // ─── 入口 ─────────────────────────────────────────────────────────────────

  /**
   * 对齐功能点列表与基线
   * @param {Array} featureItems  FeatureItem[]（来自 req-parser.js）
   * @returns {Object} 对齐结果
   */
  align(featureItems) {
    const matrix = featureItems.map(f => this._alignSingle(f));

    // 分类统计
    const summary = {
      total:       matrix.length,
      matched:     matrix.filter(r => r.matchType === 'MATCH').length,
      partial:     matrix.filter(r => r.matchType === 'PARTIAL').length,
      modified:    matrix.filter(r => r.matchType === 'MODIFIED').length,
      new:         matrix.filter(r => r.matchType === 'NEW').length,
      unclear:     matrix.filter(r => r.matchType === 'UNCLEAR').length,
    };

    // 模块影响分析
    const moduleImpact = this._buildModuleImpact(matrix);

    // 建议
    const recommendations = this._buildRecommendations(matrix, moduleImpact);

    // 生成 Markdown 报告
    const report = this._buildReport(matrix, summary, moduleImpact, recommendations);

    return {
      summary,
      alignmentMatrix: matrix,
      moduleImpact,
      recommendations,
      report,
    };
  }

  // ─── 单功能点对齐 ──────────────────────────────────────────────────────────

  _alignSingle(feature) {
    const { name, description, keywords } = feature;

    // 合并所有文本用于匹配
    const allText = [name, description, ...(keywords || [])].join(' ').toLowerCase();
    const kwSet   = new Set((keywords || []).map(k => k.toLowerCase()));

    // ── Step 1: 关键词精确匹配 → 识别目标模块 ──
    const moduleScores = {};
    for (const [modId, modDef] of Object.entries(AD_MODULE_KEYWORDS)) {
      let score = 0;
      const matched = [];
      const reasons = [];

      for (const kw of modDef.keywords) {
        const kl = kw.toLowerCase();
        if (allText.includes(kl)) {
          score += 1;
          matched.push(kw);
          reasons.push(`关键词「${kw}」`);
        }
      }

      // 检查是否命中基线中的实际功能
      const baselineMod = this.baseline.modules?.[modId];
      if (baselineMod) {
        // 检查基线中的类/函数名是否被提及
        for (const cls of (baselineMod.classes || [])) {
          const cl = cls.name.toLowerCase();
          if (allText.includes(cl)) {
            score += 2;
            reasons.push(`基线类「${cls.name}」`);
          }
        }
        for (const fn of (baselineMod.functions || [])) {
          const fl = fn.name.toLowerCase();
          if (allText.includes(fl) && fl.length > 4) {
            score += 1.5;
            reasons.push(`基线函数「${fn.name}」`);
          }
        }
        for (const tp of (baselineMod.topics || [])) {
          if (allText.includes(tp.toLowerCase())) {
            score += 2;
            reasons.push(`基线Topic「${tp}」`);
          }
        }
      }

      if (score > 0) {
        moduleScores[modId] = { score, matched, reasons };
      }
    }

    // 找最佳匹配模块
    const sorted = Object.entries(moduleScores)
      .sort(([, a], [, b]) => b.score - a.score);

    let bestModule   = null;
    let bestScore    = 0;
    let bestReasons  = [];
    let confidence   = 0;

    if (sorted.length > 0) {
      bestModule  = sorted[0][0];
      bestScore   = sorted[0][1].score;
      bestReasons = sorted[0][1].reasons;
    }

    // ── Step 2: 确定匹配类型 ──
    const baselineMod = bestModule ? this.baseline.modules?.[bestModule] : null;
    const baseKwCount = AD_MODULE_KEYWORDS[bestModule]?.keywords?.length || 1;
    confidence = Math.min(bestScore / baseKwCount * 1.5, 1.0);

    let matchType;
    if (!bestModule || confidence < this.config.matchThreshold) {
      matchType = confidence > 0.3 ? 'PARTIAL' : 'NEW';
    } else if (!baselineMod || baselineMod.featureCount === 0) {
      matchType = confidence >= 0.7 ? 'NEW' : 'PARTIAL';
    } else {
      // 检查是否有基线中的类/函数被明确提及
      const hasExplicitMention = bestReasons.some(r =>
        r.includes('基线类') || r.includes('基线函数') || r.includes('基线Topic')
      );
      if (hasExplicitMention) {
        matchType = confidence >= 0.7 ? 'MATCH' : 'MODIFIED';
      } else if (confidence >= 0.6) {
        matchType = 'PARTIAL';
      } else {
        matchType = 'NEW';
      }
    }

    // ── Step 3: 风险识别 ──
    const risks = this._identifyRisks(bestModule, feature, matchType, bestReasons);

    // ── Step 4: 相关接口变更 ──
    const interfaceChanges = this._identifyInterfaceChanges(bestModule, feature);

    return {
      featureId:   feature.id,
      featureName: name,
      featureDesc: description.substring(0, 200),
      priority:    feature.priority || 'P1',
      matchType,
      moduleId:    bestModule,
      moduleName:  AD_MODULE_KEYWORDS[bestModule]?.name || '未知模块',
      confidence:  Math.round(confidence * 100),
      reasons:     bestReasons,
      keywords:    keywords,
      risks,
      interfaceChanges,
      baselineFeatures: baselineMod
        ? this._summarizeBaselineFeatures(baselineMod)
        : [],
      recommendation: this._singleRecommendation(matchType, bestModule, feature),
    };
  }

  // ─── 风险识别 ──────────────────────────────────────────────────────────────

  _identifyRisks(moduleId, feature, matchType, reasons) {
    const risks = [];
    const modDef = AD_MODULE_KEYWORDS[moduleId];

    // ASIL 高风险模块
    if (modDef?.asil === 'D' && matchType !== 'MATCH') {
      risks.push({
        type: 'safety_critical',
        severity: 'critical',
        module: modDef.name,
        message: `涉及 ASIL-D 安全关键模块（${modDef.name}），任何变更需 ISO26262 评审`,
      });
    }

    // 实时性影响
    if (modDef?.realtime && matchType !== 'MATCH') {
      risks.push({
        type: 'realtime_impact',
        severity: 'medium',
        module: modDef.name,
        message: `涉及实时模块（延迟要求 ${this._getLatencyReq(moduleId)}），变更需性能测试验证`,
      });
    }

    // 跨模块依赖
    const crossModDeps = this._detectCrossModuleDeps(feature);
    if (crossModDeps.length > 0) {
      risks.push({
        type: 'cross_module',
        severity: 'medium',
        message: `功能涉及多个模块：${crossModDeps.join(', ')}，需协调评审`,
      });
    }

    // 接口变更风险
    if (matchType === 'MODIFIED' || matchType === 'PARTIAL') {
      risks.push({
        type: 'interface_change',
        severity: 'high',
        message: '涉及接口变更，可能影响下游模块',
      });
    }

    return risks;
  }

  _detectCrossModuleDeps(feature) {
    const text = [feature.name, feature.description, ...(feature.keywords || [])].join(' ');
    const deps = [];
    for (const [modId, def] of Object.entries(AD_MODULE_KEYWORDS)) {
      if (def.keywords.some(kw => text.includes(kw))) {
        deps.push(def.name);
      }
    }
    return [...new Set(deps)].slice(0, 4);
  }

  _getLatencyReq(moduleId) {
    const reqs = {
      safety: '1ms', monitor: '5ms', canbus: '10ms',
      control: '20ms', localization: '20ms', perception: '50ms',
      prediction: '30ms', planning: '100ms',
    };
    return reqs[moduleId] || '100ms';
  }

  _identifyInterfaceChanges(moduleId, feature) {
    const text = [feature.name, feature.description].join(' ').toLowerCase();
    const changes = [];

    if (/topic|发布|订阅|ros|interface|接口/.test(text)) {
      changes.push({ type: 'topic', action: '可能新增或修改 ROS Topic' });
    }
    if (/api|函数|方法|service|服务|call/.test(text)) {
      changes.push({ type: 'api', action: '可能新增或修改 API/函数接口' });
    }
    if (/参数|配置|config/.test(text)) {
      changes.push({ type: 'config', action: '可能涉及参数或配置变更' });
    }

    return changes;
  }

  _summarizeBaselineFeatures(mod) {
    const classes = (mod.classes || []).slice(0, 5).map(c => c.name);
    const topics  = (mod.topics || []).slice(0, 5);
    return { classes, topics, total: mod.featureCount };
  }

  _singleRecommendation(matchType, moduleId, feature) {
    const modDef = AD_MODULE_KEYWORDS[moduleId];
    switch (matchType) {
      case 'MATCH':
        return `✅ 功能「${feature.name}」已存在于基线中（${modDef?.name}），直接复用`;
      case 'PARTIAL':
        return `🔄 功能「${feature.name}」部分匹配 ${modDef?.name}，需在现有基础上扩展`;
      case 'MODIFIED':
        return `⚠️ 功能「${feature.name}」需修改基线中的实现，请确认变更范围`;
      case 'NEW':
        return `🆕 功能「${feature.name}」为全新功能，建议新增模块并补充测试`;
      default:
        return `❓ 功能「${feature.name}」无法自动对齐，需人工确认`;
    }
  }

  // ─── 模块影响聚合 ──────────────────────────────────────────────────────────

  _buildModuleImpact(matrix) {
    const impact = {};

    for (const item of matrix) {
      if (!item.moduleId) continue;

      if (!impact[item.moduleId]) {
        impact[item.moduleId] = {
          moduleId:      item.moduleId,
          moduleName:    item.moduleName,
          matched:       [],
          partial:       [],
          modified:      [],
          new:           [],
          unclear:       [],
          risks:         [],
          interfaces:    [],
          priority:      item.priority,
        };
      }

      const entry = impact[item.moduleId];
      const record = {
        featureId:   item.featureId,
        featureName: item.featureName,
        confidence:  item.confidence,
        reasons:     item.reasons,
      };

      switch (item.matchType) {
        case 'MATCH':    entry.matched.push(record); break;
        case 'PARTIAL':  entry.partial.push(record); break;
        case 'MODIFIED': entry.modified.push(record); break;
        case 'NEW':      entry.new.push(record); break;
        default:         entry.unclear.push(record);
      }

      // 聚合风险
      for (const risk of item.risks) {
        if (!entry.risks.find(r => r.type === risk.type)) {
          entry.risks.push(risk);
        }
      }

      // 聚合接口变更
      for (const iface of item.interfaceChanges) {
        if (!entry.interfaces.find(i => i.type === iface.type)) {
          entry.interfaces.push(iface);
        }
      }

      // 优先级取最高
      if (item.priority === 'P0' || (entry.priority !== 'P0' && item.priority === 'P1')) {
        entry.priority = item.priority;
      }
    }

    return impact;
  }

  // ─── 建议生成 ──────────────────────────────────────────────────────────────

  _buildRecommendations(matrix, moduleImpact) {
    const recs = [];

    // 阻断级建议
    const p0New = matrix.filter(m => m.priority === 'P0' && m.matchType === 'NEW');
    const p0Partial = matrix.filter(m => m.priority === 'P0' && m.matchType === 'PARTIAL');
    if (p0New.length > 0) {
      recs.push({
        priority: 'P0',
        severity: 'blocker',
        text: `🔴 ${p0New.length} 个 P0 需求为全新功能（无基线匹配），必须先完成架构设计再开发`,
        items: p0New.map(m => m.featureName),
      });
    }
    if (p0Partial.length > 0) {
      recs.push({
        priority: 'P0',
        severity: 'high',
        text: `🟠 ${p0Partial.length} 个 P0 需求部分匹配基线，变更范围较大，需专项评审`,
        items: p0Partial.map(m => m.featureName),
      });
    }

    // ASIL 模块建议
    const asildFeatures = matrix.filter(m =>
      m.moduleId && AD_MODULE_KEYWORDS[m.moduleId]?.asil === 'D'
    );
    if (asildFeatures.length > 0) {
      recs.push({
        priority: 'P1',
        severity: 'critical',
        text: `🛡️ ${asildFeatures.length} 个功能涉及 ASIL-D 模块（${asildFeatures.map(m => m.moduleName).join(', ')}），必须执行 ISO26262 安全评审`,
        items: [],
      });
    }

    // 实时性建议
    const realtimeFeatures = matrix.filter(m =>
      m.moduleId && AD_MODULE_KEYWORDS[m.moduleId]?.realtime && m.matchType !== 'MATCH'
    );
    if (realtimeFeatures.length > 0) {
      const mods = [...new Set(realtimeFeatures.map(m => m.moduleName))].join(', ');
      recs.push({
        priority: 'P1',
        severity: 'medium',
        text: `⏱️ ${realtimeFeatures.length} 个功能涉及实时模块（${mods}），需做延迟影响测试`,
        items: [],
      });
    }

    // 接口变更建议
    const ifaceChanges = matrix.filter(m =>
      m.interfaceChanges && m.interfaceChanges.length > 0 && m.matchType !== 'MATCH'
    );
    if (ifaceChanges.length > 0) {
      recs.push({
        priority: 'P1',
        severity: 'high',
        text: `🔌 ${ifaceChanges.length} 个功能涉及接口变更，必须同步更新接口文档并通知下游`,
        items: ifaceChanges.map(m => `${m.featureName} (${m.interfaceChanges.map(i => i.type).join(', ')})`),
      });
    }

    // 无基线功能
    const noBaseline = matrix.filter(m => m.matchType === 'NEW' && m.priority !== 'P0');
    if (noBaseline.length > 0) {
      recs.push({
        priority: 'P2',
        severity: 'low',
        text: `ℹ️ ${noBaseline.length} 个功能无基线匹配，建议先创建功能骨架再开发`,
        items: noBaseline.map(m => m.featureName),
      });
    }

    return recs;
  }

  // ─── Markdown 报告生成 ─────────────────────────────────────────────────────

  _buildReport(matrix, summary, moduleImpact, recommendations) {
    const lines = [];

    lines.push(`# 🎯 功能对齐分析报告`);
    lines.push(`\n> 自动驾驶功能基线对齐分析 | ${new Date().toLocaleString('zh-CN')}\n`);
    lines.push(`---\n`);
    lines.push(`\n## 📊 分析摘要\n`);
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 功能点总数 | ${summary.total} |`);
    lines.push(`| ✅ 完全匹配 | ${summary.matched} |`);
    lines.push(`| 🔄 部分匹配 | ${summary.partial} |`);
    lines.push(`| ⚠️ 需修改 | ${summary.modified} |`);
    lines.push(`| 🆕 全新功能 | ${summary.new} |`);
    lines.push(`| ❓ 需确认 | ${summary.unclear} |`);
    lines.push(`\n`);
    lines.push(`> **匹配率**: ${summary.total > 0 ? Math.round((summary.matched + summary.partial) / summary.total * 100) : 0}% 的功能与基线相关\n`);

    // 优先级分布
    const p0 = matrix.filter(m => m.priority === 'P0').length;
    const p1 = matrix.filter(m => m.priority === 'P1').length;
    const p2 = matrix.filter(m => m.priority === 'P2').length;
    lines.push(`\n### 优先级分布\n`);
    lines.push(`- 🔴 **P0（阻断）**: ${p0} 个`);
    lines.push(`- 🟠 **P1（重要）**: ${p1} 个`);
    lines.push(`- 🟡 **P2（可选）**: ${p2} 个`);

    // 详细对齐矩阵
    lines.push(`\n---\n`);
    lines.push(`\n## 📋 功能对齐矩阵\n`);
    lines.push(`\n| 功能 | 优先级 | 对齐类型 | 目标模块 | 置信度 | 说明 |`);
    lines.push(`|------|--------|---------|---------|--------|------|`);
    for (const item of matrix) {
      const emoji = { MATCH: '✅', PARTIAL: '🔄', MODIFIED: '⚠️', NEW: '🆕', UNCLEAR: '❓' }[item.matchType] || '❓';
      const modColor = item.confidence >= 70 ? '🟢' : item.confidence >= 50 ? '🟡' : '🔴';
      lines.push(`| ${item.featureName.substring(0, 30)} | ${item.priority} | ${emoji} | ${modColor} ${item.moduleName} | ${item.confidence}% | ${item.reasons.slice(0, 2).join(', ') || '—'} |`);
    }

    // 模块影响
    lines.push(`\n---\n`);
    lines.push(`\n## 📦 模块影响分析\n`);
    const modEntries = Object.values(moduleImpact).sort((a, b) => {
      const p = { P0: 0, P1: 1, P2: 2 };
      return (p[a.priority] || 3) - (p[b.priority] || 3);
    });

    for (const mod of modEntries) {
      const total = mod.matched.length + mod.partial.length + mod.modified.length + mod.new.length;
      if (total === 0) continue;
      lines.push(`\n### ${mod.moduleName} (${total} 个功能)\n`);
      lines.push(`| 类型 | 数量 | 详情 |`);
      lines.push(`|------|------|------|`);
      if (mod.matched.length) lines.push(`| ✅ 完全匹配 | ${mod.matched.length} | ${mod.matched.map(m => m.featureName).join(', ')} |`);
      if (mod.partial.length) lines.push(`| 🔄 部分匹配 | ${mod.partial.length} | ${mod.partial.map(m => m.featureName).join(', ')} |`);
      if (mod.modified.length) lines.push(`| ⚠️ 需修改 | ${mod.modified.length} | ${mod.modified.map(m => m.featureName).join(', ')} |`);
      if (mod.new.length) lines.push(`| 🆕 全新 | ${mod.new.length} | ${mod.new.map(m => m.featureName).join(', ')} |`);
      if (mod.risks.length) {
        lines.push(`\n⚠️ **风险**: ${mod.risks.map(r => `${r.message}（${r.severity}级）`).join(' | ')}`);
      }
    }

    // 建议
    if (recommendations.length > 0) {
      lines.push(`\n---\n`);
      lines.push(`\n## 🏁 实施建议\n`);
      for (const rec of recommendations) {
        const badge = rec.severity === 'blocker' ? '🔴' : rec.severity === 'critical' ? '🟠' : rec.severity === 'high' ? '🟡' : '🔵';
        lines.push(`\n${badge} **[${rec.priority}]** ${rec.text}`);
        if (rec.items && rec.items.length > 0) {
          lines.push(`\n   > ${rec.items.slice(0, 5).join(' | ')}${rec.items.length > 5 ? ` ...（共${rec.items.length}项）` : ''}`);
        }
      }
    }

    lines.push(`\n---\n`);
    lines.push(`\n> 🤖 DevGuard Agent v2.1 | 基线版本: ${this.baseline.id || 'N/A'} | 扫描时间: ${this.baseline.scanTime || 'N/A'}`);

    return lines.join('\n');
  }
}

// ─── 导出 ────────────────────────────────────────────────────────────────────

module.exports = { FeatureAligner, AD_MODULE_KEYWORDS };
