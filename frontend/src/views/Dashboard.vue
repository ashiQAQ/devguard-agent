<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon" style="background: #667eea"><el-icon><DocumentCopy /></el-icon></div>
          <div class="stat-content">
            <p class="stat-label">需求总数</p>
            <p class="stat-value">{{ appStore.requirementCount }}</p>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon" style="background: #764ba2"><el-icon><Search /></el-icon></div>
          <div class="stat-content">
            <p class="stat-label">分析总数</p>
            <p class="stat-value">{{ appStore.analysisCount }}</p>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon" style="background: #f093fb"><el-icon><Cpu /></el-icon></div>
          <div class="stat-content">
            <p class="stat-label">仿真总数</p>
            <p class="stat-value">{{ appStore.simulationCount }}</p>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon" style="background: #4facfe"><el-icon><DataAnalysis /></el-icon></div>
          <div class="stat-content">
            <p class="stat-label">文档总数</p>
            <p class="stat-value">{{ recentDocs.length }}</p>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 文档列表 -->
    <el-row :gutter="20" class="content-row">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>📄 需求文档</span>
              <el-button link type="primary" @click="$router.push('/req-docs')">查看全部</el-button>
            </div>
          </template>
          <div class="doc-grid">
            <div v-for="doc in recentDocs" :key="doc.doc_id" class="doc-item" @click="$router.push('/req-docs/' + doc.doc_id)">
              <div class="doc-title">{{ doc.title }}</div>
              <div class="doc-meta">
                <el-tag size="small" :type="getDocStatusType(doc.status)">{{ getDocStatusText(doc.status) }}</el-tag>
                <span>{{ doc.author || '未知' }}</span>
              </div>
            </div>
            <div v-if="!recentDocs.length" class="empty">暂无文档</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近需求 -->
    <el-row :gutter="20" class="content-row">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>最近需求</span>
              <el-button link type="primary" @click="$router.push('/requirements-list')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentRequirements" stripe>
            <el-table-column prop="req_id" label="ID" width="120" />
            <el-table-column prop="title" label="标题" show-overflow-tooltip />
            <el-table-column prop="priority" label="优先级" width="80">
              <template #default="{ row }"><el-tag :type="getPriorityType(row.priority)" size="small">{{ row.priority }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }"><el-tag :type="getStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { DocumentCopy, Search, Cpu, DataAnalysis } from '@element-plus/icons-vue'

const router = useRouter()
const appStore = useAppStore()

const recentDocs = ref<any[]>([])
const recentRequirements = computed(() => appStore.requirements.slice(0, 5))

const getPriorityType = (p: string) => ({ P0: 'danger', P1: 'warning', P2: 'info' }[p] || 'info')
const getStatusType = (s: string) => ({ pending: 'info', confirmed: 'warning', in_progress: 'primary', completed: 'success', rejected: 'danger' }[s] || 'info')
const getDocStatusType = (s: string) => ({ draft: 'info', review: 'warning', approved: 'success', archived: '' }[s] || 'info')
const getDocStatusText = (s: string) => ({ draft: '草稿', review: '审核中', approved: '已批准', archived: '已归档' }[s] || s)

onMounted(async () => {
  await appStore.fetchRequirements()
  try {
    const res = await fetch('http://localhost:8000/api/req-docs/docs?page_size=10')
    const data = await res.json()
    recentDocs.value = data.docs || []
  } catch (e) { console.error('加载文档失败', e) }
})
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 20px; }
.stats-row { margin-bottom: 0; }
.stat-card { background: white; border-radius: 8px; padding: 20px; display: flex; align-items: center; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.stat-icon { width: 60px; height: 60px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: white; }
.stat-label { color: #909399; font-size: 14px; margin: 0; }
.stat-value { font-size: 28px; font-weight: bold; margin: 5px 0 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.doc-item { padding: 12px; border: 1px solid #ebeef5; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
.doc-item:hover { border-color: #409EFF; background: #f5f7fa; }
.doc-title { font-weight: 500; margin-bottom: 8px; }
.doc-meta { display: flex; gap: 10px; align-items: center; font-size: 12px; color: #909399; }
.empty { text-align: center; color: #909399; padding: 30px; }
</style>
