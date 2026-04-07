<template>
  <div id="app" class="app-container">
    <el-container>
      <!-- 侧边栏 -->
      <el-aside width="250px" class="sidebar">
        <div class="logo">
          <h1>🛡️ DevGuard</h1>
          <p>代码质量守护系统</p>
        </div>
        
        <el-menu
          :default-active="activeMenu"
          class="el-menu-vertical"
          background-color="transparent"
          text-color="rgba(255,255,255,0.8)"
          active-text-color="#ffffff"
          @select="handleMenuSelect"
        >
          <el-menu-item index="dashboard">
            <el-icon><DataAnalysis /></el-icon>
            <span>仪表板</span>
          </el-menu-item>
          
          <el-sub-menu index="requirements">
            <template #title>
              <el-icon><DocumentCopy /></el-icon>
              <span>需求管理</span>
            </template>
            <el-menu-item index="req-docs">需求文档</el-menu-item>
            <el-menu-item index="requirements-list">需求列表</el-menu-item>
            <el-menu-item index="requirements-create">创建需求</el-menu-item>
            <el-menu-item index="requirements-analysis">需求分析</el-menu-item>
          </el-sub-menu>
          
          <el-sub-menu index="analysis">
            <template #title>
              <el-icon><Search /></el-icon>
              <span>分析管理</span>
            </template>
            <el-menu-item index="analysis-pr">PR 分析</el-menu-item>
            <el-menu-item index="analysis-history">分析历史</el-menu-item>
          </el-sub-menu>
          
          <el-sub-menu index="simulation">
            <template #title>
              <el-icon><Cpu /></el-icon>
              <span>仿真验证</span>
            </template>
            <el-menu-item index="simulation-run">运行仿真</el-menu-item>
            <el-menu-item index="simulation-results">仿真结果</el-menu-item>
          </el-sub-menu>
          
          <el-sub-menu index="baselines">
            <template #title>
              <el-icon><DataAnalysis /></el-icon>
              <span>基线管理</span>
            </template>
            <el-menu-item index="baselines-list">基线列表</el-menu-item>
            <el-menu-item index="baselines-create">创建基线</el-menu-item>
          </el-sub-menu>
          
          <el-menu-item index="settings">
            <el-icon><Setting /></el-icon>
            <span>系统设置</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <!-- 主容器 -->
      <el-container class="main-container">
        <!-- 顶部栏 -->
        <el-header class="header">
          <div class="header-left">
            <h2>{{ pageTitle }}</h2>
          </div>
          <div class="header-right">
            <el-button type="primary" @click="handleRefresh">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
            <el-dropdown @command="handleCommand">
              <span class="el-dropdown-link">
                <el-icon><User /></el-icon>
                用户
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">个人资料</el-dropdown-item>
                  <el-dropdown-item command="settings">设置</el-dropdown-item>
                  <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>
        
        <!-- 主内容 -->
        <el-main class="main-content">
          <router-view />
        </el-main>
        
        <!-- 底部栏 -->
        <el-footer class="footer">
          <p>DevGuard Agent v2.4.0 | © 2026 All Rights Reserved</p>
        </el-footer>
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  DataAnalysis,
  DocumentCopy,
  Search,
  Cpu,
  Setting,
  Refresh,
  User,
} from '@element-plus/icons-vue'

const router = useRouter()
const activeMenu = ref('dashboard')

const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    dashboard: '仪表板',
    'req-docs': '需求文档',
    'req-docs-create': '创建文档',
    'req-docs-edit': '编辑文档',
    'requirements-list': '需求列表',
    'requirements-create': '创建需求',
    'requirements-analysis': '需求分析',
    'analysis-pr': 'PR 分析',
    'analysis-history': '分析历史',
    'simulation-run': '运行仿真',
    'simulation-results': '仿真结果',
    'baselines-list': '基线列表',
    'baselines-create': '创建基线',
    settings: '系统设置',
  }
  return titles[activeMenu.value] || 'DevGuard Agent'
})

const handleMenuSelect = (index: string) => {
  activeMenu.value = index
  router.push(`/${index}`)
}

const handleRefresh = () => {
  ElMessage.success('已刷新')
  window.location.reload()
}

const handleCommand = (command: string) => {
  if (command === 'logout') {
    ElMessage.success('已退出登录')
    router.push('/login')
  } else if (command === 'profile') {
    router.push('/profile')
  } else if (command === 'settings') {
    router.push('/settings')
  }
}
</script>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
}

.sidebar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  overflow-y: auto;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
}

.logo {
  padding: 20px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.logo h1 {
  margin: 0;
  font-size: 24px;
  font-weight: bold;
}

.logo p {
  margin: 5px 0 0 0;
  font-size: 12px;
  opacity: 0.8;
}

.el-menu-vertical {
  background: transparent !important;
  border: none !important;
}

.el-menu-vertical :deep(.el-menu-item),
.el-menu-vertical :deep(.el-sub-menu__title) {
  color: rgba(255, 255, 255, 0.8) !important;
  background: transparent !important;
}

.el-menu-vertical :deep(.el-menu-item:hover),
.el-menu-vertical :deep(.el-sub-menu__title:hover) {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.el-menu-vertical :deep(.is-active) {
  color: white !important;
  background: rgba(255, 255, 255, 0.2) !important;
}

/* 子菜单展开区域：覆盖 Element Plus 默认白色背景 */
.el-menu-vertical :deep(.el-menu--inline) {
  background: transparent !important;
}

.el-menu-vertical :deep(.el-menu--inline .el-menu-item) {
  color: rgba(255, 255, 255, 0.75) !important;
  background: transparent !important;
  padding-left: 50px !important;
}

.el-menu-vertical :deep(.el-menu--inline .el-menu-item:hover) {
  color: white !important;
  background: rgba(255, 255, 255, 0.12) !important;
}

.el-menu-vertical :deep(.el-menu--inline .el-menu-item.is-active) {
  color: white !important;
  background: rgba(255, 255, 255, 0.2) !important;
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.header {
  background: white;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header-left h2 {
  margin: 0;
  font-size: 20px;
  color: #333;
}

.header-right {
  display: flex;
  gap: 20px;
  align-items: center;
}

.el-dropdown-link {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  color: #667eea;
}

.main-content {
  flex: 1;
  background: #f5f7fa;
  overflow-y: auto;
  padding: 20px;
}

.footer {
  background: white;
  border-top: 1px solid #e0e0e0;
  text-align: center;
  color: #999;
  font-size: 12px;
}

.footer p {
  margin: 0;
}
</style>
