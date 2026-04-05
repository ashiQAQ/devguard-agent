<template>
  <div class="req-list">
    <div class="header">
      <h2>📋 需求列表</h2>
      <el-button type="primary" @click="$router.push('/requirements-create')">
        + 新建需求
      </el-button>
    </div>

    <div class="filters">
      <el-input v-model="search" placeholder="搜索需求..." clearable @input="filterList" style="width: 200px" />
      <el-select v-model="filterStatus" placeholder="状态" clearable @change="filterList" style="width: 120px">
        <el-option label="待确认" value="pending" />
        <el-option label="已确认" value="confirmed" />
        <el-option label="进行中" value="in_progress" />
        <el-option label="已完成" value="completed" />
      </el-select>
      <el-select v-model="filterModule" placeholder="模块" clearable @change="filterList" style="width: 140px">
        <el-option v-for="m in modules" :key="m" :label="m" :value="m" />
      </el-select>
    </div>

    <!-- 新增需求提示 -->
    <transition name="slide-down">
      <div v-if="newReq && !dismissedNewReq" class="new-req-banner" @click="scrollToNew">
        <span>✨ 新增需求：{{ newReq.title || newReq.req_id }}</span>
        <span class="new-badge">{{ newReq.diff?.diff_count > 0 ? `对比上条：${newReq.diff.diff_count} 处变化` : '新增成功' }}</span>
        <el-button link type="info" @click.stop="showNewDetail = true; dismissedNewReq = true">查看对比</el-button>
        <el-button link type="info" @click="dismissedNewReq = true" :icon="Close">忽略</el-button>
      </div>
    </transition>

    <div class="req-grid" v-loading="loading">
      <div
        v-for="req in filteredReqs"
        :key="req.req_id"
        class="req-card"
        :class="{ 'is-new': req.is_newest && !dismissedNewReq }"
        @click="viewReq(req)"
      >
        <!-- 新增标记 -->
        <div v-if="req.is_newest && !dismissedNewReq" class="new-tag">
          <el-badge value="NEW" type="success" />
        </div>

        <div class="req-header">
          <span class="req-id">{{ req.req_id }}</span>
          <el-tag :type="getPriorityType(req.priority)" size="small">{{ req.priority }}</el-tag>
        </div>

        <div class="req-title">{{ req.title }}</div>
        <div class="req-desc">{{ req.description || '暂无描述' }}</div>

        <div class="req-footer">
          <span class="req-module">
            <el-tag v-if="req.module" size="small" type="info">{{ req.module }}</el-tag>
          </span>
          <span class="req-time">{{ formatTime(req.created_at) }}</span>
        </div>

        <!-- 与上一条的变化提示 -->
        <div v-if="req.diff?.diff_count > 0" class="diff-summary">
          <el-icon><Top /></el-icon>
          {{ req.diff.diff_count }} 项变更
        </div>
      </div>

      <div v-if="!filteredReqs.length && !loading" class="empty">暂无需求</div>
    </div>

    <!-- 新增需求对比弹窗 -->
    <el-dialog v-model="showNewDetail" title="📊 新增需求对比" width="600px">
      <div v-if="newReq && newReq.diff">
        <el-alert type="success" :closable="false" style="margin-bottom: 16px">
          与上一条需求对比，共 <strong>{{ newReq.diff.diff_count }}</strong> 处变化
        </el-alert>

        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="当前需求">
            <strong>{{ newReq.req_id }}</strong> — {{ newReq.title }}
          </el-descriptions-item>
          <el-descriptions-item label="上一条">
            <strong>{{ newReq.diff.prev_req_id }}</strong>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">变更详情</el-divider>

        <el-table :data="newReq.diff.diffs" size="small" border>
          <el-table-column prop="label" label="字段" width="80" />
          <el-table-column label="变更前" width="120">
            <template #default="{ row }">
              <span class="diff-from">{{ row.from }}</span>
            </template>
          </el-table-column>
          <el-table-column label="变更后">
            <template #default="{ row }">
              <span class="diff-to">{{ row.to }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="showNewDetail = false">关闭</el-button>
        <el-button type="primary" @click="viewReq(newReq); showNewDetail = false">
          查看详情
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Close, Top } from '@element-plus/icons-vue'

const router = useRouter()

// ─── 状态 ────────────────────────────────────────────────────────────────────
const allReqs = ref<any[]>([])
const filteredReqs = ref<any[]>([])
const loading = ref(true)
const search = ref('')
const filterStatus = ref('')
const filterModule = ref('')
const dismissedNewReq = ref(false)
const showNewDetail = ref(false)

// 从上一个页面（创建页）传入的新需求
const newReq = ref<any>(null)

