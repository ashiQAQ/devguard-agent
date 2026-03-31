<template>
  <div class="pr-analysis">
    <!-- 输入表单 -->
    <el-card class="form-card">
      <template #header>
        <div class="card-header">
          <span>PR 分析</span>
        </div>
      </template>

      <el-form :model="formData" label-width="120px">
        <el-form-item label="PR 号">
          <el-input-number v-model="formData.pr_number" :min="1" />
        </el-form-item>

        <el-form-item label="PR 标题">
          <el-input v-model="formData.title" placeholder="输入 PR 标题" />
        </el-form-item>

        <el-form-item label="PR 描述">
          <el-input
            v-model="formData.description"
            type="textarea"
            rows="4"
            placeholder="输入 PR 描述"
          />
        </el-form-item>

        <el-form-item label="作者">
          <el-input v-model="formData.author" placeholder="输入作者名称" />
        </el-form-item>

        <el-form-item label="分支">
          <el-input v-model="formData.branch" placeholder="输入分支名称" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleAnalyze" :loading="appStore.loading">
            <el-icon><Search /></el-icon>
            开始分析
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 分析结果 -->
    <el-card v-if="analysisResult" class="result-card">
      <template #header>
        <div class="card-header">
          <span>分析结果</span>
          <el-tag :type="analysisResult.can_merge ? 'success' : 'danger'">
            {{ analysisResult.can_merge ? '可合并' : '不可合并' }}
          </el-tag>
        </div>
      </template>

      <!-- Commit 校验结果 -->
      <h4>Commit 语义对齐校验</h4>
      <el-table :data="analysisResult.commit_validations" stripe style="width: 100%; margin-bottom: 20px">
        <el-table-column prop="commit_sha" label="Commit SHA" width="150" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getValidationStatusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="semantic_match_score" label="语义匹配度" width="120">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.round(row.semantic_match_score * 100)"
              :color="getScoreColor(row.semantic_match_score)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="matched_keywords" label="匹配关键字" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-for="keyword in row.matched_keywords" :key="keyword" size="small">
              {{ keyword }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <!-- 代码变更分析 -->
      <h4>代码变更分析</h4>
      <el-descriptions :column="2" border style="margin-bottom: 20px">
        <el-descriptions-item label="变更文件数">
          {{ analysisResult.changed_files }}
        </el-descriptions-item>
        <el-descriptions-item label="新增行数">
          {{ analysisResult.additions }}
        </el-descriptions-item>
        <el-descriptions-item label="删除行数">
          {{ analysisResult.deletions }}
        </el-descriptions-item>
        <el-descriptions-item label="总变更行数">
          {{ analysisResult.additions + analysisResult.deletions }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- 需求追溯 -->
      <h4>需求追溯</h4>
      <el-table :data="analysisResult.traced_requirements" stripe style="width: 100%; margin-bottom: 20px">
        <el-table-column prop="req_id" label="需求 ID" />
        <el-table-column prop="title" label="需求标题" show-overflow-tooltip />
        <el-table-column prop="alignment_score" label="对齐度" width="100">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.round(row.alignment_score * 100)"
              :color="getScoreColor(row.alignment_score)"
            />
          </template>
        </el-table-column>
      </el-table>

      <!-- 需求负责人确认 -->
      <h4>需求负责人确认</h4>
      <el-table :data="analysisResult.confirmations" stripe style="width: 100%; margin-bottom: 20px">
        <el-table-column prop="owner" label="负责人" />
        <el-table-column prop="status" label="确认状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getConfirmationStatusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="comment" label="备注" show-overflow-tooltip />
      </el-table>

      <!-- 合入建议 -->
      <el-alert
        :title="analysisResult.can_merge ? '可以合并' : '不能合并'"
        :type="analysisResult.can_merge ? 'success' : 'error'"
        :description="analysisResult.merge_suggestion"
        show-icon
        closable
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useAppStore } from '../../stores/app'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import apiClient from '../../api/client'

const appStore = useAppStore()

const formData = reactive({
  pr_number: 0,
  title: '',
  description: '',
  author: '',
  branch: '',
})

const analysisResult = ref<any>(null)

const getValidationStatusType = (status: string) => {
  const types: Record<string, string> = {
    PASS: 'success',
    WARNING: 'warning',
    BLOCKED: 'danger',
  }
  return types[status] || 'info'
}

const getScoreColor = (score: number) => {
  if (score >= 0.8) return '#67c23a'
  if (score >= 0.6) return '#e6a23c'
  return '#f56c6c'
}

const getConfirmationStatusType = (status: string) => {
  const types: Record<string, string> = {
    APPROVE: 'success',
    CONDITIONAL: 'warning',
    REJECT: 'danger',
    PENDING: 'info',
  }
  return types[status] || 'info'
}

const handleAnalyze = async () => {
  if (!formData.pr_number) {
    ElMessage.error('请输入 PR 号')
    return
  }

  try {
    const result = await apiClient.analysis.pr(formData)
    analysisResult.value = result
    ElMessage.success('分析完成')
  } catch (error) {
    ElMessage.error('分析失败')
  }
}

const handleReset = () => {
  formData.pr_number = 0
  formData.title = ''
  formData.description = ''
  formData.author = ''
  formData.branch = ''
  analysisResult.value = null
}
</script>

<style scoped>
.pr-analysis {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-card,
.result-card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h4 {
  margin: 20px 0 10px 0;
  font-size: 14px;
  font-weight: bold;
  color: #333;
}
</style>
