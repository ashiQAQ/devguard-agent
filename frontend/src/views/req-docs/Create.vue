<template>
  <div class="doc-create">
    <!-- 顶部工具栏 -->
    <div class="top-bar">
      <el-button @click="$router.push('/req-docs')">← 返回</el-button>
      <input
        v-model="form.title"
        class="title-input"
        placeholder="输入文档标题..."
      />
      <div class="top-actions">
        <el-select v-model="form.doc_type" style="width: 120px">
          <el-option label="PRD" value="PRD" />
          <el-option label="SRS" value="SRS" />
          <el-option label="ICD" value="ICD" />
          <el-option label="HLD" value="HLD" />
        </el-select>
        <el-button type="primary" @click="saveDoc" :loading="saving">💾 保存</el-button>
      </div>
    </div>

    <!-- 元信息 -->
    <div class="meta-bar">
      <el-input v-model="form.description" placeholder="文档描述" style="width: 300px" size="small" />
      <el-input v-model="form.author" placeholder="作者" style="width: 150px" size="small" />
    </div>

    <!-- 编辑器 - 占满整个页面 -->
    <div class="editor-wrapper">
      <div class="content-editor" ref="editorRef" contenteditable="true" @paste="onPaste" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const router = useRouter()

const form = ref({
  title: '',
  description: '',
  doc_type: 'SRS',
  author: '',
})

const saving = ref(false)
const editorRef = ref<HTMLElement>()

onMounted(() => {
  nextTick(() => {
    editorRef.value?.focus()
  })
})

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}

async function saveDoc() {
  if (!form.value.title) {
    ElMessage.warning('请输入文档标题')
    return
  }

  saving.value = true
  try {
    const content = editorRef.value?.innerText || ''
    
    await axios.post('/api/req-docs/docs', {
      title: form.value.title,
      description: form.value.description,
      doc_type: form.value.doc_type,
      author: form.value.author,
      status: 'draft',
      content: content,
    })

    ElMessage.success('文档创建成功')
    router.push('/req-docs')
  } catch (e: any) {
    ElMessage.error('创建失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.doc-create {
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  padding: 0;
  margin: -20px;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.title-input {
  flex: 1;
  font-size: 18px;
  font-weight: bold;
  border: none;
  outline: none;
  padding: 5px 0;
  border-bottom: 2px solid #409EFF;
}

.top-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.meta-bar {
  display: flex;
  gap: 15px;
  padding: 10px 20px;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
}

.editor-wrapper {
  flex: 1;
  overflow-y: auto;
  background: #fff;
}

.content-editor {
  min-height: 100%;
  padding: 30px 60px;
  font-size: 15px;
  line-height: 1.8;
  outline: none;
  max-width: 900px;
  margin: 0 auto;
}

.content-editor:empty::before {
  content: '开始输入文档内容...';
  color: #c0c4cc;
}

.content-editor :deep(h1) {
  font-size: 28px;
  font-weight: bold;
  margin: 24px 0 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid #409EFF;
}

.content-editor :deep(h2) {
  font-size: 22px;
  font-weight: bold;
  margin: 20px 0 12px;
}

.content-editor :deep(h3) {
  font-size: 18px;
  font-weight: bold;
  margin: 16px 0 8px;
}

.content-editor :deep(p) {
  margin: 12px 0;
}

.content-editor :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
}

.content-editor :deep(th),
.content-editor :deep(td) {
  border: 1px solid #dcdfe6;
  padding: 10px 12px;
}

.content-editor :deep(th) {
  background: #f5f7fa;
}

.content-editor :deep(ul),
.content-editor :deep(ol) {
  padding-left: 24px;
}
</style>
