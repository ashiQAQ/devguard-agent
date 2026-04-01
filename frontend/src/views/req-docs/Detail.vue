<template>
  <div class="doc-detail">
    <!-- 顶部工具栏 -->
    <div class="top-bar">
      <el-button @click="$router.push('/req-docs')" size="small">← 返回列表</el-button>
      <div class="doc-title">{{ title }}</div>
      <div class="top-actions">
        <select v-model="selectedDocId" @change="changeDoc" class="doc-select">
          <option v-for="d in docs" :key="d.doc_id" :value="d.doc_id">{{ d.title }}</option>
        </select>
        <el-button size="small" @click="loadArchived">最新归档</el-button>
        <el-button size="small" :type="isEditing ? 'warning' : 'default'" @click="toggleMode">
          {{ isEditing ? '📖 预览' : '✏️ 编辑' }}
        </el-button>
        <el-button size="small" type="primary" @click="showAnalyzeDialog = true">🔍 AI 分析</el-button>
      </div>
    </div>

    <!-- 预览模式 -->
    <div class="editor-area" v-if="!error">
      <!-- 渲染预览 -->
      <div v-if="!isEditing" class="content-preview" v-html="renderedHtml" />
      <!-- 编辑模式 -->
      <div
        v-else
        ref="editorRef"
        class="content-editor"
        contenteditable="true"
        @input="onEditorInput"
        @paste="onPaste"
        @keydown="onKeydown"
      />
    </div>
    <div class="error-area" v-else>
      <el-result icon="error" :title="error">
        <template #extra>
          <el-button @click="loadDoc(selectedDocId)">重试</el-button>
        </template>
      </el-result>
    </div>

    <!-- 底部状态栏 -->
    <div class="bottom-bar">
      <div class="status-left">
        <el-tag v-if="docStatus" :type="getStatusType(docStatus)" size="small">{{ getStatusText(docStatus) }}</el-tag>
        <span v-if="isDirty" class="dirty-indicator">● 未保存</span>
        <span v-if="lastSaved" class="saved-info">已保存 {{ lastSaved }}</span>
        <span v-if="newContentCount > 0" class="new-count" @click="openNewTab">🆕 {{ newContentCount }} 条新增</span>
      </div>
      <div class="status-right">
        <el-button size="small" @click="addRequirement">➕ 新增需求</el-button>
        <el-button size="small" type="primary" @click="saveDoc" :loading="saving" :disabled="!isDirty">💾 保存</el-button>
      </div>
    </div>

    <!-- AI 分析对话框 -->
    <el-dialog v-model="showAnalyzeDialog" title="📋 需求分析" width="860px" top="5vh">
      <div class="analyze-panel">
        <div class="analyze-toolbar">
          <el-button type="primary" @click="runAnalysis" :loading="analyzing" size="small">🤖 AI 分析文档</el-button>
          <el-button @click="extractRequirements" :loading="extracting" size="small">📌 提取需求条目</el-button>
          <el-tag v-if="analysisResult" type="success" size="small">分析完成</el-tag>
        </div>

        <el-tabs v-model="activeAnalysisTab">
          <el-tab-pane label="📋 文档摘要" name="summary">
            <div v-if="analysisResult" class="summary-content">
              <div class="summary-block">
                <div class="summary-label">📌 概述</div>
                <p>{{ analysisResult.summary }}</p>
              </div>
              <div v-if="analysisResult.key_entities?.length" class="summary-block">
                <div class="summary-label">🔑 关键实体</div>
                <div class="tag-list">
                  <el-tag v-for="e in analysisResult.key_entities" :key="e" size="small" class="mr4">{{ e }}</el-tag>
                </div>
              </div>
              <div v-if="analysisResult.potential_risks?.length" class="summary-block">
                <div class="summary-label">⚠️ 潜在风险</div>
                <ul class="analysis-list">
                  <li v-for="(r, i) in analysisResult.potential_risks" :key="i">{{ r }}</li>
                </ul>
              </div>
              <div v-if="analysisResult.suggestions?.length" class="summary-block">
                <div class="summary-label">💡 改进建议</div>
                <ul class="analysis-list">
                  <li v-for="(s, i) in analysisResult.suggestions" :key="i">{{ s }}</li>
                </ul>
              </div>
            </div>
            <el-empty v-else description="点击「AI 分析文档」开始" />
          </el-tab-pane>

          <el-tab-pane :label="`📝 需求条目 (${extractedReqs.length})`" name="requirements">
            <div v-if="extractedReqs.length" class="req-list">
              <div v-for="(req, idx) in extractedReqs" :key="idx" class="req-item">
                <div class="req-item-header">
                  <span class="req-item-id">{{ req.title || `REQ-${idx+1}` }}</span>
                  <el-tag size="small" :type="getPriorityType(req.priority)">{{ req.priority || 'P1' }}</el-tag>
                  <el-tag v-if="req.asil_implication" size="small" type="warning">{{ req.asil_implication }}</el-tag>
                </div>
                <div class="req-item-desc">{{ req.description }}</div>
                <div v-if="req.keywords?.length" class="req-item-tags">
                  <el-tag v-for="k in req.keywords" :key="k" size="small" type="info" class="mr4">{{ k }}</el-tag>
                </div>
              </div>
            </div>
            <el-empty v-else description="点击「提取需求条目」开始分析" />
          </el-tab-pane>

          <el-tab-pane :label="`🆕 新增内容 (${newContentItems.length})`" name="new">
            <div v-if="newContentItems.length" class="new-list">
              <div class="new-hint">以下内容为本次编辑新增，保存后在文档中高亮显示</div>
              <div v-for="(item, idx) in newContentItems" :key="idx" class="new-item">
                <el-tag type="success" size="small">新增</el-tag>
                <span class="new-text">{{ item.text }}</span>
              </div>
            </div>
            <el-empty v-else description="编辑并保存后，新增内容将显示在这里" />
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-dialog>

    <!-- 新增需求对话框 -->
    <el-dialog v-model="showAddReqDialog" title="➕ 新增需求条目" width="580px">
      <el-form :model="newReq" label-width="90px" size="small">
        <el-form-item label="需求 ID"><el-input v-model="newReq.req_id" placeholder="如: BR-2025-001" /></el-form-item>
        <el-form-item label="标题"><el-input v-model="newReq.title" placeholder="需求标题" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="newReq.type" style="width:100%">
            <el-option label="业务需求 (BR)" value="BR" />
            <el-option label="技术需求 (TR)" value="TR" />
            <el-option label="性能需求 (PR)" value="PR" />
            <el-option label="接口需求 (IR)" value="IR" />
            <el-option label="安全需求 (SR)" value="SR" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="newReq.priority" style="width:100%">
            <el-option label="P0 - 紧急" value="P0" />
            <el-option label="P1 - 高" value="P1" />
            <el-option label="P2 - 中" value="P2" />
          </el-select>
        </el-form-item>
        <el-form-item label="ASIL 等级">
          <el-select v-model="newReq.asil" placeholder="可选" style="width:100%">
            <el-option label="QM" value="QM" />
            <el-option label="ASIL-A" value="A" />
            <el-option label="ASIL-B" value="B" />
            <el-option label="ASIL-C" value="C" />
            <el-option label="ASIL-D" value="D" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newReq.description" type="textarea" :rows="4" placeholder="详细描述..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddReqDialog = false">取消</el-button>
        <el-button type="primary" @click="insertRequirement">插入到文档</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()

