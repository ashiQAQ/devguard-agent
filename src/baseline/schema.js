/**
 * 架构基线 Schema — 专为自动驾驶系统设计
 *
 * 核心领域模型：
 *   - 感知模块 (Perception)
 *   - 定位模块 (Localization)
 *   - 决策规划 (Planning/Decision)
 *   - 车辆控制 (Control)
 *   - 高精地图 (HDMap)
 *   - 仿真测试 (Simulation)
 *   - 功能安全 (Safety/ISO26262)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 生成项目基线
 * @param {Object} options
 * @param {string} options.name 项目名称
 * @param {string} options.repoPath 代码仓库路径
 * @param {string} options.language 主语言 (cpp/python/ros)
 */
async function generateBaseline(options = {}) {
  const {
    name = 'autonomous-driving-project',
    repoPath = null,
    language = 'cpp',
    modules = null // 可手动指定模块结构
  } = options;

  const baseline = {
    id: crypto.randomUUID(),
    name,
    version: '1.0.0',
    language,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    // ─── 核心架构 ────────────────────────────────────────────────────────
    architecture: {
      pattern: 'distributed-real-time',
      rosVersion: 'ROS2 Humble',
      communication: 'DDS / Pub-Sub',
      os: 'Ubuntu 22.04 / QNX',
      realtime: true,
      safetyLevel: 'ASIL-D', // 功能安全等级
    },

    // ─── 模块依赖图 ──────────────────────────────────────────────────────
    modules: modules || buildDefaultADModules(language),

    // ─── 文件结构树 ──────────────────────────────────────────────────────
    fileTree: null,

    // ─── 数据流图 ────────────────────────────────────────────────────────
    dataFlows: [],

    // ─── 接口清单 ────────────────────────────────────────────────────────
    interfaces: [],

    // ─── 数据模型 ────────────────────────────────────────────────────────
    dataModels: [],

    // ─── 技术债务 ────────────────────────────────────────────────────────
    techDebts: [],

    // ─── 风险热点 ────────────────────────────────────────────────────────
    riskHotspots: [],

    // ─── 感知系统专项 ────────────────────────────────────────────────────
    perception: {
      sensors: [],       // 传感器配置
      models: [],        // 模型版本
      latency: {},       // 延迟要求
      fps: {},           // 帧率要求
    },

    // ─── 决策规划专项 ────────────────────────────────────────────────────
    planning: {
      algorithms: [],     // 算法清单
      scenarios: [],      // 支持场景
      latency: {},        // 规划延迟要求
      fallback: null,     // 降级策略
    },

    // ─── 功能安全专项 ────────────────────────────────────────────────────
    safety: {
      asilLevel: 'D',
      watchdogs: [],      // 看门狗配置
      redundancies: [],   // 冗余设计
      fta: null,          // 故障树分析
      misra: [],          // MISRA-C 合规
    },

    // ─── 仿真测试专项 ────────────────────────────────────────────────────
    simulation: {
      frameworks: [],     //仿真框架
      scenarios: [],      //测试场景库
      coverage: {},       //覆盖率要求
    },

    // ─── 基线统计 ────────────────────────────────────────────────────────
    stats: {
      totalFiles: 0,
      totalModules: 0,
      totalLines: 0,
      complexity: 0,
      safetyScore: 0,
    },

    // ─── 向量索引元数据 ──────────────────────────────────────────────────
    vectorIndex: {
      enabled: false,
      provider: null,
      chunks: 0,
    }
  };

  // 如果有代码仓库路径，进行实际分析
  if (repoPath && fs.existsSync(repoPath)) {
    await enrichFromRepo(baseline, repoPath, language);
  }

  return baseline;
}

/**
 * 构建默认自动驾驶模块结构
 */
