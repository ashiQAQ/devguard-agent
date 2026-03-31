/**
 * req-parser.js — 多格式需求文档解析器
 * 核心策略：标题即功能名，标题下方内容为描述
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── 跳过规则 ──────────────────────────────────────────────────────────────

function _isSkipHeading(title) {
  const lower = title.toLowerCase();

  // 功能关键词 — 永远不过滤
  if (['功能','需求','feature','requirement','spec','prd',
       '接口','interface','api','模块','component','service',
       '分割','merge','segment','对齐','align','合并',
       '规划','planning','感知','perception','控制','control',
       '定位','localization','预测','prediction','录制','落盘',
       '测试','test','用例','scenario'].some(k => lower.includes(k))) {
    return false;
  }

  // 元信息 — 永远跳过
  if (['背景','前言','摘要','目录','概述','版本','历史',
       '版权','声明','附录','文档','doc','changelog',
       'abstract','summary','table of contents','用户故事',
       '核心功能','性能要求','数据结构','接口设计'].some(k => lower === k || lower.startsWith(k))) {
    return true;
  }

  // 纯章节编号的非功能标题 — 跳过
  if (/^\d[\d.]*\s+[a-zA-Z\u4e00-\u9fa5]/.test(title)) {
    const sectionOnly = ['背景','前言','摘要','目录','概述','版本','历史',
                          '版权','声明','附录','摘要','用户故事','核心功能',
                          '性能要求','接口设计','数据结构','测试验收'];
    if (sectionOnly.some(k => lower.includes(k))) return true;
  }

  // 纯性能数据行
  if (/^[<>=]?\s*\d+[\s]*(ms|s|mb|gb|kb|%)/i.test(title)) return true;
  if (title.length < 4) return true;

  return false;
}

function _isSkipListItem(item) {
  if (!item || item.length < 5) return true;
  // 性能数据
  if (/^[<>=]?\s*\d+[\s]*(ms|s|mb|gb|kb|%)/i.test(item)) return true;
  // 章节编号
  if (/^\d[\d.]+\s+\S/.test(item)) return true;
  // 用户故事格式
  if (/^(我|用户|司机)/.test(item)) return true;
  const lower = item.toLowerCase();
  if (['user story','as a ','i want','so that','---','==='].some(s => lower.startsWith(s))) return true;
  return false;
}

function _extractName(text) {
  const clean = text.replace(/[#*`\[\]>|]/g, '').trim();
  // 去掉章节编号前缀："3.1 自动文件分割" → "自动文件分割"
  const noNum = clean.replace(/^[\d.]+\s*/, '').trim();
  return (noNum.length >= 2 ? noNum : clean).substring(0, 60);
}

function _extractKeywords(text) {
  const chinese = (text.match(/[\u4e00-\u9fa5]{2,4}/g) || []);
  const english = (text.match(/[a-zA-Z]{3,20}/g) || []);
  const stop = new Set([
    '这个','这些','那些','能够','可以','应该','必须','需要','如果','那么',
    '因为','所以','但是','并且','以及','关于','对于','通过','使用','进行',
    '实现','提供','支持','包含','具有',
    'this','that','with','from','have','will','also','into',
    'should','could','would','must','need','make','able',
  ]);
  return [...new Set([...chinese, ...english])].filter(w => !stop.has(w) && w.length >= 2).slice(0, 20);
}

function _detectPriority(text) {
  if (/p0|阻断|关键|必须|must|shall|紧急|critical/i.test(text)) return 'P0';
  if (/p2|可选|可以|could|low/i.test(text)) return 'P2';
  return 'P1';
}

function _normalizePriority(p) {
  if (!p) return 'P1';
  const s = String(p).toUpperCase();
  if (s.startsWith('P0')) return 'P0';
  if (s.startsWith('P2')) return 'P2';
  return 'P1';
}

function _detectFeatureType(text) {
  if (/删|remove|delete|deprecated/i.test(text)) return '删除';
  if (/修|改|更新|refactor|upgrade/i.test(text)) return '修改';
  if (/优|增强|improvement|optimiz/i.test(text)) return '优化';
  return '新增';
}

function _generateId() {
  return 'FEAT-' + Date.now().toString(36).slice(-4) + '-' +
         Math.random().toString(36).substring(2, 5).toUpperCase();
}

