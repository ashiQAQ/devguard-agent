#!/usr/bin/env node
/**
 * 知识库初始化脚本
 * 用法: node init-index.js <repoId> <repoPath> [extensions]
 * 
 * 示例:
 *   node init-index.js apollo /path/to/apollo ".cpp,.h,.py,.md"
 *   node init-index.js arm-recorder /Users/fengxinfeng/.qclaw/workspace/devguard-agent/demo/arm_recorder ".cpp,.h,.md"
 */
require('dotenv').config();
const { AIPipeline } = require('./engine');

async function main() {
  const [, , repoId, repoPath, extensions] = process.argv;

  if (!repoId || !repoPath) {
    console.log('用法: node init-index.js <repoId> <repoPath> [extensions]');
    console.log('示例: node init-index.js apollo /path/to/apollo ".cpp,.h,.py,.md"');
    process.exit(1);
  }

  const exts = extensions
    ? extensions.split(',').map(e => e.startsWith('.') ? e : '.' + e)
    : ['.cpp', '.cc', '.h', '.hpp', '.py', '.js', '.ts', '.md'];

  console.log(`\n🔍 开始为 "${repoId}" 建立向量索引...`);
  console.log(`   路径: ${repoPath}`);
  console.log(`   扩展: ${exts.join(', ')}\n`);

  const pipeline = new AIPipeline();

  const result = await pipeline.indexRepo(repoId, repoPath, {
    extensions: exts,
    excludeDirs: [
      'node_modules', 'build', 'dist', '.git', 'third_party',
      'test', 'tests', '__pycache__', 'venv', 'venv39',
      '.cache', '.bazel', 'bazel-*', 'docs', 'www',
    ],
    onProgress: (info) => {
      if (info.phase === 'scan') {
        process.stdout.write(`\r   扫描: ${info.done}/${info.total} 文件`);
      } else if (info.phase === 'embed') {
        process.stdout.write(`\r   向量化: ${info.done}/${info.total} chunk`);
      }
    },
  });

  console.log(`\n\n✅ 索引完成！`);
  console.log(`   状态: ${result.status}`);
  console.log(`   新增 chunks: ${result.newChunks || 0}`);
  console.log(`   总向量数: ${result.total}`);
  console.log(`   分类统计:`, result.byType || {});
}

main().catch(e => {
  console.error('\n❌ 索引失败:', e.message);
  process.exit(1);
});
