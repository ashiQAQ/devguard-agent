<template>
  <div class="doc-list">
    <div class="header">
      <h2>📄 需求文档</h2>
      <el-button type="primary" @click="$router.push('/req-docs/create')">+ 新建文档</el-button>
    </div>

    <div class="filters">
      <el-select v-model="filter.status" placeholder="状态" clearable @change="fetchDocs">
        <el-option label="草稿" value="draft" />
        <el-option label="审核中" value="review" />
        <el-option label="已批准" value="approved" />
        <el-option label="已归档" value="archived" />
      </el-select>
    </div>

    <div class="doc-grid" v-loading="loading">
      <div v-for="doc in docs" :key="doc.doc_id" class="doc-card" @click="viewDoc(doc)">
        <div class="doc-header">
          <el-tag :type="getStatusType(doc.status)" size="small">{{ getStatusText(doc.status) }}</el-tag>
          <el-tag type="info" size="small">{{ doc.doc_type }}</el-tag>
        </div>
        <div class="doc-title">{{ doc.title }}</div>
        <div class="doc-desc">{{ doc.description || '暂无描述' }}</div>
        <div class="doc-footer">
          <span>{{ doc.author || '未知' }}</span>
          <span>{{ formatDate(doc.created_at) }}</span>
        </div>
      </div>
      <div v-if="!docs.length && !loading" class="empty">暂无文档</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const docs = ref<any[]>([])
const loading = ref(true)

const filter = reactive({ status: '' })

onMounted(() => fetchDocs())

async function fetchDocs() {
  loading.value = true
  try {
    const url = filter.status 
      ? `/api/req-docs/docs?status=${filter.status}&page_size=50`
      : '/api/req-docs/docs?page_size=50'
    const res = await fetch(url)
    const data = await res.json()
    docs.value = data.docs || []
  } catch (e) {
    console.error('加载失败', e)
  } finally {
    loading.value = false
  }
}

function viewDoc(doc: any) {
  router.push(`/req-docs/${doc.doc_id}`)
}

function getStatusType(s: string) {
  return { draft: 'info', review: 'warning', approved: 'success', archived: '' }[s] || 'info'
}
function getStatusText(s: string) {
  return { draft: '草稿', review: '审核中', approved: '已批准', archived: '已归档' }[s] || s
}
function formatDate(d: string) {
  return d ? new Date(d).toLocaleDateString('zh-CN') : ''
}
</script>

<style scoped>
.doc-list { padding: 20px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.filters { margin-bottom: 20px; }
.doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
.doc-card { background: #fff; border-radius: 8px; padding: 15px; cursor: pointer; border: 1px solid #ebeef5; transition: all 0.2s; }
.doc-card:hover { border-color: #409EFF; box-shadow: 0 2px 8px rgba(64,158,255,0.2); }
.doc-header { display: flex; gap: 8px; margin-bottom: 10px; }
.doc-title { font-weight: bold; font-size: 15px; margin-bottom: 8px; }
.doc-desc { color: #606266; font-size: 13px; margin-bottom: 10px; min-height: 40px; }
.doc-footer { display: flex; justify-content: space-between; font-size: 12px; color: #909399; }
.empty { grid-column: 1/-1; text-align: center; padding: 60px; color: #909399; }
</style>