// ─── 模块列表 ────────────────────────────────────────────────────────────────
const modules = computed(() => {
  const set = new Set(allReqs.value.map(r => r.module).filter(Boolean))
  return [...set].sort()
})

// ─── 生命周期 ────────────────────────────────────────────────────────────────
onMounted(() => {
  loadReqs()
  // 检查是否有来自创建页的新需求
  const saved = sessionStorage.getItem('__last_created_req__')
  if (saved) {
    try {
      newReq.value = JSON.parse(saved)
      dismissedNewReq.value = false
      sessionStorage.removeItem('__last_created_req__')
      // 插入到列表顶部
      allReqs.value.unshift(newReq.value)
      filterList()
    } catch {}
  }
})

async function loadReqs() {
  loading.value = true
  try {
    const res = await fetch('/api/requirements/list?page_size=100')
    const data = await res.json()
    const reqs: any[] = data.requirements || []

    // 找出最新的那条（用于高亮）
    if (reqs.length > 0) {
      const latest = reqs.reduce((a, b) =>
        (a.created_seq || 0) > (b.created_seq || 0) ? a : b
      )
      latest.is_newest = true
      latest.created_seq = latest.created_seq || reqs.length
    }

    allReqs.value = reqs
    filteredReqs.value = reqs
  } catch (e) {
    console.error('加载失败', e)
  } finally {
    loading.value = false
  }
}

function filterList() {
  let list = allReqs.value
  if (filterStatus.value) list = list.filter((r: any) => r.status === filterStatus.value)
  if (filterModule.value) list = list.filter((r: any) => r.module === filterModule.value)
  if (search.value) {
    const s = search.value.toLowerCase()
    list = list.filter((r: any) =>
      r.req_id?.toLowerCase().includes(s) ||
      r.title?.toLowerCase().includes(s) ||
      r.description?.toLowerCase().includes(s)
    )
  }
  filteredReqs.value = list
}

function viewReq(req: any) {
  router.push(`/requirements-detail/${req.req_id}`)
}

function scrollToNew() {
  nextTick(() => {
    const el = document.querySelector('.req-card.is-new')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function getPriorityType(p: string) {
  return { P0: 'danger', P1: 'warning', P2: 'info' }[p] || 'info'
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
.req-list { padding: 20px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }

/* 新增需求横幅 */
.new-req-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #f0f9eb 0%, #e8f5e9 100%);
  border: 1px solid #67c23a;
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #67c23a;
  cursor: pointer;
}
.new-req-banner:hover { background: linear-gradient(135deg, #dbf3d0 0%, #c8e6c9 100%); }
.new-badge { font-size: 12px; background: #67c23a; color: #fff; padding: 2px 8px; border-radius: 10px; }

/* 卡片网格 */
.req-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 15px;
}

.req-card {
  background: #fff;
  border-radius: 8px;
  padding: 15px;
  cursor: pointer;
  border: 1px solid #ebeef5;
  transition: all 0.3s ease;
  position: relative;
}
.req-card:hover { border-color: #409EFF; box-shadow: 0 2px 8px rgba(64,158,255,0.2); }

/* 新增需求高亮 */
.req-card.is-new {
  border-color: #67c23a;
  background: #fafff0;
  animation: highlight-pulse 2s ease-out;
}

/* 呼吸脉冲动画（持续到用户忽略） */
@keyframes highlight-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(103,194,58,0.4); }
  25%  { box-shadow: 0 0 0 6px rgba(103,194,58,0.15); }
  50%  { box-shadow: 0 0 0 12px rgba(103,194,58,0.08); }
  75%  { box-shadow: 0 0 0 6px rgba(103,194,58,0.04); }
  100% { box-shadow: 0 0 0 0 rgba(103,194,58,0); }
}

.req-card.is-new:hover { box-shadow: 0 4px 16px rgba(103,194,58,0.25); }

/* NEW 标签 */
.new-tag { position: absolute; top: -8px; right: 8px; }

/* 头部 */
.req-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.req-id { font-weight: bold; color: #409EFF; font-size: 13px; }
.req-title { font-weight: 500; margin-bottom: 6px; font-size: 15px; }
.req-desc { font-size: 13px; color: #606266; min-height: 40px; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* 底部 */
.req-footer { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #909399; margin-top: 6px; }
.req-time { font-size: 11px; }

/* 变更摘要 */
.diff-summary {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
  color: #67c23a;
  background: #f0f9eb;
  border-radius: 4px;
  padding: 2px 8px;
  width: fit-content;
}

.diff-from { text-decoration: line-through; color: #999; }
.diff-to { color: #67c23a; font-weight: 500; }

.empty { grid-column: 1/-1; text-align: center; padding: 60px; color: #909399; }

/* 过渡动画 */
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-10px); }
</style>
