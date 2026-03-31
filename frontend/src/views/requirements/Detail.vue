<template>
  <div class="requirement-detail">
    <!-- 顶部操作栏 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="header-left">
          <el-button @click="goBack" text>
            <el-icon><ArrowLeft /></el-icon>
            返回
          </el-button>
          <el-divider direction="vertical" />
          <span class="req-id">{{ requirement?.req_id || '加载中...' }}</span>
          <el-tag :type="getStatusType(requirement?.status)" size="large">
            {{ getStatusText(requirement?.status) }}
          </el-tag>
        </div>
        <div class="header-right">
          <el-button type="primary" @click="handleEdit">
            <el-icon><Edit /></el-icon>
            编辑需求
          </el-button>
          <el-button @click="handleValidate" :loading="validating">
            <el-icon><Check /></el-icon>
            重新校验
          </el-button>
          <el-button type="success" @click="handleAnalyze">
            <el-icon><DataAnalysis /></el-icon>
            分析
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 主内容区 -->
    <el-row :gutter="20" class="content-row">
      <!-- 左侧：基本信息 -->
      <el-col :xs="24" :md="14">
        <el-card class="info-card">
          <template #header>
            <span class="card-title">需求信息</span>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="需求ID">{{ requirement?.req_id }}</el-descriptions-item>
            <el-descriptions-item label="标题">{{ requirement?.title }}</el-descriptions-item>
            <el-descriptions-item label="类型">
              <el-tag :type="requirement?.req_type === 'BUSINESS' ? 'success' : requirement?.req_type === 'SYMBOLIC' ? 'warning' : 'info'">
                {{ getTypeText(requirement?.req_type) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="优先级">
              <el-tag :type="getPriorityType(requirement?.priority)">{{ requirement?.priority }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="模块">{{ requirement?.module }}</el-descriptions-item>
            <el-descriptions-item label="ASIL">{{ requirement?.asil || '-' }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ requirement?.created_at }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ requirement?.updated_at }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- 需求内容 -->
        <el-card class="content-card">
          <template #header>
            <span class="card-title">需求内容</span>
          </template>
          <div class="content-box">
            <pre>{{ requirement?.content || '暂无内容' }}</pre>
          </div>
        </el-card>

        <!-- 符号条件 -->
        <el-card v-if="requirement?.conditions || symbolicConditions.length" class="conditions-card">
          <template #header>
            <span class="card-title">符号条件</span>
          </template>
          <el-table :data="symbolicConditions" stripe>
            <el-table-column prop="variable" label="变量" width="120" />
            <el-table-column prop="operator" label="操作符" width="80" />
            <el-table-column prop="value" label="值">
              <template #default="{ row }">
                {{ row.value }}{{ row.unit ? ' ' + row.unit : '' }}
              </template>
            </el-table-column>
            <el-table-column prop="value_type" label="类型" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ row.value_type }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <!-- 右侧：校验结果 -->
      <el-col :xs="24" :md="10">
        <!-- 校验摘要 -->
        <el-card class="summary-card">
          <template #header>
            <span class="card-title">校验摘要</span>
          </template>
          <div class="summary-stats">
            <div class="stat-item" :class="{ error: validationReport?.summary?.error_count > 0 }">
              <el-icon><WarningFilled /></el-icon>
              <span class="stat-value">{{ validationReport?.summary?.error_count || 0 }}</span>
              <span class="stat-label">错误</span>
            </div>
            <div class="stat-item" :class="{ warning: validationReport?.summary?.warning_count > 0 }">
              <el-icon><Warning /></el-icon>
              <span class="stat-value">{{ validationReport?.summary?.warning_count || 0 }}</span>
              <span class="stat-label">警告</span>
            </div>
            <div class="stat-item">
              <el-icon><InfoFilled /></el-icon>
              <span class="stat-value">{{ validationReport?.summary?.info_count || 0 }}</span>
              <span class="stat-label">提示</span>
            </div>
          </div>
          <div class="validation-status">
            <el-tag :type="validationReport?.is_valid ? 'success' : 'danger'" size="large">
              {{ validationReport?.is_valid ? '校验通过' : '校验未通过' }}
            </el-tag>
          </div>
        </el-card>

        <!-- 校验详情 -->
        <el-card class="results-card">
          <template #header>
            <span class="card-title">校验详情</span>
          </template>
          <div v-if="validationReport?.results?.length" class="validation-results">
            <div
              v-for="(result, index) in validationReport.results"
              :key="index"
              class="result-item"
              :class="result.level"
            >
              <div class="result-header">
                <el-icon v-if="result.level === 'error'" color="#f56c6c"><CircleCloseFilled /></el-icon>
                <el-icon v-else-if="result.level === 'warning'" color="#e6a23c"><WarningFilled /></el-icon>
                <el-icon v-else color="#409eff"><InfoFilled /></el-icon>
                <span class="result-field">{{ result.field }}</span>
              </div>
              <div class="result-message">{{ result.message }}</div>
              <div v-if="result.suggestion" class="result-suggestion">
                <el-icon><QuestionFilled /></el-icon>
                {{ result.suggestion }}
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无校验结果" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft, Edit, Check, DataAnalysis,
  WarningFilled, Warning, InfoFilled,
  CircleCloseFilled, QuestionFilled
} from '@element-plus/icons-vue'
import { useAppStore } from '../../stores/app'
import apiClient from '../../api/client'
import type { Requirement, RequirementValidationReport, SymbolicCondition } from '../../types'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const requirement = ref<Requirement | null>(null)
const validationReport = ref<RequirementValidationReport | null>(null)
const symbolicConditions = ref<SymbolicCondition[]>([])
const validating = ref(false)

