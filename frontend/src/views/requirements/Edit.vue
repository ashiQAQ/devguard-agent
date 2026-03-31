<template>
  <div class="requirements-edit">
    <el-card class="form-card">
      <template #header>
        <div class="card-header">
          <span>编辑需求 - {{ formData.req_id }}</span>
          <el-tag :type="formData.req_type === 'BUSINESS' ? 'success' : formData.req_type === 'SYMBOLIC' ? 'warning' : 'info'">
            {{ getTypeText(formData.req_type) }}
          </el-tag>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-width="120px"
        @submit.prevent="handleSubmit"
      >
        <!-- 基本信息 -->
        <el-form-item label="需求 ID" prop="req_id">
          <el-input v-model="formData.req_id" placeholder="例如: REQ-2025-Q1-001" disabled />
        </el-form-item>

        <el-form-item label="需求标题" prop="title">
          <el-input v-model="formData.title" placeholder="输入需求标题" />
        </el-form-item>

        <el-form-item label="需求类型" prop="req_type">
          <el-select v-model="formData.req_type" placeholder="选择需求类型" @change="handleTypeChange">
            <el-option label="业务需求" value="BUSINESS" />
            <el-option label="技术需求" value="TECHNICAL" />
            <el-option label="符号需求" value="SYMBOLIC" />
          </el-select>
        </el-form-item>

        <el-form-item label="优先级" prop="priority">
          <el-select v-model="formData.priority" placeholder="选择优先级">
            <el-option label="P0 - 紧急" value="P0" />
            <el-option label="P1 - 高" value="P1" />
            <el-option label="P2 - 中" value="P2" />
          </el-select>
        </el-form-item>

        <el-form-item label="模块" prop="module">
          <el-input v-model="formData.module" placeholder="输入模块名称" />
        </el-form-item>

        <el-form-item label="ASIL 等级" prop="asil">
          <el-select v-model="formData.asil" placeholder="选择 ASIL 等级">
            <el-option label="QM" value="QM" />
            <el-option label="ASIL A" value="A" />
            <el-option label="ASIL B" value="B" />
            <el-option label="ASIL C" value="C" />
            <el-option label="ASIL D" value="D" />
          </el-select>
        </el-form-item>

        <!-- 技术需求时段 -->
        <el-form-item v-if="formData.req_type === 'TECHNICAL'" label="实现时段" prop="phase">
          <el-select v-model="formData.phase" placeholder="选择实现时段">
            <el-option label="编译前（代码规范）" value="PRE_COMPILE" />
            <el-option label="编译时（C++17/编译器）" value="COMPILE_TIME" />
            <el-option label="代码逻辑（接口/线程安全）" value="CODE_LOGIC" />
            <el-option label="业务信号对齐（CAN/ROS）" value="SIGNAL_ALIGN" />
            <el-option label="运行时性能（延迟/内存/CPU）" value="RUNTIME_PERF" />
          </el-select>
        </el-form-item>

        <!-- 需求描述 -->
        <el-form-item label="需求描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            rows="3"
            placeholder="输入需求描述"
          />
        </el-form-item>

        <!-- 需求内容 -->
        <el-form-item label="需求内容" prop="content">
          <el-input
            v-model="formData.content"
            type="textarea"
            rows="8"
            placeholder="输入完整的需求内容（支持 Markdown）"
          />
        </el-form-item>

        <!-- 符号条件（仅符号需求显示） -->
        <el-form-item v-if="formData.req_type === 'SYMBOLIC'" label="符号条件" prop="conditions">
          <el-input
            v-model="formData.conditions"
            type="textarea"
            rows="3"
            placeholder="输入符号条件，例如: carSpeed=100km/h, geer=D, throttle>=50%"
            @input="handleConditionsChange"
          />
          <div class="conditions-hint">
            <el-icon><InfoFilled /></el-icon>
            格式：变量=值 或 变量>=值，多个条件用逗号或分号分隔
          </div>
        </el-form-item>

        <!-- 符号条件解析预览 -->
        <el-form-item v-if="formData.req_type === 'SYMBOLIC' && parsedConditions.length" label="条件预览">
          <el-table :data="parsedConditions" size="small" stripe>
            <el-table-column prop="variable" label="变量" width="120" />
            <el-table-column prop="operator" label="操作符" width="80" />
            <el-table-column prop="value" label="值">
              <template #default="{ row }">
                {{ row.value }}{{ row.unit ? ' ' + row.unit : '' }}
              </template>
            </el-table-column>
            <el-table-column prop="value_type" label="类型" width="80">
              <template #default="{ row }">
                <el-tag size="small">{{ row.value_type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row._valid ? 'success' : 'danger'" size="small">
                  {{ row._valid ? '有效' : '无效' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-form-item>

        <!-- 内容格式 -->
        <el-form-item label="内容格式" prop="format">
          <el-select v-model="formData.format" placeholder="选择内容格式">
            <el-option label="Markdown" value="markdown" />
            <el-option label="JSON" value="json" />
            <el-option label="YAML" value="yaml" />
          </el-select>
        </el-form-item>

        <!-- 操作按钮 -->
        <el-form-item>
          <el-button type="primary" @click="handleSubmit" :loading="loading">
            <el-icon><Check /></el-icon>
            保存修改
          </el-button>
          <el-button @click="handleValidate" :loading="validating">
            <el-icon><Warning /></el-icon>
            预览并校验
          </el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button @click="goBack">返回</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 校验结果对话框 -->
    <el-dialog v-model="showValidationDialog" title="校验结果" width="600px">
      <div v-if="validationReport" class="validation-dialog-content">
        <div class="validation-summary">
          <el-tag :type="validationReport.is_valid ? 'success' : 'danger'" size="large">
            {{ validationReport.is_valid ? '校验通过' : '校验未通过' }}
          </el-tag>
          <span class="summary-text">
            共 {{ validationReport.summary.total_checks }} 项检查，
            {{ validationReport.summary.error_count }} 个错误，
            {{ validationReport.summary.warning_count }} 个警告
          </span>
        </div>

        <el-divider />

        <div class="validation-results">
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
            <div v-if="result.suggestion" class="result-suggestion">{{ result.suggestion }}</div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showValidationDialog = false">关闭</el-button>
        <el-button v-if="validationReport?.is_valid" type="primary" @click="handleConfirmSave">
          确认保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, FormInstance } from 'element-plus'
import {
  Check, Warning, InfoFilled, CircleCloseFilled, WarningFilled
} from '@element-plus/icons-vue'
import { useAppStore } from '../../stores/app'
import apiClient from '../../api/client'
import type { RequirementValidationReport, SymbolicCondition } from '../../types'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const validating = ref(false)
const showValidationDialog = ref(false)
const validationReport = ref<RequirementValidationReport | null>(null)
const parsedConditions = ref<any[]>([])

const reqId = computed(() => route.params.id as string)

const formData = reactive({
  req_id: '',
  title: '',
  description: '',
  content: '',
  format: 'markdown',
  req_type: 'BUSINESS',
  priority: 'P1',
  module: '',
  asil: '',
  phase: '',
  conditions: '',
})

const rules = {
  req_id: [{ required: true, message: '请输入需求 ID', trigger: 'blur' }],
  title: [{ required: true, message: '请输入需求标题', trigger: 'blur' }],
  module: [{ required: true, message: '请输入模块名称', trigger: 'blur' }],
}

const getTypeText = (type: string) => {
  const texts: Record<string, string> = {
    BUSINESS: '业务需求',
    TECHNICAL: '技术需求',
    SYMBOLIC: '符号需求',
  }
  return texts[type] || type
}

const handleTypeChange = () => {
  // 切换类型时清空相关字段
  if (formData.req_type !== 'TECHNICAL') {
    formData.phase = ''
  }
  if (formData.req_type !== 'SYMBOLIC') {
    formData.conditions = ''
    parsedConditions.value = []
  }
}

const handleConditionsChange = async () => {
  if (!formData.conditions) {
    parsedConditions.value = []
    return
  }

  try {
    const result = await apiClient.client.post('/requirements/parse-symbolic', {
      id: formData.req_id,
      title: formData.title,
      conditions: formData.conditions,
    })
    
    parsedConditions.value = (result.conditions || []).map((c: any, i: number) => ({
      ...c,
      _valid: result.validation_results?.[i]?.is_valid ?? true,
    }))
  } catch (error) {
    console.error('解析符号条件失败', error)
  }
}

const handleValidate = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    validating.value = true
    try {
      const result = await apiClient.client.post('/requirements/validate', {
        id: formData.req_id,
        title: formData.title,
        content: formData.content,
        description: formData.description,
        module: formData.module,
        priority: formData.priority,
        asil: formData.asil,
        req_type: formData.req_type,
        phase: formData.phase,
        conditions: formData.conditions,
        format: formData.format,
      })
      
      validationReport.value = result as RequirementValidationReport
      showValidationDialog.value = true
    } catch (error) {
      ElMessage.error('校验失败')
    } finally {
      validating.value = false
    }
  })
}

