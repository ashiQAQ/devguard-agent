<template>
  <div class="analysis-history">
    <!-- 搜索和过滤 -->
    <el-card class="search-card">
      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="6">
          <el-input
            v-model="searchText"
            placeholder="搜索分析 ID 或需求 ID"
            clearable
            @input="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <el-select
            v-model="filterType"
            placeholder="按分析类型过滤"
            clearable
            @change="handleFilter"
          >
            <el-option label="Flow A" value="FLOW_A" />
            <el-option label="Flow B" value="FLOW_B" />
          </el-select>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <el-select
            v-model="filterStatus"
            placeholder="按状态过滤"
            clearable
            @change="handleFilter"
          >
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failed" />
            <el-option label="待处理" value="pending" />
          </el-select>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <el-button type="primary" @click="handleRefresh">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 分析历史表格 -->
    <el-card class="table-card">
      <el-table
        :data="filteredAnalyses"
        stripe
        style="width: 100%"
        :loading="appStore.loading"
        @row-click="handleRowClick"
      >
        <el-table-column prop="id" label="分析 ID" width="150" show-overflow-tooltip />
        <el-table-column prop="requirement_id" label="需求 ID" width="150" show-overflow-tooltip />
        <el-table-column prop="analysis_type" label="分析类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.analysis_type === 'FLOW_A' ? 'success' : 'info'">
              {{ row.analysis_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column prop="completed_at" label="完成时间" width="180" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="handleView(row)">查看</el-button>
            <el-button link type="danger" @click.stop="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="appStore.analyses.length"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 20px; text-align: right"
      />
    </el-card>

    <!-- 详情对话框 -->
    <el-dialog v-model="showDetailDialog" title="分析详情" width="80%">
      <div v-if="selectedAnalysis" class="detail-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="分析 ID">{{ selectedAnalysis.id }}</el-descriptions-item>
          <el-descriptions-item label="需求 ID">{{ selectedAnalysis.requirement_id }}</el-descriptions-item>
          <el-descriptions-item label="分析类型">{{ selectedAnalysis.analysis_type }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(selectedAnalysis.status)">
              {{ selectedAnalysis.status }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ selectedAnalysis.created_at }}</el-descriptions-item>
          <el-descriptions-item label="完成时间">{{ selectedAnalysis.completed_at }}</el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <h4>分析结果</h4>
        <el-tree
          :data="formatResultTree(selectedAnalysis.result)"
          node-key="id"
          :props="{ children: 'children', label: 'label' }"
          default-expand-all
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '../../stores/app'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import type { Analysis } from '../../types'

const appStore = useAppStore()

const searchText = ref('')
const filterType = ref('')
const filterStatus = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const showDetailDialog = ref(false)
const selectedAnalysis = ref<Analysis | null>(null)

const filteredAnalyses = computed(() => {
  let result = appStore.analyses

  if (searchText.value) {
    result = result.filter(
      (a) =>
        a.id.includes(searchText.value) ||
        a.requirement_id.includes(searchText.value)
    )
  }

  if (filterType.value) {
    result = result.filter((a) => a.analysis_type === filterType.value)
  }

  if (filterStatus.value) {
    result = result.filter((a) => a.status === filterStatus.value)
  }

  return result.slice(
    (currentPage.value - 1) * pageSize.value,
    currentPage.value * pageSize.value
  )
})

const getStatusType = (status: string) => {
  const types: Record<string, string> = {
    success: 'success',
    failed: 'danger',
    pending: 'info',
  }
  return types[status] || 'info'
}

const formatResultTree = (result: Record<string, any>) => {
  const formatValue = (key: string, value: any, depth = 0): any => {
    if (depth > 3) return null

    if (typeof value === 'object' && value !== null) {
      return {
        id: key,
        label: key,
        children: Object.entries(value).map(([k, v]) => formatValue(k, v, depth + 1)),
      }
    }

    return {
      id: key,
      label: `${key}: ${JSON.stringify(value)}`,
    }
  }

  return Object.entries(result).map(([key, value]) => formatValue(key, value))
}

const handleSearch = () => {
  currentPage.value = 1
}

const handleFilter = () => {
  currentPage.value = 1
}

const handleRefresh = async () => {
  await appStore.fetchAnalyses()
  ElMessage.success('已刷新')
}

const handleView = (row: Analysis) => {
  selectedAnalysis.value = row
  showDetailDialog.value = true
}

const handleDelete = (row: Analysis) => {
  ElMessageBox.confirm(
    `确定删除分析 ${row.id} 吗？`,
    '警告',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  )
    .then(() => {
      ElMessage.success('删除成功')
    })
    .catch(() => {
      ElMessage.info('已取消删除')
    })
}

onMounted(async () => {
  await appStore.fetchAnalyses()
})
</script>

<style scoped>
.analysis-history {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.search-card,
.table-card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.detail-content {
  padding: 20px 0;
}

h4 {
  margin: 20px 0 10px 0;
  font-size: 14px;
  font-weight: bold;
  color: #333;
}
</style>
