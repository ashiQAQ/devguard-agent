<template>
  <div class="req-list">
    <div class="header">
      <h2>📋 需求列表</h2>
      <el-button type="primary" @click="$router.push('/requirements-create')">+ 新建需求</el-button>
    </div>

    <div class="filters">
      <el-input v-model="search" placeholder="搜索需求..." clearable @input="filterList" style="width: 200px" />
      <el-select v-model="filterStatus" placeholder="状态" clearable @change="filterList" style="width: 120px">
        <el-option label="待确认" value="pending" />
        <el-option label="已确认" value="confirmed" />
        <el-option label="进行中" value="in_progress" />
        <el-option label="已完成" value="completed" />
      </el-select>
    </div>

    <div class="req-grid" v-loading="loading">
      <div v-for="req in filteredReqs" :key="req.req_id" class="req-card" @click="viewReq(req)">
        <div class="req-header">
          <span class="req-id">{{ req.req_id }}</span>
          <el-tag :type="getPriorityType(req.priority)" size="small">{{ req.priority }}</el-tag>
        </div>
        <div class="req-title">{{ req.title }}</div>
        <div class="req-desc">{{ req.description || '暂无描述' }}</div>
      </div>
      <div v-if="!filteredReqs.length && !loading" class="empty">暂无需求</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const allReqs = ref<any[]>([])
const filteredReqs = ref<any[]>([])
const loading = ref(true)
const search = ref('')
const filterStatus = ref('')

onMounted(() => loadReqs())

async function loadReqs() {
  loading.value = true
  try {
    const res = await fetch('/api/requirements/list?page_size=100')
    const data = await res.json()
    allReqs.value = data.requirements || []
    filteredReqs.value = allReqs.value
  } catch (e) { console.error('加载失败', e) }
  finally { loading.value = false }
}

function filterList() {
  let list = allReqs.value
  if (filterStatus.value) list = list.filter((r: any) => r.status === filterStatus.value)
  if (search.value) {
    const s = search.value.toLowerCase()
    list = list.filter((r: any) => 
      r.req_id?.toLowerCase().includes(s) || r.title?.toLowerCase().includes(s)
    )
  }
  filteredReqs.value = list
}

function viewReq(req: any) {
  router.push(`/requirements-detail/${req.req_id}`)
}

function getPriorityType(p: string) {
  return { P0: 'danger', P1: 'warning', P2: 'info' }[p] || 'info'
}
</script>

<style scoped>
.req-list { padding: 20px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.filters { display: flex; gap: 10px; margin-bottom: 20px; }
.req-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px; }
.req-card { background: #fff; border-radius: 8px; padding: 15px; cursor: pointer; border: 1px solid #ebeef5; transition: all 0.2s; }
.req-card:hover { border-color: #409EFF; box-shadow: 0 2px 8px rgba(64,158,255,0.2); }
.req-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.req-id { font-weight: bold; color: #409EFF; }
.req-title { font-weight: 500; margin-bottom: 6px; }
.req-desc { font-size: 13px; color: #606266; min-height: 40px; }
.empty { grid-column: 1/-1; text-align: center; padding: 60px; color: #909399; }
</style>