function buildDefaultADModules(language) {
  const ext = language === 'python' ? '.py' : '.cpp';

  return {
    // ─── 感知模块 ────────────────────────────────────────────────────
    perception: {
      name: '感知模块',
      name_en: 'perception',
      path: language === 'python' ? 'perception/' : 'src/perception/',
      asil: 'B',
      rt: true,  // 实时性要求
      latency: { target: '50ms', max: '100ms' },
      dependencies: ['sensor_drivers', 'hdmap'],
      dependents: ['planning', 'prediction'],
      submodules: {
        lidar: { name: '激光雷达感知', asil: 'B', files: [] },
        camera: { name: '视觉感知', asil: 'B', files: [] },
        radar: { name: '毫米波雷达', asil: 'B', files: [] },
        fusion: { name: '多传感器融合', asil: 'C', files: [] },
        detection: { name: '目标检测', asil: 'B', files: [] },
        tracking: { name: '目标跟踪', asil: 'B', files: [] },
      },
      risks: [
        { type: 'sensor_failure', severity: 'critical', mitigation: '传感器冗余' },
        { type: 'perception_latency', severity: 'major', mitigation: '降低检测阈值' },
      ],
      techDebts: [],
    },

    // ─── 定位模块 ─────────────────────────────────────────────────────
    localization: {
      name: '定位模块',
      name_en: 'localization',
      path: language === 'python' ? 'localization/' : 'src/localization/',
      asil: 'C',
      rt: true,
      latency: { target: '20ms', max: '50ms' },
      dependencies: ['sensor_drivers', 'hdmap'],
      dependents: ['planning', 'control'],
      submodules: {
        gnss: { name: 'GNSS定位', asil: 'B', files: [] },
        imu: { name: 'IMU惯导', asil: 'B', files: [] },
        ekf: { name: 'EKF融合定位', asil: 'C', files: [] },
        lidar_loc: { name: '激光雷达定位', asil: 'B', files: [] },
      },
      risks: [
        { type: 'gnss_outage', severity: 'critical', mitigation: 'IMU航位推算' },
        { type: 'map_mismatch', severity: 'major', mitigation: '多源校验' },
      ],
      techDebts: [],
    },

    // ─── 决策规划模块 ──────────────────────────────────────────────────
    planning: {
      name: '决策规划模块',
      name_en: 'planning',
      path: language === 'python' ? 'planning/' : 'src/planning/',
      asil: 'D',
      rt: true,
      latency: { target: '100ms', max: '200ms' },
      dependencies: ['perception', 'localization', 'hdmap', 'prediction'],
      dependents: ['control'],
      submodules: {
        behavior: { name: '行为决策', asil: 'D', files: [] },
        trajectory: { name: '轨迹规划', asil: 'D', files: [] },
        speed: { name: '速度规划', asil: 'C', files: [] },
        routing: { name: '全局路径规划', asil: 'C', files: [] },
        scenario: { name: '场景切换', asil: 'D', files: [] },
      },
      risks: [
        { type: 'planning_failure', severity: 'critical', mitigation: 'MRC最小风险条件' },
        { type: 'inflexible', severity: 'major', mitigation: '规则引擎升级' },
      ],
      techDebts: [],
    },

    // ─── 预测模块 ─────────────────────────────────────────────────────
    prediction: {
      name: '轨迹预测模块',
      name_en: 'prediction',
      path: language === 'python' ? 'prediction/' : 'src/prediction/',
      asil: 'B',
      rt: true,
      latency: { target: '30ms', max: '60ms' },
      dependencies: ['perception'],
      dependents: ['planning'],
      submodules: {
        agent_model: { name: 'Agent模型', asil: 'B', files: [] },
        multi_agent: { name: '多Agent交互', asil: 'B', files: [] },
        constraint: { name: '运动约束', asil: 'B', files: [] },
      },
      risks: [],
      techDebts: [],
    },

    // ─── 控制模块 ──────────────────────────────────────────────────────
    control: {
      name: '车辆控制模块',
      name_en: 'control',
      path: language === 'python' ? 'control/' : 'src/control/',
      asil: 'D',
      rt: true,
      latency: { target: '10ms', max: '20ms' },
      dependencies: ['planning', 'localization', 'vehicle'],
      dependents: ['canbus'],
      submodules: {
        longitudinal: { name: '纵向控制', asil: 'D', files: [] },
        lateral: { name: '横向控制', asil: 'D', files: [] },
        lqr: { name: 'LQR控制', asil: 'C', files: [] },
        mpc: { name: 'MPC模型预测控制', asil: 'D', files: [] },
      },
      risks: [
        { type: 'control_hz', severity: 'critical', mitigation: 'PID降级' },
        { type: 'overshoot', severity: 'major', mitigation: '限幅处理' },
      ],
      techDebts: [],
    },

    // ─── 高精地图 ─────────────────────────────────────────────────────
    hdmap: {
      name: '高精地图模块',
      name_en: 'hdmap',
      path: language === 'python' ? 'map/' : 'src/hdmap/',
      asil: 'C',
      rt: false,
      latency: { target: 'N/A', max: '1s' },
      dependencies: [],
      dependents: ['perception', 'localization', 'planning', 'routing'],
      submodules: {
        base_map: { name: '基础地图', asil: 'C', files: [] },
        localization_map: { name: '定位地图', asil: 'B', files: [] },
        routing_map: { name: '路由地图', asil: 'C', files: [] },
        semantic_map: { name: '语义地图', asil: 'B', files: [] },
      },
      risks: [],
      techDebts: [],
    },

    // ─── 仿真测试 ─────────────────────────────────────────────────────
    simulation: {
      name: '仿真测试模块',
      name_en: 'simulation',
      path: language === 'python' ? 'simulation/' : 'src/simulation/',
      asil: 'N/A',
      rt: false,
      latency: { target: 'N/A', max: 'N/A' },
      dependencies: ['planning', 'control', 'perception'],
      dependents: [],
      submodules: {
        scenarios: { name: '测试场景库', asil: 'N/A', files: [] },
        metrics: { name: '评测指标', asil: 'N/A', files: [] },
        injector: { name: '故障注入', asil: 'N/A', files: [] },
      },
      risks: [],
      techDebts: [],
    },

    // ─── 通信中间件 ───────────────────────────────────────────────────
    canbus: {
      name: 'CAN/CANFD总线',
      name_en: 'canbus',
      path: language === 'python' ? 'vehicle/' : 'src/canbus/',
      asil: 'D',
      rt: true,
      latency: { target: '5ms', max: '10ms' },
      dependencies: ['control'],
      dependents: ['vehicle'],
      submodules: {
        protocol: { name: '协议解析', asil: 'D', files: [] },
        gateway: { name: '网关', asil: 'C', files: [] },
      },
      risks: [
        { type: 'bus_timeout', severity: 'critical', mitigation: '超时监控' },
      ],
      techDebts: [],
    },

    // ─── 功能安全 ─────────────────────────────────────────────────────
    safety: {
      name: '功能安全模块',
      name_en: 'safety',
      path: language === 'python' ? 'safety/' : 'src/safety/',
      asil: 'D',
      rt: true,
      latency: { target: '1ms', max: '5ms' },
      dependencies: ['perception', 'planning', 'control'],
      dependents: [],
      submodules: {
        monitor: { name: '系统监控', asil: 'D', files: [] },
        watchdog: { name: '看门狗', asil: 'D', files: [] },
        mrc: { name: '最小风险控制', asil: 'D', files: [] },
        diagnostic: { name: '诊断模块', asil: 'C', files: [] },
      },
      risks: [],
      techDebts: [],
    },

    // ─── 车辆平台 ─────────────────────────────────────────────────────
    vehicle: {
      name: '车辆平台接口',
      name_en: 'vehicle',
      path: language === 'python' ? 'vehicle/' : 'src/vehicle/',
      asil: 'D',
      rt: true,
      latency: { target: '1ms', max: '5ms' },
      dependencies: ['canbus'],
      dependents: [],
      submodules: {
        chassis: { name: '底盘接口', asil: 'D', files: [] },
        brake: { name: '制动接口', asil: 'D', files: [] },
        throttle: { name: '油门接口', asil: 'D', files: [] },
        steering: { name: '转向接口', asil: 'D', files: [] },
      },
      risks: [],
      techDebts: [],
    },

    // ─── 工具/监控 ────────────────────────────────────────────────────
    monitor: {
      name: '系统监控',
      name_en: 'monitor',
      path: language === 'python' ? 'tools/' : 'src/tools/',
      asil: 'N/A',
      rt: false,
      latency: { target: 'N/A', max: 'N/A' },
      dependencies: ['all'],
      dependents: [],
      submodules: {
        logger: { name: '日志系统', asil: 'N/A', files: [] },
        visualizer: { name: '可视化', asil: 'N/A', files: [] },
        dumper: { name: '数据回放', asil: 'N/A', files: [] },
      },
      risks: [],
      techDebts: [],
    },
  };
}

