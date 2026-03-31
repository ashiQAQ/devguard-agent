/**
 * ============================================================
 * DevGuard Agent — 完整需求分析+下发流程演示
 * ============================================================
 *
 * 模拟场景：
 *   工程师提交了一个 PR："城市NOA感知融合增强"
 *
 * 完整流程：
 *   Step 1: Webhook 接收 → 自动解析 PR 元信息
 *   Step 2: ReqParser 解析需求文档 → 提取功能点
 *   Step 3: 基线选择 → 加载 Apollo 感知系统基线
 *   Step 4: FeatureAligner 对齐 → 模块映射 + 风险评估
 *   Step 5: 自动化代码评审 → Diff 分析
 *   Step 6: 生成综合报告 → 下发评审意见
 */

'use strict';

const path = require('path');

// ─── 模拟：PR Webhook Event ───────────────────────────────────────────────────

const MOCK_PR_EVENT = {
  type: 'github.pr.opened',       // 事件类型
  prNumber: 8847,
  repository: {
    full_name: 'ApolloAuto/apollo',
  },
  pull_request: {
    number: 8847,
    title: 'feat: 城市NOA感知融合增强 — 多LiDAR前融合 + 雨天降级策略',
    body: `## 📋 PR 描述

### 变更目的
提升城市NOA在城市复杂场景（雨天、隧道、夜间）下的感知稳定性。

### 主要变更
1. 新增多激光雷达（3→5）前融合模块，降低单点故障风险
2. 新增自适应雨天降级策略（雨量分级 → 感知精度自适应）
3. 优化车道线检测算法（提升遮挡场景准确率）

### 涉及模块
- \`perception/obstacle/onboard\` — 障碍物感知
- \`perception/fusion\` — 融合模块（新增）
- \`perception/lanes\` — 车道线检测

### 性能影响
- 感知延迟：当前 65ms → 预计 72ms（+7ms，可接受）
- 算力：GPU 利用率 78% → 预计 85%

### 测试计划
- [x] 单元测试（覆盖率 > 80%）
- [ ] 封闭场地测试
- [ ] 雨天场景专项测试
- [ ] 回归测试

### 风险自评
- ASIL-B 模块变更，代码审查后合入
- 不涉及控制链路，安全影响低
`,
    user: { login: 'zhangsan-dev' },
    head: { ref: 'feat/city-noa-perception-fusion' },
    base: { ref: 'main' },
    additions: 2847,
    deletions: 312,
    changed_files: 18,
    state: 'open',
    html_url: 'https://github.com/ApolloAuto/apollo/pull/8847',
    created_at: '2026-03-30T01:00:00Z',
    updated_at: '2026-03-30T01:00:00Z',
  },
};

// ─── 模拟：Apollo 感知系统基线 ────────────────────────────────────────────────

