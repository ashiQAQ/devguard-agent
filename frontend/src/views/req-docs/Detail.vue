<template>
  <div class="doc-detail">
    <!-- 顶部工具栏 -->
    <div class="top-bar">
      <el-button @click="$router.push('/req-docs')">← 返回列表</el-button>
      <div class="doc-title">{{ title }}</div>
      <div class="top-actions">
        <select v-model="selectedDocId" @change="changeDoc" class="doc-select">
          <option v-for="d in docs" :key="d.doc_id" :value="d.doc_id">{{ d.title }}</option>
        </select>
        <el-button @click="loadArchived">最新归档</el-button>
        <el-button @click="showAnalyzeDialog = true" type="primary">🔍 AI 分析</el-button>
      </div>
    </div>

    <!-- 编辑器区域 -->
    <div class="editor-area" v-if="!error">
      <div 
        ref="editorRef" 
        class="content-editor" 
        contenteditable="true" 
        @input="onEditorInput"
        @paste="onPaste"
      />
    </div>
    <div class="error-area" v-else>
      <p>{{ error }}</p>
    </div>

    <!-- 底部状态栏 -->
    <div class="bottom-bar">
      <div class="status-left">
        <span v-if="isDirty" class="dirty-indicator">● 有未保存的更改</span>
        <span v-if="lastSaved" class="saved-info">已保存: {{ lastSaved }}</span>
        <span v-if="newContentCount > 0" class="new-count" @click="showNewContent">
          🆕 {{ newContentCount }} 条新增
        </span>
      </div>
      <div class="status-right">
        <el-button @click="addRequirement">➕ 新增需求条目</el-button>
        <el-button type="primary" @click="saveDoc" :disabled="saving || !isDirty">💾 保存</el-button>
      </div>
    </div>

    <!-- AI 分析对话框 -->
    <el-dialog v-model="showAnalyzeDialog" title="📋 需求分析" width="900px">
      <div class="analyze-panel">
        <div class="analyze-toolbar">
          <el-button type="primary" @click="runAnalysis" :loading="analyzing">🤖 AI 分析文档</el-button>
          <el-button @click="extractRequirements" :loading="extracting">📌 提取需求条目</el-button>
        </div>

        <!-- 分析结果 -->
        <div v-if="analysisResult" class="analysis-result">
          <el-tabs>
            <el-tab-pane label="📋 需求摘要" name="summary">
              <div class="summary-content">
                <div class="summary-item">
                  <strong>📌 概述：</strong>
                  <p>{{ analysisResult.summary || '暂无' }}</p>
                </div>
                <div v-if="analysisResult.key_entities?.length" class="summary-item">
                  <strong>🔑 关键实体：</strong>
                  <div class="tag-list">
                    <el-tag v-for="e in analysisResult.key_entities" :key="e" size="small">{{ e }}</el-tag>
                  </div>
                </div>
                <div v-if="analysisResult.potential_risks?.length" class="summary-item">
                  <strong>⚠️ 潜在风险：</strong>
                  <ul>
                    <li v-for="(r, i) in analysisResult.potential_risks" :key="i">{{ r }}</li>
                  </ul>
                </div>
                <div v-if="analysisResult.suggestions?.length" class="summary-item">
                  <strong>💡 改进建议：</strong>
                  <ul>
                    <li v-for="(s, i) in analysisResult.suggestions" :key="i">{{ s }}</li>
                  </ul>
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="📝 提取的需求" name="requirements">
              <div v-if="extractedReqs.length" class="req-list">
                <div v-for="(req, idx) in extractedReqs" :key="idx" class="req-item">
                  <div class="req-header">
                    <strong class="req-id">{{ req.title || 'NEW-' + (idx + 1) }}</strong>
                    <el-tag size="small" :type="getPriorityType(req.priority)">{{ req.priority || 'P1' }}</el-tag>
                    <el-tag v-if="req.asil_implication" size="small">{{ req.asil_implication }}</el-tag>
                  </div>
                  <div class="req-desc">{{ req.description || req.name || '' }}</div>
                  <div v-if="req.keywords?.length" class="req-keywords">
                    <el-tag v-for="k in req.keywords" :key="k" size="small" type="info">{{ k }}</el-tag>
                  </div>
                </div>
              </div>
              <el-empty v-else description="点击「提取需求条目」开始分析" />
            </el-tab-pane>

            <el-tab-pane label="🆕 新增内容" name="new">
              <div v-if="newContentItems.length" class="new-list">
                <div class="new-hint">以下内容将在保存后高亮显示在文档中</div>
                <div v-for="(item, idx) in newContentItems" :key="idx" class="new-item">
                  <el-tag type="success" size="small">新增</el-tag>
                  <span class="new-text">{{ item.text }}</span>
                </div>
              </div>
              <el-empty v-else-if="!isDirty" description="暂无新增内容" />
              <div v-else class="new-hint">
                编辑文档后点击「保存」，新增内容将显示在这里
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </el-dialog>

    <!-- 新增需求对话框 -->
    <el-dialog v-model="showAddReqDialog" title="➕ 新增需求条目" width="600px">
      <el-form :model="newReq" label-width="100px">
        <el-form-item label="需求 ID">
          <el-input v-model="newReq.req_id" placeholder="如: BR-2025-001" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="newReq.title" placeholder="需求标题" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="newReq.type">
            <el-option label="业务需求 (BR)" value="BR" />
            <el-option label="技术需求 (TR)" value="TR" />
            <el-option label="性能需求 (PR)" value="PR" />
            <el-option label="接口需求 (IR)" value="IR" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="newReq.priority">
            <el-option label="P0 - 紧急" value="P0" />
            <el-option label="P1 - 高" value="P1" />
            <el-option label="P2 - 中" value="P2" />
          </el-select>
        </el-form-item>
        <el-form-item label="ASIL 等级">
          <el-select v-model="newReq.asil" placeholder="可选">
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
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()