/**
 * 从代码仓库实际分析并丰富基线
 */
async function enrichFromRepo(baseline, repoPath, language) {
  // 扫描文件结构
  baseline.fileTree = scanDirectory(repoPath);

  // 统计
  baseline.stats = computeStats(baseline.fileTree);

  // 分析模块依赖
  baseline.dependencies = analyzeDependencies(repoPath, language);

  // 分析接口
  baseline.interfaces = analyzeInterfaces(repoPath, language);

  // 识别技术债务
  baseline.techDebts = identifyTechDebts(repoPath, language);

  // 计算风险热点
  baseline.riskHotspots = computeRiskHotspots(baseline);
}

function scanDirectory(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];

  const items = fs.readdirSync(dir, { withFileTypes: true });
  const result = [];

  for (const item of items) {
    if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === '__pycache__') continue;

    const fullPath = path.join(dir, item.name);
    const relativePath = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.isDirectory()) {
      result.push({
        name: item.name,
        path: relativePath,
        type: 'directory',
        children: scanDirectory(fullPath, relativePath)
      });
    } else {
      const ext = path.extname(item.name);
      result.push({
        name: item.name,
        path: relativePath,
        type: 'file',
        extension: ext,
        size: fs.statSync(fullPath).size,
      });
    }
  }

  return result;
}