const MOCK_BASELINE = {
  id: 'baseline-apollo-perception-001',
  name: 'Apollo感知系统基线',
  version: '3.5.0',
  language: 'cpp',
  createdAt: '2026-01-15T00:00:00Z',
  scanTime: '2026-01-15T12:00:00Z',
  architecture: {
    pattern: 'distributed-real-time',
    rosVersion: 'ROS2 Humble',
    communication: 'CyberRT / Pub-Sub',
    realtime: true,
    safetyLevel: 'ASIL-D',
  },

  modules: {
    perception: {
      id: 'perception',
      name: '感知模块',
      asil: 'B',
      rt: true,
      latency: { target: '50ms', max: '80ms' },
      classes: [
        { name: 'ApolloPerceptionComponent' },
        { name: 'ObstaclePerception' },
        { name: 'LanePerception' },
        { name: 'TrafficLightPerception' },
      ],
      functions: [
        { name: 'ProcessPointCloud' },
        { name: 'DetectObstacles' },
        { name: 'FusionObjects' },
      ],
      topics: [
        '/apollo/sensor/lidar/front',
        '/apollo/sensor/lidar/rear',
        '/apollo/sensor/camera/front_6mm',
        '/apollo/perception/obstacles',
        '/apollo/perception/fusion',
      ],
      dependencies: ['localization', 'hdmap'],
      dependents: ['planning', 'prediction', 'control'],
      featureCount: 47,
      risks: [
        { type: 'sensor_failure', severity: 'major', description: '单传感器失效风险', mitigation: '多传感器冗余融合' },
        { type: 'latency_spike', severity: 'major', description: '算力不足时延迟飙升', mitigation: '降级策略 + 监控告警' },
      ],
      techDebts: [
        { id: 'DEBT-001', type: '耦合', severity: 'major', description: 'Fusion模块与Obstacle模块耦合过紧', file: 'perception/fusion/' },
      ],
    },
    localization: {
      id: 'localization',
      name: '定位模块',
      asil: 'C',
      rt: true,
      latency: { target: '20ms', max: '50ms' },
      classes: [
        { name: 'LocalizationComponent' },
        { name: 'MSFLocalizer' },
      ],
      functions: [
        { name: 'UpdatePose' },
        { name: 'GetLatestPose' },
      ],
      topics: ['/apollo/localization/pose', '/apollo/localization/msf'],
      dependencies: ['hdmap'],
      dependents: ['perception', 'planning', 'control'],
      featureCount: 23,
      risks: [
        { type: 'gps_dropout', severity: 'critical', description: 'GPS信号中断导致定位失效', mitigation: 'IMU惯性导航兜底' },
      ],
    },
    planning: {
      id: 'planning',
      name: '决策规划模块',
      asil: 'D',
      rt: true,
      latency: { target: '100ms', max: '200ms' },
      classes: [
        { name: 'PlanningComponent' },
        { name: 'OnLanePlanning' },
        { name: 'ScenarioManager' },
      ],
      functions: [
        { name: 'RunOnce' },
        { name: 'PlanTrajectory' },
      ],
      topics: ['/apollo/planning/trajectory'],
      dependencies: ['perception', 'localization', 'hdmap'],
      dependents: ['control'],
      featureCount: 89,
      risks: [],
    },
    control: {
      id: 'control',
      name: '车辆控制模块',
      asil: 'D',
      rt: true,
      latency: { target: '20ms', max: '50ms' },
      classes: [{ name: 'ControlComponent' }, { name: 'LonController' }, { name: 'LatController' }],
      functions: [{ name: 'ComputeControlCommand' }],
      topics: ['/apollo/control/command'],
      dependencies: ['planning', 'localization', 'canbus'],
      dependents: [],
      featureCount: 34,
      risks: [],
    },
    hdmap: {
      id: 'hdmap',
      name: '高精地图模块',
      asil: 'C',
      rt: false,
      latency: { target: 'N/A', max: 'N/A' },
      classes: [{ name: 'HDMapImpl' }],
      functions: [{ name: 'GetLanes' }, { name: 'GetJunction' }],
      topics: ['/apollo/map'],
      dependencies: [],
      dependents: ['perception', 'planning', 'localization'],
      featureCount: 18,
      risks: [],
    },
    prediction: {
      id: 'prediction',
      name: '轨迹预测模块',
      asil: 'B',
      rt: true,
      latency: { target: '30ms', max: '50ms' },
      classes: [{ name: 'PredictionComponent' }, { name: 'Container' }],
      functions: [{ name: 'Predict' }],
      topics: ['/apollo/prediction/trajectory'],
      dependencies: ['perception', 'hdmap'],
      dependents: ['planning'],
      featureCount: 31,
      risks: [],
    },
  },

  techDebts: [
    { id: 'DEBT-001', type: '耦合', severity: 'major', description: 'Fusion模块与Obstacle模块耦合过紧', file: 'perception/fusion/' },
    { id: 'DEBT-002', type: '性能', severity: 'minor', description: '多激光雷达数据未充分利用', file: 'perception/lidar/' },
  ],

  interfaces: [
    { name: '/apollo/perception/obstacles', file: 'perception/obstacle/onboard/BUILD', type: 'ROS2 Topic' },
    { name: '/apollo/perception/fusion', file: 'perception/fusion/BUILD', type: 'ROS2 Topic' },
    { name: '/apollo/sensor/lidar/front', file: 'perception/lidar/front/BUILD', type: 'ROS2 Topic' },
  ],
};

// ─── 模拟：需求解析 ───────────────────────────────────────────────────────────

