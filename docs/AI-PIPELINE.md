# AI Pipeline 使用指南

> **版本**: v1.0  
> **日期**: 2026-04-04  
> **功能**: 自动驾驶 AI 全链路开发体系

---

## 一、整体架构

```
人工输入需求
    ↓
[1] AI 需求分析  ←  向量代码库检索
    ↓
[2] AI 任务下发  →  自动生成任务卡
    ↓
[3] AI 代码生成  ←  语义检索相关代码
    ↓
[4] AI 测试用例  ←  代码建议上下文
    ↓
[5] AI 合入风险  ←  MR Diff vs 建议代码对比
```

---

## 二、快速开始

### 2.1 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入实际值
```

**必填项：**
```env
# AI
OPENAI_API_KEY=sk-...         # 必须有

# GitLab（MR 合并风险评估必须）
GITLAB_URL=https://gitlab.your-company.com
GITLAB_TOKEN=glpat-xxx        # Personal Access Token（需 api 权限）
```

### 2.2 为代码库建立向量索引

```bash
# 索引 Apollo 仓库
node src/ai-pipeline/init-index.js apollo /path/to/apollo ".cpp,.h,.hpp,.py,.md"

# 索引 ARM recorder demo
node src/ai-pipeline/init-index.js arm-recorder /path/to/arm_recorder ".cpp,.h,.md"
```

索引数据保存在 `data/ai-pipeline/vectors.json`。

---

## 三、API 接口

服务启动后访问：`http://localhost:3100/api/ai-pipeline/`

### 3.1 建立/更新索引
```
POST /api/ai-pipeline/index
Body: {
  "repoId": "apollo-main",
  "repoPath": "/path/to/apollo",
  "extensions": [".cpp", ".h", ".py", ".md"],
  "excludeDirs": ["node_modules", "build", "third_party"]
}
```

### 3.2 AI 需求分析
```
POST /api/ai-pipeline/analyze
Body: {
  "title": "雨天感知降级策略",
  "description": "当降雨量超过阈值时，自动切换到简化感知模式",
  "content": "（可选，提供完整 PRD 文档内容）",
  "repoIds": ["apollo-main"]
}
```
返回：功能点列表 + 代码差距分析（NEW/PARTIAL/COVERED）

### 3.3 AI 生成任务卡
```
POST /api/ai-pipeline/tasks
Body: {
  "gapAnalysis": [...],   // 来自 /analyze 的 gapAnalysis
  "repoId": "apollo-main"
}
```

### 3.4 AI 生成代码建议
```
POST /api/ai-pipeline/code-suggest
Body: {
  "task": { "task_id": "T-001", "title": "...", "module": "感知", "ASIL": "B" },
  "relatedCode": [...],    // 可选，来自 /analyze 的相关代码
  "codeStyle": "cpp17"
}
```

### 3.5 AI 生成测试用例
```
POST /api/ai-pipeline/tests
Body: {
  "task": {...},
  "codeSuggestion": "..."   // 可选，来自 /code-suggest 的建议代码
}
```

### 3.6 全链路分析（一步到位）
```
POST /api/ai-pipeline/full
Body: {
  "title": "...",
  "description": "...",
  "content": "...",
  "repoIds": ["apollo-main"]
}
```
返回：功能点 + 差距分析 + 任务卡 + 代码建议 + 测试用例

### 3.7 MR 合并风险评估
```
POST /api/ai-pipeline/merge-risk
Body: {
  "gitlabUrl": "https://gitlab.your-company.com",
  "gitlabToken": "glpat-xxx",
  "projectId": "group/project",
  "mrIid": 42,
  "task": { "title": "...", "ASIL": "B" },
  "codeSuggestion": "..."   // 可选，来自代码建议
}
```

### 3.8 语义代码搜索
```
GET /api/ai-pipeline/search?q=感知降级策略&repoId=apollo-main&topK=10
```

---

## 四、GitLab Webhook 配置

### 4.1 在 GitLab 中配置 Webhook

1. 进入 GitLab 项目 → Settings → Webhooks
2. 添加新 Webhook：
   - **URL**: `https://your-server/webhook/gitlab-ai`
   - **Secret Token**: 填入 `.env` 中的 `GITLAB_WEBHOOK_SECRET`
   - **Trigger**: ✅ Merge request events
3. 点击 "Add webhook" → "Test" 验证

### 4.2 触发流程

MR 打开/更新 → Webhook 接收 → 获取 diff → AI 合并风险评估 → **自动发表 MR 评论**

---

## 五、代码库索引策略

### 5.1 自动驾驶模块推荐配置

| 模块 | 路径 | 扩展名 |
|------|------|--------|
| Apollo 主仓库 | `modules/` | `.cpp,.h,.py,.md` |
| ARM 数据落盘 | `src/,include/` | `.cpp,.h,.md` |
| 仿真回灌 | `simulation/` | `.cpp,.h,.proto,.md` |

### 5.2 索引更新策略

- **CI/CD 触发**：PR 合并后增量更新向量库
- **每日全量**：配合 cron 每日凌晨重索引
- **按需触发**：大版本发布前手动触发

---

## 六、与现有 Flow A/B 的关系

```
新 AI Pipeline          现有 Flow A/B
─────────────           ────────────
需求分析（语义）  ←→    ReqParser（文本正则）
代码检索（向量）  ←→    FeatureAligner（图匹配）
代码建议（LLM）   ←→    代码骨架（模板）
测试用例（LLM）   ←→    仿真验证
合入风险（语义）  ←→    Commit 语义对齐
```

**推荐**：AI Pipeline 作为 Flow A/B 的能力增强层，复用现有数据模型和通知层。

---

## 七、测试（无 API Key 模式）

不填 `OPENAI_API_KEY` 时，所有 AI 调用自动降级为 Mock 模式，返回结构正确的模拟数据。向量搜索使用 Mock embedding（基于文本哈希生成伪向量）。

```bash
# Mock 模式验证
curl -X POST http://localhost:3100/api/ai-pipeline/full \
  -H "Content-Type: application/json" \
  -d '{"title": "雨天感知降级", "description": "降雨量阈值自动切换"}'
```
