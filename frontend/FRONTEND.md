# DevGuard Agent 前端开发指南

## 快速开始

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 3. 构建生产版本

```bash
npm run build
```

## 项目结构

```
frontend/
├── src/
│   ├── main.ts                 # 应用入口
│   ├── App.vue                 # 根组件
│   ├── api/
│   │   └── client.ts           # API 客户端
│   ├── router/
│   │   └── index.ts            # 路由配置
│   ├── stores/
│   │   └── app.ts              # Pinia 状态管理
│   ├── types/
│   │   └── index.ts            # TypeScript 类型定义
│   ├── styles/
│   │   └── main.css            # 全局样式
│   └── views/
│       ├── Dashboard.vue       # 仪表板
│       ├── Login.vue           # 登录页
│       ├── Profile.vue         # 个人资料
│       ├── Settings.vue        # 系统设置
│       ├── requirements/
│       │   ├── List.vue        # 需求列表
│       │   ├── Create.vue      # 创建需求
│       │   └── Analysis.vue    # 需求分析
│       ├── analysis/
│       │   ├── PR.vue          # PR 分析
│       │   └── History.vue     # 分析历史
│       ├── simulation/
│       │   ├── Run.vue         # 运行仿真
│       │   └── Results.vue     # 仿真结果
│       └── baselines/
│           ├── List.vue        # 基线列表
│           └── Create.vue      # 创建基线
├── index.html                  # HTML 入口
├── package.json                # 项目配置
├── vite.config.ts              # Vite 配置
└── tsconfig.json               # TypeScript 配置
```

## 技术栈

- **框架**: Vue 3 + TypeScript
- **路由**: Vue Router 4
- **状态管理**: Pinia
- **UI 组件**: Element Plus
- **构建工具**: Vite
- **HTTP 客户端**: Axios
- **图表**: ECharts
- **日期处理**: date-fns

## 开发规范

### 组件命名

- 文件名使用 PascalCase: `MyComponent.vue`
- 组件名使用 PascalCase: `<MyComponent />`

### 文件组织

```
views/
├── feature/
│   ├── List.vue        # 列表页
│   ├── Create.vue      # 创建页
│   ├── Edit.vue        # 编辑页
│   └── Detail.vue      # 详情页
```

### 代码风格

```typescript
// 使用 setup 语法糖
<script setup lang="ts">
import { ref, computed } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)
</script>
```

### 类型定义

```typescript
// 在 types/index.ts 中定义所有类型
export interface User {
  id: string
  name: string
  email: string
}
```

### API 调用

```typescript
// 使用 apiClient 进行 API 调用
import apiClient from '@/api/client'

const data = await apiClient.requirements.list()
```

### 状态管理

```typescript
// 使用 Pinia store
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
await appStore.fetchRequirements()
```

## 常用命令

```bash
# 开发
npm run dev

# 构建
npm run build

# 预览
npm run preview

# 代码检查
npm run lint

# 代码格式化
npm run format

# 类型检查
npm run type-check
```

## 页面清单

### 已实现

- ✅ 仪表板 (Dashboard)
- ✅ 需求列表 (Requirements List)
- ✅ PR 分析 (PR Analysis)

### 待实现

- [ ] 需求创建 (Create Requirement)
- [ ] 需求分析 (Analyze Requirement)
- [ ] 分析历史 (Analysis History)
- [ ] 仿真运行 (Run Simulation)
- [ ] 仿真结果 (Simulation Results)
- [ ] 基线列表 (Baseline List)
- [ ] 基线创建 (Create Baseline)
- [ ] 系统设置 (Settings)
- [ ] 登录页 (Login)
- [ ] 个人资料 (Profile)

## API 集成

### 需求 API

```typescript
// 获取需求列表
const requirements = await apiClient.requirements.list()

// 创建需求
const newReq = await apiClient.requirements.create({
  req_id: 'REQ-001',
  title: '需求标题',
  content: '需求内容',
})

// 分析需求
const result = await apiClient.requirements.analyze('requirement-id')

// 确认需求
await apiClient.requirements.confirm('requirement-id', {
  owner: '张三',
  status: 'APPROVE',
})
```