function parseRequirement(event) {
  console.log('\n' + '═'.repeat(70));
  console.log('📋 Step 2: 需求解析 — ReqParser 提取功能点');
  console.log('═'.repeat(70));

  const pr = event.pull_request;
  const title = pr.title;
  const body = pr.body;

  // 模拟 ReqParser 逻辑
  const features = [
    {
      id: 'FEAT-001',
      name: '多LiDAR前融合',
      description: '将现有3个激光雷达融合扩展至5个，新增前融合模块AdaptiveFusion，提升遮挡场景和单点故障场景的感知稳定性。涉及新增/apollo/perception/fusion接口。',
      priority: 'P0',
      keywords: ['融合', 'fusion', 'lidar', '激光雷达', '感知', '冗余', 'perception'],
      acceptance: ['5路LiDAR融合数据一致性>95%', '单点故障场景感知不中断'],
      dependencies: ['perception'],
      type: '新增',
      module: null,
    },
    {
      id: 'FEAT-002',
      name: '雨天自适应降级策略',
      description: '基于雨量传感器数据，分级调整感知精度：轻度（保持精度）、中度（降低分辨率）、重度（仅保留前向感知）。涉及感知模块参数动态调整。',
      priority: 'P1',
      keywords: ['雨天', '降级', '策略', '雨量', '自适应', 'degradation', 'weather'],
      acceptance: ['雨天误检率<2%', '降级策略切换<500ms'],
      dependencies: ['perception'],
      type: '新增',
      module: null,
    },
    {
      id: 'FEAT-003',
      name: '车道线检测遮挡优化',
      description: '优化LanePerception算法，在前方车辆遮挡场景下，通过历史轨迹预测车道线延伸，提升遮挡通过率。',
      priority: 'P1',
      keywords: ['车道线', 'lane', '遮挡', '检测', '优化', 'prediction'],
      acceptance: ['遮挡场景准确率提升至85%'],
      dependencies: ['perception', 'prediction'],
      type: '修改',
      module: null,
    },
    {
      id: 'FEAT-004',
      name: '感知延迟监控告警',
      description: '新增感知链路延迟监控（P99<80ms），超出阈值时自动告警并触发降级。',
      priority: 'P2',
      keywords: ['延迟', '监控', '告警', 'latency', 'monitor'],
      acceptance: ['P99延迟超阈值后5s内告警'],
      dependencies: ['perception', 'monitor'],
      type: '新增',
      module: null,
    },
  ];

  features.forEach(f => {
    console.log(`  ${features.indexOf(f) === 0 ? '🆕' : features.indexOf(f) === 1 ? '🆕' : features.indexOf(f) === 2 ? '🔄' : '🆕'} [${f.priority}] ${f.name}`);
    console.log(`     📝 ${f.description.substring(0, 60)}...`);
    console.log(`     🏷️  关键词: ${f.keywords.join(', ')}`);
    if (f.acceptance) {
      console.log(`     ✅ 验收: ${f.acceptance.join(' | ')}`);
    }
    console.log('');
  });

  return features;
}

// ─── 模拟：模块对齐 ───────────────────────────────────────────────────────────

