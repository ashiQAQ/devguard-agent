/**
 * code-scanner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * 从代码仓库自动识别「功能基线」
 *
 * 核心思路：
 *   1. 遍历仓库文件树（按 repos.config.json 的 scan 配置）
 *   2. 对每个文件提取：类/函数/命名空间/Topic/接口
 *   3. 按模块聚合，生成「功能特征向量」
 *   4. 输出结构化的 FeatureBaseline（可持久化）
 *
 * 输出格式：
 *   {
 *     repoId, scanTime, modules: {
 *       [moduleId]: {
 *         name, path, features: [{ name, type, signature, file, line }],
 *         topics: [...], interfaces: [...], dependencies: [...]
 *       }
 *     }
 *   }
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── 语言解析规则 ────────────────────────────────────────────────────────────

const LANG_RULES = {
  cpp: {
    extensions: ['.cc', '.cpp', '.h', '.hpp', '.cxx'],
    patterns: {
      namespace:  /^namespace\s+(\w+)\s*\{/m,
      class_:     /^(?:class|struct)\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+[\w:]+)?\s*\{/gm,
      function_:  /^\s*(?:virtual\s+|static\s+|inline\s+|explicit\s+)*(?:[\w:*&<>, ]+)\s+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:override\s*)?(?:noexcept\s*)?[{;]/gm,
      topic:      /(?:TOPIC|topic_name|channel_name|"\/apollo\/[^"]+"|"\/[a-z_]+\/[a-z_/]+")/g,
      proto_msg:  /(?:apollo::|::|std::)(\w+(?:::\w+)*)\s+\w+/g,
      include:    /^#include\s+[<"]([^>"]+)[>"]/gm,
      define:     /^#define\s+(\w+)/gm,
    },
    moduleHints: {
      perception:   ['perception', 'detect', 'lidar', 'camera', 'radar', 'obstacle', 'lane', 'traffic'],
      planning:     ['planning', 'trajectory', 'path', 'route', 'behavior', 'decision'],
      control:      ['control', 'pid', 'mpc', 'throttle', 'brake', 'steer', 'actuator'],
      localization: ['localization', 'gnss', 'imu', 'pose', 'odometry', 'slam'],
      prediction:   ['prediction', 'predict', 'intent', 'motion'],
      hdmap:        ['map', 'hdmap', 'lane_info', 'road_info', 'junction'],
      canbus:       ['canbus', 'can_', 'chassis', 'vehicle_signal'],
      simulation:   ['simulation', 'sim_', 'mock', 'fake', 'test_'],
      safety:       ['safety', 'fault', 'watchdog', 'redundan', 'failsafe', 'emergency'],
      monitor:      ['monitor', 'metric', 'health', 'status', 'heartbeat'],
    }
  },
  python: {
    extensions: ['.py'],
    patterns: {
      class_:    /^class\s+(\w+)(?:\([^)]*\))?\s*:/gm,
      function_: /^def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*[\w\[\], ]+)?\s*:/gm,
      topic:     /(?:topic|channel|subject)\s*=\s*["']([^"']+)["']/g,
      import_:   /^(?:import|from)\s+([\w.]+)/gm,
    },
    moduleHints: {
      perception:   ['perception', 'detect', 'lidar', 'camera'],
      planning:     ['planning', 'trajectory', 'path'],
      control:      ['control', 'pid', 'throttle'],
      localization: ['localization', 'gnss', 'pose'],
    }
  }
};

// ─── 主扫描器 ────────────────────────────────────────────────────────────────

class CodeScanner {
  /**
   * @param {Object} repoConfig  repos.config.json 中的单个 repo 配置
   */
  constructor(repoConfig) {
    this.repo      = repoConfig;
    this.scanCfg  = repoConfig.scan || {};
    this.lang     = this.scanCfg.language || 'cpp';
    this.rules  = LANG_RULES[this.lang] || LANG_RULES.cpp;
    this.stats  = { files: 0, lines: 0, features: 0, skipped: 0 };
  }

  // ─── 入口 ─────────────────────────────────────────────────────────────────

  /**
   * 扫描仓库，返回功能基线
   * @returns {Promise<FeatureBaseline>}
   */
  async scan() {
    const repoRoot = this.repo.git.localPath;
    if (!fs.existsSync(repoRoot)) {
      throw new Error(`Repo path not found: ${repoRoot}`);
    }

    const includePaths = (this.scanCfg.includePaths || ['.']).map(p =>
      path.join(repoRoot, p)
    );
    const excludePaths = new Set(
      (this.scanCfg.excludePaths || []).map(p => path.join(repoRoot, p))
    );

    // 收集所有文件
    const files = [];
    for (const incPath of includePaths) {
      if (fs.existsSync(incPath)) {
        this._collectFiles(incPath, excludePaths, files);
      }
    }

    // 按文件解析特征
    const rawFeatures = [];
    for (const file of files) {
      const feats = this._parseFile(file, repoRoot);
      rawFeatures.push(...feats);
      this.stats.files++;
    }

    // 聚合为模块基线
    const baseline = this._aggregate(rawFeatures, repoRoot);
    baseline.repoId   = this.repo.id;
    baseline.repoName = this.repo.name;
    baseline.scanTime = new Date().toISOString();
    baseline.stats    = { ...this.stats };

    return baseline;
  }

  // ─── 文件收集 ─────────────────────────────────────────────────────────────

  _collectFiles(dir, excludePaths, out) {
    if (excludePaths.has(dir)) return;
    const maxFiles = this.scanCfg.maxFiles || 2000;
    if (out.length >= maxFiles) return;

    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !excludePaths.has(full)) {
          this._collectFiles(full, excludePaths, out);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ((this.rules.extensions || []).includes(ext)) {
          const maxKB = this.scanCfg.maxFileSizeKB || 500;
          try {
            const stat = fs.statSync(full);
            if (stat.size <= maxKB * 1024) out.push(full);
            else this.stats.skipped++;
          } catch { this.stats.skipped++; }
        }
      }
    }
  }

  // ─── 单文件解析 ───────────────────────────────────────────────────────────

  _parseFile(filePath, repoRoot) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf-8'); }
    catch { return []; }

    this.stats.lines += content.split('\n').length;

    const relPath = path.relative(repoRoot, filePath);
    const features = [];
    const p = this.rules.patterns;

    // 命名空间 / 模块归属
    const nsMatch = content.match(p.namespace);
    const namespace = nsMatch ? nsMatch[1] : null;

    // 类
    let m;
    if (p.class_) {
      const re = new RegExp(p.class_.source, p.class_.flags);
      while ((m = re.exec(content)) !== null) {
        features.push({
          type: 'class',
          name: m[1],
          namespace,
          file: relPath,
          line: this._lineOf(content, m.index),
        });
        this.stats.features++;
      }
    }

    // 函数（只取公开/非匿名的）
    if (p.function_) {
      const re = new RegExp(p.function_.source, p.function_.flags);
      while ((m = re.exec(content)) !== null) {
        const name = m[1];
        if (!name || name.length < 3) continue;
        if (/^(if|for|while|switch|return|delete|new)$/.test(name)) continue;
        features.push({
          type: 'function',
          name,
          signature: m[0].trim().substring(0, 120),
          namespace,
          file: relPath,
          line: this._lineOf(content, m.index),
        });
        this.stats.features++;
      }
    }

    // Topic 订阅/发布
    if (p.topic) {
      const re = new RegExp(p.topic.source, p.topic.flags);
      while ((m = re.exec(content)) !== null) {
        features.push({
          type: 'topic',
          name: m[0].replace(/['"]/g, '').trim(),
          file: relPath,
          line: this._lineOf(content, m.index),
        });
      }
    }

    return features;
  }

  // ─── 聚合为模块 ───────────────────────────────────────────────────────────

  _aggregate(rawFeatures, repoRoot) {
    const modules = {};
    const hints = this.rules.moduleHints || {};

    for (const feat of rawFeatures) {
      const modId = this._detectModule(feat, hints);

      if (!modules[modId]) {
        modules[modId] = {
          id: modId,
          name: this._moduleDisplayName(modId),
          features: [],
          topics: [],
          classes: [],
          functions: [],
          files: new Set(),
          featureCount: 0,
        };
      }

      const mod = modules[modId];
      mod.files.add(feat.file);
      mod.featureCount++;

      if (feat.type === 'topic') {
        mod.topics.push(feat.name);
      } else if (feat.type === 'class') {
        mod.classes.push({ name: feat.name, file: feat.file, line: feat.line });
        mod.features.push(feat);
      } else if (feat.type === 'function') {
        mod.functions.push({ name: feat.name, file: feat.file, line: feat.line });
        mod.features.push(feat);
      }
    }

    // 序列化 Set
    for (const mod of Object.values(modules)) {
      mod.files = [...mod.files];
      mod.topics = [...new Set(mod.topics)];
    }

    return { modules };
  }

  // ─── 模块识别 ─────────────────────────────────────────────────────────────

  _detectModule(feat, hints) {
    const text = [feat.name, feat.file, feat.namespace || '']
      .join(' ')
      .toLowerCase();

    let best = 'other';
    let bestScore = 0;

    for (const [modId, keywords] of Object.entries(hints)) {
      const score = keywords.filter(kw => text.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        best = modId;
      }
    }
    return best;
  }

  _moduleDisplayName(id) {
    const names = {
      perception:   '感知模块',
      planning:     '决策规划模块',
      control:      '车辆控制模块',
      localization: '定位模块',
      prediction:   '轨迹预测模块',
      hdmap:        '高精地图模块',
      canbus:       'CAN总线模块',
      simulation:   '仿真测试模块',
      safety:       '功能安全模块',
      monitor:      '系统监控模块',
      other:        '其他模块',
    };
    return names[id] || id;
  }

  _lineOf(content, index) {
    return content.substring(0, index).split('\n').length;
  }
}

// ─── 导出 ────────────────────────────────────────────────────────────────────

module.exports = { CodeScanner };