const title = ref('加载中...')
const docs = ref<any[]>([])
const selectedDocId = ref('')
const saving = ref(false)
const isDirty = ref(false)
const lastSaved = ref('')
const error = ref('')
const editorRef = ref<HTMLElement | null>(null)
const originalContent = ref('')
const originalHtml = ref('')

// AI 分析
const showAnalyzeDialog = ref(false)
const analyzing = ref(false)
const extracting = ref(false)
const analysisResult = ref<any>(null)
const extractedReqs = ref<any[]>([])
const newContentItems = ref<any[]>([])
const newContentCount = ref(0)

// 新增需求
const showAddReqDialog = ref(false)
const newReq = ref({
  req_id: '',
  title: '',
  type: 'BR',
  priority: 'P1',
  asil: '',
  description: ''
})

const API = 'http://localhost:8000/api/req-docs'

onMounted(async () => {
  try {
    const r = await fetch(`${API}/docs?page_size=100`)
    const data = await r.json()
    docs.value = data.docs || []
  } catch (e) {
    console.error('加载列表失败', e)
  }

  const id = route.params.id as string
  if (id) {
    selectedDocId.value = id
    await loadDoc(id)
  } else {
    const arch = docs.value.find((d: any) => d.status === 'archived')
    const target = arch || docs.value[0]
    if (target) {
      router.replace(`/req-docs/${target.doc_id}`)
    }
  }
})

async function loadDoc(id: string) {
  error.value = ''
  try {
    const r = await fetch(`${API}/docs/${id}`)
    const data = await r.json()
    
    if (!data || !data.doc) {
      error.value = '文档不存在'
      title.value = '文档不存在'
      return
    }

    title.value = data.doc.title || id
    selectedDocId.value = id
    originalContent.value = data.doc.content || ''

    if (editorRef.value) {
      // 直接使用原始文本，保持格式
      editorRef.value.innerText = data.doc.content || ''
      originalHtml.value = editorRef.value.innerHTML
    }
    isDirty.value = false
    newContentItems.value = []
    newContentCount.value = 0
  } catch (e: any) {
    error.value = '加载失败: ' + (e.message || '')
    title.value = '加载失败'
  }
}

function onEditorInput() {
  isDirty.value = true
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
  if (arch) {
    router.push(`/req-docs/${arch.doc_id}`)
  } else if (docs.value[0]) {
    router.push(`/req-docs/${docs.value[0].doc_id}`)
  }
}

