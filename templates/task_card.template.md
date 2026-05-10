# Agent 走查任务卡 — {{ROUND_NAME}}

> **Round ID**: `{{ROUND_ID}}` (e.g., `r1`) | **版本**: v1.0 | **日期**: {{DATE}}
> **关联画像库**: `persona.md` | **关联规则库**: `rules/{{RULE_SET}}.md`

---

## 走查目标

{{WALKTHROUGH_OBJECTIVE}}

**本轮聚焦**:
- 核心流程: {{CORE_FLOW}}
- 评估重点: {{EVALUATION_FOCUS}}
- 参与画像: {{ACTIVE_PERSONAS}} (引用 persona.md 中的画像 ID)

**前置条件**:
- 测试环境: {{ENV_URL}}
- 账号状态: {{ACCOUNT_STATE}} (e.g., 新注册未完成资质 / 已认证买家 / 游客)
- 数据状态: {{DATA_STATE}} (e.g., 空历史 / 有历史订单 / 有收藏夹)

---

## 走查路线图

### Station s1: {{STATION_NAME_1}}

**目标页面**: {{TARGET_PAGE_1}}
**入口路径**: {{ENTRY_PATH_1}} (e.g., 首页 → 搜索框)
**新用户 Discovery Mode**: {{DISCOVERY_MODE_1}} (YES = Agent 不预设路径，观察自然行为)

**操作指令**:

1. {{ACTION_1_DESC}}
   - 截图: `{{ROUND_ID}}_s1_01_{{ACTION_1_SLUG}}.png`
   - 记录: 操作耗时 / 是否需要引导

2. {{ACTION_2_DESC}}
   - 截图: `{{ROUND_ID}}_s1_02_{{ACTION_2_SLUG}}.png`
   - 记录: 可见信息层级 / 首屏关键元素

3. {{ACTION_3_DESC}}
   - 截图: `{{ROUND_ID}}_s1_03_{{ACTION_3_SLUG}}.png`
   - 记录: 系统反馈延迟 / 错误状态呈现

**多画像评估维度**:

| 评估视角 | 关注点 | 认知约束 | 成功标准 |
|----------|--------|----------|----------|
| {{PERSONA_NAME_A}} | {{FOCUS_A_1}} | {{CONSTRAINT_A_1}} | {{SUCCESS_A_1}} |
| {{PERSONA_NAME_B}} | {{FOCUS_B_1}} | {{CONSTRAINT_B_1}} | {{SUCCESS_B_1}} |
| {{PERSONA_NAME_C}} | {{FOCUS_C_1}} | {{CONSTRAINT_C_1}} | {{SUCCESS_C_1}} |

**检查项**:
- [ ] {{CHECK_1_1}}
- [ ] {{CHECK_1_2}}
- [ ] {{CHECK_1_3}}
- [ ] 无障碍: 关键操作区域有无文字标签（非纯图标）
- [ ] 响应式: 移动端关键信息是否截断

**问题触发条件** (任一满足即记录为 Issue):
- 操作路径超过 {{MAX_STEPS_1}} 步未完成任务
- 页面加载超过 {{LOAD_THRESHOLD_1}}s
- 新用户视角下入口不在首屏可见区域

---

### Station s2: {{STATION_NAME_2}}

**目标页面**: {{TARGET_PAGE_2}}
**入口路径**: {{ENTRY_PATH_2}}
**新用户 Discovery Mode**: {{DISCOVERY_MODE_2}}

**操作指令**:

1. {{ACTION_2_1_DESC}}
   - 截图: `{{ROUND_ID}}_s2_01_{{ACTION_2_1_SLUG}}.png`

2. {{ACTION_2_2_DESC}}
   - 截图: `{{ROUND_ID}}_s2_02_{{ACTION_2_2_SLUG}}.png`

3. {{ACTION_2_3_DESC}}
   - 截图: `{{ROUND_ID}}_s2_03_{{ACTION_2_3_SLUG}}.png`

**多画像评估维度**:

| 评估视角 | 关注点 | 认知约束 | 成功标准 |
|----------|--------|----------|----------|
| {{PERSONA_NAME_A}} | {{FOCUS_A_2}} | {{CONSTRAINT_A_2}} | {{SUCCESS_A_2}} |
| {{PERSONA_NAME_B}} | {{FOCUS_B_2}} | {{CONSTRAINT_B_2}} | {{SUCCESS_B_2}} |
| {{PERSONA_NAME_C}} | {{FOCUS_C_2}} | {{CONSTRAINT_C_2}} | {{SUCCESS_C_2}} |

**检查项**:
- [ ] {{CHECK_2_1}}
- [ ] {{CHECK_2_2}}
- [ ] {{CHECK_2_3}}

**问题触发条件**:
- {{TRIGGER_2_1}}
- {{TRIGGER_2_2}}

---

### Station s3: {{STATION_NAME_3}}

**目标页面**: {{TARGET_PAGE_3}}
**入口路径**: {{ENTRY_PATH_3}}
**新用户 Discovery Mode**: {{DISCOVERY_MODE_3}}

**操作指令**:

1. {{ACTION_3_1_DESC}}
   - 截图: `{{ROUND_ID}}_s3_01_{{ACTION_3_1_SLUG}}.png`

2. {{ACTION_3_2_DESC}}
   - 截图: `{{ROUND_ID}}_s3_02_{{ACTION_3_2_SLUG}}.png`

**多画像评估维度**:

| 评估视角 | 关注点 | 认知约束 | 成功标准 |
|----------|--------|----------|----------|
| {{PERSONA_NAME_A}} | {{FOCUS_A_3}} | {{CONSTRAINT_A_3}} | {{SUCCESS_A_3}} |
| {{PERSONA_NAME_B}} | {{FOCUS_B_3}} | {{CONSTRAINT_B_3}} | {{SUCCESS_B_3}} |