const reqId = computed(() => route.params.id as string)

const getStatusType = (status?: string) => {
  const types: Record<string, string> = {
    pending: 'info',
    confirmed: 'warning',
    in_progress: 'primary',
    completed: 'success',
    rejected: 'danger',
  }
  return types[status || ''] || 'info'
}

const getStatusText = (status?: string) => {
  const texts: Record<string, string> = {
    pending: '待确认',
    confirmed: '已确认',
    in_progress: '进行中',
    completed: '已完成',
    rejected: '已驳回',
  }
  return texts[status || ''] || status
}

const getTypeText = (type?: string) => {
  const texts: Record<string, string> = {
    BUSINESS: '业务需求',
    TECHNICAL: '技术需求',
    SYMBOLIC: '符号需求',
  }
  return texts[type || ''] || type
}

const getPriorityType = (priority?: string) => {
  const types: Record<string, string> = {
    P0: 'danger',
    P1: 'warning',
    P2: 'info',
  }
  return types[priority || ''] || 'info'
}

const goBack = () => {
  router.back()
}

const handleEdit = () => {
  router.push(`/requirements-edit/${reqId.value}`)
}

const handleValidate = async () => {
  if (!requirement.value) return
  
  validating.value = true
  try {
    const result = await apiClient.client.post('/requirements/validate', {
      id: requirement.value.req_id,
      title: requirement.value.title,
      content: requirement.value.content,
      module: requirement.value.module,
      priority: requirement.value.priority,
      asil: requirement.value.asil,
      req_type: requirement.value.req_type,
      conditions: requirement.value.conditions,
    })
    validationReport.value = result as RequirementValidationReport
    
    // 解析符号条件
    if (result.symbolic_conditions) {
      symbolicConditions.value = result.symbolic_conditions
    }
    
    ElMessage.success(validationReport.value.is_valid ? '校验通过' : '校验未通过')
  } catch (error) {
    ElMessage.error('校验失败')
  } finally {
    validating.value = false
  }
}

const handleAnalyze = async () => {
  if (!requirement.value) return
  
  try {
    await appStore.analyzeRequirement(requirement.value.id)
    ElMessage.success('分析已启动')
    router.push('/analysis-history')
  } catch (error) {
    ElMessage.error('分析启动失败')
  }
}

const loadRequirement = async () => {
  // 先从 store 查找
  const found = appStore.requirements.find(r => r.id === reqId.value || r.req_id === reqId.value)
  
  if (found) {
    requirement.value = found
  } else {
    // 模拟数据（实际应从 API 获取）
    requirement.value = {
      id: reqId.value,
      req_id: reqId.value,
      title: '示例需求',
      description: '这是一个示例需求',
      content: '## 功能描述\n\n实现车辆速度控制功能。\n\n## 验收标准\n\n1. 速度控制精度 ±1km/h\n2. 响应时间 < 100ms',
      format: 'markdown',
      req_type: 'BUSINESS',
      priority: 'P1',
      module: '动力控制',
      asil: 'B',
      status: 'pending',
      conditions: 'carSpeed=100km/h, geer=D',
      created_at: '2026-03-30 10:00:00',
      updated_at: '2026-03-30 12:00:00',
    } as any
  }
  
  // 解析符号条件
  if (requirement.value.conditions) {
    try {
      const result = await apiClient.client.post('/requirements/parse-symbolic', {
        id: requirement.value.req_id,
        title: requirement.value.title,
        conditions: requirement.value.conditions,
      })
      symbolicConditions.value = result.conditions || []
    } catch (error) {
      console.error('解析符号条件失败', error)
    }
  }
}

onMounted(async () => {
  await loadRequirement()
  await handleValidate()
})
</script>

<style scoped>
.requirement-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.header-card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.req-id {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.header-right {
  display: flex;
  gap: 10px;
}

.content-row {
  flex: 1;
}

.info-card, .content-card, .conditions-card, .summary-card, .results-card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  margin-bottom: 20px;
}

.card-title {
  font-weight: bold;
  color: #333;
}

.content-box {
  background: #f5f7fa;
  border-radius: 4px;
  padding: 15px;
  max-height: 400px;
  overflow-y: auto;
}

.content-box pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.summary-stats {
  display: flex;
  justify-content: space-around;
  padding: 20px 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #333;
}

.stat-label {
  font-size: 12px;
  color: #999;
}

.stat-item.error .stat-value {
  color: #f56c6c;
}

.stat-item.warning .stat-value {
  color: #e6a23c;
}

.validation-status {
  text-align: center;
  padding: 10px 0;
  border-top: 1px solid #eee;
}

.validation-results {
  max-height: 500px;
  overflow-y: auto;
}

.result-item {
  padding: 12px;
  margin-bottom: 10px;
  border-radius: 4px;
  background: #f5f7fa;
}

.result-item.error {
  background: #fef0f0;
  border-left: 3px solid #f56c6c;
}

.result-item.warning {
  background: #fdf6ec;
  border-left: 3px solid #e6a23c;
}

.result-item.info {
  background: #ecf5ff;
  border-left: 3px solid #409eff;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.result-field {
  font-weight: bold;
  color: #333;
}

.result-message {
  font-size: 13px;
  color: #666;
  margin-bottom: 5px;
}

.result-suggestion {
  font-size: 12px;
  color: #999;
  display: flex;
  align-items: center;
  gap: 5px;
}
</style>
