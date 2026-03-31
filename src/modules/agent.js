/**
 * DevGuard Agent Core — Fused Architecture
 * Combines: DevGuard flow + demands1 multi-agent dimensions + demands2 NLP-AST comparison
 */
const ai = require('../ai-provider');

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────
function tag(level, label, message) {
  const icons = { block: '🔴', crit: '🟠', major: '🟡', minor: '🔵', info: '⚪' };
  return `**${icons[level] || '⚪'} ${label}**: ${message}`;
}

// Demo responses for each module (returned when no API key)
const DEMO = {
  requirement(data) {
    const t = data.title || data.prdContent?.substring(0, 60) || '未命名需求';
    return `## 📋 需求分析报告

**需求**: ${t}

### 🔍 主线差异分析
| 模块 | 变更类型 | 文件数 | 风险 |
|------|---------|-------|------|
| src/api/ | 新增接口 | 2 | 🟡 中 |
| src/service/ | 逻辑变更 | 3 | 🟠 高 |
| src/model/ | Schema变更 | 1 | 🟠 高 |
| src/utils/ | 无变更 | 0 | 🟢 低 |
| database/ | Migration | 2 | 🔴 阻断 |

### ⚠️ 实现风险评估
${tag('major', '技术复杂性', '涉及异步队列和缓存一致性，实现难度中等')}
${tag('crit', '数据迁移风险', 'Schema变更需考虑存量数据，双写过渡期至少2周')}
${tag('major', '依赖引入', '新引入 Redis 依赖需评估单点故障')}
${tag('minor', '性能影响', '大数据量查询需加索引，预估 QPS 下降 5-8%')}

### 📐 推荐实现拆解
| 任务 | 描述 | SP | 负责人 |
|------|------|-----|--------|
| T1 | 数据库 Migration + 回滚脚本 | 2 | DBA |
| T2 | Service 层核心逻辑实现 | 5 | Backend |
| T3 | API 接口 + 参数校验 | 3 | Backend |
| T4 | 缓存层封装 | 2 | Backend |
| T5 | 单元测试 + 集成测试 | 3 | QA |
| T6 | 文档更新 | 1 | All |

### 📊 综合评估
- **复杂度**: 中等偏高
- **优先级**: P1
- **预估工期**: 7-10 人天
- **可测试性**: 良

### ❓ 待澄清问题
1. 存量数据的迁移策略（清空/双写/增量同步）？
2. 缓存与 DB 一致性方案（延迟双删/Cache-Aside）？
3. 是否需要灰度发布策略？`;
  },

  requirementVsCode(data) {
    return `## 🔬 需求-代码一致性分析

### ✅ 已实现（匹配）
| 需求点 | 代码位置 | 状态 |
|--------|---------|------|
| 手机号验证码登录 | auth/login.py:24 | ✅ 匹配 |
| Token 有效期 2h | auth/token.py:18 | ✅ 匹配 |
| 登录失败锁定 | auth/security.py:35 | ✅ 匹配 |

### ❌ 缺失需求
| 缺失需求 | 说明 | 建议 |
|---------|------|------|
| 密码登录 | 需求要求支持手机+密码两种方式 | 在 auth 模块补充密码校验 |
| 验证码有效期 5 分钟 | 需求文档明确 5 分钟 | 当前代码硬编码为 10 分钟 ⚠️ |

### ⚠️ 逻辑冲突
| 位置 | 需求要求 | 实际实现 | 风险 |
|------|---------|---------|------|
| verifyCode() | 5 分钟 | 10 分钟 | 🔴 安全风险：有效期过长可被暴力枚举 |
| login() | 失败3次锁定 | 失败5次锁定 | 🟡 不一致：需对齐需求 |

### 📝 建议
${tag('crit', '立即修复', '将验证码有效期从 10 分钟改为 5 分钟')}
${tag('major', '补充功能', '在 auth 模块增加密码登录分支')}
${tag('minor', '规范对齐', '建议将 magic number 提取为配置常量')}`;
  },

  codeReview(data) {
    const riskLevel = Math.random() > 0.5 ? 'major' : 'crit';
    return `## 🔍 七维度代码评审报告

**PR**: ${data.prTitle || 'Unknown'} → \`${data.targetBranch || 'main'}\`
${data.prDescription ? `**描述**: ${data.prDescription.substring(0, 200)}` : ''}

---

### 📊 总体评分
| 维度 | 得分 | 状态 |
|------|------|------|
| 代码复杂度 | ⭐⭐⭐☆ 3/5 | 🟡 需关注 |
| 重复代码 | ⭐⭐⭐⭐☆ 4/5 | 🟢 良好 |
| 测试覆盖 | ⭐⭐☆☆☆ 2/5 | 🔴 不足 |
| 编码规范 | ⭐⭐⭐⭐⭐ 5/5 | 🟢 优秀 |
| 注释质量 | ⭐⭐⭐☆☆ 3/5 | 🟡 建议补充 |
| Bug风险 | ⭐⭐⭐⭐☆ 4/5 | 🟢 低风险 |
| 架构设计 | ⭐⭐⭐⭐☆ 4/5 | 🟢 良好 |

---

### 🔴 Blocker（阻断级 — 必须修复）
${tag('block', 'SQL 注入风险', 'auth/query.py:42 — 用户输入直接拼入 SQL，必须使用参数化查询')}
\`\`\`python
# ❌ 当前
query = f"SELECT * FROM users WHERE name = '{username}'"

# ✅ 建议
query = "SELECT * FROM users WHERE name = ?"
cursor.execute(query, (username,))
\`\`\`

### 🟠 Critical（关键级 — 强烈建议修复）
${tag('crit', '硬编码密钥', 'config/secret.py:10 — API密钥硬编码在代码中，建议移至环境变量')}
${tag('crit', '错误处理过宽', 'service/payment.py:78 — catch所有异常会掩盖真实错误，建议分层捕获')}

### 🟡 Major（重要级 — 建议优化）
${tag('major', '重复代码', 'utils/a.py:15 和 utils/b.py:20 逻辑完全相同，建议抽取为公共方法')}
${tag('major', 'Magic Number', '多处硬编码数字，建议提取为命名常量')}
${tag('major', '注释缺失', 'service/core.py:50-80 核心逻辑无注释，维护困难')}

### 🔵 Minor（次要级 — 可选改进）
${tag('minor', '命名规范', '部分变量命名不够直观，如 d、tmp、data1')}
${tag('minor', '日志级别', 'info 级别日志可改为 debug，减少噪音')}

---

### ⚠️ 合入风险评估
| 维度 | 评估 | 影响 |
|------|------|------|
| 影响范围 | 5 个文件，3 个模块 | 中 |
| Breaking Change | 无 | 🟢 |
| 数据库变更 | 有（需 Migration） | 🟠 |
| 配置变更 | 无 | 🟢 |
| 依赖变更 | 新增 1 个（redis） | 🟡 |

---

### 🏁 合入建议
${riskLevel === 'crit' ? `**⚠️ 需关注** — 修复 Blocker 和 Critical 项后合入` : `**✅ 建议合入** — 修复 Blocker 项后合入，Major/Minor 项可后续迭代`}

---

### 📍 建议代码结构（与实际对比）
| 项目 | 建议结构 | 实际结构 | 是否符合 |
|------|---------|---------|---------|
| 模块分层 | MVC 三层分离 | ✅ 符合 | 🟢 |
| 错误处理 | 分层捕获 + 统一封装 | ❌ 全局 catch | 🟡 |
| 配置管理 | 环境变量优先 | ❌ 硬编码 | 🔴 |
| 日志规范 | 结构化日志 | ❌ 字符串拼接 | 🟡 |`;
  },

  tests(data) {
    return `## 🧪 测试用例生成报告

### 📋 测试用例矩阵

#### 正常流程
| ID | 用例名称 | 前置条件 | 操作 | 预期结果 | 优先级 |
|----|---------|---------|------|---------|--------|
| TC-001 | 正常登录 | 用户已注册 | POST /login + 正确凭证 | 返回 Token, 200 | P0 |
| TC-002 | 验证码登录 | 手机已注册 | POST /login + 有效验证码 | 返回 Token, 200 | P0 |
| TC-003 | 查询资源 | Token 有效 | GET /resource/:id | 返回资源详情, 200 | P1 |
| TC-004 | 更新资源 | Token 有效 + 资源存在 | PUT /resource/:id | 更新成功, 200 | P1 |

#### 边界值测试
| ID | 用例名称 | 输入 | 预期结果 |
|----|---------|------|---------|
| TC-005 | 最大长度 | 字段值 = 最大允许长度 | 正常处理 |
| TC-006 | 超长输入 | 字段值 > 最大长度 | 返回 413 |
| TC-007 | 空列表 | 无匹配数据 | 返回 200, [] |
| TC-008 | 分页边界 | page=0, page=最大页 | 正确分页 |

#### 异常流程
| ID | 用例名称 | 触发条件 | 预期结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-009 | 未授权 | 无 Token | 返回 401 | P0 |
| TC-010 | Token 过期 | 过期 Token | 返回 401 + refresh | P0 |
| TC-011 | 重复创建 | 唯一键冲突 | 返回 409 | P1 |
| TC-012 | 参数缺失 | 必填字段为空 | 返回 400 + 字段提示 | P1 |
| TC-013 | 并发更新 | 同时修改同一记录 | 返回 409 或乐观锁 | P1 |

---

### 🤖 自动化测试代码

\`\`\`javascript
// auth.login.spec.js
describe('登录模块', () => {
  describe('正常流程', () => {
    test('手机号+验证码登录成功', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ phone: '13800138000', code: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.expiresIn).toBe(7200);
    });

    test('密码登录成功', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ phone: '13800138000', password: 'Test@123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });
  });

  describe('异常流程', () => {
    test('无Token返回401', async () => {
      const res = await request(app).get('/api/resource/1');
      expect(res.status).toBe(401);
    });

    test('验证码错误返回401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ phone: '13800138000', code: '000000' });
      expect(res.status).toBe(401);
      expect(res.body.message).toContain('验证码错误');
    });

    test('重复注册返回409', async () => {
      await createUser({ phone: '13800138000' });
      const res = await request(app)
        .post('/api/auth/register')
        .send({ phone: '13800138000', password: 'Test@123' });
      expect(res.status).toBe(409);
    });
  });

  describe('边界值', () => {
    test('密码最小长度验证', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ phone: '13800138001', password: '123' });
      expect(res.status).toBe(400);
    });
  });
});
\`\`\`

### 📊 覆盖率预估
| 维度 | 当前 | 目标 | 缺口 |
|------|------|------|------|
| 语句覆盖 | 65% | 80% | 需补充异常路径 |
| 分支覆盖 | 52% | 75% | 需补充边界值 |
| 函数覆盖 | 78% | 90% | 需补充辅助函数测试 |
| 路径覆盖 | 45% | 70% | 需补充并发场景 |

### 🤖 自动化建议
- **推荐框架**: Jest + Supertest（API测试）
- **E2E**: Playwright（UI+API联动）
- **建议自动化率**: 80%（当前约 45%）`;
  },

  deploy(data) {
    return `## 🚀 上线部署检查清单

### 📋 部署前 Checklist

#### 环境准备
| 检查项 | 状态 | 备注 |
|--------|------|------|
| Staging 环境验证通过 | ☐ | |
| 配置参数已同步 | ☐ | 注意：REDIS_HOST 已变更 |
| 数据库 Migration 已执行 | ☐ | 需 DBA 确认 |
| 回滚脚本已准备 | ☐ | 需测试验证 |
| 灰度策略已配置 | ☐ | 初始 5% 流量 |

#### 通知相关方
- [ ] DBA — 数据库 Migration 确认
- [ ] SRE — 新增 Redis 依赖，请准备监控
- [ ] 前端 — API 响应结构变更，请关注

---

### 🔄 回滚方案

**自动回滚触发条件**:
- 5 分钟内错误率 > 1%
- P99 延迟 > 2s
- Redis 连接失败

**手动回滚步骤**:
\`\`\`bash
# 1. 停止服务
kubectl scale deployment app --replicas=0 -n production

# 2. 执行回滚
kubectl rollout undo deployment/app -n production

# 3. 验证
curl -I https://api.example.com/health
\`\`\`

---

### 📊 灰度发布策略
| 阶段 | 流量比例 | 观察时间 | 晋级条件 |
|------|---------|---------|---------|
| Canary | 5% | 30min | 错误率 < 0.1% |
| 10% | 10% | 1h | P99 < 500ms |
| 50% | 50% | 2h | 无异常 |
| Full | 100% | — | — |

---

### 📈 关键监控指标
| 指标 | 告警阈值 | Dashboard |
|------|---------|---------|
| HTTP 错误率 | > 0.5% | auth-dashboard |
| 响应时间 P99 | > 800ms | latency-dashboard |
| Redis 连接数 | > 5000 | redis-dashboard |
| DB 连接池 | > 80% | db-dashboard |`;
  },

  monitor(data) {
    return `## 📊 运行监测方案

### 🎯 核心监控指标

| 指标 | 正常范围 | 告警阈值 | 采集方式 |
|------|---------|---------|---------|
| QPS | 100-500/s | >800/s | Prometheus |
| P50 延迟 | < 100ms | > 200ms | Prometheus |
| P99 延迟 | < 500ms | > 800ms | Prometheus |
| 错误率 | < 0.1% | > 0.5% | Prometheus |
| CPU | < 60% | > 80% | Node Exporter |
| Memory | < 70% | > 85% | Node Exporter |
| Redis QPS | 1k-10k/s | > 15k/s | Redis Exporter |

---

### 🚨 告警规则

#### P0 — 立即响应
\`\`\`yaml
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "错误率超过 1%，持续 2 分钟"
    runbook: "https://wiki/runbooks/high-error-rate"
\`\`\`

#### P1 — 关注处理
\`\`\`yaml
- alert: HighLatency
  expr: histogram_quantile(0.99, http_request_duration_seconds) > 0.8
  for: 5m
  labels:
    severity: warning
\`\`\`

---

### 🔗 异常关联分析

**变更 → 异常快速定位**:
\`\`\`
1. 告警触发 → 自动提取最近合入的 PR 列表
2. 提取 PR 中的文件变更 + commit message
3. 关联错误日志中的堆栈信息
4. 生成初步 RCA 报告（平均减少 60% MTTR）
\`\`\`

**推荐 Dashboard 布局**:
- 左上：实时 QPS + 错误率
- 右上：P50/P95/P99 延迟趋势
- 左下：服务依赖拓扑
- 右下：最近变更时间线（PR → 部署 → 告警）`;
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// CORE MODULE PROMPTS
// ──────────────────────────────────────────────────────────────────────────────
const PROMPTS = {
  requirement: `你是一位资深研发架构师和需求分析师。请对需求进行全面分析，输出包含以下内容的 Markdown 报告：

## 一、主线差异分析
分析本次需求与主分支（main）的差异：影响哪些模块、新增/变更/删除文件数量、影响范围。

## 二、实现风险评估
从以下维度评估风险并给出风险等级：
- 技术复杂性风险
- 数据迁移风险（Schema 变更时）
- 依赖引入风险
- 性能影响风险
- 安全风险

## 三、实现方案拆解
将需求拆解为可执行的技术子任务，包含：任务名、描述、验收标准、预估 SP（斐波那契数列）、建议负责人。

## 四、综合评估
给出复杂度评级（P/M/H）、优先级建议、预估工期（人天）、可测试性评估。

## 五、待澄清问题
列出需要需求方明确的问题（至少 3 条）。

请用 Markdown 表格和分级标题输出。`,

  requirementVsCode: `你是需求-代码一致性分析专家。请对比需求文档与实际代码实现，输出 Markdown 报告：

## 一、已实现（匹配）
表格：需求点 | 代码位置 | 匹配状态

## 二、缺失需求
表格：缺失需求 | 说明 | 实现建议

## 三、逻辑冲突
表格：位置 | 需求要求 | 实际实现 | 风险等级
重点：找出任何数值、逻辑、流程不一致的地方。

## 四、建议
基于以上分析，给出修复优先级和建议。

请务必仔细对比任何数值类参数（如超时时间、重试次数、阈值等）。`,

  codeReview: `你是资深代码评审专家。请对以下代码变更进行全面评审，输出 Markdown 报告：

## 一、七维度评审
| 维度 | 评分(1-5星) | 状态 |
|------|------------|------|
| 代码复杂度 | | |
| 重复代码 | | |
| 测试覆盖 | | |
| 编码规范 | | |
| 注释质量 | | |
| Bug风险 | | |
| 架构设计 | | |

## 二、必须修改项（Blocker）
格式：${tag('block', '类型', '描述')} + 代码示例

## 三、建议优化项（Major/Minor）
格式：${tag('major', '类型', '描述')} + 代码示例

## 四、合入风险评估
| 维度 | 评估 | 影响等级 |
|------|------|---------|
| 影响范围 | | |
| Breaking Change | | |
| 数据库变更 | | |
| 配置变更 | | |

## 五、合入建议
给出：✅建议合入 / ⚠️需关注 / 🚫建议阻断
说明原因和修复前置条件。`,

  tests: `你是资深测试工程师。请基于以下信息生成测试方案，输出 Markdown 报告：

## 一、测试用例矩阵
包含正常流程、边界值、异常流程三个表格。
每表字段：ID、用例名称、前置条件、操作步骤、预期结果、优先级(P0-P2)。

## 二、自动化测试代码
根据语言生成 Jest/Playwright 测试代码，覆盖正常流+异常流。

## 三、覆盖率预估
评估当前覆盖率目标和缺口。

## 四、自动化建议
推荐框架和目标自动化率。`,

  deploy: `你是 DevOps 专家。请基于代码评审结果生成上线部署清单，输出 Markdown：

## 一、部署前 Checklist（表格）
包含：检查项、状态（☐）、负责人、备注

## 二、回滚方案
包含：自动回滚条件、手动回滚步骤（代码块）

## 三、灰度发布策略
阶段-流量-时间-晋级条件表格

## 四、监控指标
关键指标-告警阈值-Dashboard 对应表格`,

  monitor: `你是 SRE 专家。请生成运行监测方案，输出 Markdown：

## 一、核心监控指标
表格：指标、正常范围、告警阈值、采集方式

## 二、告警规则
至少 2 条 Prometheus 告警规则（YAML 格式）

## 三、异常关联分析
说明如何将告警快速关联到具体 PR/变更

## 四、Dashboard 建议
推荐面板布局和核心图表`
};

// ──────────────────────────────────────────────────────────────────────────────
// MODULE FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/** 1. 需求分析 */
async function analyzeRequirement(data) {
  const { title, description, prdContent, techStack, repoContext } = data;
  const userMsg = `## 需求信息
**标题**: ${title || '未提供'}
**描述**: ${description || '未提供'}
${prdContent ? `**PRD内容**:\n${prdContent}` : ''}
${techStack ? `**技术栈**: ${techStack}` : ''}
${repoContext ? `**仓库上下文**: ${repoContext}` : ''}`;

  const result = await ai.chat(PROMPTS.requirement, userMsg);
  return result || DEMO.requirement(data);
}

/** 1b. 需求-代码一致性对比 */
async function compareRequirementWithCode(data) {
  const { requirement, codeFiles } = data;
  const userMsg = `## 需求文档
${requirement}
${codeFiles ? `## 代码文件列表\n${JSON.stringify(codeFiles, null, 2)}` : ''}`;
  const result = await ai.chat(PROMPTS.requirementVsCode, userMsg);
  return result || DEMO.requirementVsCode(data);
}

/** 2. 代码评审（七维度 + 风险分级）*/
async function reviewCode(data) {
  const { prTitle, prDescription, diff, files, targetBranch, sourceBranch } = data;
  const userMsg = `## PR 信息
**标题**: ${prTitle || 'Unknown'}
${prDescription ? `**描述**: ${prDescription}` : ''}
**分支**: ${sourceBranch || 'feat/...'} → ${targetBranch || 'main'}

## 变更文件
${files?.length ? files.map(f => `- \`${f}\``).join('\n') : '(未提供)'}

## 代码 Diff
\`\`\`diff
${diff || '// 暂无 diff，请检查仓库'}
\`\`\``;

  const result = await ai.chat(PROMPTS.codeReview, userMsg);
  return result || DEMO.codeReview(data);
}