function alignFeatures(features, baseline) {
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 Step 3: 功能对齐 — FeatureAligner 模块映射');
  console.log('═'.repeat(70));

  const AD_MODULE_KEYWORDS = {
    perception: {
      name: '感知模块',
      asil: 'B',
      keywords: ['感知', '检测', 'fusion', '融合', 'lidar', 'laser', 'camera', 'obstacle',
                 '车道线', '障碍物', 'perception', 'camera', 'radar', 'tracking'],
    },
    localization: {
      name: '定位模块',
      asil: 'C',
      keywords: ['定位', 'localization', 'pose', 'gnss', 'gps', 'imu', '里程计'],
    },
    planning: {
      name: '决策规划模块',
      asil: 'D',
      keywords: ['规划', 'planning', 'trajectory', 'route', 'behavior', '决策', 'scenario'],
    },
    control: {
      name: '车辆控制模块',
      asil: 'D',
      keywords: ['控制', 'control', 'throttle', 'brake', '横向', '纵向', 'lateral'],
    },
    prediction: {
      name: '轨迹预测模块',
      asil: 'B',
      keywords: ['预测', 'prediction', 'intent', 'trajectory', '障碍物预测', 'motion'],
    },
    hdmap: {
      name: '高精地图模块',
      asil: 'C',
      keywords: ['地图', 'map', 'hdmap', 'lane', 'road', 'routing', '拓扑'],
    },
    monitor: {
      name: '系统监控模块',
      asil: 'N/A',
      keywords: ['监控', 'monitor', 'health', '告警', 'metric', 'diag'],
    },
  };

  const alignment = [];

  for (const feat of features) {
    const allText = [feat.name, feat.description, ...feat.keywords].join(' ').toLowerCase();
    let bestModule = null;
    let bestScore = 0;
    let matchedKws = [];

    for (const [modId, modDef] of Object.entries(AD_MODULE_KEYWORDS)) {
      let score = 0;
      const matched = [];
      for (const kw of modDef.keywords) {
        if (allText.includes(kw.toLowerCase())) {
          score += 1;
          matched.push(kw);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestModule = modId;
        matchedKws = matched;
      }
    }

    const baseKwCount = AD_MODULE_KEYWORDS[bestModule]?.keywords?.length || 1;
    const confidence = Math.min(Math.round((bestScore / baseKwCount) * 150), 100);

    // 判断对齐类型
    const baselineMod = baseline.modules?.[bestModule];
    let matchType;
    if (!bestModule || confidence < 50) {
      matchType = confidence > 30 ? 'PARTIAL' : 'NEW';
    } else if (!baselineMod || baselineMod.featureCount === 0) {
      matchType = confidence >= 70 ? 'NEW' : 'PARTIAL';
    } else {
      matchType = confidence >= 70 ? 'MATCH' : 'PARTIAL';
    }

    // 风险识别
    const risks = [];
    const modDef = AD_MODULE_KEYWORDS[bestModule];
    if (modDef?.asil === 'D' && matchType !== 'MATCH') {
      risks.push({ type: 'safety_critical', severity: 'critical', message: `涉及 ASIL-D 安全关键模块（${modDef.name}），任何变更需 ISO26262 评审` });
    }
    if (modDef?.asil === 'B' && matchType !== 'MATCH') {
      risks.push({ type: 'safety_medium', severity: 'major', message: `涉及 ASIL-B 模块，需代码评审覆盖` });
    }
    if (bestScore >= 3) {
      risks.push({ type: 'interface_change', severity: 'high', message: '涉及接口变更，可能影响下游模块（planning/control）' });
    }

    alignment.push({
      featureId: feat.id,
      featureName: feat.name,
      priority: feat.priority,
      matchType,
      moduleId: bestModule,
      moduleName: AD_MODULE_KEYWORDS[bestModule]?.name || '未知模块',
      asil: AD_MODULE_KEYWORDS[bestModule]?.asil || 'N/A',
      confidence,
      matchedKeywords: matchedKws,
      risks,
      dependencies: feat.dependencies || [],
    });
  }

  // 打印对齐矩阵
  console.log('\n  对齐矩阵：\n');
  console.log('  ┌─────────────┬────────┬──────────────┬──────────────┬──────────┬────────────┐');
  console.log('  │ 功能        │ 优先级  │ 对齐类型     │ 目标模块     │ ASIL    │ 置信度     │');
  console.log('  ├─────────────┼────────┼──────────────┼──────────────┼──────────┼────────────┤');

  const typeEmoji = { MATCH: '✅', PARTIAL: '🔄', MODIFIED: '⚠️', NEW: '🆕', UNCLEAR: '❓' };
  for (const a of alignment) {
    const name = a.featureName.substring(0, 11).padEnd(11);
    const mod = a.moduleName.substring(0, 10).padEnd(10);
    const emoji = typeEmoji[a.matchType] || '❓';
    console.log(`  │ ${name} │ ${a.priority}     │ ${emoji} ${a.matchType.padEnd(7)} │ ${mod} │ ${a.asil.padEnd(6)}  │ ${String(a.confidence).padStart(3)}%     │`);
  }
  console.log('  └─────────────┴────────┴──────────────┴──────────────┴──────────┴────────────┘\n');

  return alignment;
}

// ─── 模拟：风险评估 + 影响范围 ────────────────────────────────────────────────

function assessRisks(alignment, baseline) {
  console.log('\n' + '═'.repeat(70));
  console.log('⚠️  Step 4: 风险评估 — 综合风险分析 + 影响范围');
  console.log('═'.repeat(70));

  const allRisks = [];
  const directModules = new Set();
  const allAffected = new Set();

  for (const a of alignment) {
    if (!a.moduleId) continue;
    directModules.add(a.moduleId);
    allAffected.add(a.moduleId);

    // 递归影响
    const mod = baseline.modules?.[a.moduleId];
    if (mod) {
      for (const dep of (mod.dependencies || [])) allAffected.add(dep);
      for (const dep of (mod.dependents || [])) allAffected.add(dep);
    }

    allRisks.push(...a.risks);
  }

  // 统计
  const criticalRisks = allRisks.filter(r => r.severity === 'critical');
  const majorRisks = allRisks.filter(r => r.severity === 'major');
  const highRisks = allRisks.filter(r => r.severity === 'high');

  console.log('\n  📊 风险总览:');
  console.log(`     🔴 阻断级风险: ${criticalRisks.length} 项`);
  console.log(`     🟠 关键级风险: ${majorRisks.length} 项`);
  console.log(`     🟡 重要级风险: ${highRisks.length} 项`);

  console.log('\n  📦 影响范围:');
  console.log(`     直接影响模块: ${[...directModules].map(m => baseline.modules?.[m]?.name || m).join(', ')}`);
  console.log(`     间接影响模块: ${[...allAffected].filter(m => !directModules.has(m)).map(m => baseline.modules?.[m]?.name || m).join(', ')}`);
  console.log(`     合计影响: ${allAffected.size} 个模块`);

  console.log('\n  ⚠️  风险详情:');
  for (const risk of allRisks) {
    const sev = risk.severity === 'critical' ? '🔴' : risk.severity === 'major' ? '🟠' : '🟡';
    console.log(`     ${sev} [${risk.severity.toUpperCase()}] ${risk.message}`);
  }

  // ASIL 分析
  const asilModules = alignment.filter(a => a.asil && a.asil !== 'N/A' && a.asil !== 'N/A');
  console.log('\n  🛡️  ASIL 合规性检查:');
  for (const a of asilModules) {
    const level = parseInt(a.asil) || 0;
    if (level >= 3) {
      console.log(`     🔴 ASIL-${a.asil} 模块 [${a.moduleName}] — 必须执行 ISO26262 专项评审`);
    } else if (level >= 2) {
      console.log(`     🟡 ASIL-${a.asil} 模块 [${a.moduleName}] — 需功能测试覆盖`);
    } else {
      console.log(`     🟢 ASIL-${a.asil} 模块 [${a.moduleName}] — 标准评审流程`);
    }
  }

  return { allRisks, directModules, allAffected, criticalRisks, majorRisks };
}

// ─── 模拟：代码评审摘要 ───────────────────────────────────────────────────────

function runCodeReview(event) {
  console.log('\n' + '═'.repeat(70));
  console.log('🔍 Step 5: 自动化代码评审 — Diff 分析');
  console.log('═'.repeat(70));

  const pr = event.pull_request;
  const changedFiles = [
    { file: 'perception/obstacle/onboard/BUILD', status: 'modified', additions: 156, deletions: 23 },
    { file: 'perception/fusion/adaptive_fusion.h', status: 'added', additions: 423, deletions: 0 },
    { file: 'perception/fusion/adaptive_fusion.cc', status: 'added', additions: 1872, deletions: 0 },
    { file: 'perception/lanes/lane_detector.cc', status: 'modified', additions: 89, deletions: 12 },
    { file: 'perception/fusion/rain_degradation.cc', status: 'added', additions: 234, deletions: 0 },
    { file: 'perception/lanes/occlusion_predictor.h', status: 'added', additions: 78, deletions: 0 },
    { file: 'perception/lanes/occlusion_predictor.cc', status: 'added', additions: 312, deletions: 0 },
    { file: 'perception/common/perception_gflags.cc', status: 'modified', additions: 45, deletions: 8 },
    { file: 'perception/lidar/front_lidar_calibration.conf', status: 'modified', additions: 12, deletions: 3 },
    { file: 'perception/onboard/components/BUILD', status: 'modified', additions: 28, deletions: 5 },
  ];

  console.log('\n  📁 变更文件列表:');
  for (const f of changedFiles) {
    const icon = f.status === 'added' ? '🆕' : f.status === 'modified' ? '🔄' : '⚪';
    const badge = f.status === 'added' ? '新增' : '修改';
    console.log(`     ${icon} [${badge}] ${f.file} (+${f.additions}/-${f.deletions})`);
  }

  console.log('\n  📊 统计:');
  console.log(`     变更文件: ${changedFiles.length} 个`);
  console.log(`     新增代码: +${pr.additions} 行`);
  console.log(`     删除代码: -${pr.deletions} 行`);
  console.log(`     净增加: +${pr.additions - pr.deletions} 行`);

  console.log('\n  🔍 代码评审要点:');

  const reviews = [
    {
      file: 'perception/fusion/adaptive_fusion.cc',
      severity: 'warning',
      line: '~line 234',
      message: 'Fusion队列长度固定为5，若部分LiDAR失效需处理边界情况（空指针/超时）',
    },
    {
      file: 'perception/lanes/occlusion_predictor.cc',
      severity: 'warning',
      line: '~line 89',
      message: '历史轨迹缓存使用滑动窗口，建议配置化窗口大小，避免内存持续增长',
    },
    {
      file: 'perception/fusion/rain_degradation.cc',
      severity: 'info',
      line: '~line 156',
      message: '雨量阈值参数建议移至 gflags，便于运行时调参',
    },
    {
      file: 'perception/common/perception_gflags.cc',
      severity: 'warning',
      line: '~line 12',
      message: '新增参数未在对应 .conf 配置文件中设置默认值，建议补充',
    },
  ];

  for (const r of reviews) {
    const icon = r.severity === 'warning' ? '🟡' : r.severity === 'error' ? '🔴' : '🔵';
    console.log(`\n     ${icon} [${r.severity.toUpperCase()}] ${r.file}`);
    console.log(`        📍 ${r.line}: ${r.message}`);
  }

  return {
    files: changedFiles,
    totalFiles: changedFiles.length,
    totalAdditions: pr.additions,
    totalDeletions: pr.deletions,
    issues: reviews,
  };
}

// ─── 模拟：生成综合报告 + 下发 ────────────────────────────────────────────────

function generateDispatchReport(event, features, alignment, risks, review) {
  console.log('\n' + '═'.repeat(70));
  console.log('📤 Step 6: 综合报告生成 + 评审意见下发');
  console.log('═'.repeat(70));

  const pr = event.pull_request;
  const riskLevel = risks.criticalRisks.length > 0 ? '🔴 HIGH'
    : risks.majorRisks.length > 0 ? '🟠 MEDIUM-HIGH'
    : risks.allRisks.length > 0 ? '🟡 MEDIUM'
    : '🟢 LOW';

  const matched = alignment.filter(a => a.matchType === 'MATCH' || a.matchType === 'PARTIAL');
  const newFeatures = alignment.filter(a => a.matchType === 'NEW');
  const modified = alignment.filter(a => a.matchType === 'MODIFIED' || a.matchType === 'PARTIAL');

  const report = {
    prNumber: pr.number,
    title: pr.title,
    author: pr.user.login,
    sourceBranch: pr.head.ref,
    targetBranch: pr.base.ref,
    url: pr.html_url,
    timestamp: new Date().toISOString(),

    // 综合评估
    riskLevel: risks.criticalRisks.length > 0 ? 'critical'
      : risks.majorRisks.length > 0 ? 'high'
      : risks.allRisks.length > 0 ? 'medium' : 'low',
    riskLabel: riskLevel,
    overallScore: Math.min(100, matched.length * 20 + newFeatures.length * 10),

    // 功能摘要
    summary: {
      totalFeatures: features.length,
      matchedFeatures: matched.length,
      newFeatures: newFeatures.length,
      modifiedFeatures: modified.length,
      moduleCount: risks.allAffected.size,
    },

    // 模块命中
    modules: [...new Set(alignment.map(a => a.moduleId).filter(Boolean))].map(m => ({
      module: m,
      name: alignment.find(a => a.moduleId === m)?.moduleName,
      asil: alignment.find(a => a.moduleId === m)?.asil,
    })),

    // 风险
    risks: {
      critical: risks.criticalRisks.length,
      major: risks.majorRisks.length,
      total: risks.allRisks.length,
      details: risks.allRisks,
    },

    // 代码评审
    codeReview: review,

    // 建议
    recommendations: [
      ...(risks.criticalRisks.length > 0
        ? [{ priority: 'P0', severity: 'blocker', text: '🔴 必须先解决阻断级风险才能合入', items: risks.criticalRisks.map(r => r.message) }]
        : []),
      ...(alignment.some(a => a.asil === 'B' && a.matchType !== 'MATCH')
        ? [{ priority: 'P1', severity: 'critical', text: '🛡️ 涉及 ASIL-B 模块变更，需专项代码评审', items: [] }]
        : []),
      ...(alignment.some(a => a.confidence < 60)
        ? [{ priority: 'P1', severity: 'high', text: '⚠️ 部分功能与基线匹配度低，建议补充架构评审', items: [] }]
        : []),
      ...(review.issues.filter(i => i.severity === 'warning').length > 0
        ? [{ priority: 'P2', severity: 'medium', text: `🟡 代码评审发现 ${review.issues.filter(i => i.severity === 'warning').length} 项警告，建议修复后合入`, items: [] }]
        : []),
    ],
  };

  // 打印综合报告
  console.log('\n  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │               🛡️  DevGuard 综合分析报告                    │');
  console.log('  │             PR #' + String(report.prNumber).padEnd(51) + '│');
  console.log('  └─────────────────────────────────────────────────────────────┘\n');

  console.log(`  📌 PR标题: ${report.title}`);
  console.log(`  👤 作者: ${report.author} | 分支: ${report.sourceBranch} → ${report.targetBranch}`);
  console.log(`  🔗 地址: ${report.url}`);
  console.log('');

  console.log('  ┌──────────────────┬────────────────────────────────────────────┐');
  console.log('  │ 评估维度          │ 结果                                       │');
  console.log('  ├──────────────────┼────────────────────────────────────────────┤');
  console.log(`  │ 风险等级          │ ${riskLevel.padEnd(40)}│`);
  console.log(`  │ 功能点总数        │ ${String(report.summary.totalFeatures).padEnd(40)}│`);
  console.log(`  │ 涉及模块          │ ${String(report.summary.moduleCount).padEnd(40)}│`);
  console.log(`  │ 阻断级风险        │ ${String(report.risks.critical).padEnd(40)}│`);
  console.log(`  │ 关键级风险        │ ${String(report.risks.major).padEnd(40)}│`);
  console.log(`  │ 代码变更量        │ +${report.codeReview.totalAdditions}/-${report.codeReview.totalDeletions} 行`.padEnd(51) + '│');
  console.log('  └──────────────────┴────────────────────────────────────────────┘');

  // 建议
  console.log('\n  📋 评审建议:\n');
  for (const rec of report.recommendations) {
    const badge = rec.severity === 'blocker' ? '🔴' : rec.severity === 'critical' ? '🟠' : rec.severity === 'high' ? '🟡' : '🔵';
    console.log(`  ${badge} [${rec.priority}] ${rec.text}`);
    if (rec.items && rec.items.length > 0) {
      for (const item of rec.items.slice(0, 3)) {
        console.log(`      └─ ${item}`);
      }
    }
    console.log('');
  }

  // PR 评论内容
  console.log('  📝 已在 PR #' + pr.number + ' 下发评审意见');
  console.log('');

  return report;
}

// ─── 下发详情（模拟写入 PR Comment）──────────────────────────────────────────

function postComment(report, event) {
  const pr = event.pull_request;

  const commentBody = generatePRComment(report);

  console.log('  ═══════════════════════════════════════════════════════════════');
  console.log('  📮 以下内容将作为 PR 评论下发:\n');
  console.log(commentBody);
  console.log('\n  ═══════════════════════════════════════════════════════════════');

  return commentBody;
}

function generatePRComment(report) {
  const riskLabel = report.riskLevel === 'critical' ? '🔴 高风险'
    : report.riskLevel === 'high' ? '🟠 中高风险'
    : report.riskLevel === 'medium' ? '🟡 中等风险'
    : '🟢 低风险';

  const lines = [
    '## 🛡️ DevGuard 自动分析报告',
    '',
    '<details>',
    `<summary><b>${riskLabel} — 建议评审</b></summary>`,
    '',
    '| 指标 | 数值 |',
    '|------|------|',
    `| 风险等级 | ${riskLabel} |`,
    `| 涉及模块 | ${report.modules.map(m => `\`${m.name}\``).join(', ')} |`,
    `| 功能点 | ${report.summary.totalFeatures} 个（匹配 ${report.summary.matchedFeatures}，新增 ${report.summary.newFeatures}，修改 ${report.summary.modifiedFeatures}）|`,
    `| 阻断风险 | ${report.risks.critical} 项 |`,
    `| 关键风险 | ${report.risks.major} 项 |`,
    '',
    '**评审建议:**',
    ...report.recommendations.map(r => {
      const badge = r.severity === 'blocker' ? '🔴' : r.severity === 'critical' ? '🟠' : r.severity === 'high' ? '🟡' : '🔵';
      let text = `- ${badge} [${r.priority}] ${r.text}`;
      if (r.items && r.items.length > 0) {
        text += '\n  ' + r.items.slice(0, 3).map(i => `  - ${i}`).join('\n');
      }
      return text;
    }),
    '',
    '</details>',
    '',
    `*[自动分析 · DevGuard Agent · ${new Date().toLocaleString('zh-CN')}]*`,
  ];

  return lines.join('\n');
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function runDemo() {
  const startTime = Date.now();

  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                   ║');
  console.log('║     🛡️  DevGuard Agent — 需求分析 + 下发流程演示                  ║');
  console.log('║                                                                   ║');
  console.log('║     场景: 工程师提交 PR #8847 — 城市NOA感知融合增强               ║');
  console.log('║                                                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');

  // Step 1: Webhook 事件接收
  console.log('\n' + '═'.repeat(70));
  console.log('📥 Step 1: Webhook 事件接收');
  console.log('═'.repeat(70));
  console.log(`\n  事件类型: ${MOCK_PR_EVENT.type}`);
  console.log(`  PR编号:   #${MOCK_PR_EVENT.prNumber}`);
  console.log(`  仓库:     ${MOCK_PR_EVENT.repository.full_name}`);
  console.log(`  标题:    ${MOCK_PR_EVENT.pull_request.title}`);
  console.log(`  作者:    ${MOCK_PR_EVENT.pull_request.user.login}`);
  console.log(`  分支:    ${MOCK_PR_EVENT.pull_request.head.ref} → ${MOCK_PR_EVENT.pull_request.base.ref}`);

  // Step 2: 需求解析
  const features = parseRequirement(MOCK_PR_EVENT);

  // Step 3: 功能对齐
  const alignment = alignFeatures(features, MOCK_BASELINE);

  // Step 4: 风险评估
  const risks = assessRisks(alignment, MOCK_BASELINE);

  // Step 5: 代码评审
  const review = runCodeReview(MOCK_PR_EVENT);

  // Step 6: 生成报告 + 下发
  const report = generateDispatchReport(MOCK_PR_EVENT, features, alignment, risks, review);
  const comment = postComment(report, MOCK_PR_EVENT);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '═'.repeat(70));
  console.log('✅ 演示完成 — 全链路耗时: ' + elapsed + 's');
  console.log('═'.repeat(70));
  console.log('\n  流程回顾:');
  console.log('  1. 📥 Webhook 接收 GitHub PR 事件（PR #8847）');
  console.log('  2. 📋 ReqParser 从 PR 描述中提取 4 个功能点');
  console.log('  3. 🎯 FeatureAligner 匹配到感知(prediction)模块');
  console.log('  4. ⚠️  风险评估发现 ASIL-B 模块变更 + 接口风险');
  console.log('  5. 🔍 代码评审发现 4 处警告');
  console.log('  6. 📤 生成综合报告并下发至 PR 评论\n');

  return { report, comment };
}

// 启动
runDemo().catch(console.error);
