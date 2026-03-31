/**
 * ============================================================
 * DevGuard Agent — 两套独立触发流程演示
 * ============================================================
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Flow A: 需求输入触发                                      │
 * │  输入: PRD文档 / 需求文本                                   │
 * │  管道: ReqParser → FeatureAligner → 差距分析              │
 * │  输出: 状态分析 + 实现指导 / 代码骨架生成                   │
 * └─────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Flow B: 代码提交触发（无对应需求）                        │
 * │  输入: GitHub PR Diff（无 linked requirement）           │
 * │  管道: 代码变更分析 → 设计文档变更检测 → 需求变更传导      │
 * │  输出: 设计文档变更记录 + 需求变更建议 + 评审意见           │
 * └─────────────────────────────────────────────────────────┘
 */

'use strict';

const { ReqParser } = require('../src/baseline/req-parser');
const { FeatureAligner } = require('../src/baseline/feature-aligner');

// ─────────────────────────────────────────────────────────────────────────────
// Mock 基线数据（Apollo 感知系统）
// ─────────────────────────────────────────────────────────────────────────────

const APOLLO_BASELINE = {
  id: 'baseline-apollo-perception-3.5',
  name: 'Apollo感知系统基线 v3.5',
  version: '3.5.0',
  language: 'cpp',
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
        { name: 'LaneDetectorProcess' },
      ],
      topics: [
        '/apollo/sensor/lidar/front',
        '/apollo/sensor/lidar/rear',
        '/apollo/perception/obstacles',
        '/apollo/perception/fusion',
        '/apollo/perception/lanes',
      ],
      dependencies: ['localization', 'hdmap'],
      dependents: ['planning', 'prediction'],
      featureCount: 47,
      risks: [
        { type: 'sensor_failure', severity: 'major', description: '单传感器失效风险', mitigation: '多传感器冗余融合' },
        { type: 'latency_spike', severity: 'major', description: '算力不足时延迟飙升', mitigation: '降级策略+监控告警' },
      ],
    },
    prediction: {
      id: 'prediction',
      name: '轨迹预测模块',
      asil: 'B',
      rt: true,
      latency: { target: '30ms', max: '50ms' },
      classes: [{ name: 'PredictionComponent' }, { name: 'Container' }],
      functions: [{ name: 'Predict' }, { name: 'PredictTrajectory' }],
      topics: ['/apollo/prediction/trajectory'],
      dependencies: ['perception', 'hdmap'],
      dependents: ['planning'],
      featureCount: 31,
      risks: [],
    },
    planning: {
      id: 'planning',
      name: '决策规划模块',
      asil: 'D',
      rt: true,
      latency: { target: '100ms', max: '200ms' },
      classes: [{ name: 'PlanningComponent' }, { name: 'OnLanePlanning' }],
      functions: [{ name: 'RunOnce' }, { name: 'PlanTrajectory' }],
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
      classes: [{ name: 'ControlComponent' }],
      functions: [{ name: 'ComputeControlCommand' }],
      topics: ['/apollo/control/command'],
      dependencies: ['planning', 'localization'],
      dependents: [],
      featureCount: 34,
      risks: [],
    },
    localization: {
      id: 'localization',
      name: '定位模块',
      asil: 'C',
      rt: true,
      latency: { target: '20ms', max: '50ms' },
      classes: [{ name: 'LocalizationComponent' }],
      functions: [{ name: 'UpdatePose' }],
      topics: ['/apollo/localization/pose'],
      dependencies: ['hdmap'],
      dependents: ['perception', 'planning', 'control'],
      featureCount: 23,
      risks: [
        { type: 'gps_dropout', severity: 'critical', description: 'GPS信号中断导致定位失效', mitigation: 'IMU惯性导航兜底' },
      ],
    },
    hdmap: {
      id: 'hdmap',
      name: '高精地图模块',
      asil: 'C',
      rt: false,
      classes: [{ name: 'HDMapImpl' }],
      functions: [{ name: 'GetLanes' }],
      topics: ['/apollo/map'],
      dependencies: [],
      dependents: ['perception', 'planning', 'localization'],
      featureCount: 18,
      risks: [],
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────────────────────────────────────

function separator(title) {
  const bar = '═'.repeat(72);
  console.log('\n' + bar);
  console.log(title);
  console.log(bar);
}

function panel(lines, width = 72) {
  const pad = (s) => '  ' + s;
  lines.forEach(l => console.log(pad(l)));
}

function box(lines, title) {
  if (title) {
    console.log('  ┌' + '─'.repeat(width - 4) + '┐');
    console.log('  │' + title.padStart((width - 4 + title.length) / 2).padEnd(width - 4) + '│');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// Flow A: 需求输入触发
// ═══════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

async function flowA_requirementTrigger() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                       ║');
  console.log('║   Flow A: 需求输入触发                                                 ║');
  console.log('║   ────────────────────────────                                        ║');
  console.log('║   场景: 产品经理输入新需求 → 系统分析差距 → 输出实现指导               ║');
  console.log('║                                                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  // ── A-0: 需求输入 ──────────────────────────────────────────────────────────

  separator('📥 A-0: 需求输入 — PRD 文档片段');

  const reqInput = `
需求名称: 城市NOA雨天感知降级策略
优先级: P1
模块: 感知模块 (perception)

背景:
城市NOA在城市雨天场景下感知性能显著下降，需要实现自适应降级策略。

功能规格:
1. FR-Rain-01: 雨量分级检测（轻/中/重）
2. FR-Rain-02: 感知精度自适应降级
   - 轻度: 保持原精度，降低帧率
   - 中度: 降低点云分辨率，跳过部分相机
   - 重度: 仅保留前向激光雷达
3. FR-Rain-03: 降级策略切换延迟 < 500ms
4. FR-Rain-04: 降级状态上报（CAN消息）

非功能需求:
- 感知延迟: P99 < 80ms
- 内存占用: +50MB 以内
- ASIL等级: ASIL-B

验收标准:
- 雨天误检率 < 2%
- 降级切换成功率 100%
- 恢复正常工况后自动恢复精度
`;

  console.log('  输入类型: PRD 文档文本');
  console.log('  输入长度:', reqInput.trim().split('\n').length, '行');
  console.log('');
  panel([
    '「城市NOA雨天感知降级策略」',
    '├─ 雨量分级检测（轻/中/重）',
    '├─ 感知精度自适应降级（3级）',
    '├─ 切换延迟 < 500ms',
    '└─ 降级状态上报 CAN 消息',
  ]);

  // ── A-1: 需求解析 ──────────────────────────────────────────────────────────

  separator('🔍 A-1: 需求解析 — ReqParser 提取功能点');

  const parser = new ReqParser();
  const features = parser.parseContent(reqInput.trim(), 'md');

  console.log('  解析结果: 共提取', features.length, '个功能点\n');

  features.forEach((f, i) => {
    const typeIcon = f.type === '新增' ? '🆕' : f.type === '修改' ? '🔄' : f.type === '优化' ? '⚡' : '🗑️';
    console.log(`  ${typeIcon} [${f.priority}] ${f.name}`);
    console.log(`     描述: ${f.description.substring(0, 70)}...`);
    console.log(`     类型: ${f.type} | 关键词: ${(f.keywords || []).slice(0, 4).join(', ')}`);
    if (f.acceptance) {
      console.log(`     验收: ${f.acceptance.join(' | ')}`);
    }
    console.log('');
  });

  // ── A-2: 特征对齐 ──────────────────────────────────────────────────────────

  separator('🎯 A-2: 特征对齐 — FeatureAligner 与基线匹配');

  const aligner = new FeatureAligner(APOLLO_BASELINE, { matchThreshold: 0.3 });
  const alignResult = aligner.align(features);

  console.log('  对齐矩阵:\n');
  console.log('  ┌────────────────────────┬────────┬─────────────┬──────────────┬──────────┐');
  console.log('  │ 功能名称               │ 优先级  │ 对齐类型    │ 命中模块     │ ASIL    │');
  console.log('  ├────────────────────────┼────────┼─────────────┼──────────────┼──────────┤');

  const typeEmoji = { MATCH: '✅', PARTIAL: '🔄', MODIFIED: '⚠️', NEW: '🆕', UNCLEAR: '❓' };
  for (const item of alignResult.alignmentMatrix) {
    const name = item.featureName.substring(0, 20).padEnd(20);
    const mod = (item.moduleName || '未知').substring(0, 10).padEnd(10);
    const emoji = typeEmoji[item.matchType] || '❓';
    console.log(
      `  │ ${name} │ ${item.priority}     │ ${emoji} ${item.matchType.padEnd(7)}│ ${mod} │ ${(item.moduleId ? APOLLO_BASELINE.modules[item.moduleId]?.asil || 'N/A' : 'N/A').padEnd(6)}  │`
    );
  }
  console.log('  └────────────────────────┴────────┴─────────────┴──────────────┴──────────┘\n');

  console.log('  📊 统计:', alignResult.summary);

  // ── A-3: 差距分析 ──────────────────────────────────────────────────────────

  separator('📐 A-3: 差距分析 — 基线 vs 需求');

  // 模拟分析结果
  const gapAnalysis = {
    fullyCovered: features.filter(f => {
      const item = alignResult.alignmentMatrix.find(a => a.featureId === f.id);
      return item?.matchType === 'MATCH';
    }),
    partiallyCovered: features.filter(f => {
      const item = alignResult.alignmentMatrix.find(a => a.featureId === f.id);
      return item?.matchType === 'PARTIAL';
    }),
    notCovered: features.filter(f => {
      const item = alignResult.alignmentMatrix.find(a => a.featureId === f.id);
      return item?.matchType === 'NEW' || item?.matchType === 'UNCLEAR' || !item?.moduleId;
    }),
    newModules: [],
    techDebts: [],
    interfaceChanges: [],
    risks: [],
  };

  // 手动补充差距分析（基于实际内容）
  const rainFeature = features.find(f => f.name.includes('雨量') || f.name.includes('分级'));
  const degradeFeature = features.find(f => f.name.includes('降级') || f.name.includes('自适应'));

  gapAnalysis.notCovered = [rainFeature, degradeFeature].filter(Boolean);
  gapAnalysis.techDebts = [
    {
      type: 'new_capability',
      severity: 'major',
      description: '当前基线无雨量传感器数据接入接口（CAN总线无对应信号通道）',
      module: 'perception',
    },
    {
      type: 'interface_gap',
      severity: 'medium',
      description: '无降级状态 CAN 上报通道定义',
      module: 'canbus',
    },
  ];
  gapAnalysis.newModules = [
    { module: 'perception/rain_adaptation', type: '新增', asil: 'B', files: ['rain_adaptation.h', 'rain_adaptation.cc'] },
  ];
  gapAnalysis.risks = [
    { severity: 'major', module: 'perception', message: '新增降级逻辑可能影响感知P99延迟（需控制在80ms内）' },
    { severity: 'major', module: 'perception', message: '雨量传感器数据延迟可能引入时序同步问题' },
    { severity: 'minor', module: 'canbus', message: '新增CAN信号通道需更新DBC文件并通知下游' },
  ];

  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │                        差距分析结果                         │');
  console.log('  ├──────────────────┬───────────────────────────────────────────┤');
  console.log(`  │ 完全覆盖          │ ${String(gapAnalysis.fullyCovered.length).padEnd(3)} 个功能点（基线已有）                         │`);
  console.log(`  │ 部分覆盖          │ ${String(gapAnalysis.partiallyCovered.length).padEnd(3)} 个功能点（需扩展）                         │`);
  console.log(`  │ 缺失覆盖          │ ${String(gapAnalysis.notCovered.length).padEnd(3)} 个功能点（需新增）                            │`);
  console.log(`  │ 新增模块          │ ${String(gapAnalysis.newModules.length).padEnd(3)} 个（全新实现）                               │`);
  console.log(`  │ 技术债务          │ ${String(gapAnalysis.techDebts.length).padEnd(3)} 项（阻碍实现的问题）                          │`);
  console.log('  └──────────────────┴───────────────────────────────────────────┘');

  console.log('\n  📋 缺失详情:');
  for (const td of gapAnalysis.techDebts) {
    const sev = td.severity === 'major' ? '🟠' : td.severity === 'minor' ? '🟡' : '🔵';
    console.log(`  ${sev} [${td.severity}] ${td.description}`);
    console.log(`     模块: ${td.module} | 类型: ${td.type}`);
  }

  console.log('\n  🆕 需新增模块:');
  for (const nm of gapAnalysis.newModules) {
    console.log(`  📦 ${nm.module} (ASIL-${nm.asil})`);
    console.log(`     新增文件: ${nm.files.join(', ')}`);
  }

  // ── A-4: 实现指导 + 代码生成 ───────────────────────────────────────────────

  separator('🛠️  A-4: 实现指导 — 状态分析 + 代码骨架生成');

  console.log('  📊 状态综合评级:\n');

  const totalGaps = gapAnalysis.notCovered.length + gapAnalysis.techDebts.length;
  const riskCount = gapAnalysis.risks.filter(r => r.severity === 'major').length;
  const statusLevel = riskCount > 0 ? '🟠 可实施（有风险）'
    : totalGaps > 2 ? '🟡 可实施（需补充）'
    : '🟢 具备实施条件';

  console.log(`  ${statusLevel}`);
  console.log('');
  console.log('  ┌────────────────────────────────────────────────────────────┐');
  console.log('  │ 维度             │ 评级       │ 说明                        │');
  console.log('  ├──────────────────┼────────────┼─────────────────────────────┤');
  console.log('  │ 基线匹配度       │ 🔄 PARTIAL │ 2/4 功能点需新增实现        │');
  console.log('  │ ASIL合规性       │ 🟢 PASS    │ 感知模块 ASIL-B，标准流程   │');
  console.log('  │ 实时性           │ 🟡 关注    │ 需验证P99延迟<80ms         │');
  console.log('  │ 接口完备性       │ 🟠 需补充  │ 缺少CAN信号通道定义        │');
  console.log('  │ 依赖完整性       │ 🟡 待确认  │ 雨量传感器数据源需确认      │');
  console.log('  └──────────────────┴────────────┴─────────────────────────────┘');

  console.log('\n  📋 实施计划:\n');

  const plan = [
    { phase: 'Phase 0', label: '技术债务清理', items: ['定义CAN信号通道 rain_intensity (0-100)', '新增DBC文件条目', '更新canbus模块接口'], duration: '1d', priority: 'P0' },
    { phase: 'Phase 1', label: '数据层实现', items: ['新增 RainSensorListener 类（订阅雨量CAN信号）', '实现雨量数据滤波（平滑抖动）', '时间戳对齐（与感知帧同步）'], duration: '2d', priority: 'P1' },
    { phase: 'Phase 2', label: '降级策略实现', items: ['新增 RainDegradationPolicy 类', '实现3级降级状态机', '延迟监控（超出阈值触发告警）'], duration: '3d', priority: 'P1' },
    { phase: 'Phase 3', label: '集成 + 验收', items: ['与 ApolloPerceptionComponent 集成', '单元测试 + 场景回灌测试', '性能测试（P99延迟验证）'], duration: '2d', priority: 'P2' },
  ];

  plan.forEach(p => {
    const icon = p.priority === 'P0' ? '🔴' : p.priority === 'P1' ? '🟠' : '🟡';
    console.log(`  ${icon} [${p.priority}] ${p.phase}: ${p.label} (${p.duration})`);
    p.items.forEach(item => console.log(`      ✓ ${item}`));
    console.log('');
  });

  // ── A-5: 代码骨架生成 ─────────────────────────────────────────────────────

  separator('💻 A-5: 代码骨架生成 — Hinted Implementation');

  console.log('  根据 FeatureAligner 分析 + 基线上下文，生成以下代码骨架:\n');

  const skeletons = [
    {
      file: 'perception/rain_adaptation/rain_adaptation.h',
      lang: 'cpp',
      code: `#pragma once

#include <atomic>
#include "modules/perception/common/interface/base_algorithm.h"
#include "modules/canbus/proto/chassis.pb.h"

// ASIL-B 模块：禁止在多线程访问时产生数据竞争
namespace apollo::perception {

// 雨量等级枚举
enum class RainIntensityLevel : uint8_t {
  NONE = 0,   // 无雨天
  LIGHT = 1,   // 轻度
  MODERATE = 2, // 中度
  HEAVY = 3,   // 重度（仅保留前向LiDAR）
};

// 降级策略配置
struct RainDegradationConfig {
  uint32_t filter_window_ms = 500;    // 滤波窗口
  uint32_t switch_delay_ms = 200;      // 切换延迟上限
  uint32_t latency_threshold_ms = 80;  // P99 延迟阈值
  RainIntensityLevel level = RainIntensityLevel::NONE;
};

// 降级状态
struct DegradationStatus {
  RainIntensityLevel current_level = RainIntensityLevel::NONE;
  uint64_t timestamp_us = 0;
  bool is_degraded = false;
  float actual_latency_ms = 0.0f;
};

class RainAdaptation : public BaseAlgorithm {
 public:
  RainAdaptation() = default;
  ~RainAdaptation() = default;

  // 初始化接口（供 ApolloPerceptionComponent 调用）
  bool Init(const RainDegradationConfig& config) override;

  // 主处理函数：接收雨量CAN信号 + 当前感知结果 → 输出降级决策
  // @param rain_intensity: 雨量传感器值 (0-100)
  // @param current_latency: 当前帧感知延迟
  // @param output: 降级策略输出
  bool Process(int rain_intensity, float current_latency_ms,
               DegradationStatus* output);

  // 获取当前配置
  RainDegradationConfig GetConfig() const { return config_; }

 private:
  RainIntensityLevel ClassifyLevel(int raw_value);
  bool ShouldDegrade(RainIntensityLevel level, float latency);
  void UpdateStatistics(RainIntensityLevel level);

  RainDegradationConfig config_;
  std::atomic<RainIntensityLevel> current_level_{RainIntensityLevel::NONE};
  std::atomic<bool> degraded_{false};
};

}  // namespace apollo::perception`,
    },
    {
      file: 'perception/rain_adaptation/rain_adaptation.cc',
      lang: 'cpp',
      code: `#include "perception/rain_adaptation/rain_adaptation.h"

namespace apollo::perception {

bool RainAdaptation::Init(const RainDegradationConfig& config) {
  config_ = config;
  AINFO << "RainAdaptation initialized with threshold: "
        << config_.latency_threshold_ms << "ms";
  return true;
}

bool RainAdaptation::Process(int rain_intensity, float current_latency_ms,
                              DegradationStatus* output) {
  if (!output) return false;

  // Step 1: 雨量等级分类
  RainIntensityLevel level = ClassifyLevel(rain_intensity);

  // Step 2: 判断是否需要降级
  bool degrade = ShouldDegrade(level, current_latency_ms);

  output->current_level = level;
  output->is_degraded = degrade;
  output->actual_latency_ms = current_latency_ms;
  output->timestamp_us = CyberTime::GetInstance()->GetTimestamp();

  current_level_.store(level, std::memory_order_relaxed);
  degraded_.store(degrade, std::memory_order_relaxed);

  return true;
}

RainIntensityLevel RainAdaptation::ClassifyLevel(int raw_value) {
  if (raw_value <= 0) return RainIntensityLevel::NONE;
  if (raw_value <= 33) return RainIntensityLevel::LIGHT;
  if (raw_value <= 66) return RainIntensityLevel::MODERATE;
  return RainIntensityLevel::HEAVY;
}

bool RainAdaptation::ShouldDegrade(RainIntensityLevel level, float latency) {
  // 双重条件：雨量等级 + 延迟超阈值
  return level != RainIntensityLevel::NONE &&
         (level == RainIntensityLevel::HEAVY || latency > config_.latency_threshold_ms);
}

}  // namespace apollo::perception`,
    },
  ];

  skeletons.forEach((sk, idx) => {
    console.log(`  ┌─ ${sk.file}`.padEnd(70) + '┐');
    sk.code.split('\n').slice(0, 30).forEach(line => {
      console.log('  │  ' + line.padEnd(67) + '  │');
    });
    if (sk.code.split('\n').length > 30) {
      console.log('  │  ... (' + (sk.code.split('\n').length - 30) + ' more lines)'.padEnd(67) + '  │');
    }
    console.log('  └' + '─'.repeat(68) + '┘\n');
  });

  // ── A-6: 需求文档变更建议 ─────────────────────────────────────────────────

  separator('📝 A-6: 需求文档变更建议');

  console.log('  基于差距分析，建议对以下文档进行更新:\n');

  const docChanges = [
    {
      doc: 'REQ-RAIN-001（新建）',
      type: '🆕 新增',
      content: '城市NOA雨天感知降级策略需求规格说明书',
      owner: '产品经理',
      priority: 'P1',
    },
    {
      doc: 'perception/rain_adaptation/ 接口规格',
      type: '🆕 新增',
      content: 'RainAdaptation 类 API 规格（含时序图）',
      owner: '感知架构师',
      priority: 'P1',
    },
    {
      doc: 'canbus/DBC/apollo_chassis.dbc',
      type: '🔄 更新',
      content: '新增 rain_intensity (0-100) CAN 信号通道定义',
      owner: 'CAN工程师',
      priority: 'P0',
    },
    {
      doc: '感知模块 ASIL-B 评审清单',
      type: '🔄 更新',
      content: '新增降级策略 ASIL-B 评审条目',
      owner: '安全工程师',
      priority: 'P1',
    },
    {
      doc: '基线基线 (baseline-apollo-perception-3.5)',
      type: '🔄 版本更新',
      content: '新增 perception.rain_adaptation 模块条目',
      owner: '架构师',
      priority: 'P2',
    },
  ];

  console.log('  ┌──────────────────────────┬────────┬──────────────────────────────┬──────────┬──────────┐');
  console.log('  │ 文档                      │ 操作    │ 变更内容                      │ 负责人    │ 优先级   │');
  console.log('  ├──────────────────────────┼────────┼──────────────────────────────┼──────────┼──────────┤');
  docChanges.forEach(d => {
    const doc = d.doc.substring(0, 22).padEnd(22);
    const op = d.type.substring(0, 4).padEnd(4);
    const content = d.content.substring(0, 26).padEnd(26);
    const owner = d.owner.substring(0, 8).padEnd(8);
    const pri = d.priority.padEnd(6);
    const typeColor = d.type.includes('新增') ? '🆕' : '🔄';
    const priColor = d.priority === 'P0' ? '🔴' : d.priority === 'P1' ? '🟠' : '🟡';
    console.log(`  │ ${doc} │ ${typeColor} ${op} │ ${content} │ ${owner} │ ${priColor} ${pri} │`);
  });
  console.log('  └──────────────────────────┴────────┴──────────────────────────────┴──────────┴──────────┘');

  return {
    flow: 'A',
    features,
    alignment: alignResult,
    gapAnalysis,
    plan,
    skeletons,
    docChanges,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// Flow B: 代码提交触发（无对应需求）
// ═══════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

function flowB_codeCommitTrigger() {
  console.log('\n\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                       ║');
  console.log('║   Flow B: 代码提交触发（无对应需求）                                  ║');
  console.log('║   ──────────────────────────────────────────                         ║');
  console.log('║   场景: 工程师直接提交 PR → 无 linked requirement → 全链路溯源       ║');
  console.log('║                                                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  // ── B-0: 代码提交输入 ───────────────────────────────────────────────────────

  separator('📥 B-0: 代码提交 — PR Diff 信息 + Commit Message 校验');

  const prEvent = {
    type: 'github.pr.opened',
    prNumber: 9152,
    title: 'feat: 优化车道线检测在夜间场景的准确性',
    author: 'lisi-dev',
    sourceBranch: 'feat/lane-detection-night-v2',
    targetBranch: 'main',
    additions: 412,
    deletions: 89,
    changedFiles: 7,
    description: '夜间场景下车道线误检率较高，优化了边缘检测阈值自适应算法。',
    hasLinkedRequirement: false,  // ⚠️ 关键：无 linked requirement
    // ─── 新增：Commit Message 信息 ───────────────────────────────────────────
    commits: [
      {
        sha: 'a1b2c3d',
        message: 'feat(lane): 夜间场景自适应边缘阈值',
        author: 'lisi-dev',
        timestamp: '2026-03-30T00:30:00Z',
      },
      {
        sha: 'e4f5g6h',
        message: 'add frame_processor for night mode',  // ⚠️ 不符合规范
        author: 'lisi-dev',
        timestamp: '2026-03-30T00:45:00Z',
      },
      {
        sha: 'i7j8k9l',
        message: 'update BUILD deps',
        author: 'lisi-dev',
        timestamp: '2026-03-30T01:00:00Z',
      },
    ],
    diff: `
--- a/perception/lanes/lane_detector.cc
+++ b/perception/lanes/lane_detector.cc
@@ -45,7 +45,9 @@ bool LaneDetector::Process(const CameraFrame& frame) {
-  const float kEdgeThreshold = 0.35f;  // 固定阈值
+  // 夜间场景自适应阈值：亮度<30时降低阈值
+  const float brightness = ComputeFrameBrightness(frame);
+  const float kEdgeThreshold = (brightness < 30.0f) ? 0.18f : 0.35f;

   // 新增：夜间场景专用边缘增强
+  if (brightness < 30.0f) {
+    EnhanceEdgeForNightMode(&frame);
+  }

   // 原检测逻辑保持不变
@@ -123,7 +130,8 @@ bool LaneDetector::Process(const CameraFrame& frame) {
-  std::vector<Lane> lanes = EdgeDetector(frame, kEdgeThreshold);
+  auto lanes = EdgeDetector(frame, kEdgeThreshold);

-  LanePostProcessor::Process(lanes);  // 旧后处理
+  // 新增后处理：夜间场景抑制误检
+  if (brightness < 30.0f) {
+    SuppressNightGhostLanes(&lanes);
+  }
+  LanePostProcessor::Process(lanes);
`,
    files: [
      { path: 'perception/lanes/lane_detector.cc', status: 'modified', additions: 156, deletions: 12 },
      { path: 'perception/lanes/lane_detector.h', status: 'modified', additions: 34, deletions: 3 },
      { path: 'perception/lanes/BUILD', status: 'modified', additions: 12, deletions: 2 },
      { path: 'perception/common/frame_processor.cc', status: 'added', additions: 89, deletions: 0 },
      { path: 'perception/common/frame_processor.h', status: 'added', additions: 45, deletions: 0 },
      { path: 'perception/onboard/components/lane_component.cc', status: 'modified', additions: 67, deletions: 12 },
      { path: 'perception/common/perception_gflags.cc', status: 'modified', additions: 9, deletions: 1 },
    ],
  };

  console.log('  ⚠️ 关键标记: hasLinkedRequirement = false');
  console.log('');
  console.log('  PR #9152:', prEvent.title);
  console.log('  作者:', prEvent.author);
  console.log('  分支:', prEvent.sourceBranch, '→', prEvent.targetBranch);
  console.log('  变更: +' + prEvent.additions + '/-' + prEvent.deletions + ' 行 | ' + prEvent.changedFiles + ' 个文件');
  console.log('  说明:', prEvent.description);
  console.log('');

  // ── B-0.5: Commit Message 规范校验 ────────────────────────────────────────

  separator('📜 B-0.5: Commit Message 规范校验 — 必须: 类型(模块): 描述 [REQ-ID]');

  console.log('  校验规则:');
  console.log('  ┌──────────────────────────────────────────────────────────────┐');
  console.log('  │  规范格式: <type>(<scope>): <subject> [REQ-XXX]              │');
  console.log('  │                                                              │');
  console.log('  │  type: feat|fix|refactor|perf|test|docs|chore              │');
  console.log('  │  scope: 模块名 (perception|planning|control|...)            │');
  console.log('  │  subject: 变更描述 (中文或英文)                              │');
  console.log('  │  REQ-ID: 关联需求ID (可选但强烈推荐)                         │');
  console.log('  └──────────────────────────────────────────────────────────────┘');
  console.log('');

  // 校验逻辑
  const commitChecks = prEvent.commits.map(c => {
    const issues = [];
    
    // 检查类型前缀
    const validTypes = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'style'];
    const hasType = validTypes.some(t => c.message.startsWith(t));
    if (!hasType) {
      issues.push('缺少类型前缀 (feat/fix/refactor/...)');
    }

    // 检查模块范围
    const hasScope = /\([^)]+\)/.test(c.message);
    if (!hasScope) {
      issues.push('缺少模块范围 (perception/planning/...)');
    }

    // 检查需求ID关联
    const hasReqId = /\[REQ-[A-Z0-9-]+\]/.test(c.message);
    if (!hasReqId && !prEvent.hasLinkedRequirement) {
      issues.push('⚠️ 缺少需求ID关联 [REQ-XXX]');
    }

    // 检查描述长度
    const subject = c.message.split(':')[1] || c.message;
    if (subject.length < 10) {
      issues.push('描述过短 (建议 >10 字符)');
    }

    return {
      sha: c.sha.substring(0, 7),
      message: c.message,
      valid: issues.length === 0,
      issues,
      hasReqId,
    };
  });

  console.log('  Commit 校验结果:\n');
  console.log('  ┌──────────┬────────────────────────────────────────────────────┬────────┐');
  console.log('  │ SHA      │ Message                                              │ 状态   │');
  console.log('  ├──────────┼────────────────────────────────────────────────────┼────────┤');
  for (const check of commitChecks) {
    const msg = check.message.substring(0, 48).padEnd(48);
    const status = check.valid ? '🟢 PASS' : '🔴 FAIL';
    console.log(`  │ ${check.sha} │ ${msg} │ ${status} │`);
    if (!check.valid) {
      console.log(`  │          │ ⚠️  ${check.issues.join('; ').substring(0, 46).padEnd(46)} │        │`);
    }
  }
  console.log('  └──────────┴────────────────────────────────────────────────────┴────────┘');

  const allCommitsValid = commitChecks.every(c => c.valid);
  const hasAnyReqId = commitChecks.some(c => c.hasReqId);

  if (!allCommitsValid) {
    console.log('\n  🔴 阻断: Commit Message 不符合规范，请修改后重新提交');
    console.log('  💡 修正示例: feat(perception): 夜间场景自适应边缘阈值 [REQ-2025-Q4-014]\n');
  } else if (!hasAnyReqId) {
    console.log('\n  🟡 警告: 无需求ID关联，将触发 Flow B 反向确认流程\n');
  } else {
    console.log('\n  🟢 所有 Commit Message 符合规范\n');
  }

  // 如果 commit 不合规，直接阻断
  if (!allCommitsValid) {
    console.log('  ════════════════════════════════════════════════════════════════');
    console.log('  ❌ PR 被阻断 — 请修正 Commit Message 后重新提交');
    console.log('  ════════════════════════════════════════════════════════════════\n');
    return { flow: 'B', blocked: true, reason: 'commit_message_invalid', commitChecks };
  }

  // ── B-1: 代码变更解析 ──────────────────────────────────────────────────────

  separator('🔍 B-1: 代码变更解析 — 提取设计变更');

  const codeChanges = [
    {
      file: 'perception/lanes/lane_detector.cc',
      type: 'logic_change',
      summary: '夜间场景自适应边缘阈值（亮度<30时降为0.18）',
      affected_functions: ['LaneDetector::Process'],
      oldBehavior: '固定边缘阈值 0.35，全天候统一',
      newBehavior: '夜间（亮度<30）自适应阈值0.18，新增夜间增强和误检抑制',
      isBreakingChange: false,
      isInterfaceChange: false,
      isNewFunction: false,
    },
    {
      file: 'perception/common/frame_processor.cc',
      type: 'new_capability',
      summary: '新增帧处理器（亮度计算、夜间增强、误检抑制）',
      affected_functions: ['ComputeFrameBrightness', 'EnhanceEdgeForNightMode', 'SuppressNightGhostLanes'],
      oldBehavior: '无',
      newBehavior: '新增3个辅助函数，供lane_detector调用',
      isBreakingChange: false,
      isInterfaceChange: false,
      isNewFunction: true,
    },
    {
      file: 'perception/lanes/BUILD',
      type: 'build_change',
      summary: '新增frame_processor依赖',
      affected_functions: [],
      oldBehavior: 'lane_detector不依赖frame_processor',
      newBehavior: '新增frame_processor到deps',
      isBreakingChange: false,
      isInterfaceChange: true,
      isNewFunction: false,
    },
  ];

  console.log('  变更解析结果:\n');
  codeChanges.forEach((c, i) => {
    const typeIcon = c.type === 'logic_change' ? '🔄' : c.type === 'new_capability' ? '🆕' : '⚙️';
    console.log(`  ${i + 1}. ${typeIcon} ${c.file}`);
    console.log(`     变更: ${c.summary}`);
    console.log(`     函数: ${c.affected_functions.join(', ')}`);
    console.log(`     旧行为: ${c.oldBehavior}`);
    console.log(`     新行为: ${c.newBehavior}`);
    if (c.isInterfaceChange) {
      console.log(`     ⚠️  接口变更: ${c.isInterfaceChange ? '是' : '否'}`);
    }
    console.log('');
  });

  // ── B-2: 设计文档变更检测 ──────────────────────────────────────────────────

  separator('📄 B-2: 设计文档变更检测 — 溯源设计意图');

  const designDocs = [
    {
      doc: 'perception/lanes/SPEC.md',
      lastModified: '2026-01-15',
      lastCommit: 'fix: 修复车道线在弯道处的连续性',
      relatedFiles: ['perception/lanes/lane_detector.cc'],
      keySpecs: [
        '边缘阈值: 固定0.35',
        '帧率: 30Hz',
        '支持场景: 白天/阴天/夜晚基础',
      ],
    },
    {
      doc: 'perception/lanes/ARCH.md',
      lastModified: '2025-11-20',
      lastCommit: 'refactor: 车道线检测模块重构',
      relatedFiles: ['perception/lanes/lane_detector.h', 'lane_detector.cc'],
      keySpecs: [
        '模块职责: 输入CameraFrame，输出LaneArray',
        '算法: 边缘检测 + 样条曲线拟合',
        '无夜间场景专项说明',
      ],
    },
  ];

  console.log('  扫描关联设计文档:', designDocs.length, '个\n');

  const detectedDocGaps = [];

  for (const doc of designDocs) {
    const docSpec = doc.keySpecs.join(' | ');

    // 检测文档与代码的差异
    if (doc.keySpecs.some(s => s.includes('夜间') || s.includes('night'))) {
      // 文档已有夜间说明 → 检查是否与代码一致
      if (codeChanges.some(c => c.file === doc.relatedFiles[0] && c.type === 'logic_change')) {
        detectedDocGaps.push({
          doc: doc.doc,
          gap: '代码已实现夜间优化，但未更新文档说明',
          severity: 'warning',
        });
      }
    } else {
      // 文档无夜间说明，但代码新增了夜间处理
      detectedDocGaps.push({
        doc: doc.doc,
        gap: '代码新增夜间场景优化，文档未记录夜间专项设计',
        severity: 'error',
        missing: '夜间场景设计规格（亮度阈值、边缘增强策略、误检抑制逻辑）',
      });
    }
  }

  console.log('  检测结果:');
  console.log('  ┌─────────────────────────────┬────────┬────────────────────────────────────┐');
  console.log('  │ 文档                        │ 状态   │ 缺口                               │');
  console.log('  ├─────────────────────────────┼────────┼────────────────────────────────────┤');
  for (const d of designDocs) {
    const gap = detectedDocGaps.find(g => g.doc === d.doc);
    const status = gap?.severity === 'error' ? '🔴 过期' : gap?.severity === 'warning' ? '🟡 待更新' : '🟢 一致';
    const gapText = gap?.gap?.substring(0, 35).padEnd(35) || '无缺口'.padEnd(35);
    const docName = d.doc.substring(0, 25).padEnd(25);
    console.log(`  │ ${docName} │ ${status} │ ${gapText} │`);
  }
  console.log('  └─────────────────────────────┴────────┴────────────────────────────────────┘');

  // ── B-3: 需求变更传导分析 ─────────────────────────────────────────────────

  separator('🔗 B-3: 需求变更传导 — 需求-代码双向追溯');

  console.log('  无 linked requirement → 执行需求链逆向追溯:\n');

  // 逆向追溯：代码变更 → 可能影响的需求
  const possibleReqLinks = [
    {
      req: '城市NOA夜间感知能力提升',
      reqId: 'REQ-2025-Q4-014',
      reqText: '系统应在夜间场景下保持车道线检测准确率 > 80%',
      relation: '可能相关',
      confidence: '60%',
      direction: '代码满足需求',
      note: '需求提到夜间场景，但无具体亮度阈值定义',
    },
    {
      req: '感知模块夜间模式设计',
      reqId: 'SYS-ARCH-2025-09',
      reqText: '各感知子模块应支持夜间降级模式',
      relation: '直接相关',
      confidence: '85%',
      direction: '代码补全架构设计',
      note: '架构文档要求夜间模式，代码首次实现',
    },
  ];

  console.log('  🔍 逆向追溯（代码 → 需求）:\n');
  console.log('  ┌──────────────────────────────┬────────────┬──────────┬──────────────────────┬──────────────────────────────────┐');
  console.log('  │ 需求名称                     │ 需求ID      │ 相关度   │ 方向                  │ 说明                              │');
  console.log('  ├──────────────────────────────┼────────────┼──────────┼──────────────────────┼──────────────────────────────────┤');
  for (const r of possibleReqLinks) {
    const name = r.req.substring(0, 24).padEnd(24);
    const conf = r.confidence.padEnd(6);
    const dir = r.direction.substring(0, 14).padEnd(14);
    const note = r.note.substring(0, 32).padEnd(32);
    const confIcon = parseInt(r.confidence) >= 80 ? '🟢' : parseInt(r.confidence) >= 60 ? '🟡' : '🔵';
    const relIcon = r.relation === '直接相关' ? '🔴' : '🟡';
    console.log(`  │ ${name} │ ${r.reqId.substring(0, 12).padEnd(12)} │ ${relIcon} ${r.relation.substring(0, 4)} │ ${confIcon} ${conf} │ ${note} │`);
  }
  console.log('  └──────────────────────────────┴────────────┴──────────┴──────────────────────┴──────────────────────────────────┘');

  // 正向追溯：变更可能触发的需求更新
  console.log('\n  🔮 正向传导（变更 → 需求涟漪）:\n');

  const rippleEffects = [
    {
      effect: '需求条款变更',
      target: 'REQ-2025-Q4-014 第3.2条',
      currentText: '夜间车道线准确率 > 80%',
      suggestedNewText: '夜间车道线准确率 > 85%（亮度<30时 > 75%）',
      reason: '代码实现超出原需求，需更新量化指标',
      priority: 'P1',
    },
    {
      effect: '新增子需求',
      target: 'SYS-ARCH-2025-09',
      currentText: '各感知子模块应支持夜间降级模式',
      suggestedNewText: '各感知子模块应支持夜间降级模式（含亮度自适应阈值机制）',
      reason: '代码新增了亮度自适应逻辑，需补充到架构设计',
      priority: 'P1',
    },
    {
      effect: '新增验收用例',
      target: '夜间感知测试矩阵',
      currentText: '夜间场景：亮度<30lux, 3种天气',
      suggestedNewText: '夜间场景：亮度<30lux细化（<15lux极端暗光, 15-30lux一般暗光），新增误检率指标',
      reason: '代码对不同亮度级别做了区分处理',
      priority: 'P2',
    },
  ];

  rippleEffects.forEach(e => {
    const pri = e.priority === 'P0' ? '🔴' : e.priority === 'P1' ? '🟠' : '🟡';
    console.log(`  ${pri} [${e.priority}] ${e.effect}`);
    console.log(`     目标: ${e.target}`);
    console.log(`     现状: ${e.currentText}`);
    console.log(`     建议: ${e.suggestedNewText}`);
    console.log(`     原因: ${e.reason}`);
    console.log('');
  });

  // ── B-4: 综合评审意见 ─────────────────────────────────────────────────────

  separator('📋 B-4: 综合评审意见 — 三路建议汇总');

  const reviewSummary = {
    designDocChanges: detectedDocGaps,
    requirementChanges: rippleEffects,
    risks: [
      { severity: 'medium', message: '夜间亮度阈值（30lux）无量化依据，建议补充设计说明' },
      { severity: 'low', message: 'frame_processor为新模块，建议补充单元测试覆盖率要求' },
    ],
    approvals: [
      { text: '夜间场景优化方向正确，代码实现质量良好' },
      { text: '未破坏现有接口，向后兼容' },
      { text: 'BUILD依赖变更合理' },
    ],
    blockers: [],
  };

  // 判定是否阻断
  if (detectedDocGaps.some(g => g.severity === 'error')) {
    reviewSummary.blockers.push({
      reason: '设计文档未更新，夜间场景设计规格缺失',
      severity: 'critical',
    });
  }
  if (reviewSummary.risks.some(r => r.severity === 'medium')) {
    reviewSummary.risks.forEach(r => {
      if (r.severity === 'medium') {
        reviewSummary.blockers.push({
          reason: r.message,
          severity: 'medium',
        });
      }
    });
  }

  const overallStatus = reviewSummary.blockers.some(b => b.severity === 'critical')
    ? '🔴 BLOCKED'
    : reviewSummary.blockers.length > 0
    ? '🟠 CONDITIONAL'
    : '🟢 APPROVED';

  console.log('  综合状态:', overallStatus, '\n');

  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │                    评审结果                                   │');
  console.log('  ├────────────────┬────────────────────────────────────────────┤');
  console.log(`  │ 设计文档变更    │ ${String(detectedDocGaps.length).padEnd(2)} 项（${detectedDocGaps.filter(g=>g.severity==='error').length} 阻断）`.padEnd(63) + '│');
  console.log(`  │ 需求传导变更    │ ${String(rippleEffects.length).padEnd(2)} 项                                        `.padEnd(63) + '│');
  console.log(`  │ 代码风险        │ ${String(reviewSummary.risks.length).padEnd(2)} 项                                        `.padEnd(63) + '│');
  console.log(`  │ 阻断项          │ ${String(reviewSummary.blockers.length).padEnd(2)} 项                                        `.padEnd(63) + '│');
  console.log(`  │ 认可项          │ ${String(reviewSummary.approvals.length).padEnd(2)} 项                                        `.padEnd(63) + '│');
  console.log('  └────────────────┴────────────────────────────────────────────┘');

  console.log('\n  ✅ 认可项:');
  reviewSummary.approvals.forEach(a => console.log('     ✓', a.text));

  if (reviewSummary.blockers.length > 0) {
    console.log('\n  ⚠️  阻断/待确认项:');
    reviewSummary.blockers.forEach(b => {
      const icon = b.severity === 'critical' ? '🔴' : '🟠';
      console.log(`     ${icon} [${b.severity}] ${b.reason}`);
    });
  }

  // ── B-5: 变更记录生成 ─────────────────────────────────────────────────────

  separator('📝 B-5: 变更记录 — 写入设计文档变更日志');

  const changeLog = {
    prNumber: prEvent.prNumber,
    title: prEvent.title,
    author: prEvent.author,
    timestamp: new Date().toISOString(),
    type: 'code_commit_no_requirement',
    traceability: {
      designDocChanges: detectedDocGaps.map(g => ({
        doc: g.doc,
        gap: g.gap,
        missing: g.missing || null,
        action: 'UPDATE',
      })),
      requirementRipples: rippleEffects.map(e => ({
        target: e.target,
        type: e.effect,
        suggestion: e.suggestedNewText,
        reason: e.reason,
        priority: e.priority,
        action: e.effect.includes('变更') ? 'MODIFY' : 'CREATE',
      })),
      codeChanges: codeChanges.map(c => ({
        file: c.file,
        type: c.type,
        summary: c.summary,
        isBreaking: c.isBreakingChange,
      })),
    },
    reviewers: ['架构评审机器人(自动)', '感知模块Owner(待分配)'],
    status: 'pending_doc_update',
    blockers: reviewSummary.blockers.map(b => b.reason),
  };

  console.log('\n  📄 变更记录（将写入 CHANGELOG.md / 设计文档）:\n');
  console.log('  ```yaml');
  console.log(`  - pr: "#${changeLog.prNumber}"`);
  console.log(`    title: "${changeLog.title}"`);
  console.log(`    author: "${changeLog.author}"`);
  console.log(`    timestamp: "${changeLog.timestamp}"`);
  console.log(`    type: "code_commit_no_requirement"`);
  console.log(`    traceability:`);
  console.log(`      design_doc_changes:`);
  for (const dc of changeLog.traceability.designDocChanges) {
    console.log(`        - doc: "${dc.doc}"`);
    console.log(`          gap: "${dc.gap}"`);
    console.log(`          action: "${dc.action}"`);
  }
  console.log(`      requirement_ripples:`);
  for (const rr of changeLog.traceability.requirementRipples) {
    console.log(`        - target: "${rr.target}"`);
    console.log(`          type: "${rr.type}"`);
    console.log(`          suggestion: "${rr.suggestion}"`);
    console.log(`          action: "${rr.action}"`);
  }
  console.log(`    blockers: ${JSON.stringify(changeLog.blockers)}`);
  console.log(`    status: "pending_doc_update"`);
  console.log('  ```');

  // ── B-6: PR 评论下发 ─────────────────────────────────────────────────────

  separator('📤 B-6: PR 评论下发 — 评审意见');

  const prComment = `## 🛡️ DevGuard 自动分析报告

> **Flow B: 代码提交触发（无对应需求）**
> ⚠️ 未检测到 linked requirement，执行全链路溯源

### 分析摘要

| 维度 | 结果 |
|------|------|
| PR | #${prEvent.prNumber}: ${prEvent.title} |
| 变更文件 | ${prEvent.changedFiles} 个 |
| 变更量 | +${prEvent.additions}/-${prEvent.deletions} 行 |
| 状态 | **${overallStatus}** |

### 🔍 变更分析

**代码变更**: ${codeChanges.length} 个文件变更
${codeChanges.map(c => `- \`${c.file}\`: ${c.summary}`).join('\n')}

**设计文档缺口**:
${detectedDocGaps.length > 0
  ? detectedDocGaps.map(g => `- ⚠️ \`${g.doc}\`: ${g.gap}${g.missing ? `\n  → 缺失: ${g.missing}` : ''}`).join('\n')
  : '- 🟢 无文档缺口'}

### 🔗 需求传导

${rippleEffects.length > 0
  ? rippleEffects.map(e => `- **${e.target}** (${e.effect}): ${e.suggestedNewText}`).join('\n')
  : '- 无需求传导影响'}

### ⚠️ 阻断/待确认项

${reviewSummary.blockers.length > 0
  ? reviewSummary.blockers.map(b => `- ${b.severity === 'critical' ? '🔴' : '🟠'} **${b.severity}**: ${b.reason}`).join('\n')
  : '- 无阻断项'}

### ✅ 合入建议

1. **立即**: 更新 \`SPEC.md\` 和 \`ARCH.md\` 中的夜间场景设计规格
2. **建议**: 更新需求文档中夜间场景量化指标（REQ-2025-Q4-014）
3. **可选**: 补充 frame_processor 单元测试覆盖率

---

*[DevGuard Agent · Flow B · ${new Date().toLocaleString('zh-CN')}]*`;

  console.log('  📮 PR 评论内容:\n');
  console.log(prComment);

  // ── B-7: 需求负责人反向确认机制 ─────────────────────────────────────────────

  separator('🔐 B-7: 需求负责人反向确认 — 一票否决权');

  console.log('  ⚠️ Flow B 核心机制: 代码合入必须经过需求负责人确认\n');

  console.log('  ┌──────────────────────────────────────────────────────────────────┐');
  console.log('  │                    反向确认流程                                  │');
  console.log('  ├──────────────────────────────────────────────────────────────────┤');
  console.log('  │                                                                  │');
  console.log('  │  1️⃣  DevGuard 自动识别相关需求负责人                             │');
  console.log('  │      ↓                                                           │');
  console.log('  │  2️⃣  系统自动发送确认请求（邮件/IM/GitHub @mention）            │');
  console.log('  │      ↓                                                           │');
  console.log('  │  3️⃣  需求负责人审核代码变更是否影响需求范围                      │');
  console.log('  │      ↓                                                           │');
  console.log('  │  4️⃣  负责人做出决策:                                            │');
  console.log('  │      ✅ APPROVE  — 同意合入（需更新需求文档）                    │');
  console.log('  │      🟡 CONDITIONAL — 有条件同意（需补充测试/文档）              │');
  console.log('  │      ❌ REJECT   — 否决合入（需求范围不匹配/风险过高）           │');
  console.log('  │      ↓                                                           │');
  console.log('  │  5️⃣  只有 APPROVE 或 CONDITIONAL(已满足条件) 才能合入 PR        │');
  console.log('  │                                                                  │');
  console.log('  └──────────────────────────────────────────────────────────────────┘');

  // 模拟识别需求负责人
  const relatedRequirements = [
    {
      reqId: 'REQ-2025-Q4-014',
      title: '城市NOA夜间感知能力提升',
      owner: '张三 (产品经理)',
      ownerEmail: 'zhangsan@company.com',
      ownerGithub: '@zhangsan-pm',
      confidence: 0.85,
      impact: '需求指标需更新（准确率 80% → 85%）',
    },
    {
      reqId: 'SYS-ARCH-2025-09',
      title: '感知模块夜间模式设计',
      owner: '李四 (架构师)',
      ownerEmail: 'lisi@company.com',
      ownerGithub: '@lisi-arch',
      confidence: 0.92,
      impact: '架构文档需补充亮度自适应阈值机制',
    },
  ];

  console.log('\n  📋 识别到的相关需求及负责人:\n');
  console.log('  ┌──────────────────┬──────────────────────────────┬────────────────┬─────────────┐');
  console.log('  │ 需求ID            │ 需求名称                      │ 负责人          │ 影响说明     │');
  console.log('  ├──────────────────┼──────────────────────────────┼────────────────┼─────────────┤');
  for (const req of relatedRequirements) {
    const reqId = req.reqId.substring(0, 16).padEnd(16);
    const title = req.title.substring(0, 26).padEnd(26);
    const owner = req.owner.substring(0, 12).padEnd(12);
    const impact = req.impact.substring(0, 11).padEnd(11);
    const confIcon = req.confidence >= 0.9 ? '🟢' : req.confidence >= 0.7 ? '🟡' : '🔵';
    console.log(`  │ ${reqId} │ ${title} │ ${owner} │ ${confIcon} ${impact} │`);
  }
  console.log('  └──────────────────┴──────────────────────────────┴────────────────┴─────────────┘');

  // 模拟发送确认请求
  console.log('\n  📤 已发送确认请求:\n');
  for (const req of relatedRequirements) {
    console.log(`  To: ${req.ownerEmail} ${req.ownerGithub}`);
    console.log(`  Subject: [DevGuard] PR #${prEvent.prNumber} 需要您的确认 — 关联需求 ${req.reqId}`);
    console.log('');
    console.log(`  尊敬的 ${req.owner.split(' ')[0]}:`);
    console.log('');
    console.log(`  PR #${prEvent.prNumber} "${prEvent.title}" 触发了需求变更追溯。`);
    console.log(`  该 PR 与您负责的需求 "${req.title}" 相关度: ${(req.confidence * 100).toFixed(0)}%`);
    console.log('');
    console.log(`  影响分析: ${req.impact}`);
    console.log('');
    console.log('  请在 24 小时内完成确认:');
    console.log(`  - ✅ APPROVE:  https://github.com/.../pull/${prEvent.prNumber}/approve?from=req-owner`);
    console.log(`  - ❌ REJECT:   https://github.com/.../pull/${prEvent.prNumber}/reject?from=req-owner`);
    console.log('');
    console.log('  ──────────────────────────────────────────────────────────────\n');
  }

  // 模拟确认状态追踪
  console.log('  🔄 确认状态追踪:\n');
  console.log('  ┌──────────────────┬────────────────┬────────────────────────────────────────┐');
  console.log('  │ 需求ID            │ 负责人          │ 状态                                    │');
  console.log('  ├──────────────────┼────────────────┼────────────────────────────────────────┤');
  console.log('  │ REQ-2025-Q4-014  │ 张三 (产品经理) │ ⏳ 等待确认 (剩余 18h 32m)              │');
  console.log('  │ SYS-ARCH-2025-09 │ 李四 (架构师)   │ ⏳ 等待确认 (剩余 23h 45m)              │');
  console.log('  └──────────────────┴────────────────┴────────────────────────────────────────┘');

  console.log('\n  🚫 合入门禁:');
  console.log('  ┌──────────────────────────────────────────────────────────────────┐');
  console.log('  │  PR 合入条件（ALL must pass）:                                   │');
  console.log('  ├──────────────────────────────────────────────────────────────────┤');
  console.log('  │  ☐ 所有阻塞性问题已解决                                          │');
  console.log('  │  ☐ 设计文档已更新（或标记为待更新）                              │');
  console.log('  │  ☐ 所有相关需求负责人已确认 (APPROVE 或 CONDITIONAL)            │');
  console.log('  │  ☐ Commit Message 符合规范                                       │');
  console.log('  │  ☐ CI 测试通过                                                   │');
  console.log('  └──────────────────────────────────────────────────────────────────┘');

  console.log('\n  ⚠️  一票否决权说明:');
  console.log('  ────────────────────────────────────────');
  console.log('  • 任意需求负责人 REJECT → PR 无法合入');
  console.log('  • 24小时内无响应 → 自动升级至上级负责人');
  console.log('  • 代码与需求范围严重偏离 → 强制阻断并通知PM');

  // ── B-8: 变更记录生成（更新）──────────────────────────────────────────────

  separator('📝 B-8: 变更记录 — 写入设计文档变更日志 + 确认状态');

  changeLog.requirementConfirmations = relatedRequirements.map(req => ({
    reqId: req.reqId,
    owner: req.owner,
    status: 'pending',
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }));
  changeLog.commitChecks = commitChecks;
  changeLog.canMerge = false;  // 需要确认后才能合并

  console.log('\n  📄 变更记录（已更新）:\n');
  console.log('  ```yaml');
  console.log(`  - pr: "#${changeLog.prNumber}"`);
  console.log(`    title: "${changeLog.title}"`);
  console.log(`    author: "${changeLog.author}"`);
  console.log(`    type: "code_commit_no_requirement"`);
  console.log(`    status: "pending_requirement_confirmation"`);
  console.log(`    commit_checks:`);
  for (const check of commitChecks) {
    console.log(`      - sha: "${check.sha}"`);
    console.log(`        valid: ${check.valid}`);
    if (!check.valid) {
      console.log(`        issues: ${JSON.stringify(check.issues)}`);
    }
  }
  console.log(`    requirement_confirmations:`);
  for (const conf of changeLog.requirementConfirmations) {
    console.log(`      - req_id: "${conf.reqId}"`);
    console.log(`        owner: "${conf.owner}"`);
    console.log(`        status: "${conf.status}"`);
    console.log(`        deadline: "${conf.deadline}"`);
  }
  console.log(`    can_merge: false  # 需所有负责人确认后自动置 true`);
  console.log('  ```');

  return { 
    flow: 'B', 
    prEvent, 
    commitChecks,
    codeChanges, 
    detectedDocGaps, 
    rippleEffects, 
    reviewSummary, 
    changeLog,
    relatedRequirements,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  // 执行 Flow A
  await flowA_requirementTrigger();

  // 执行 Flow B
  flowB_codeCommitTrigger();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  separator('✅ 演示完成');

  console.log('  全链路耗时:', elapsed, 's\n');

  console.log('  ╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('  ║                    两套触发流程总结                                   ║');
  console.log('  ╠═══════════════════════════════════════════════════════════════════════╣');
  console.log('  ║                                                                       ║');
  console.log('  ║  Flow A: 需求输入触发                                                  ║');
  console.log('  ║  ──────────────────────────                                          ║');
  console.log('  ║  输入: PRD / 需求文档 → ReqParser → FeatureAligner                    ║');
  console.log('  ║  输出: 状态分析 + 实施计划 + 代码骨架 + 文档变更建议                   ║');
  console.log('  ║  典型场景: 产品经理提出新需求 → DevGuard 分析是否可实施               ║');
  console.log('  ║                                                                       ║');
  console.log('  ║  Flow B: 代码提交触发（无对应需求）                                    ║');
  console.log('  ║  ─────────────────────────────────────────                             ║');
  console.log('  ║  输入: PR Diff（无 linked requirement）                               ║');
  console.log('  ║  管道: 代码变更分析 → 设计文档变更检测 → 需求变更传导                  ║');
  console.log('  ║  输出: 设计文档变更记录 + 需求变更建议 + 评审意见                      ║');
  console.log('  ║  典型场景: 工程师直接提交代码 → DevGuard 反向追溯设计/需求影响         ║');
  console.log('  ║                                                                       ║');
  console.log('  ╚═══════════════════════════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