### PR 分析 API

```typescript
// 分析 PR
const result = await apiClient.analysis.pr({
  number: 9152,
  title: 'PR 标题',
  commits: [...],
})

// 确认 PR 分析
await apiClient.analysis.confirmPR(9152, {
  owner: '李四',
  status: 'APPROVE',
})
```

### 仿真 API

```typescript
// 运行仿真
const simulation = await apiClient.simulation.run({
  requirement_id: 'REQ-001',
  scenario_path: '/data/scenarios/rain_heavy.bag',
  duration_sec: 60,
})

// 获取仿真结果
const results = await apiClient.simulation.getResults('simulation-id')

// 确认仿真结果
await apiClient.simulation.confirm('simulation-id', {
  owner: '王五',
  accept_deviation: true,
})
```

## 状态管理

### 使用 Pinia Store

```typescript
import { useAppStore } from '@/stores/app'

export default {
  setup() {
    const appStore = useAppStore()

    // 访问状态
    console.log(appStore.requirements)

    // 调用方法
    appStore.fetchRequirements()

    return { appStore }
  },
}
```

## 路由配置

### 添加新路由

```typescript
// router/index.ts
{
  path: '/my-page',
  component: () => import('../views/MyPage.vue'),
  meta: { title: '我的页面' },
}
```

## 样式指南

### 使用 CSS 变量

```css
:root {
  --primary-color: #667eea;
  --secondary-color: #764ba2;
  --success-color: #67c23a;
  --warning-color: #e6a23c;
  --danger-color: #f56c6c;
}
```

### 响应式设计

```vue
<el-row :gutter="20">
  <el-col :xs="24" :sm="12" :md="8">
    <!-- 内容 -->
  </el-col>
</el-row>
```

## 调试

### 浏览器开发者工具

1. 打开 Chrome DevTools (F12)
2. 查看 Vue 组件树 (Vue DevTools)
3. 查看 Pinia 状态 (Pinia DevTools)

### 日志输出

```typescript
console.log('调试信息:', data)
```

## 性能优化

### 代码分割

```typescript
// 路由级别的代码分割
component: () => import('../views/MyPage.vue')
```

### 图片优化

```vue
<img src="image.jpg" alt="描述" loading="lazy" />
```

### 缓存策略

```typescript
// 使用 localStorage 缓存
localStorage.setItem('key', JSON.stringify(data))
const data = JSON.parse(localStorage.getItem('key'))
```

## 常见问题

### Q: 如何添加新的 API 端点？

A: 在 `api/client.ts` 中添加新的方法：

```typescript
myFeature = {
  list: (params?: any) => this.client.get('/my-feature/list', { params }),
  create: (data: any) => this.client.post('/my-feature/create', data),
}
```

### Q: 如何修改主题颜色？

A: 修改 `styles/main.css` 中的 CSS 变量或 Element Plus 主题配置。

### Q: 如何处理 API 错误？

A: 在 `api/client.ts` 中的响应拦截器中处理错误。

### Q: 如何添加新的页面？

A: 
1. 在 `views/` 中创建新的 `.vue` 文件
2. 在 `router/index.ts` 中添加路由
3. 在 `App.vue` 中添加菜单项

## 部署

### 构建

```bash
npm run build
```

### 输出

生成的文件在 `dist/` 目录中。

### 部署到 Nginx

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    root /var/www/devguard-frontend/dist;
    try_files $uri $uri/ /index.html;
  }

  location /api {
    proxy_pass http://localhost:8000;
  }
}
```

## 下一步

1. 实现剩余页面
2. 添加单元测试
3. 添加 E2E 测试
4. 性能优化
5. 国际化支持

---

**版本**: v2.4.0  
**最后更新**: 2026-03-30
