<template>
  <div class="simulation-run">
    <!-- 仿真配置表单 -->
    <el-card class="form-card">
      <template #header>
        <div class="card-header">
          <span>运行仿真</span>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-width="140px"
      >
        <el-form-item label="需求 ID" prop="requirement_id">
          <el-select
            v-model="formData.requirement_id"
            placeholder="选择需求"
            filterable
          >
            <el-option
              v-for="req in appStore.requirements"
              :key="req.id"
              :label="`${req.req_id} - ${req.title}`"
              :value="req.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="仿真场景" prop="scenario_path">
          <el-select
            v-model="formData.scenario_path"
            placeholder="选择仿真场景"
          >
            <el-option label="雨天场景 (rain_heavy.bag)" value="/data/scenarios/rain_heavy.bag" />
            <el-option label="夜间场景 (night_scene.bag)" value="/data/scenarios/night_scene.bag" />
            <el-option label="高速场景 (highway.bag)" value="/data/scenarios/highway.bag" />
            <el-option label="城市场景 (urban.bag)" value="/data/scenarios/urban.bag" />
          </el-select>
        </el-form-item>

        <el-form-item label="播放速度" prop="playback_speed">
          <el-slider
            v-model="formData.playback_speed"
            :min="0.5"
            :max="2"
            :step="0.1"
            :marks="{ 0.5: '0.5x', 1: '1x', 1.5: '1.5x', 2: '2x' }"
          />
        </el-form-item>

        <el-form-item label="仿真时长 (秒)" prop="duration_sec">
          <el-input-number
            v-model="formData.duration_sec"
            :min="10"
            :max="600"
            :step="10"
          />
        </el-form-item>

        <el-form-item label="采集间隔 (ms)" prop="collect_interval_ms">
          <el-input-number
            v-model="formData.collect_interval_ms"
            :min="10"
            :max="1000"
            :step="10"
          />
        </el-form-item>

        <!-- 性能指标 -->
        <el-form-item label="性能指标">
          <el-checkbox-group v-model="selectedMetrics">
            <el-checkbox label="latency" value="latency">延迟 (ms)</el-checkbox>
            <el-checkbox label="memory" value="memory">内存 (MB)</el-checkbox>
            <el-checkbox label="cpu" value="cpu">CPU (%)</el-checkbox>
            <el-checkbox label="throughput" value="throughput">吞吐量 (fps)</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <!-- 操作按钮 -->
        <el-form-item>
          <el-button type="primary" @click="handleRun" :loading="loading">
            <el-icon><VideoPlay /></el-icon>
            开始仿真
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 仿真进度 -->
    <el-card v-if="simulationRunning" class="progress-card">
      <template #header>
        <div class="card-header">
          <span>仿真进度</span>
          <el-tag type="warning">运行中...</el-tag>
        </div>
      </template>

      <el-progress
        :percentage="simulationProgress"
        :color="getProgressColor"
        :format="(percentage) => `${percentage}%`"
      />

      <el-descriptions :column="2" border style="margin-top: 20px">
        <el-descriptions-item label="已用时间">
          {{ elapsedTime }} 秒
        </el-descriptions-item>
        <el-descriptions-item label="预计剩余时间">
          {{ remainingTime }} 秒
        </el-descriptions-item>
        <el-descriptions-item label="采集数据点">
          {{ collectedPoints }}
        </el-descriptions-item>
        <el-descriptions-item label="平均延迟">
          {{ averageLatency }} ms
        </el-descriptions-item>
      </el-descriptions>

      <el-button @click="handleCancel" type="danger" style="margin-top: 20px">
        取消仿真
      </el-button>
    </el-card>

    <!-- 仿真结果 -->
    <el-card v-if="simulationResult" class="result-card">
      <template #header>
        <div class="card-header">
          <span>仿真结果</span>
          <el-tag :type="simulationResult.passed ? 'success' : 'danger'">
            {{ simulationResult.passed ? '通过' : '失败' }}
          </el-tag>
        </div>
      </template>

      <el-table :data="simulationResult.results" stripe style="width: 100%; margin-bottom: 20px">
        <el-table-column prop="metric" label="性能指标" width="150" />
        <el-table-column prop="constraint" label="约束条件" width="150" />
        <el-table-column prop="measured" label="实测值" width="120">
          <template #default="{ row }">
            {{ row.measured }} {{ row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="passed" label="是否通过" width="100">
          <template #default="{ row }">
            <el-tag :type="row.passed ? 'success' : 'danger'">
              {{ row.passed ? '通过' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deviation" label="偏离度" width="100">
          <template #default="{ row }">
            <span :style="{ color: row.deviation > 0 ? '#f56c6c' : '#67c23a' }">
              {{ row.deviation > 0 ? '+' : '' }}{{ row.deviation.toFixed(2) }}%
            </span>
          </template>
        </el-table-column>
      </el-table>

      <el-divider />

      <h4>性能分析报告</h4>
      <div class="report-content">{{ simulationResult.report }}</div>

      <el-button type="primary" @click="handleConfirm" style="margin-top: 20px">
        确认结果
      </el-button>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useAppStore } from '../../stores/app'
import { ElMessage, FormInstance } from 'element-plus'
import { VideoPlay } from '@element-plus/icons-vue'
import apiClient from '../../api/client'

const appStore = useAppStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const simulationRunning = ref(false)
const simulationProgress = ref(0)
const elapsedTime = ref(0)
const collectedPoints = ref(0)
const averageLatency = ref(0)
const selectedMetrics = ref(['latency', 'memory', 'cpu'])
const simulationResult = ref<any>(null)

const formData = reactive({
  requirement_id: '',
  scenario_path: '',
  playback_speed: 1.0,
  duration_sec: 60,
  collect_interval_ms: 100,
})

const rules = {
  requirement_id: [{ required: true, message: '请选择需求', trigger: 'change' }],
  scenario_path: [{ required: true, message: '请选择仿真场景', trigger: 'change' }],
}

const remainingTime = computed(() => {
  return Math.max(0, formData.duration_sec - elapsedTime.value)
})

const getProgressColor = (percentage: number) => {
  if (percentage < 50) return '#409eff'
  if (percentage < 80) return '#e6a23c'
  return '#67c23a'
}

const handleRun = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    loading.value = true
    simulationRunning.value = true
    simulationProgress.value = 0
    elapsedTime.value = 0
    collectedPoints.value = 0

    try {
      // 模拟仿真进度
      const interval = setInterval(() => {
        elapsedTime.value += 1
        simulationProgress.value = Math.min(
          100,
          (elapsedTime.value / formData.duration_sec) * 100
        )
        collectedPoints.value = Math.floor(
          (elapsedTime.value * 1000) / formData.collect_interval_ms
        )
        averageLatency.value = 50 + Math.random() * 20

        if (elapsedTime.value >= formData.duration_sec) {
          clearInterval(interval)
          simulationRunning.value = false
          simulationProgress.value = 100

          // 模拟仿真结果
          simulationResult.value = {
            passed: true,
            results: [
              {
                metric: '感知延迟 P99',
                constraint: '< 80ms',
                measured: 75.3,
                unit: 'ms',
                passed: true,
                deviation: -5.875,
              },
              {
                metric: '内存占用',
                constraint: '< 500MB',
                measured: 420,
                unit: 'MB',
                passed: true,
                deviation: -16,
              },
              {
                metric: 'CPU 占用',
                constraint: '< 80%',
                measured: 65,
                unit: '%',
                passed: true,
                deviation: -18.75,
              },
            ],
            report: '仿真验证通过。所有性能指标均符合要求。',
          }

          ElMessage.success('仿真完成')
        }
      }, 1000)

      // 实际调用 API
      // const result = await apiClient.simulation.run(formData)
      // simulationResult.value = result
    } catch (error) {
      ElMessage.error('仿真启动失败')
      simulationRunning.value = false
    } finally {
      loading.value = false
    }
  })
}

const handleCancel = () => {
  simulationRunning.value = false
  ElMessage.info('仿真已取消')
}

const handleReset = () => {
  formRef.value?.resetFields()
  simulationResult.value = null
}

const handleConfirm = () => {
  ElMessage.success('仿真结果已确认')
}

onMounted(async () => {
  await appStore.fetchRequirements()
})
</script>

<style scoped>
.simulation-run {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-card,
.progress-card,
.result-card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.report-content {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
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
