<template>
  <div class="ai-analysis">
    <div class="header">
      <h2>🤖 AI 需求分析</h2>
      <div class="model-selector">
        <el-select v-model="selectedModel" placeholder="选择模型">
          <el-option
            v-for="m in models"
            :key="m.provider + '-' + m.model"
            :label="`${m.provider}: ${m.model}`"
            :value="m.provider + '-' + m.model"
          />
        </el-select>
      </div>
    </div>

    <!-- 分析模式切换 -->
    <el-tabs v-model="activeTab" class="mode-tabs">
      <el-tab-pane label="📝 完整分析" name="full">
        <div class="analyze-form">
          <el-input
            v-model="requirementId"
            placeholder="需求 ID (如 BR-2025-Q1-001)"
            class="req-id-input"
          />
          <el-input
            v-model="requirementContent"
            type="textarea"
            :rows="8"
            placeholder="输入需求内容..."
          />
          <el-button type="primary" @click="runAnalysis" :loading="loading">
            开始分析
          </el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="🎯 提取功能点" name="features">
        <div class="analyze-form">
          <el-input
            v-model="requirementContent"
            type="textarea"
            :rows="8"
            placeholder="输入需求文档，提取功能点..."
          />
          <el-button type="success" @click="extractFeatures" :loading="loading">
            提取功能点
          </el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="⚠️ 风险分析" name="risks">
        <div class="analyze-form">
          <el-input
            v-model="requirementId"
            placeholder="需求 ID"
            class="req-id-input"
          />
          <el-input
            v-model="requirementContent"
            type="textarea"
            :rows="6"
            placeholder="输入需求内容，分析风险..."
          />
          <el-button type="warning" @click="analyzeRisks" :loading="loading">
            风险分析
          </el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="💡 代码建议" name="code">
        <div class="analyze-form">
          <el-input
            v-model="requirementContent"
            type="textarea"
            :rows="6"
            placeholder="输入需求，生成代码建议..."
          />
          <el-button type="info" @click="getCodeSuggestions" :loading="loading">
            生成代码建议
          </el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 分析结果 -->
    <div v-if="result" class="results">
      <!-- 功能点 -->
      <div v-if="result.features?.length" class="result-section">
        <h3>📋 提取的功能点 ({{ result.features.length }})</h3>
        <div class="feature-cards">
          <el-card
            v-for="f in result.features"
            :key="f.id"
            class="feature-card"
            :class="'priority-' + f.priority.toLowerCase()"
          >
            <template #header>
              <div class="feature-header">
                <span class="feature-id">{{ f.id }}</span>
                <el-tag :type="getPriorityType(f.priority)">{{ f.priority }}</el-tag>
                <el-tag v-if="f.asil_implication" :type="getAsilType(f.asil_implication)">
                  ASIL {{ f.asil_implication }}
                </el-tag>
              </div>
              <div class="feature-name">{{ f.name }}</div>
            </template>
            <div class="feature-body">
              <p class="description">{{ f.description }}</p>
              <div class="tags">
                <el-tag v-for="kw in f.keywords" :key="kw" size="small">{{ kw }}</el-tag>
              </div>
              <div v-if="f.acceptance_criteria?.length" class="acceptance">
                <strong>验收标准：</strong>
                <ul>
                  <li v-for="(ac, i) in f.acceptance_criteria" :key="i">{{ ac }}</li>
                </ul>
              </div>
              <div v-if="f.constraints?.length" class="constraints">
                <strong>约束条件：</strong>
                <span v-for="c in f.constraints" :key="c" class="constraint-tag">{{ c }}</span>
              </div>
            </div>
          </el-card>
        </div>
      </div>

      <!-- 风险 -->
      <div v-if="result.risks?.length" class="result-section">
        <h3>⚠️ 风险分析 ({{ result.risks.length }})</h3>
        <el-table :data="result.risks" stripe>
          <el-table-column prop="type" label="类型" width="120">
            <template #default="{ row }">
              <el-tag :type="getRiskType(row.type)">{{ row.type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" />
          <el-table-column prop="severity" label="严重度" width="100">
            <template #default="{ row }">
              <el-tag :type="getSeverityType(row.severity)">{{ row.severity }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="mitigation" label="缓解措施" />
        </el-table>
      </div>

      <!-- 洞察 -->
      <div v-if="result.insights" class="result-section">
        <h3>🔍 需求洞察</h3>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="概述">{{ result.insights.summary }}</el-descriptions-item>
          <el-descriptions-item label="关键实体">
            <el-tag v-for="e in result.insights.key_entities" :key="e" size="small">{{ e }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="质量属性">
            <el-tag v-for="q in result.insights.quality_attributes" :key="q" type="success" size="small">{{ q }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="潜在风险">
            <el-tag v-for="r in result.insights.potential_risks" :key="r" type="warning" size="small">{{ r }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
        
        <div v-if="result.insights.suggestions?.length" class="suggestions">
          <h4>💡 改进建议</h4>
          <ul>
            <li v-for="(s, i) in result.insights.suggestions" :key="i">{{ s }}</li>
          </ul>
        </div>

        <div v-if="result.insights.test_scenarios?.length" class="test-scenarios">
          <h4>🧪 测试场景</h4>
          <ul>
            <li v-for="(t, i) in result.insights.test_scenarios" :key="i">{{ t }}</li>
          </ul>
        </div>
      </div>

      <!-- 代码建议 -->
      <div v-if="result.code_suggestions" class="result-section">
        <h3>💻 代码建议</h3>
        <div v-if="result.code_suggestions.suggested_classes?.length" class="code-section">
          <h4>建议的类结构</h4>
          <div v-for="cls in result.code_suggestions.suggested_classes" :key="cls.name" class="code-class">
            <div class="class-name">class {{ cls.name }}</div>
            <div class="class-desc">{{ cls.responsibility }}</div>
            <div class="class-methods">
              <code v-for="m in cls.methods" :key="m">{{ m }}()</code>
            </div>
          </div>
        </div>
        <div v-if="result.code_suggestions.test_cases?.length" class="test-section">
          <h4>测试用例建议</h4>
          <ul>
            <li v-for="(t, i) in result.code_suggestions.test_cases" :key="i">{{ t }}</li>
          </ul>
        </div>
      </div>

      <!-- 对齐 -->
      <div v-if="result.alignments?.length" class="result-section">
        <h3>🔗 功能点对齐</h3>
        <el-table :data="result.alignments" stripe>
          <el-table-column prop="feature_id" label="功能点" width="140" />
          <el-table-column prop="code_element" label="代码元素" />
          <el-table-column prop="similarity" label="相似度" width="100">
            <template #default="{ row }">
              <el-progress :percentage="Math.round(row.similarity * 100)" 
                :color="getSimilarityColor(row.similarity)" />
            </template>
          </el-table-column>
          <el-table-column prop="match_type" label="匹配类型" width="100">
            <template #default="{ row }">
              <el-tag :type="getMatchType(row.match_type)">{{ row.match_type }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 汇总 -->
      <div v-if="result.summary" class="result-section summary">
        <h3>📊 分析汇总</h3>
        <el-row :gutter="20">
          <el-col :span="6">
            <el-statistic title="功能点数量" :value="result.summary.feature_count" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="风险数量" :value="result.summary.risk_count" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="对齐数量" :value="result.summary.alignment_count" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="高优先级" :value="result.summary.high_priority_count" />
          </el-col>
        </el-row>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { analyzeRequirement, extractFeatures, analyzeRisks, getCodeSuggestions, getModels } from '@/api/client'

const activeTab = ref('full')
const requirementId = ref('')
const requirementContent = ref('')
const loading = ref(false)
const result = ref<any>(null)
const selectedModel = ref('')
const models = ref<any[]>([])

onMounted(async () => {
  try {
    const res = await getModels()
    models.value = res.models || []
    if (models.value.length) {
      selectedModel.value = models.value[0].provider + '-' + models.value[0].model
    }
  } catch (e) {
    console.error('Failed to load models', e)
  }
})

async function runAnalysis() {
  if (!requirementId.value || !requirementContent.value) {
    ElMessage.warning('请输入需求 ID 和内容')
    return
  }
  loading.value = true
  result.value = null
  try {
    const res = await analyzeRequirement({
      requirement_id: requirementId.value,
      content: requirementContent.value,
    })
    result.value = res.data
  } catch (e: any) {
    ElMessage.error(e.message || '分析失败')
  } finally {
    loading.value = false
  }
}

async function extractFeatures() {
  if (!requirementContent.value) {
    ElMessage.warning('请输入需求内容')
    return
  }
  loading.value = true
  result.value = null
  try {
    const res = await extractFeatures(requirementContent.value)
    result.value = { features: res.features }
  } catch (e: any) {
    ElMessage.error(e.message || '提取失败')
  } finally {
    loading.value = false
  }
}

async function analyzeRisks() {
  if (!requirementId.value || !requirementContent.value) {
    ElMessage.warning('请输入需求 ID 和内容')
    return
  }
  loading.value = true
  result.value = null
  try {
    const res = await analyzeRisks(requirementId.value, requirementContent.value)
    result.value = { risks: res.risks }
  } catch (e: any) {
    ElMessage.error(e.message || '分析失败')
  } finally {
    loading.value = false
  }
}

async function getCodeSuggestions() {
  if (!requirementContent.value) {
    ElMessage.warning('请输入需求内容')
    return
  }
  loading.value = true
  result.value = null
  try {
    const res = await getCodeSuggestionsApi(requirementContent.value)
    result.value = { code_suggestions: res.suggestions }
  } catch (e: any) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    loading.value = false
  }
}

function getPriorityType(p: string) {
  return p === 'P0' ? 'danger' : p === 'P1' ? 'warning' : 'info'
}
function getAsilType(a: string) {
  return a === 'A' ? 'success' : a === 'B' ? 'warning' : a === 'C' || a === 'D' ? 'danger' : 'info'
}
function getRiskType(t: string) {
  return t === 'SAFETY' ? 'danger' : t === 'TECHNICAL' ? 'warning' : 'info'
}
function getSeverityType(s: string) {
  return s === 'HIGH' ? 'danger' : s === 'MEDIUM' ? 'warning' : 'info'
}
function getSimilarityColor(s: number) {
  return s >= 0.85 ? '#67C23A' : s >= 0.65 ? '#E6A23C' : '#909399'
}
function getMatchType(m: string) {
  return m === 'EXACT' ? 'success' : m === 'PARTIAL' ? 'warning' : 'info'
}
</script>

<style scoped>
.ai-analysis {
  padding: 20px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.header h2 {
  margin: 0;
}
.mode-tabs {
  margin-bottom: 20px;
}
.analyze-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.req-id-input {
  max-width: 300px;
}
.results {
  margin-top: 30px;
}
.result-section {
  margin-bottom: 30px;
  padding: 20px;
  background: #fff;
  border-radius: 8px;
}
.result-section h3 {
  margin-bottom: 15px;
  color: #303133;
}
.feature-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 15px;
}
.feature-card {
  margin-bottom: 0;
}
.feature-card.priority-p0 {
  border-left: 4px solid #F56C6C;
}
.feature-card.priority-p1 {
  border-left: 4px solid #E6A23C;
}
.feature-header {
  display: flex;
  gap: 8px;
  align-items: center;
}
.feature-id {
  font-weight: bold;
  color: #409EFF;
}
.feature-name {
  font-size: 16px;
  font-weight: bold;
  margin-top: 5px;
}
.feature-body .description {
  color: #606266;
  margin-bottom: 10px;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}
.acceptance ul, .test-scenarios ul, .suggestions ul {
  padding-left: 20px;
}
.acceptance li, .test-scenarios li, .suggestions li {
  color: #606266;
}
.constraint-tag {
  background: #f0f9eb;
  color: #67C23A;
  padding: 2px 8px;
  border-radius: 4px;
  margin-right: 5px;
  font-size: 12px;
}
.code-class {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 10px;
}
.class-name {
  font-weight: bold;
  color: #409EFF;
  font-family: monospace;
}
.class-desc {
  color: #606266;
  margin: 5px 0;
}
.class-methods {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.class-methods code {
  background: #e6f0fa;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.summary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}
.summary h3 {
  color: white;
}
</style>