async function saveDoc() {
  if (!selectedDocId.value) return
  saving.value = true
  try {
    const content = editorRef.value?.innerText || ''
    
    // 检测新增内容
    detectNewContent(content)
    
    await fetch(`${API}/docs/${selectedDocId.value}/save-markdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
    
    originalContent.value = content
    originalHtml.value = editorRef.value?.innerHTML || ''
    isDirty.value = false
    lastSaved.value = new Date().toLocaleTimeString()
    
    // 高亮新增内容
    applyHighlights()
    
    ElMessage.success('保存成功')
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

function detectNewContent(newText: string) {
  if (!originalContent.value) {
    // 全新内容，全部高亮
    const lines = newText.split('\n').filter(l => l.trim())
    newContentItems.value = lines.slice(0, 50).map(text => ({ text, type: 'new' }))
  } else {
    const oldLines = new Set(originalContent.value.split('\n').map(s => s.trim()).filter(Boolean))
    newContentItems.value = newText.split('\n')
      .filter(line => {
        const trimmed = line.trim()
        return trimmed && !oldLines.has(trimmed)
      })
      .slice(0, 50)
      .map(text => ({ text, type: 'new' }))
  }
  newContentCount.value = newContentItems.value.length
}

function applyHighlights() {
  if (!editorRef.value || !newContentItems.value.length) return
  
  const el = editorRef.value
  // 遍历文本节点，高亮新增内容
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node: Node | null
  while (node = walker.nextNode()) {
    textNodes.push(node as Text)
  }
  
  for (const textNode of textNodes) {
    const text = textNode.textContent || ''
    for (const item of newContentItems.value) {
      const idx = text.indexOf(item.text)
      if (idx >= 0) {
        const span = document.createElement('span')
        span.className = 'highlight-new'
        span.textContent = item.text
        const after = document.createTextNode(text.substring(idx + item.text.length))
        textNode.parentNode?.replaceChild(after, textNode)
        textNode.parentNode?.insertBefore(span, after)
        break
      }
    }
  }
}

function showNewContent() {
  showAnalyzeDialog.value = true
}

// AI 分析
async function runAnalysis() {
  if (!selectedDocId.value) return
  analyzing.value = true
  try {
    const res = await fetch(`${API}/docs/${selectedDocId.value}/ai-summary`, { method: 'POST' })
    const data = await res.json()
    analysisResult.value = data
    ElMessage.success('分析完成')
  } catch (e) {
    ElMessage.error('分析失败')
  } finally {
    analyzing.value = false
  }
}

async function extractRequirements() {
  if (!selectedDocId.value) return
  extracting.value = true
  try {
    const res = await fetch(`${API}/docs/${selectedDocId.value}/extract`, { method: 'POST' })
    const data = await res.json()
    extractedReqs.value = data.requirements || []
    ElMessage.success(`提取了 ${extractedReqs.value.length} 条需求`)
  } catch (e) {
    ElMessage.error('提取失败')
  } finally {
    extracting.value = false
  }
}

function addRequirement() {
  const id = `BR-${new Date().getFullYear()}-${String(extractedReqs.value.length + 1).padStart(3, '0')}`
  newReq.value.req_id = id
  showAddReqDialog.value = true
}

function insertRequirement() {
  if (!newReq.value.title) {
    ElMessage.warning('请输入标题')
    return
  }
  
  const asilText = newReq.value.asil ? `**ASIL**: ${newReq.value.asil}` : ''
  
  const reqText = `
## ${newReq.value.req_id}: ${newReq.value.title}

**类型**: ${newReq.value.type} | **优先级**: ${newReq.value.priority}
${asilText ? '\n' + asilText : ''}

${newReq.value.description}
`
  
  if (editorRef.value) {
    // 在末尾添加
    editorRef.value.innerText += reqText
    isDirty.value = true
  }
  
  showAddReqDialog.value = false
  ElMessage.success('已添加到文档')
}

function getPriorityType(p: string) {
  return { P0: 'danger', P1: 'warning', P2: 'info' }[p] || 'info'
}
</script>

<style scoped>
.doc-detail { height: calc(100vh - 60px); display: flex; flex-direction: column; margin: -20px; }
.top-bar { display: flex; align-items: center; gap: 15px; padding: 10px 20px; background: #fff; border-bottom: 1px solid #e4e7ed; }
.doc-title { flex: 1; font-weight: bold; font-size: 16px; }
.top-actions { display: flex; gap: 10px; }
.doc-select { width: 200px; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 4px; }
.editor-area { flex: 1; overflow-y: auto; padding: 30px 60px; background: #fff; }
.error-area { flex: 1; display: flex; align-items: center; justify-content: center; color: #f56c6c; }
.content-editor { max-width: 900px; margin: 0 auto; min-height: 500px; font-size: 15px; line-height: 1.8; outline: none; white-space: pre-wrap; word-wrap: break-word; }
.bottom-bar { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; background: #fff; border-top: 1px solid #e4e7ed; }
.status-left { display: flex; gap: 15px; font-size: 13px; align-items: center; }
.dirty-indicator { color: #e6a23c; }
.saved-info { color: #909399; }
.new-count { color: #67c23a; cursor: pointer; font-weight: 500; }
.new-count:hover { text-decoration: underline; }
.status-right { display: flex; gap: 10px; }

/* 高亮样式 */
.content-editor :deep(.highlight-new) { 
  background: linear-gradient(180deg, #fef0f0 0%, #fcdbd9 100%); 
  color: #c45656; 
  padding: 1px 3px; 
  border-radius: 3px; 
  border-bottom: 2px solid #f56c6c;
}

/* 分析面板 */
.analyze-panel { min-height: 400px; }
.analyze-toolbar { margin-bottom: 20px; display: flex; gap: 10px; }
.summary-content { display: flex; flex-direction: column; gap: 15px; }
.summary-item strong { display: block; margin-bottom: 8px; }
.summary-item p { margin: 0; color: #606266; }
.tag-list { display: flex; flex-wrap: wrap; gap: 5px; }
.req-list { display: flex; flex-direction: column; gap: 12px; }
.req-item { background: #f5f7fa; padding: 12px; border-radius: 6px; }
.req-header { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.req-id { color: #409EFF; font-weight: bold; }
.req-desc { color: #606266; font-size: 13px; margin-bottom: 6px; }
.req-keywords { display: flex; gap: 5px; flex-wrap: wrap; }
.new-list { display: flex; flex-direction: column; gap: 10px; }
.new-hint { color: #909399; font-size: 13px; padding: 10px; background: #f5f7fa; border-radius: 4px; margin-bottom: 10px; }
.new-item { display: flex; gap: 10px; align-items: flex-start; padding: 8px 12px; background: linear-gradient(90deg, #f0f9eb 0%, #e8f5e1 100%); border-radius: 4px; border-left: 3px solid #67c23a; }
.new-text { color: #303133; }
</style>
