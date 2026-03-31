<template>
  <div class="baselines-list">
    <!-- 搜索和操作 -->
    <el-card class="search-card">
      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="6">
          <el-input
            v-model="searchText"
            placeholder="搜索基线 ID 或名称"
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
            v-model="filterLanguage"
            placeholder="按编程语言过滤"
            clearable
            @change="handleFilter"
          >
            <el-option label="C++" value="cpp" />
            <el-option label="Python" value="python" />
            <el-option label="Java" value="java" />
          </el-select>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <el-select
            v-model="filterStatus"
            placeholder="按状态过滤"
            clearable
            @change="handleFilter"
          >
            <el-option label="活跃" value="active" />
            <el-option label="已归档" value="archived" />
          </el-select>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <el-button type="primary" @click="goToCreate">
            <el-icon><Plus /></el-icon>
            创建基线
          </el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 基线表格 -->
    <el-card class="table-card">
      <el-table
        :data="filteredBaselines"
        stripe
        style="width: 100%"
        :loading="loading"
        @row-click="handleRowClick"
      >
        <el-table-column prop="baseline_id" label="基线 ID" width="150" />
        <el-table-column prop="name" label="基线名称" show-overflow-tooltip />
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column prop="language" label="编程语言" width="100">
          <template #default="{ row }">
            <el-tag>{{ row.language }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'info'">
              {{ row.is_active ? '活跃' : '已归档' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column prop="updated_at" label="更新时间" width="180" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="handleView(row)">查看</el-button>
            <el-button link type="primary" @click.stop="handleVersions(row)">版本</el-button>
            <el-button link type="warning" @click.stop="handleEdit(row)">编辑</el-button>
            <el-button link type="danger" @click.stop="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="baselines.length"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 20px; text-align: right"
      />
    </el-card>

    <!-- 基线详情对话框 -->
    <el-dialog v-model="showDetailDialog" title="基线详情" width="80%">
      <div v-if="selectedBaseline" class="detail-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="基线 ID">{{ selectedBaseline.baseline_id }}</el-descriptions-item>
          <el-descriptions-item label="基线名称">{{ selectedBaseline.name }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ selectedBaseline.version }}</el-descriptions-item>
          <el-descriptions-item label="编程语言">{{ selectedBaseline.language }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="selectedBaseline.is_active ? 'success' : 'info'">
              {{ selectedBaseline.is_active ? '活跃' : '已归档' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ selectedBaseline.created_at }}</el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <h4>基线架构</h4>
        <el-tree
          :data="formatSchemaTree(selectedBaseline.schema)"
          node-key="id"
          :props="{ children: 'children', label: 'label' }"
          default-expand-all
        />
      </div>
    </el-dialog>

    <!-- 版本历史对话框 -->
    <el-dialog v-model="showVersionsDialog" title="版本历史" width="60%">
      <el-table :data="versionHistory" stripe style="width: 100%">
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleRollback(row)">回滚</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import type { Baseline } from '../../types'

const router = useRouter()

const searchText = ref('')
const filterLanguage = ref('')
const filterStatus = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const showDetailDialog = ref(false)
const showVersionsDialog = ref(false)
const selectedBaseline = ref<Baseline | null>(null)
const versionHistory = ref<any[]>([])

// 模拟数据
const baselines = ref<Baseline[]>([
  {
    id: '1',
    baseline_id: 'BL-2025-Q1-001',
    name: '感知系统基线 v1.0',
    version: '1.0.0',
    language: 'cpp',
    schema: {
      modules: {
        perception: {
          lanes: { detector: 'lane_detector.cc' },
          objects: { detector: 'object_detector.cc' },
        },
      },
    },
    is_active: true,
    parent_id: '',
    created_at: '2026-03-01',
    updated_at: '2026-03-30',
  },
  {
    id: '2',
    baseline_id: 'BL-2025-Q1-002',
    name: '规划系统基线 v1.0',
    version: '1.0.0',
    language: 'cpp',
    schema: {
      modules: {
        planning: {
          path: { planner: 'path_planner.cc' },
          trajectory: { generator: 'trajectory_generator.cc' },
        },
      },
    },
    is_active: true,
    parent_id: '',
    created_at: '2026-03-05',
    updated_at: '2026-03-30',
  },
])

const filteredBaselines = computed(() => {
  let result = baselines.value

  if (searchText.value) {
    result = result.filter(
      (b) =>
        b.baseline_id.includes(searchText.value) ||
        b.name.includes(searchText.value)
    )
  }

  if (filterLanguage.value) {
    result = result.filter((b) => b.language === filterLanguage.value)
  }

  if (filterStatus.value) {
    const isActive = filterStatus.value === 'active'
    result = result.filter((b) => b.is_active === isActive)
  }

  return result.slice(
    (currentPage.value - 1) * pageSize.value,
    currentPage.value * pageSize.value
  )
})

const formatSchemaTree = (schema: Record<string, any>) => {
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

  return Object.entries(schema).map(([key, value]) => formatValue(key, value))
}

const handleSearch = () => {
  currentPage.value = 1
}

const handleFilter = () => {
  currentPage.value = 1
}

const goToCreate = () => {
  router.push('/baselines-create')
}

const handleRowClick = (row: Baseline) => {
  selectedBaseline.value = row
  showDetailDialog.value = true
}

const handleView = (row: Baseline) => {
  selectedBaseline.value = row
  showDetailDialog.value = true
}

const handleVersions = (row: Baseline) => {
  selectedBaseline.value = row
  versionHistory.value = [
    { version: '1.0.0', created_at: '2026-03-01', description: '初始版本' },
    { version: '1.0.1', created_at: '2026-03-10', description: '修复 bug' },
    { version: '1.1.0', created_at: '2026-03-20', description: '新增功能' },
  ]
  showVersionsDialog.value = true
}

const handleEdit = (row: Baseline) => {
  router.push(`/baselines-edit/${row.id}`)
}

const handleDelete = (row: Baseline) => {
  ElMessageBox.confirm(
    `确定删除基线 ${row.baseline_id} 吗？`,
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

const handleRollback = (row: any) => {
  ElMessage.success(`已回滚到版本 ${row.version}`)
  showVersionsDialog.value = false
}

onMounted(() => {
  loading.value = false
})
</script>

<style scoped>
.baselines-list {
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
