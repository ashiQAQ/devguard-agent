import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '/dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { title: '仪表板', requiresAuth: true },
  },
  {
    path: '/requirements-list',
    component: () => import('../views/requirements/List.vue'),
    meta: { title: '需求列表', requiresAuth: true },
  },
  {
    path: '/requirements-create',
    component: () => import('../views/requirements/Create.vue'),
    meta: { title: '创建需求', requiresAuth: true },
  },
  {
    path: '/requirements-detail/:id',
    component: () => import('../views/requirements/Detail.vue'),
    meta: { title: '需求详情', requiresAuth: true },
  },
  {
    path: '/requirements-edit/:id',
    component: () => import('../views/requirements/Edit.vue'),
    meta: { title: '编辑需求', requiresAuth: true },
  },
  {
    path: '/requirements-analysis',
    component: () => import('../views/requirements/Analysis.vue'),
    meta: { title: '需求分析', requiresAuth: true },
  },
  {
    path: '/requirements-ai-analysis',
    component: () => import('../views/requirements/AIAnalysis.vue'),
    meta: { title: 'AI 需求分析', requiresAuth: true },
  },
  {
    path: '/req-docs',
    component: () => import('../views/req-docs/List.vue'),
    meta: { title: '需求文档', requiresAuth: true },
  },
  {
    path: '/req-docs/create',
    component: () => import('../views/req-docs/Create.vue'),
    meta: { title: '创建文档', requiresAuth: true },
  },
  {
    path: '/req-docs/:id',
    component: () => import('../views/req-docs/Detail.vue'),
    meta: { title: '文档详情', requiresAuth: true },
  },
  {
    path: '/analysis-pr',
    component: () => import('../views/analysis/PR.vue'),
    meta: { title: 'PR 分析', requiresAuth: true },
  },
  {
    path: '/analysis-history',
    component: () => import('../views/analysis/History.vue'),
    meta: { title: '分析历史', requiresAuth: true },
  },
  {
    path: '/simulation-run',
    component: () => import('../views/simulation/Run.vue'),
    meta: { title: '运行仿真', requiresAuth: true },
  },
  {
    path: '/simulation-results',
    component: () => import('../views/simulation/Results.vue'),
    meta: { title: '仿真结果', requiresAuth: true },
  },
  {
    path: '/baselines-list',
    component: () => import('../views/baselines/List.vue'),
    meta: { title: '基线列表', requiresAuth: true },
  },
  {
    path: '/baselines-create',
    component: () => import('../views/baselines/Create.vue'),
    meta: { title: '创建基线', requiresAuth: true },
  },
  {
    path: '/settings',
    component: () => import('../views/Settings.vue'),
    meta: { title: '系统设置', requiresAuth: true },
  },
  {
    path: '/login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/profile',
    component: () => import('../views/Profile.vue'),
    meta: { title: '个人资料', requiresAuth: true },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title || 'DevGuard'} - DevGuard Agent`
  // 认证检查
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else {
    next()
  }
})

export default router
