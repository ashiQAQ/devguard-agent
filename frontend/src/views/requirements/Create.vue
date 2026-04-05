<template>
  <div class="requirements-create">
    <el-card class="form-card">
      <template #header>
        <div class="card-header">
          <span>创建需求</span>
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
          <el-input v-model="formData.req_id" placeholder="例如: REQ-2025-Q1-001" />
        </el-form-item>

        <el-form-item label="需求标题" prop="title">
          <el-input v-model="formData.title" placeholder="输入需求标题" />
        </el-form-item>

        <el-form-item label="需求类型" prop="req_type">
          <el-select v-model="formData.req_type" placeholder="选择需求类型">
            <el-option label="业务需求" value="BUSINESS" />
            <el-option label="技术需求" value="TECHNICAL" />
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
            <el-option label="ASIL A" value="A" />
            <el-option label="ASIL B" value="B" />
            <el-option label="ASIL C" value="C" />
            <el-option label="ASIL D" value="D" />
          </el-select>
        </el-form-item>

        <!-- 需求内容 -->
        <el-form-item label="需求描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            rows="4"
            placeholder="输入需求描述"
          />
        </el-form-item>

        <el-form-item label="需求内容" prop="content">
          <el-input
            v-model="formData.content"
            type="textarea"
            rows="8"
            placeholder="输入完整的需求内容（支持 Markdown）"
          />
        </el-form-item>

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
            <el-icon><Plus /></el-icon>
            创建需求
          </el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button @click="goBack">返回</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 预览 -->
    <el-card v-if="showPreview" class="preview-card">
      <template #header>
        <div class="card-header">
          <span>需求预览</span>
        </div>
      </template>

      <el-descriptions :column="2" border>
        <el-descriptions-item label="需求 ID">{{ formData.req_id }}</el-descriptions-item>
        <el-descriptions-item label="标题">{{ formData.title }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ formData.req_type }}</el-descriptions-item>
        <el-descriptions-item label="优先级">{{ formData.priority }}</el-descriptions-item>
        <el-descriptions-item label="模块">{{ formData.module }}</el-descriptions-item>
        <el-descriptions-item label="ASIL">{{ formData.asil }}</el-descriptions-item>
      </el-descriptions>

      <el-divider />

      <h4>需求内容</h4>
      <div class="content-preview">{{ formData.content }}</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../../stores/app'
import { ElMessage, FormInstance } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import apiClient from '../../api/client'

const router = useRouter()
const appStore = useAppStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const showPreview = ref(false)

const formData = reactive({
  req_id: '',
  title: '',
  description: '',
  content: '',
  format: 'markdown',
  req_type: 'BUSINESS',
  priority: 'P1',
  module: '',
  asil: 'B',
})

const rules = {
  req_id: [{ required: true, message: '请输入需求 ID', trigger: 'blur' }],
  title: [{ required: true, message: '请输入需求标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入需求内容', trigger: 'blur' }],
  module: [{ required: true, message: '请输入模块名称', trigger: 'blur' }],
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    loading.value = true
    try {
      const result = await apiClient.requirements.create(formData)
      ElMessage.success('需求创建成功')
      
      // 提取返回数据（含 diff 和 is_newest），存入 sessionStorage 供列表页读取
      if (result?.data) {
        sessionStorage.setItem('__last_created_req__', JSON.stringify({
          ...result.data,
          is_newest: true,
          diff: result.diff || null,
          created_seq: Date.now(),
        }))
      }
      
      await appStore.fetchRequirements()
      router.push('/requirements-list')
    } catch (error) {
      ElMessage.error('需求创建失败')
    } finally {
      loading.value = false
    }
  })
}

const handleReset = () => {
  formRef.value?.resetFields()
  showPreview.value = false
}

const goBack = () => {
  router.back()
}
</script>

<style scoped>
.requirements-create {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-card,
.preview-card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.content-preview {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

h4 {
  margin: 20px 0 10px 0;
  font-size: 14px;
  font-weight: bold;
  color: #333;
}
</style>