/** 3. 测试用例生成 */
async function generateTests(data) {
  const { requirement, codeContent, language } = data;
  const userMsg = `## 需求描述
${requirement || ''}
${codeContent ? `## 相关代码\n\`\`\`${language || 'javascript'}\n${codeContent}\n\`\`\`` : ''}`;

  const result = await ai.chat(PROMPTS.tests, userMsg);
  return result || DEMO.tests(data);
}

/** 4. 部署检查 */
async function checkDeployment(data) {
  const { prAnalysis, changes, envInfo } = data;
  const userMsg = `## 代码评审摘要
${prAnalysis || ''}
${changes ? `## 变更内容\n${changes}` : ''}
${envInfo ? `## 环境信息\n${envInfo}` : ''}`;

  const result = await ai.chat(PROMPTS.deploy, userMsg);
  return result || DEMO.deploy(data);
}

/** 5. 监测方案 */
async function generateMonitoring(data) {
  const { deployment, serviceInfo, serviceName } = data;
  const userMsg = `## 部署信息
${deployment || ''}
${serviceInfo ? `## 服务信息\n${serviceInfo}` : ''}
${serviceName ? `**服务名**: ${serviceName}` : ''}`;

  const result = await ai.chat(PROMPTS.monitor, userMsg);
  return result || DEMO.monitor(data);
}

/** 6. 全链路分析（串联所有模块）*/
async function fullCycleAnalysis(data) {
  const { requirement, prdContent, codeContent, diff, files, techStack } = data;

  // 并行执行各模块
  const [reqResult, codeResult, testResult] = await Promise.allSettled([
    analyzeRequirement({ title: data.title, description: data.description, prdContent, techStack }),
    reviewCode({ prTitle: data.title, prDescription: data.description, diff, files }),
    generateTests({ requirement: data.description || data.prdContent, codeContent })
  ]);

  return {
    requirement: reqResult.status === 'fulfilled' ? reqResult.value : reqResult.reason?.message,
    codeReview: codeResult.status === 'fulfilled' ? codeResult.value : codeResult.reason?.message,
    tests: testResult.status === 'fulfilled' ? testResult.value : testResult.reason?.message
  };
}

module.exports = {
  analyzeRequirement,
  compareRequirementWithCode,
  reviewCode,
  generateTests,
  checkDeployment,
  generateMonitoring,
  fullCycleAnalysis
};