function _parseTable(rows) {
  if (rows.length < 2) return [];
  const features = [];
  const header = rows[0].split('|').map(c => c.trim().toLowerCase());
  const isUserStory = header.some(h => h.includes('角色') || h.includes('user') || h.includes('身份'));

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].match(/^[\|:\-\s]+$/)) continue;
    const cols = rows[i].split('|').filter(c => c.trim());
    if (cols.length < 2) continue;

    const funcCol = isUserStory
      ? cols[cols.length - 1]?.trim()
      : cols[1]?.trim() || cols[0]?.trim();

    if (!funcCol || funcCol.length < 5) continue;
    if (/^(我|用户|作为)/.test(funcCol)) continue;

    features.push({
      id: `FEAT-${String(features.length + 1).padStart(3, '0')}`,
      name: _extractName(funcCol),
      description: funcCol,
      priority: _detectPriority(funcCol),
      keywords: _extractKeywords(funcCol),
      acceptance: null, dependencies: null,
      type: _detectFeatureType(funcCol),
      module: null, raw: rows[i],
    });
  }
  return features;
}

function _extractByKeywords(content, filename) {
  const paragraphs = content.split(/\n{2,}/);
  const triggers = ['实现','支持','提供','新增','增加','修改','优化','功能','能力','系统','模块'];
  return paragraphs
    .filter(p => triggers.some(k => p.includes(k)) && p.length > 20 && p.length < 1000)
    .slice(0, 10)
    .map((p, i) => ({
      id: `FEAT-${String(i+1).padStart(3,'0')}`,
      name: _extractName(p),
      description: p.trim(),
      priority: _detectPriority(p),
      keywords: _extractKeywords(p),
      acceptance: null, dependencies: null,
      type: _detectFeatureType(p),
      module: null, raw: p.trim().substring(0, 300),
    }));
}

function _normalizeFeature(f) {
  f.keywords = [...new Set(f.keywords)].filter(k => k.length >= 2);
  return f;
}

// ─── Markdown 解析器 ─────────────────────────────────────────────────────────

function parseMarkdown(content) {
  const lines = content.split('\n');
  const features = [];
  let current = null;
  let inTable = false;
  let tableBuf = [];
  let codeDepth = 0;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) { codeDepth ^= 1; continue; }
    if (codeDepth) continue;

    // 标题
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      if (current && current.name) features.push(_normalizeFeature(current));
      const level = hMatch[1].length;
      const title = hMatch[2].trim();

      // ## 是章节标题，不是功能 → 跳过
      // ### 和以下才是功能
      if (level === 2) { current = null; inTable = false; continue; }

      // level >= 3: 检查是否跳过
      if (level >= 3 && !_isSkipHeading(title)) {
        current = {
          id: _generateId(), name: _extractName(title),
          description: title,
          priority: _detectPriority(title),
          keywords: _extractKeywords(title),
          acceptance: null, dependencies: null,
          type: _detectFeatureType(title),
          module: null, raw: title,
        };
      } else { current = null; }
      inTable = false;
      continue;
    }

    // 表格
    if (trimmed.startsWith('|')) {
      if (!inTable) { inTable = true; tableBuf = []; }
      tableBuf.push(trimmed);
      continue;
    } else if (inTable) {
      features.push(..._parseTable(tableBuf));
      tableBuf = []; inTable = false;
    }

    if (!current) continue;

    // 列表项
    const listMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (listMatch) {
      const item = listMatch[1];
      if (!_isSkipListItem(item)) {
        current.description += '\n' + item;
        current.keywords.push(..._extractKeywords(item));
        const p = _detectPriority(item);
        if (p !== 'P1') current.priority = p;
      }
      continue;
    }

    // 段落
    if (trimmed.length > 8 && !trimmed.startsWith('>')) {
      current.description += ' ' + trimmed;
      current.keywords.push(..._extractKeywords(trimmed));
    }

    // TC / 验收标准
    const tcMatch = trimmed.match(/(?:验收标准|acceptance criteria|测试用例|TC-\d+)[：:.\s]+(.+)/i);
    if (tcMatch) {
      if (!current.acceptance) current.acceptance = [];
      current.acceptance.push(tcMatch[1].trim());
    }
  }

  if (current && current.name) features.push(_normalizeFeature(current));
  if (features.length === 0) features.push(..._extractByKeywords(content, ''));
  return features;
}