**检查项**:
- [ ] {{CHECK_3_1}}
- [ ] {{CHECK_3_2}}

**问题触发条件**:
- {{TRIGGER_3_1}}

<!-- 如需添加更多 Station，复制上方 Station 块，递增编号 (s4, s5...)。截图命名规则不变。 -->

---

## 输出要求

### 每站输出 (Per-Station Output)

Agent 完成每个 Station 后，立即输出以下内容（不等待全局汇总）:

**1. 截图清单**
```
{{ROUND_ID}}_sN_01_*.png   — 步骤截图（按操作顺序）
{{ROUND_ID}}_sN_issue_*.png — 问题截图（发现异常时额外截图）
```

**2. 发现问题列表** (按 Output Schema 格式)

每个 Issue 必须包含:
```yaml
issue_id: "{{ROUND_ID}}_sN_001"
station: "sN"
persona: "persona_{{ID}}"          # 发现该问题时的激活画像
severity: "P0 / P1 / P2 / P3"     # P0=阻断流程 P1=严重影响 P2=体验下降 P3=优化建议
category: "navigation / content / feedback / performance / accessibility"
description: "具体描述（包含截图文件名引用）"
screenshot: "{{ROUND_ID}}_sN_issue_001.png"
affected_personas: ["persona_{{ID_A}}", "persona_{{ID_B}}"]
reproduction_steps:
  - step 1
  - step 2
recommendation: "建议改进方向"
```

---

### 全局输出 (Global Output)

所有 Station 完成后，输出全局汇总：

**1. 场景汇总 (Scene Summary)**

```markdown
## 走查汇总 — {{ROUND_NAME}}

### 问题统计
| 严重度 | 数量 | 占比 |
|--------|------|------|
| P0 阻断 | N | XX% |
| P1 严重 | N | XX% |
| P2 体验 | N | XX% |
| P3 建议 | N | XX% |
| **合计** | **N** | 100% |

### 严重度分布（按 Station）
| Station | P0 | P1 | P2 | P3 | 合计 |
|---------|----|----|----|----|------|
| s1 {{STATION_NAME_1}} | | | | | |
| s2 {{STATION_NAME_2}} | | | | | |
| s3 {{STATION_NAME_3}} | | | | | |

### Top 3 关键发现
1. **[P? | sN]** 发现描述 — 影响画像 / 复现步骤摘要
2. **[P? | sN]** 发现描述 — 影响画像 / 复现步骤摘要
3. **[P? | sN]** 发现描述 — 影响画像 / 复现步骤摘要
```

**2. 完整截图清单**

按 Station 分组列出所有截图文件名，标注截图类型（步骤 / 问题）。

**3. 完整问题列表**

所有 Issue 按严重度排序（P0 → P3），每条 Issue 使用上方 Output Schema 格式。

---

## 截图命名规范

```
{round_id}_{station_id}_{seq}_{action_slug}.png

示例:
  r1_s1_01_search_input.png         — Round 1, Station 1, 步骤 1, 搜索输入
  r1_s2_03_filter_apply.png         — Round 1, Station 2, 步骤 3, 筛选应用
  r1_s1_issue_001.png               — Round 1, Station 1, 问题截图 #001
  r2_s4_02_checkout_confirm.png     — Round 2, Station 4, 步骤 2, 结算确认
```

规则:
- `round_id`: `r1`, `r2`, `r3` ... (本轮走查编号)
- `station_id`: `s1`, `s2`, `s3` ... (站点编号，全局唯一)
- `seq`: 两位数序号 `01`, `02` ... (站内步骤序号)
- `action_slug`: 英文小写下划线，描述操作内容 (e.g., `search_input`, `product_detail`)
- 问题截图: 用 `issue_` 前缀替换步骤序号

---

## 新用户场景处理规则

当 Station 的 `Discovery Mode = YES` 时，Agent 执行以下约束:

1. **不预设操作路径**: 先截图当前屏幕，从首屏可见元素判断用户可能的起始行为
2. **记录认知摩擦点**: 新用户视角下每个"不确定下一步"的节点必须记录为 Issue（至少 P3）
3. **关键词禁用**: 不假设用户已知的专业术语（如 "RFQ"、"MOQ"），评估时以 `{{PERSONA_NAME}}` 的认知约束为准
4. **路径记录**: 记录 Agent 判断的"最自然操作路径"，与设计预期路径对比

---

## 复用说明

### 保持固定的结构（跨 Round 不变）
- 文档头格式（Round ID / 版本 / 日期）
- Station 块结构（所有字段名）
- 输出要求格式（Per-Station + Global）
- Output Schema（Issue 数据结构）
- 截图命名规范
- 新用户场景处理规则

### 每个 Round 需要替换的内容
- `{{ROUND_NAME}}` / `{{ROUND_ID}}` — 如 "Round 1: 首次搜索流程" / `r1`
- `{{DATE}}` — 走查执行日期
- `{{WALKTHROUGH_OBJECTIVE}}` — 本轮目标描述
- `{{ACTIVE_PERSONAS}}` — 引用 persona.md 中参与本轮的画像 ID
- `{{ENV_URL}}` / `{{ACCOUNT_STATE}}` / `{{DATA_STATE}}` — 前置条件
- 所有 Station 内容（名称、页面、操作指令、检查项、评估维度）

### Station 数量建议
- 单次走查: 3–6 个 Station（避免上下文过长导致 Agent 质量下降）
- 超过 6 个 Station 时，拆分为 多个 Round（r1, r2...），每个 Round 独立任务卡
- 每个 Station 操作指令建议不超过 5 步
