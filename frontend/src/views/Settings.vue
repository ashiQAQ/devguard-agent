<template>
  <div class="settings">
    <el-row :gutter="20">
      <!-- 侧边栏菜单 -->
      <el-col :xs="24" :md="6">
        <el-card class="menu-card">
          <el-menu
            :default-active="activeTab"
            class="el-menu-vertical"
            @select="handleTabSelect"
          >
            <el-menu-item index="general">
              <el-icon><Setting /></el-icon>
              <span>通用设置</span>
            </el-menu-item>
            <el-menu-item index="api">
              <el-icon><Connection /></el-icon>
              <span>API 配置</span>
            </el-menu-item>
            <el-menu-item index="database">
              <el-icon><DataAnalysis /></el-icon>
              <span>数据库</span>
            </el-menu-item>
            <el-menu-item index="notification">
              <el-icon><Bell /></el-icon>
              <span>通知设置</span>
            </el-menu-item>
            <el-menu-item index="about">
              <el-icon><InfoFilled /></el-icon>
              <span>关于系统</span>
            </el-menu-item>
          </el-menu>
        </el-card>
      </el-col>

      <!-- 内容区域 -->
      <el-col :xs="24" :md="18">
        <!-- 通用设置 -->
        <el-card v-if="activeTab === 'general'" class="content-card">
          <template #header>
            <div class="card-header">
              <span>通用设置</span>
            </div>
          </template>

          <el-form label-width="150px">
            <el-form-item label="系统名称">
              <el-input v-model="settings.systemName" />
            </el-form-item>

            <el-form-item label="系统版本">
              <el-input v-model="settings.systemVersion" disabled />
            </el-form-item>

            <el-form-item label="语言">
              <el-select v-model="settings.language">
                <el-option label="中文" value="zh" />
                <el-option label="English" value="en" />
              </el-select>
            </el-form-item>

            <el-form-item label="主题">
              <el-select v-model="settings.theme">
                <el-option label="浅色" value="light" />
                <el-option label="深色" value="dark" />
              </el-select>
            </el-form-item>

            <el-form-item label="时区">
              <el-select v-model="settings.timezone">
                <el-option label="UTC+8 (Asia/Shanghai)" value="Asia/Shanghai" />
                <el-option label="UTC (UTC)" value="UTC" />
                <el-option label="UTC-5 (America/New_York)" value="America/New_York" />
              </el-select>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="handleSaveSettings">保存设置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- API 配置 -->
        <el-card v-if="activeTab === 'api'" class="content-card">
          <template #header>
            <div class="card-header">
              <span>API 配置</span>
            </div>
          </template>

          <el-form label-width="150px">
            <el-form-item label="GitHub Token">
              <el-input
                v-model="settings.githubToken"
                type="password"
                show-password
              />
            </el-form-item>

            <el-form-item label="OpenAI API Key">
              <el-input
                v-model="settings.openaiKey"
                type="password"
                show-password
              />
            </el-form-item>

            <el-form-item label="API 超时 (秒)">
              <el-input-number v-model="settings.apiTimeout" :min="10" :max="300" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="handleTestConnection">测试连接</el-button>
              <el-button @click="handleSaveSettings">保存配置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 数据库 -->
        <el-card v-if="activeTab === 'database'" class="content-card">
          <template #header>
            <div class="card-header">
              <span>数据库</span>
            </div>
          </template>

          <el-descriptions :column="2" border>
            <el-descriptions-item label="数据库类型">PostgreSQL</el-descriptions-item>
            <el-descriptions-item label="连接状态">
              <el-tag type="success">已连接</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="主机">localhost</el-descriptions-item>
            <el-descriptions-item label="端口">5432</el-descriptions-item>
            <el-descriptions-item label="数据库">devguard</el-descriptions-item>
            <el-descriptions-item label="用户">devguard</el-descriptions-item>
          </el-descriptions>

          <el-divider />

          <el-button type="primary" @click="handleBackupDatabase">备份数据库</el-button>
          <el-button @click="handleOptimizeDatabase">优化数据库</el-button>
        </el-card>

        <!-- 通知设置 -->
        <el-card v-if="activeTab === 'notification'" class="content-card">
          <template #header>
            <div class="card-header">
              <span>通知设置</span>
            </div>
          </template>

          <el-form label-width="150px">
            <el-form-item label="邮件通知">
              <el-switch v-model="settings.emailNotification" />
            </el-form-item>

            <el-form-item label="企业微信通知">
              <el-switch v-model="settings.wechatNotification" />
            </el-form-item>

            <el-form-item label="钉钉通知">
              <el-switch v-model="settings.dingNotification" />
            </el-form-item>

            <el-form-item label="通知邮箱">
              <el-input v-model="settings.notificationEmail" />
            </el-form-item>

            <el-form-item label="通知频率">
              <el-select v-model="settings.notificationFrequency">
                <el-option label="实时" value="realtime" />
                <el-option label="每小时" value="hourly" />
                <el-option label="每天" value="daily" />
              </el-select>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="handleSaveSettings">保存设置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 关于系统 -->
        <el-card v-if="activeTab === 'about'" class="content-card">
          <template #header>
            <div class="card-header">
              <span>关于系统</span>
            </div>
          </template>

          <el-descriptions :column="1" border>
            <el-descriptions-item label="系统名称">DevGuard Agent</el-descriptions-item>
            <el-descriptions-item label="系统版本">v2.4.0</el-descriptions-item>
            <el-descriptions-item label="发布日期">2026-03-30</el-descriptions-item>
            <el-descriptions-item label="项目主页">
              <el-link href="https://github.com/your-org/devguard-agent" target="_blank">
                GitHub
              </el-link>
            </el-descriptions-item>
            <el-descriptions-item label="许可证">MIT License</el-descriptions-item>
            <el-descriptions-item label="技术栈">
              Vue 3 + TypeScript + FastAPI + C++
            </el-descriptions-item>
          </el-descriptions>

          <el-divider />

          <h4>系统信息</h4>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="API 版本">v2.4.0</el-descriptions-item>
            <el-descriptions-item label="数据库版本">PostgreSQL 14</el-descriptions-item>
            <el-descriptions-item label="运行时间">45 天 12 小时</el-descriptions-item>
            <el-descriptions-item label="最后更新">2026-03-30 12:23</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Setting,
  Connection,
  DataAnalysis,
  Bell,
  InfoFilled,
} from '@element-plus/icons-vue'

const activeTab = ref('general')

const settings = reactive({
  systemName: 'DevGuard Agent',
  systemVersion: 'v2.4.0',
  language: 'zh',
  theme: 'light',
  timezone: 'Asia/Shanghai',
  githubToken: '',
  openaiKey: '',
  apiTimeout: 30,
  emailNotification: true,
  wechatNotification: true,
  dingNotification: false,
  notificationEmail: 'admin@example.com',
  notificationFrequency: 'daily',
})

const handleTabSelect = (index: string) => {
  activeTab.value = index
}

const handleSaveSettings = () => {
  ElMessage.success('设置已保存')
}

const handleTestConnection = () => {
  ElMessage.success('连接测试成功')
}

const handleBackupDatabase = () => {
  ElMessage.success('数据库备份已启动')
}

const handleOptimizeDatabase = () => {
  ElMessage.success('数据库优化已启动')
}
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.menu-card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.content-card {
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

.el-menu-vertical {
  border: none !important;
}

.el-menu-vertical :deep(.el-menu-item) {
  border-radius: 4px;
  margin-bottom: 5px;
}
</style>