// ─── JSON / YAML / TXT ─────────────────────────────────────────────────────

function parseJSON(content) {
  try {
    const data = JSON.parse(content);
    let arr = Array.isArray(data) ? data
      : data.requirements || data.features || data.items || data.specs || null;
    if (arr) {
      return arr.map((item, i) => ({
        id: item.id || `FEAT-${String(i+1).padStart(3,'0')}`,
        name: _extractName(item.name || item.title || item.description || `Feature ${i+1}`),
        description: item.description || item.desc || item.content || JSON.stringify(item),
        priority: _normalizePriority(item.priority || item.severity),
        keywords: _extractKeywords(JSON.stringify(item)),
        acceptance: item.acceptance || item.acceptanceCriteria || null,
        dependencies: item.dependsOn || item.dependencies || null,
        type: item.type || _detectFeatureType(item.name || ''),
        module: item.module || null,
        raw: typeof item === 'object' ? JSON.stringify(item).substring(0,300) : String(item),
      }));
    }
    return [{ id:'FEAT-001', name:'ROOT', description: JSON.stringify(data).substring(0,500),
              priority:'P1', keywords:_extractKeywords(JSON.stringify(data)),
              acceptance:null, dependencies:null, type:'新增', module:null, raw:content.substring(0,200) }];
  } catch { return []; }
}

function parseYAML(content) {
  const sections = content.split(/\n(?=\S)/);
  return sections.filter(s => s.trim().length > 10 && !s.trim().startsWith('#'))
    .map((s, i) => {
      const lines = s.split('\n');
      return { id:`FEAT-${String(i+1).padStart(3,'0')}`, name:_extractName(lines[0]),
               description:lines.join('\n').trim(), priority:_detectPriority(lines.join(' ')),
               keywords:_extractKeywords(lines.join(' ')),
               acceptance:null, dependencies:null, type:_detectFeatureType(lines[0]),
               module:null, raw:s.trim().substring(0,300) };
    });
}

function parsePlainText(content) {
  return content.replace(/\n{3,}/g,'\n').split(/[。！？\n]+/)
    .map(s => s.trim()).filter(s => s.length > 15)
    .map((s, i) => ({ id:`FEAT-${String(i+1).padStart(3,'0')}`, name:_extractName(s),
             description:s, priority:_detectPriority(s), keywords:_extractKeywords(s),
             acceptance:null, dependencies:null, type:_detectFeatureType(s),
             module:null, raw:s }));
}

// ─── 格式路由 ─────────────────────────────────────────────────────────────

const PARSERS = { '.md':parseMarkdown, '.json':parseJSON, '.yaml':parseYAML, '.yml':parseYAML, '.txt':parsePlainText };

// ─── ReqParser 类 ──────────────────────────────────────────────────────────

class ReqParser {
  constructor() { this.stats = { parsed:0, failed:0, features:0 }; }

  async parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const parser = PARSERS[ext];
    if (!parser) throw new Error(`Unsupported: ${ext}`);
    const features = parser(fs.readFileSync(filePath,'utf-8'));
    this.stats.parsed++; this.stats.features += features.length;
    return features.filter(f => f.name && f.name.length > 2);
  }

  async parseFiles(filePaths) {
    const results = [];
    for (const fp of filePaths) {
      try { results.push({ file:fp, features:await this.parseFile(fp) }); }
      catch (e) { this.stats.failed++; results.push({ file:fp, error:e.message, features:[] }); }
    }
    return results;
  }

  parseContent(content, formatHint = 'md') {
    const ext = '.' + formatHint.replace(/^\./,'');
    const parser = PARSERS[ext] || PARSERS['.txt'];
    const features = parser(content);
    this.stats.features += features.length;
    return features.filter(f => f.name && f.name.length > 2);
  }

  async parseDir(dirPath, extensions = ['.md','.txt','.json','.yaml']) {
    const files = [];
    const walk = d => {
      if (!fs.existsSync(d)) return;
      for (const entry of fs.readdirSync(d, { withFileTypes:true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (extensions.includes(path.extname(entry.name).toLowerCase())) files.push(full);
      }
    };
    walk(dirPath);
    return this.parseFiles(files);
  }
}

module.exports = { ReqParser };
