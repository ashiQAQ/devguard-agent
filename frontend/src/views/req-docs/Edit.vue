<template>
  <div class="doc-editor">
    <!-- 顶部工具栏 -->
    <div class="editor-header">
      <div class="header-left">
        <el-button text @click="$router.push('/req-docs-list')">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <el-divider direction="vertical" />
        <el-dropdown @command="handleVersionChange">
          <span class="version-selector">
            <el-tag size="small" type="info">v{{ doc.version }}</el-tag>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="v in versions" :key="v.id" :command="v.id">
                v{{ v.version }} - {{ v.version_note || '无备注' }}
                <span v-if="v.is_current" style="color: #67c23a;"> (当前)</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <span class="doc-title">{{ doc.title }}</span>
      </div>
      <div class="header-right">
        <el-button @click="showVersionDialog = true">
          <el-icon><Clock /></el-icon>
          版本历史
        </el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">
          <el-icon><DocumentChecked /></el-icon>
          保存
        </el-button>
      </div>
    </div>

    <!-- 编辑区 + 预览区 -->
    <div class="editor-body">
      <!-- 左侧编辑区 -->
      <div class="editor-pane">
        <div class="pane-header">
          <span>编辑</span>
          <el-button-group size="small">
            <el-button :type="editMode === 'edit' ? 'primary' : ''" @click="editMode = 'edit'">富文本</el-button>
            <el-button :type="editMode === 'split' ? 'primary' : ''" @click="editMode = 'split'">分屏</el-button>
            <el-button :type="editMode === 'preview' ? 'primary' : ''" @click="editMode = 'preview'">预览</el-button>
          </el-button-group>
        </div>
        <div class="pane-content" :class="{ 'split-view': editMode === 'split' }">
          <!-- Markdown 编辑器 -->
          <textarea
            v-if="editMode !== 'preview'"
            v-model="doc.content"
            class="markdown-editor"
            placeholder="在此输入需求文档内容（支持 Markdown 格式）..."
            @input="onContentChange"
          ></textarea>
          
          <!-- 预览 -->
          <div
            v-if="editMode !== 'edit'"
            class="markdown-preview"
            v-html="renderedContent"
          ></div>
        </div>
      </div>
    </div>

    <!-- 底部状态栏 -->
    <div class="editor-footer">
      <span>字数: {{ wordCount }}</span>
      <span>字符: {{ charCount }}</span>
      <span>最后更新: {{ doc.updated_at }}</span>
      <span v-if="unsaved" class="unsaved-tip">• 未保存</span>
    </div>

    <!-- 版本历史弹窗 -->
    <el-dialog v-model="showVersionDialog" title="📜 版本历史" width="700px">
      <el-timeline>
        <el-timeline-item
          v-for="v in versions"
          :key="v.id"
          :timestamp="v.created_at"
          :type="v.is_current ? 'primary' : 'info'"
          placement="top"
        >
          <el-card shadow="hover">
            <div class="version-item">
              <div class="version-header">
                <el-tag size="small" :type="v.is_current ? 'success' : 'info'">v{{ v.version }}</el-tag>
                <span class="version-note">{{ v.version_note || '无备注' }}</span>
                <el-button v-if="!v.is_current" link type="primary" size="small" @click="restoreVersion(v)">
                  恢复此版本
                </el-button>
                <el-button v-if="v.id !== currentDocId" link type="primary" size="small" @click="compareVersion(v)">
                  对比当前
                </el-button>
              </div>
              <div class="version-meta">
                作者: {{ v.author || '未知' }}
              </div>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
      <template #footer>
        <el-button @click="showVersionDialog = false">关闭</el-button>
        <el-button type="primary" @click="createNewVersion">
          <el-icon><Plus /></el-icon>
          创建新版本
        </el-button>
      </template>
    </el-dialog>

    <!-- 版本对比弹窗 -->
    <el-dialog v-model="showDiffDialog" title="📊 版本对比" width="900px">
      <div class="diff-container">
        <div class="diff-header">
          <el-tag>v{{ compareVersionInfo.old?.version }}</el-tag>
          <span> vs </span>
          <el-tag type="success">v{{ compareVersionInfo.new?.version }}</el-tag>
        </div>
        <div class="diff-stats">
          <span class="diff-add">+{{ compareStats.additions }} 行</span>
          <span class="diff-del">-{{ compareStats.deletions }} 行</span>
        </div>
        <div class="diff-content">
          <pre v-html="diffHtml"></pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowDown, Clock, DocumentChecked, Plus } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()

// 状态
const docId = computed(() => route.params.id as string)
const doc = ref<any>({})
const versions = ref<any[]>([])
const currentDocId = ref('')
const editMode = ref<'edit' | 'split' | 'preview'>('split')
const saving = ref(false)
const unsaved = ref(false)
const showVersionDialog = ref(false)
const showDiffDialog = ref(false)
const compareVersionInfo = ref<any>({})
const diffHtml = ref('')

// Markdown 解析（简单实现）
const renderedContent = computed(() => {
  let content = doc.value.content || ''
  // 标题
  content = content.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  content = content.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  content = content.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  // 粗体
  content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // 表格
  content = content.replace(/^\|(.+)\|$/gm, (match: string) => {
    const cells = match.slice(1, -1).split('|')
    if (cells.every((c: string) => c.trim().match(/^-+$/))) {
      return '' // 分隔行
    }
    const row = cells.map((c: string) => `<td>${c.trim()}</td>`).join('')
    return `<tr>${row}</tr>`
  })
  // 表格包装
  content = content.replace(/(<tr>.*?<\/tr>)+/gs, '<table class="md-table">$&</table>')
  // 列表
  content = content.replace(/^- (.+)$/gm, '<li>$1</li>')
  content = content.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>')
  // 换行
  content = content.replace(/\n/g, '<br>')
  return content
})