function computeStats(fileTree) {
  let files = 0, lines = 0;
  const countFiles = (items) => {
    for (const item of items) {
      if (item.type === 'file') {
        files++;
      }
      if (item.children) countFiles(item.children);
    }
  };
  countFiles(fileTree);

  return {
    totalFiles: files,
    totalModules: Object.keys(baseline?.modules || {}).length,
    totalLines: lines,
    complexity: 0,
    safetyScore: 0,
  };
}

function analyzeDependencies(repoPath, language) {
  // 简化实现：扫描 import / #include 语句
  const deps = [];
  const scanForDeps = (dir) => {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory() && item.name !== 'node_modules') {
        scanForDeps(fullPath);
      } else if (item.isFile()) {
        const ext = path.extname(item.name);
        if (language === 'python' && ext === '.py') {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const imports = content.match(/^import\s+(\w+)/gm) || [];
          const fromImports = content.match(/^from\s+(\w+)/gm) || [];
          deps.push(...imports, ...fromImports);
        } else if (language === 'cpp' && (ext === '.cpp' || ext === '.h')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const includes = content.match(/#include\s+[<"]([^>"]+)[>"]/g) || [];
          deps.push(...includes);
        }
      }
    }
  };
  scanForDeps(repoPath);
  return [...new Set(deps)];
}