const handleSubmit = async () => {
  // 先校验
  await handleValidate()
  
  // 如果校验不通过，不提交
  if (!validationReport.value?.is_valid) {
    ElMessage.warning('校验未通过，请修正后再保存')
    return
  }
}

const handleConfirmSave = async () => {
  loading.value = true
  try {
    await apiClient.requirements.update(formData.req_id, formData)
    ElMessage.success('需求已更新')
    showValidationDialog.value = false
    router.push(`/requirements-detail/${formData.req_id}`)
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    loading.value = false
  }
}

const handleReset = () => {
  loadRequirement()
}

const goBack = () => {
  router.back()
}

const loadRequirement = async () => {
  // 先从 store 查找
  const found = appStore.requirements.find(r => r.id === reqId.value || r.req_id === reqId.value)
  
  if (found) {
    Object.assign(formData, {
      req_id: found.req_id,
      title: found.title,
      description: found.description || '',
      content: found.content,
      format: found.format,
      req_type: found.req_type,
      priority: found.priority,
      module: found.module,
      asil: found.asil || '',
      phase: (found as any).phase || '',
      conditions: (found as any).conditions || '',
    })
  } else {
    // 模拟数据
    Object.assign(formData, {
      req_id: reqId.value,
      title: '示例需求',
      description: '这是一个示例需求描述',
      content: '## 功能描述\n\n实现车辆速度控制功能。\n\n## 验收标准\n\n1. 速度控制精度 ±1km/h\n2. 响应时间 < 100ms',
      format: 'markdown',
      req_type: 'BUSINESS',
      priority: 'P1',
      module: '动力控制',
      asil: 'B',
      phase: '',
      conditions: '',
    })
  }

  // 如果有符号条件，解析
  if (formData.conditions) {
    await handleConditionsChange()
  }
}

onMounted(async () => {
  await loadRequirement()
})
</script>

<style scoped>
.requirements-edit {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.conditions-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
  font-size: 12px;
  color: #999;
}

.validation-dialog-content {
  padding: 10px 0;
}

.validation-summary {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 15px;
}

.summary-text {
  font-size: 14px;
  color: #666;
}

.validation-results {
  max-height: 400px;
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
}
</style>
