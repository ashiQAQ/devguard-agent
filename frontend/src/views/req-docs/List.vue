<template>
  <div class="doc-list">
    <div class="header">
      <h2>📄 需求文档</h2>
      <el-button type="primary" @click="$router.push('/req-docs-create')">
        + 新建文档
      </el-button>
    </div>

    <div class="filters">
      <el-input v-model="search" placeholder="搜索文档..." clearable @input="filterList" style="width: 200px" />
      <el-select v-model="filterType" placeholder="类型" clearable @change="filterList" style="width: 120px">
        <el-option label="PRD" value="PRD" />
        <el-option label="SRS" value="SRS" />
        <el-option label="ICD" value="ICD" />
        <el-option label="HLD" value="HLD" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态" clearable @change="filterList" style="width: 120px">
        <el-option label="草稿" value="draft" />
        <el-option label="审核中" value="review" />
        <el-option label="已发布" value="approved" />
        <el-option label="已归档" value="archived" />
      </el-select>
    </div>

    <div class="doc-grid" v-loading="loading">
      <div v-for="doc in filteredDocs" :key="doc.id" class="doc-card" @click="editDoc(doc)">
        <div class="doc-icon">📄</div>
        <div class="doc-info">
          <div class="doc-title">{{ doc.title }}</div>
          <div class="doc-meta">
            <el-tag size="small" type="info">{{ doc.doc_type }}</el-tag>
            <el-tag size="small" :type="getStatusType(doc.status)">{{ getStatusText(doc.status) }}</el-tag>
            <span class="doc-version">v{{ doc.version }}</span>
          </div>
          <div class="doc-desc">{{ doc.description || '暂无描述' }}</div>
          <div class="doc-footer">
            <span>{{ doc.author || '未知作者' }}</span>
            <span>{{ formatTime(doc.updated_at) }}</span>
          </div>
        </div>
      </div>
      <div v-if="!filteredDocs.length && !loading" class="empty">
        <el-empty description="暂无需求文档" />
        <el-button type="primary" @click="$router.push('/req-docs-create')">创建第一个文档</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const allDocs = ref<any[]>([])
const filteredDocs = ref<any[]>([])
const loading = ref(true)
const search = ref('')
const filterType = ref('')
const filterStatus = ref('')

onMounted(() => loadDocs())

async function loadDocs() {
  loading.value = true
  try {
    const res = await fetch('/api/req-docs/docs')
    const data = await res.json()
    allDocs.value = data.docs || []
    filteredDocs.value = allDocs.value
  } catch (e) {
    console.error('加载失败', e)
  } finally {
    loading.value = false
  }
}

function filterList() {
  let list = allDocs.value
  if (filterType.value) list = list.filter((d: any) => d.doc_type === filterType.value)
  if (filterStatus.value) list = list.filter((d: any) => d.status === filterStatus.value)
  if (search.value) {
    const s = search.value.toLowerCase()
    list = list.filter((d: any) => 
      d.title?.toLowerCase().includes(s) || 
      d.description?.toLowerCase().includes(s)
    )
  }
  filteredDocs.value = list
}

function editDoc(doc: any) {
  router.push(`/req-docs-edit/${doc.id}`)
}

function getStatusType(status: string) {
  const map: Record<string, string> = {
    draft: 'info', review: 'warning', approved: 'success', archived: 'info'
  }
  return map[status] || 'info'
}

function getStatusText(status: string) {
  const map: Record<string, string> = {
    draft: '草稿', review: '审核中', approved: '已发布', archived: '已归档'
  }
  return map[status] || status
}

function formatTime(ts: string) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return ts
  }
}
</script>

<style scoped>
.doc-list { padding: 20px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.filters { display: flex; gap: 10px; margin-bottom: 16px; }
.doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.doc-card {
  display: flex;
  gap: 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.doc-card:hover { border-color: #409EFF; box-shadow: 0 2px 8px rgba(64,158,255,0.2); }
.doc-icon { font-size: 32px; }
.doc-info { flex: 1; min-width: 0; }
.doc-title { font-weight: 600; font-size: 15px; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.doc-version { font-size: 12px; color: #999; }
.doc-desc { font-size: 13px; color: #666; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.doc-footer { display: flex; justify-content: space-between; font-size: 12px; color: #999; }
.empty { grid-column: 1/-1; text-align: center; padding: 40px; }
</style>