function analyzeInterfaces(repoPath, language) {
  // 扫描函数/类定义作为接口
  const interfaces = [];
  const ext = language === 'python' ? '.py' : '.cpp';
  const scanForInterfaces = (dir) => {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory() && item.name !== 'node_modules') {
        scanForInterfaces(fullPath);
      } else if (item.isFile() && path.extname(item.name) === ext) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (language === 'python') {
          const funcs = content.match(/^def\s+(\w+)/gm) || [];
          const classes = content.match(/^class\s+(\w+)/gm) || [];
          [...funcs, ...classes].forEach(name => {
            interfaces.push({ name: name.replace(/^(def|class)\s+/, ''), file: fullPath });
          });
        } else {
          const funcs = content.match(/\b\w+\s+\w+\s*\([^)]*\)\s*;/g) || [];
          funcs.forEach(f => interfaces.push({ name: f, file: fullPath }));
        }
      }
    }
  };
  scanForInterfaces(repoPath);
  return interfaces;
}

function identifyTechDebts(repoPath, language) {
  const debts = [];
  const patterns = [
    { pattern: /\/\/ TODO|\/\/ FIXME|TODO:|FIXME:/gi, type: 'todo', severity: 'minor', desc: '未完成代码' },
    { pattern: /\/\/ HACK|\/\/ XXX/gi, type: 'hack', severity: 'major', desc: '临时方案' },
    { pattern: /while\s*\(\s*true\s*\)/gi, type: 'infinite-loop', severity: 'major', desc: '无限循环' },
    { pattern: /sleep\s*\(/gi, type: 'blocking-sleep', severity: 'major', desc: '阻塞式睡眠' },
    { pattern: /\/\/.*deprecated/gi, type: 'deprecated', severity: 'minor', desc: '废弃代码' },
    { pattern: /printf\s*\(|cout\s*<</gi, type: 'debug-print', severity: 'minor', desc: '调试打印' },
  ];

  const ext = language === 'python' ? '.py' : language === 'cpp' ? '.cpp' : '';
  const scan = (dir) => {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory() && item.name !== 'node_modules') scan(fullPath);
      else if (item.isFile() && (path.extname(item.name) === ext || item.name.endsWith('.h'))) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          patterns.forEach(({ pattern, type, severity, desc }) => {
            const matches = content.match(pattern);
            if (matches) {
              debts.push({
                id: `TD-${debts.length + 1}`.padStart(6, '0'),
                file: fullPath,
                type,
                severity,
                description: `${desc}: ${matches[0]}`,
                count: matches.length,
              });
            }
          });
        } catch (e) {}
      }
    }
  };
  scan(repoPath);
  return debts;
}

function computeRiskHotspots(baseline) {
  const hotspots = [];
  const mods = baseline.modules;
  for (const [key, mod] of Object.entries(mods)) {
    let riskScore = 0;
    if (mod.asil === 'D') riskScore += 0.3;
    if (mod.rt) riskScore += 0.2;
    if (mod.risks?.length > 0) {
      mod.risks.forEach(r => {
        if (r.severity === 'critical') riskScore += 0.3;
        if (r.severity === 'major') riskScore += 0.15;
      });
    }
    hotspots.push({
      module: key,
      name: mod.name,
      asil: mod.asil,
      riskScore: Math.min(1, riskScore),
      risks: mod.risks || [],
      latency: mod.latency,
      realtime: mod.rt,
    });
  }
  return hotspots.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * 加载保存的基线
 */
function loadBaseline(id) {
  const dir = path.join(__dirname, '../../data/baselines');
  const file = path.join(dir, `${id}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }
  return null;
}

/**
 * 保存基线到磁盘
 */
function saveBaseline(baseline) {
  const dir = path.resolve(__dirname, '../../data/baselines');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${baseline.id}.json`);
  baseline.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2));
  return file;
}

/**
 * 列出所有基线
 */
function listBaselines() {
  const dir = path.join(__dirname, '../../data/baselines');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      return { id: data.id, name: data.name, version: data.version, updatedAt: data.updatedAt };
    });
}

module.exports = {
  generateBaseline,
  loadBaseline,
  saveBaseline,
  listBaselines,
  buildDefaultADModules,
};