const title = ref('加载中...')
const docStatus = ref('')
const docs = ref<any[]>([])
const selectedDocId = ref('')
const saving = ref(false)
const isDirty = ref(false)
const lastSaved = ref('')
const error = ref('')
const isEditing = ref(false)
const editorRef = ref<HTMLElement | null>(null)
const rawContent = ref('')
const originalContent = ref('')

// 新增内容高亮
const newLinesSet = ref<Set<string>>(new Set())

// AI 分析
const showAnalyzeDialog = ref(false)
const activeAnalysisTab = ref('summary')
const analyzing = ref(false)
const extracting = ref(false)
const analysisResult = ref<any>(null)
const extractedReqs = ref<any[]>([])
const newContentItems = ref<any[]>([])
const newContentCount = ref(0)

// 新增需求
const showAddReqDialog = ref(false)
const newReq = ref({ req_id: '', title: '', type: 'BR', priority: 'P1', asil: '', description: '' })

// Markdown 渲染（带高亮）
const renderedHtml = computed(() => renderMarkdown(rawContent.value, newLinesSet.value))

function renderMarkdown(text: string, highlightLines: Set<string>): string {
  if (!text) return '<p style="color:#909399">暂无内容</p>'
  
  // 按行处理
  const lines = text.split('\n')
  const htmlLines = lines.map(line => {
    const trimmed = line.trim()
    let html = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    
    // 标题
    html = html.replace(/^# (.+)$/, '<h1>$1</h1>')
    html = html.replace(/^## (.+)$/, '<h2>$1</h2>')
    html = html.replace(/^### (.+)$/, '<h3>$1</h3>')
    html = html.replace(/^#### (.+)$/, '<h4>$1</h4>')
    
    // 粗体/斜体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
    
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
    
    // 检查是否是新增行
    const isNew = highlightLines.has(trimmed) && trimmed.length > 0
    
    if (isNew) {
      return `<div class="highlight-line"><span class="new-badge">NEW</span>${html}</div>`
    }
    return `<div>${html}</div>`
  })
  
  return htmlLines.join('')
}

onMounted(async () => {
  try {
    const r = await fetch('/api/req-docs/docs?page_size=100')
    const data = await r.json()
    docs.value = data.docs || []
  } catch (e) { console.error('加载列表失败', e) }

  const id = route.params.id as string
  if (id) {
    selectedDocId.value = id
    await loadDoc(id)
  } else {
    const arch = docs.value.find((d: any) => d.status === 'archived')
    const target = arch || docs.value[0]
    if (target) router.replace(`/req-docs/${target.doc_id}`)
  }
})

async function loadDoc(id: string) {
  error.value = ''
  try {
    const r = await fetch(`/api/req-docs/docs/${id}`)
    const data = await r.json()
    if (!data?.doc) { error.value = '文档不存在'; title.value = '文档不存在'; return }

    title.value = data.doc.title || id
    docStatus.value = data.doc.status || ''
    selectedDocId.value = id
    
    const currentContent = data.doc.content || ''
    rawContent.value = currentContent
    
    // 从 localStorage 读取上次保存的版本作为对比基准
    const cacheKey = `doc-baseline-${id}`
    const cachedBaseline = localStorage.getItem(cacheKey)
    
    if (cachedBaseline) {
      // 有缓存，对比显示高亮
      originalContent.value = cachedBaseline
      detectNewContent(currentContent)
    } else {
      // 首次加载，无高亮
      originalContent.value = currentContent
      newContentItems.value = []
      newContentCount.value = 0
      newLinesSet.value = new Set()
    }
    
    isDirty.value = false
    isEditing.value = false
  } catch (e: any) {
    error.value = '加载失败: ' + (e.message || '')
    title.value = '加载失败'
  }
}

async function toggleMode() {
  if (isEditing.value) {
    rawContent.value = editorRef.value?.innerText || rawContent.value
    isEditing.value = false
  } else {
    isEditing.value = true
    await nextTick()
    if (editorRef.value) {
      editorRef.value.innerText = rawContent.value
      editorRef.value.focus()
    }
  }
}

function onEditorInput() {
  isDirty.value = true
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveDoc()
  }
}

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || '')
}

function changeDoc() {
  router.push(`/req-docs/${selectedDocId.value}`)
}

function loadArchived() {
  const arch = docs.value.find((d: any) => d.status === 'archived')
  const target = arch || docs.value[0]
  if (target) router.push(`/req-docs/${target.doc_id}`)
}

async function saveDoc() {
  if (!selectedDocId.value) return
  saving.value = true
  try {
    const content = isEditing.value
      ? (editorRef.value?.innerText || rawContent.value)
      : rawContent.value

    // 检测新增内容并更新高亮集合
    detectNewContent(content)

    await fetch(`/api/req-docs/docs/${selectedDocId.value}/save-markdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })

    // 更新当前内容
    rawContent.value = content
    isDirty.value = false
    lastSaved.value = new Date().toLocaleTimeString()
    
    // 如果有新增内容，保存后立即切换到预览模式显示高亮
    if (newContentCount.value > 0 && isEditing.value) {
      isEditing.value = false
      // 更新 localStorage 基准版本
      const cacheKey = `doc-baseline-${selectedDocId.value}`
      localStorage.setItem(cacheKey, originalContent.value)
      originalContent.value = content
    }
    
    ElMessage.success(`保存成功${newContentCount.value > 0 ? `，${newContentCount.value} 行新增已高亮` : ''}`)
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

function detectNewContent(newText: string) {
  const oldLines = new Set(originalContent.value.split('\n').map(s => s.trim()).filter(Boolean))
  const newLines = newText.split('\n').filter(line => {
    const trimmed = line.trim()
    return trimmed && !oldLines.has(trimmed)
  })
  
  newContentItems.value = newLines.slice(0, 50).map(text => ({ text }))
  newContentCount.value = newContentItems.value.length
  
  // 更新高亮集合
  newLinesSet.value = new Set(newLines.map(l => l.trim()))
}

function openNewTab() {
  showAnalyzeDialog.value = true
  activeAnalysisTab.value = 'new'
}

async function runAnalysis() {
  if (!selectedDocId.value) return
  analyzing.value = true
  try {
    const res = await fetch(`/api/req-docs/docs/${selectedDocId.value}/ai-summary`, { method: 'POST' })
    const data = await res.json()
    analysisResult.value = data
    activeAnalysisTab.value = 'summary'
    ElMessage.success('分析完成')
  } catch (e) { ElMessage.error('分析失败') }
  finally { analyzing.value = false }
}

async function extractRequirements() {
  if (!selectedDocId.value) return
  extracting.value = true
  try {
    const res = await fetch(`/api/req-docs/docs/${selectedDocId.value}/extract`, { method: 'POST' })
    const data = await res.json()
    extractedReqs.value = data.requirements || []
    activeAnalysisTab.value = 'requirements'
    ElMessage.success(`提取了 ${extractedReqs.value.length} 条需求`)
  } catch (e) { ElMessage.error('提取失败') }
  finally { extracting.value = false }
}

function addRequirement() {
  newReq.value.req_id = `BR-${new Date().getFullYear()}-${String(extractedReqs.value.length + 1).padStart(3, '0')}`
  showAddReqDialog.value = true
}

function insertRequirement() {
  if (!newReq.value.title) { ElMessage.warning('请输入标题'); return }
  const asilLine = newReq.value.asil ? `\n**ASIL**: ${newReq.value.asil}` : ''
  const reqText = `\n\n## ${newReq.value.req_id}: ${newReq.value.title}\n\n**类型**: ${newReq.value.type} | **优先级**: ${newReq.value.priority}${asilLine}\n\n${newReq.value.description}\n`
  rawContent.value += reqText
  isDirty.value = true
  showAddReqDialog.value = false
  ElMessage.success('已添加到文档，切换到编辑模式可查看')
}

function getStatusType(s: string) {
  return { draft: 'info', review: 'warning', approved: 'success', archived: '' }[s] || 'info'
}
function getStatusText(s: string) {
  return { draft: '草稿', review: '审核中', approved: '已批准', archived: '已归档' }[s] || s
}
function getPriorityType(p: string) {
  return { P0: 'danger', P1: 'warning', P2: 'info' }[p] || 'info'
}
</script>

<style scoped>
.doc-detail { height: calc(100vh - 60px); display: flex; flex-direction: column; margin: -20px; background: #f5f7fa; }
.top-bar { display: flex; align-items: center; gap: 12px; padding: 8px 20px; background: #fff; border-bottom: 1px solid #e4e7ed; flex-shrink: 0; }
.doc-title { flex: 1; font-weight: bold; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.top-actions { display: flex; gap: 8px; align-items: center; }
.doc-select { padding: 4px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; max-width: 220px; }
.editor-area { flex: 1; overflow-y: auto; padding: 30px 60px; background: #fff; }
.error-area { flex: 1; display: flex; align-items: center; justify-content: center; }
.content-preview { max-width: 860px; margin: 0 auto; font-size: 15px; line-height: 1.8; }
.content-editor { max-width: 860px; margin: 0 auto; min-height: 500px; font-size: 15px; line-height: 1.8; outline: none; white-space: pre-wrap; word-wrap: break-word; font-family: 'SF Mono', Consolas, monospace; }
.bottom-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 20px; background: #fff; border-top: 1px solid #e4e7ed; flex-shrink: 0; }
.status-left { display: flex; gap: 12px; font-size: 13px; align-items: center; }
.dirty-indicator { color: #e6a23c; }
.saved-info { color: #909399; }
.new-count { color: #67c23a; cursor: pointer; font-weight: 500; }
.new-count:hover { text-decoration: underline; }
.status-right { display: flex; gap: 8px; }

/* 高亮新增行样式 */
.content-preview :deep(.highlight-line) {
  background: linear-gradient(90deg, #fef0f0 0%, #fcf3cf 50%, #e8f5e9 100%);
  border-left: 4px solid #f56c6c;
  padding: 8px 12px;
  margin: 4px 0;
  border-radius: 4px;
  position: relative;
  animation: highlight-pulse 2s ease-in-out;
}

.content-preview :deep(.new-badge) {
  position: absolute;
  left: -4px;
  top: -8px;
  background: #f56c6c;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}

@keyframes highlight-pulse {
  0% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(245, 108, 108, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0); }
}

/* Markdown 预览样式 */
.content-preview :deep(h1) { font-size: 26px; font-weight: 700; margin: 24px 0 16px; padding-bottom: 10px; border-bottom: 2px solid #409EFF; color: #1a1a2e; }
.content-preview :deep(h2) { font-size: 20px; font-weight: 600; margin: 20px 0 12px; color: #303133; padding-left: 10px; border-left: 4px solid #409EFF; }
.content-preview :deep(h3) { font-size: 16px; font-weight: 600; margin: 16px 0 8px; color: #606266; }
.content-preview :deep(h4) { font-size: 14px; font-weight: 600; margin: 12px 0 6px; color: #909399; }
.content-preview :deep(strong) { color: #303133; }
.content-preview :deep(code) { background: #f0f2f5; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Consolas, monospace; font-size: 13px; color: #e83e8c; }
.content-preview :deep(div) { min-height: 1.5em; }

/* 分析面板 */
.analyze-panel { min-height: 380px; }
.analyze-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
.summary-content { display: flex; flex-direction: column; gap: 16px; }
.summary-block { background: #f5f7fa; padding: 14px; border-radius: 6px; }
.summary-label { font-weight: 600; margin-bottom: 8px; color: #303133; }
.summary-block p { margin: 0; color: #606266; line-height: 1.7; }
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
.analysis-list { margin: 0; padding-left: 20px; color: #606266; }
.analysis-list li { margin: 4px 0; }
.req-list { display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; }
.req-item { background: #f5f7fa; padding: 12px; border-radius: 6px; border-left: 3px solid #409EFF; }
.req-item-header { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.req-item-id { font-weight: 600; color: #409EFF; }
.req-item-desc { color: #606266; font-size: 13px; margin-bottom: 6px; }
.req-item-tags { display: flex; gap: 5px; flex-wrap: wrap; }
.new-list { display: flex; flex-direction: column; gap: 8px; }
.new-hint { color: #909399; font-size: 13px; padding: 8px 12px; background: #f5f7fa; border-radius: 4px; margin-bottom: 8px; }
.new-item { display: flex; gap: 10px; align-items: flex-start; padding: 8px 12px; background: #f0f9eb; border-radius: 4px; border-left: 3px solid #67c23a; }
.new-text { color: #303133; font-size: 13px; }
.mr4 { margin-right: 4px; margin-bottom: 4px; }
</style>
