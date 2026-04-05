/**
 * 代码语义分块器
 * 支持：C++（class/namespace/函数）、Python（class/def）、JavaScript（class/function）
 * 自动提取代码语义上下文用于 embedding
 */

const fs = require('fs');
const path = require('path');

// ─── 语言检测 ───────────────────────────────────────────────────────────────
const EXT_MAP = {
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
  '.h': 'cpp', '.hpp': 'cpp', '.hxx': 'cpp',
  '.py': 'python',
  '.js': 'js', '.ts': 'js', '.jsx': 'js', '.tsx': 'js',
  '.vue': 'vue', '.go': 'go', '.java': 'java',
  '.md': 'markdown', '.txt': 'text',
};

// ─── C++ 分块 ──────────────────────────────────────────────────────────────
function chunkCpp(content, filePath) {
  const chunks = [];
  const lines = content.split('\n');
  const imports = [];
  const structs = [];
  const classes = [];
  const functions = [];
  const namespaces = [];

  let currentNamespace = '';

  // 提取 include
  for (const line of lines) {
    const inc = line.match(/^#include\s*["<](.*?)[">]/);
    if (inc) imports.push(inc[1]);
  }

  // 提取 namespace/class/struct/function
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // namespace
    const ns = line.match(/^namespace\s+(\w+)/);
    if (ns) { currentNamespace = ns[1]; namespaces.push(ns[1]); continue; }

    // class / struct
    const cls = line.match(/^(class|struct)\s+(\w+)/);
    if (cls) {
      const name = cls[2];
      const start = i;
      let brace = 0, done = false;
      for (let j = i; j < lines.length && !done; j++) {
        brace += (lines[j].match(/{/g) || []).length;
        brace -= (lines[j].match(/}/g) || []).length;
        if (brace <= 0 && j > i) { done = true; i = j; }
      }
      const body = lines.slice(start, i + 1).join('\n');
      classes.push({ name, body, line: start + 1, ns: currentNamespace });
      continue;
    }

    // function (free function, not inside class)
    const fn = line.match(/^(template\s*<[^>]+>\s*)?([\w:*&<>\s]+?)\s+(\w+)\s*\(/);
    if (fn && !line.startsWith('//') && !line.startsWith('*') && !line.match(/^(class|struct|enum|typedef|using|extern)/)) {
      const retType = (fn[1] || '') + ' ' + (fn[2] || '').trim();
      const name = fn[3];
      if (name && !['if', 'while', 'for', 'switch', 'catch', 'sizeof', 'static_assert'].includes(name)) {
        const start = i;
        let brace = 0, done = false;
        for (let j = i; j < lines.length && !done; j++) {
          brace += (lines[j].match(/{/g) || []).length;
          brace -= (lines[j].match(/}/g) || []).length;
          if (brace <= 0 && j > i) { done = true; i = j; }
        }
        const body = lines.slice(start, i + 1).join('\n');
        functions.push({ name, retType, body, line: start + 1, ns: currentNamespace });
        continue;
      }
    }
  }

  // 转换为 chunks
  const nsPrefix = currentNamespace ? `${currentNamespace}::` : '';
  const fileName = path.basename(filePath);

  if (classes.length > 0) {
    for (const cls of classes) {
      chunks.push({
        type: 'class',
        name: cls.name,
        chunk: cls.body,
        semantic: `C++ class ${nsPrefix}${cls.name} in ${fileName}. namespace: ${cls.ns}. includes: ${imports.join(', ')}`,
        file: filePath,
        line: cls.line,
      });
    }
  }

  for (const fn of functions) {
    chunks.push({
      type: 'function',
      name: fn.name,
      chunk: fn.body,
      semantic: `C++ ${fn.retType} function ${nsPrefix}${fn.name} in ${fileName}. namespace: ${fn.ns}. includes: ${imports.join(', ')}`,
      file: filePath,
      line: fn.line,
    });
  }

  // 文件级 chunk（如果文件太短或没找到任何结构）
  if (chunks.length === 0 && content.trim().length > 50) {
    chunks.push({
      type: 'file',
      name: fileName,
      chunk: content,
      semantic: `C++ file ${fileName}. namespace: ${currentNamespace || 'global'}. includes: ${imports.join(', ')}`,
      file: filePath,
      line: 1,
    });
  }

  return chunks;
}

// ─── Python 分块 ────────────────────────────────────────────────────────────
function chunkPython(content, filePath) {
  const chunks = [];
  const lines = content.split('\n');
  const imports = [];
  const classes = [];
  const functions = [];
  let currentClass = '';

  for (const line of lines) {
    const imp = line.match(/^(import|from)\s+(\S+)/);
    if (imp) imports.push(imp[2] || imp[1]);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const cls = line.match(/^class\s+(\w+)/);
    if (cls) { currentClass = cls[1]; classes.push({ name: cls[1], start: i }); continue; }

    const fn = line.match(/^(\s*)def\s+(\w+)/);
    if (fn) {
      const indent = fn[1].length;
      const name = fn[2];
      const start = i;
      let done = false;
      for (let j = i + 1; j < lines.length && !done; j++) {
        if (lines[j].trim() && lines[j].search(/\S/) <= indent) { done = true; i = j - 1; }
      }
      const body = lines.slice(start, i + 1).join('\n');
      const fullName = currentClass ? `${currentClass}.${name}` : name;
      functions.push({ name: fullName, body, line: start + 1, cls: currentClass });
      continue;
    }
  }

  const fileName = path.basename(filePath);

  for (const cls of classes) {
    const end = functions.find(f => f.line > cls.start)?.line - 1 || lines.length;
    const body = lines.slice(cls.start, end).join('\n');
    chunks.push({
      type: 'class',
      name: cls.name,
      chunk: body,
      semantic: `Python class ${cls.name} in ${fileName}. imports: ${imports.join(', ')}`,
      file: filePath,
      line: cls.start + 1,
    });
  }

  for (const fn of functions) {
    chunks.push({
      type: 'function',
      name: fn.name,
      chunk: fn.body,
      semantic: `Python function ${fn.name} in ${fileName}. class: ${fn.cls || 'module-level'}. imports: ${imports.join(', ')}`,
      file: filePath,
      line: fn.line,
    });
  }

  if (chunks.length === 0 && content.trim().length > 50) {
    chunks.push({
      type: 'file',
      name: fileName,
      chunk: content,
      semantic: `Python module ${fileName}. imports: ${imports.join(', ')}`,
      file: filePath,
      line: 1,
    });
  }

  return chunks;
}

// ─── JS/TS 分块 ─────────────────────────────────────────────────────────────
function chunkJS(content, filePath) {
  const chunks = [];
  const lines = content.split('\n');
  const imports = [];
  const functions = [];

  for (const line of lines) {
    const imp = line.match(/^(const|let|var|import|require)\s.*from\s?['"](.*?)['"]/);
    if (imp) imports.push(imp[2]);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fn = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (fn) {
      const name = fn[1];
      const start = i;
      let brace = 0, done = false;
      for (let j = i; j < lines.length && !done; j++) {
        brace += (lines[j].match(/{/g) || []).length;
        brace -= (lines[j].match(/}/g) || []).length;
        if (brace <= 0 && j > i) { done = true; i = j; }
      }
      const body = lines.slice(start, i + 1).join('\n');
      functions.push({ name, body, line: start + 1 });
      continue;
    }

    // arrow function const/let
    const arrow = line.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/);
    if (arrow && lines.slice(i, i + 5).some(l => l.includes('=>'))) {
      const name = arrow[1];
      const start = i;
      let brace = 0, done = false;
      for (let j = i; j < lines.length && !done; j++) {
        brace += (lines[j].match(/{/g) || []).length;
        brace -= (lines[j].match(/}/g) || []).length;
        if (brace <= 0 && j > i) { done = true; i = j; }
      }
      const body = lines.slice(start, i + 1).join('\n');
      functions.push({ name, body, line: start + 1 });
      continue;
    }
  }

  const fileName = path.basename(filePath);
  for (const fn of functions) {
    chunks.push({
      type: 'function',
      name: fn.name,
      chunk: fn.body,
      semantic: `JavaScript function ${fn.name} in ${fileName}. imports: ${imports.join(', ')}`,
      file: filePath,
      line: fn.line,
    });
  }

  if (chunks.length === 0 && content.trim().length > 50) {
    chunks.push({
      type: 'file',
      name: fileName,
      chunk: content,
      semantic: `JavaScript file ${fileName}. imports: ${imports.join(', ')}`,
      file: filePath,
      line: 1,
    });
  }

  return chunks;
}

// ─── Markdown 分块（需求文档）───────────────────────────────────────────────
function chunkMarkdown(content, filePath) {
  const chunks = [];
  const sections = content.split(/^#{1,3}\s+/m);
  let current = '';

  for (const section of sections) {
    if (!section.trim()) continue;
    const lines = section.split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    if (body.length > 100) {
      chunks.push({
        type: 'section',
        name: title,
        chunk: section,
        semantic: `文档章节: ${title}. 内容: ${body.substring(0, 300)}`,
        file: filePath,
        line: 0,
      });
    }
  }

  if (chunks.length === 0) {
    chunks.push({
      type: 'document',
      name: path.basename(filePath),
      chunk: content,
      semantic: `需求文档 ${path.basename(filePath)}: ${content.substring(0, 400)}`,
      file: filePath,
      line: 1,
    });
  }

  return chunks;
}

// ─── 主入口 ─────────────────────────────────────────────────────────────────
function chunkFile(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  const lang = EXT_MAP[ext] || 'text';

  switch (lang) {
    case 'cpp': return chunkCpp(content, filePath);
    case 'python': return chunkPython(content, filePath);
    case 'js': return chunkJS(content, filePath);
    case 'vue':
      // Vue: split into script / template / style
      return chunkVue(content, filePath);
    case 'markdown': return chunkMarkdown(content, filePath);
    default: return [{
      type: 'file',
      name: path.basename(filePath),
      chunk: content,
      semantic: `文件 ${path.basename(filePath)}: ${content.substring(0, 200)}`,
      file: filePath,
      line: 1,
    }];
  }
}

function chunkVue(content, filePath) {
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  const chunks = [];
  if (scriptMatch) chunks.push(...chunkJS(scriptMatch[1], filePath + ':script'));
  if (templateMatch) chunks.push({
    type: 'template',
    name: path.basename(filePath) + ':template',
    chunk: templateMatch[1],
    semantic: `Vue template ${path.basename(filePath)}`,
    file: filePath,
    line: 0,
  });
  return chunks.length > 0 ? chunks : chunkJS(content, filePath);
}

/** 扫描目录生成 chunks */
async function scanDir(dir, { extensions = [], maxSizeKB = 500, excludeDirs = [], onProgress } = {}) {
  const chunks = [];
  const files = [];

  function walk(d) {
    if (excludeDirs.some(ex => d.includes(ex))) return;
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const fp = path.join(d, e.name);
        if (e.isDirectory()) walk(fp);
        else if (e.isFile()) {
          const ext = path.extname(e.name);
          if (extensions.length === 0 || extensions.includes(ext)) {
            const stat = fs.statSync(fp);
            if (stat.size < maxSizeKB * 1024) files.push(fp);
          }
        }
      }
    } catch {}
  }

  walk(dir);
  for (let i = 0; i < files.length; i++) {
    try {
      const content = fs.readFileSync(files[i], 'utf-8');
      const fileChunks = chunkFile(files[i], content);
      chunks.push(...fileChunks);
    } catch {}
    if (onProgress) onProgress(i + 1, files.length);
  }
  return chunks;
}

module.exports = { chunkFile, chunkCpp, chunkPython, chunkJS, chunkMarkdown, scanDir };