const wordCount = computed(() => {
  const content = doc.value.content || ''
  return content.trim() ? content.trim().split(/\s+/).length : 0
})

const charCount = computed(() => (doc.value.content || '').length)

const compareStats = computed(() => {
  const oldText = compareVersionInfo.value.old?.content || ''
  const newText = compareVersionInfo.value.new?.content || ''
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  
  let additions = 0, deletions = 0
  const oldSet = new Set(oldLines)
  const newSet = new Set(newLines)
  
  newLines.forEach((l: string) => {
    if (!oldSet.has(l)) additions++
  })
  oldLines.forEach((l: string) => {
    if (!newSet.has(l)) deletions++
  })
  
  return { additions, deletions }
})

// 加载文档
async function loadDoc() {
  try {
    const res = await fetch(`/api/req-docs/docs/${docId.value}`)
    const data = await res.json()
    if (data.doc) {
      doc.value = data.doc
      currentDocId.value = doc.value.id
    }
  } catch (e) {
    console.error('加载失败', e)
  }
}

// 加载版本历史
async function loadVersions() {
  // 模拟版本数据（实际应从 API 获取）
  versions.value = [
    {
      id: doc.value.id,
      version: doc.value.version,
      version_note: doc.value.version_note,
      author: doc.value.author,
      created_at: doc.value.updated_at,
      is_current: true,
      content: doc.value.content,
    }
  ]
}

// 内容变化检测
function onContentChange() {
  unsaved.value = true
}

// 保存文档
async function handleSave() {
  saving.value = true
  try {
    const res = await fetch(`/api/req-docs/${docId.value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: doc.value.title,
        content: doc.value.content,
        description: doc.value.description,
      }),
    })
    const data = await res.json()
    if (data.status === 'success') {
      unsaved.value = false
      ElMessage.success('保存成功')
      loadDoc()
    }
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

// 版本切换
function handleVersionChange(id: string) {
  const v = versions.value.find((ver: any) => ver.id === id)
  if (v) {
    doc.value.content = v.content
    unsaved.value = true
  }
}

// 创建新版本
function createNewVersion() {
  // 简单处理：更新版本号
  const parts = doc.value.version.split('.')
  parts[1] = String(parseInt(parts[1]) + 1)
  doc.value.version = parts.join('.')
  doc.value.version_note = '更新版本'
  unsaved.value = true
  showVersionDialog.value = false
  ElMessage.success('已创建新版本 v' + doc.value.version)
}

// 恢复版本
function restoreVersion(v: any) {
  doc.value.content = v.content
  unsaved.value = true
  showVersionDialog.value = false
  ElMessage.success('已恢复至 v' + v.version)
}

// 对比版本
function compareVersion(v: any) {
  compareVersionInfo.value = {
    old: v,
    new: doc.value,
  }
  showDiffDialog.value = true
}

onMounted(() => {
  loadDoc()
  loadVersions()
})
</script>

<style scoped>
.doc-editor {
  height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
  background: #fff;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #e8e8e8;
  background: #fafafa;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.version-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.doc-title {
  font-weight: 500;
  font-size: 16px;
}

.header-right {
  display: flex;
  gap: 10px;
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid #e8e8e8;
  font-weight: 500;
  color: #666;
}

.pane-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.pane-content.split-view > * {
  width: 50%;
  flex: 1;
}

.pane-content.split-view .markdown-editor {
  border-right: 1px solid #e8e8e8;
}

.markdown-editor {
  flex: 1;
  padding: 16px;
  border: none;
  resize: none;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 14px;
  line-height: 1.6;
  outline: none;
}

.markdown-preview {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  line-height: 1.8;
}

.markdown-preview :deep(h1) {
  font-size: 24px;
  font-weight: 600;
  margin: 20px 0 12px;
  color: #1a1a1a;
  border-bottom: 1px solid #eee;
  padding-bottom: 8px;
}

.markdown-preview :deep(h2) {
  font-size: 20px;
  font-weight: 600;
  margin: 18px 0 10px;
  color: #2a2a2a;
}

.markdown-preview :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 14px 0 8px;
  color: #3a3a3a;
}

.markdown-preview :deep(strong) {
  color: #e6a23c;
}

.markdown-preview :deep(.md-table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.markdown-preview :deep(.md-table td) {
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  font-size: 13px;
}

.markdown-preview :deep(ul) {
  margin: 8px 0;
  padding-left: 20px;
}

.markdown-preview :deep(li) {
  margin: 4px 0;
}

.editor-footer {
  display: flex;
  gap: 20px;
  padding: 8px 20px;
  border-top: 1px solid #e8e8e8;
  background: #f5f5f5;
  font-size: 12px;
  color: #999;
}

.unsaved-tip {
  color: #e6a23c;
}

.version-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.version-note {
  color: #666;
  flex: 1;
}

.version-meta {
  font-size: 12px;
  color: #999;
}

.diff-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.diff-stats {
  display: flex;
  gap: 16px;
  font-size: 14px;
}

.diff-add { color: #67c23a; }
.diff-del { color: #f56c6c; }

.diff-content {
  max-height: 400px;
  overflow: auto;
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
}

.diff-content pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 12px;
}
</style>
