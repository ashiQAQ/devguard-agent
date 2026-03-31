# 配置文件说明 — repos.config.json

## 快速配置

编辑项目根目录下的 `repos.config.json`：

```json
{
  "repos": [
    {
      "id": "my-project",           // 唯一标识符
      "name": "我的项目",
      "enabled": true,
      "git": {
        "url": "https://github.com/owner/repo.git",   // 或 "local"
        "localPath": "/path/to/your/code",             // 本地代码路径
        "branch": "main"
      },
      "scan": {
        "language": "cpp",                // cpp | python
        "includePaths": ["modules"],      // 扫描的目录
        "excludePaths": ["build", "test"], // 排除的目录
        "fileExtensions": [".cc", ".h"]
      },
      "requirements": {
        "watchDirs": ["./demands"],       // 需求文档目录
        "formats": ["md", "txt", "json"]
      }
    }
  ]
}
```

---

## 配置项详解

### `repos[].git`

| 字段 | 说明 |
|------|------|
| `url` | Git 地址，`"local"` 表示直接用 `localPath` |
| `localPath` | 本地代码路径（绝对路径） |
| `branch` | 扫描的分支 |
| `token` | 访问令牌（私有仓库需要），支持 `${ENV_VAR}` |

### `repos[].scan`

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `language` | `"cpp"` | 扫描语言 |
| `includePaths` | `["."]` | 扫描目录 |
| `excludePaths` | `["build", "test", "docs"]` | 排除目录 |
| `maxFileSizeKB` | `500` | 单文件大小上限 |
| `maxFiles` | `2000` | 最大文件数 |

### `repos[].requirements`

| 字段 | 说明 |
|------|------|
| `watchDirs` | 需求文档所在目录 |
| `formats` | 支持的格式 `md / txt / json / yaml` |
| `autoAnalyze` | 新文档自动分析（后续功能） |

---

## API 使用方式

### 方式 1：最简单 — 直接对话输入

```
POST /api/repos/:id/analyze-text

Body:
{
  "text": "新增城市道路车道保持辅助功能...",
  "format": "md"
}
```

### 方式 2：需求文件分析

```
POST /api/repos/:id/analyze

Body:
{
  "files": ["/path/to/req.md"]         // 单个文件
  // 或
  "dir": "/path/to/demands"           // 整个目录
}
```

### 方式 3：配置文件驱动（自动）

在 `repos.config.json` 中配置好仓库后，DevGuard Agent 会自动：

1. 扫描代码 → 识别功能基线
2. 监听需求目录 → 自动解析新需求
3. 对齐分析 → 输出报告

---

## 对齐类型说明

| 类型 | 含义 | 颜色 |
|------|------|------|
| ✅ MATCH | 与基线完全匹配，直接复用 | 绿色 |
| 🔄 PARTIAL | 部分匹配，需在基线基础上扩展 | 黄色 |
| ⚠️ MODIFIED | 需修改基线现有实现 | 橙色 |
| 🆕 NEW | 全新功能，基线中不存在 | 蓝色 |
| ❓ UNCLEAR | 无法自动对齐，需人工确认 | 灰色 |

---

## 路径说明

- `repos.config.json` 默认读取位置：`/Users/fengxinfeng/.qclaw/workspace/devguard-agent/repos.config.json`
- 可通过环境变量覆盖：`DEVGUARD_CONFIG=/path/to/config.json`
- 基线快照默认存储：`./data/baselines/:repoId/baseline-latest.json`
- 分析报告默认存储：`./data/reports/:repoId-report-TIMESTAMP.json`
