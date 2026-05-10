# UX Walkthrough Agent Architecture

## Overview

A reusable 3-layer agent system for automated UX experience audits. Users provide a **walkthrough flow** (user journey stages) and **user personas**, and the system outputs structured findings + an interactive HTML report.

Originally designed for Alibaba.com B2B (找-挑-询 journey), but generalizable to any product's user journey.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 0: Configurator                     │
│            (Claude Code conversation — one-time)             │
│                                                              │
│  Input:  用户提供走查流程 + 用户画像 + 评估维度               │
│  Output: 4份 Markdown 文件（系统指令/画像/任务卡×N）          │
│          + 执行 Prompt                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ generates
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Layer 1: Walkthrough Executor                │
│          (Browser Agent — per-round, can parallelize)         │
│                                                              │
│  Input:  系统指令.md + 画像.md + 任务卡.md                    │
│  Agent:  Browser automation (内部工具 / Claude-in-Chrome)     │
│  Process: 访问页面 → 截图 → 标注 → 多画像视角评估             │
│  Output: 结构化 Markdown 走查发现                             │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Round 1   │  │ Round 2   │  │ Round N   │  ← parallel OK  │
│  │ 核心场景  │  │ 地区/行业 │  │ 专项走查  │                   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                │
└────────┼──────────────┼──────────────┼──────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Layer 2: Report Synthesizer                  │
│              (Claude text generation — final)                 │
│                                                              │
│  Input:  所有走查 Markdown 合并 + 报告生成 Prompt              │
│  Output: 单个交互式 HTML 报告                                 │
│          ├── 体验温度地图 (heatmap)                            │
│          ├── 体验洼地分析 (weighted cross-analysis)            │
│          ├── 链路断裂点 (breakpoint analysis)                  │
│          └── 全集问题数据库 (filterable table + screenshots)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 0: Configurator — 配置层

### Purpose
将用户的走查需求转化为 Agent 可执行的标准化文档。这是一个 Claude Code 对话，用户填写配置，系统生成 4 类文件。

### Input: 用户配置表 (`config.md`)

用户需要提供以下信息（可以是自然语言，Configurator Agent 会结构化）：

```markdown
# 走查配置

## 基本信息
- 项目名称: [e.g., Alibaba.com 国际站 B2B 走查]
- 目标站点: [e.g., https://www.alibaba.com]
- 走查范围: [e.g., 核心采购链路，不含下单支付]

## 用户旅程阶段 (Journey Stages)
<!-- 定义你的产品的核心用户旅程阶段，替代默认的"找-挑-询" -->
- 阶段1: [名称] — [该阶段涉及的页面/场景]
- 阶段2: [名称] — [该阶段涉及的页面/场景]
- 阶段3: [名称] — [该阶段涉及的页面/场景]

## 用户画像
<!-- 每个画像需要：名称、占比权重、核心特征、采购动机、决策关注点 -->
- 画像1: [名称] — 占比 [X%]
  - 特征: ...
  - 采购动机: ...
  - 决策关注点: ...

## 变量维度
<!-- 除画像外，你关心的交叉变量 -->
- 维度1: [e.g., 品类] — 枚举值: [标准品, 轻定制, 重定制]
- 维度2: [e.g., 新老用户] — 枚举值: [老用户, 新手小白, 新手资深]
- 维度3: [e.g., 地区] — 枚举值: [美洲, 欧洲, 亚太]

## 评估重点
<!-- 特别关注的评估维度 -->
- [e.g., AI 功能体验需要强化走查]
- [e.g., 新用户认知障碍需要 discovery 式探索]

## 报告受众
- [e.g., 业务老板关心商业机会点, 设计老板关心标准化流程]
```

### Output: 4 类文件

| 文件 | 用途 | 固定/可变 |
|------|------|-----------|
| `system_instructions.md` | Agent 的角色定义、工作规范、输出格式 | 框架固定，枚举值可变 |
| `personas.md` | 所有画像的结构化描述 | 全部可变 |
| `task_card_XX.md` | 每轮走查的具体执行指令 | 全部可变 |
| `round_prompt.md` | 粘贴给 Agent 的组装 Prompt | 结构固定，引用可变 |

---

## Layer 1: Walkthrough Executor — 走查执行层

### Agent Capabilities Required

执行层的 Agent 需要具备以下能力：

| 能力 | 说明 | Claude-in-Chrome 对应工具 |
|------|------|---------------------------|
| 网页导航 | 打开 URL、前进后退 | `navigate` |
| 页面阅读 | 读取页面内容和结构 | `read_page`, `get_page_text` |
| 交互操作 | 点击、输入、滚动 | `computer` (click/type/scroll) |
| 截图 | 全页或区域截图 | `computer` (screenshot) |
| 元素定位 | 找到特定 UI 元素 | `find`, `read_page` (ref_id) |
| 表单填写 | 填写搜索框、询盘表单 | `form_input`, `computer` (type) |

### Execution Protocol

每轮走查的执行协议：

```
1. 加载系统指令 → 建立 Agent 角色和规范
2. 加载画像文档 → Agent 理解所有画像特征
3. 加载任务卡 → Agent 按站点顺序逐个执行
4. 每个站点 (Station):
   a. 导航到目标页面（老用户直接搜索 / 新用户自然探索）
   b. 截图当前页面状态
   c. 从指定画像视角评估
   d. 发现问题 → 截图 + 红框标注 + 记录
   e. 完成当前站点所有检查项
   f. 输出该站点的结构化发现
5. 全部站点走完 → 输出场景汇总 + 完整问题列表
```

### Output Schema (每条问题)

```markdown
### 问题: [一句话标题]

- **所属环节**: [找/挑/询 or 自定义阶段名]
- **子环节**: [e.g., 搜索结果页 / 商品详情页-价格区域]
- **评估画像**: [e.g., 小微零售商-老买家]
- **严重度**: [P0 阻断 / P1 严重 / P2 一般 / P3 轻微]
- **问题分类**: [Quick Win / 结构性体验问题 / 商业战略性机会]
- **问题描述**: [从用户视角描述遇到了什么问题]
- **优化建议**: [具体可执行的改进方向]
- **页面 URL**: [当前页面地址]
- **截图**: [带红框标注的截图]
```

### Screenshot Protocol — 全过程截图规范

走查过程中有**两类截图**，缺一不可：

| 类型 | 触发时机 | 是否标注 | 命名规则 | 报告用途 |
|------|----------|----------|----------|----------|
| **步骤截图** (Step Shot) | 每个操作步骤完成后**主动截取** | 不标注，记录原始状态 | `{round}_{station}_{step}_{action}.png` | 走查过程复现，报告中展示完整用户旅程 |
| **问题截图** (Issue Shot) | 发现体验问题时截取 | 红框标注问题区域 | `{round}_{station}_issue_{seq}_{brief}.png` | 问题数据库右侧截图列 |

**命名示例：**
```
# 步骤截图 — 每一步都要截
r1_s1_01_homepage_landing.png
r1_s2_01_search_input_phone_case.png
r1_s2_02_search_results_loaded.png
r1_s2_03_filter_panel_opened.png
r1_s3_01_product_detail_entered.png
r1_s3_02_scroll_to_supplier_info.png

# 问题截图 — 发现问题时，带红框
r1_s2_issue_01_filter_missing_material.png
r1_s3_issue_02_price_hidden_behind_login.png
```

**每站结束时输出截图清单：**
```markdown
| 截图文件名 | 类型 | 说明 |
|------------|------|------|
| r1_s1_01_homepage_landing.png | 步骤 | 首页首屏着陆状态 |
| r1_s1_02_scroll_categories.png | 步骤 | 滚动到分类导航区域 |
| r1_s1_issue_01_nav_unclear.png | 问题 | 导航分类标签含义不清 |
```

**截图在报告中的呈现：**
- 温度地图 hover → 弹出该区域步骤截图缩略图（用户旅程可视化）
- 洼地分析 → 关键洞察配套步骤截图（"用户实际看到了什么"）
- 断裂点 → 断裂前后步骤截图对比（直观展示体验断裂）
- 问题数据库 → 右侧展示问题截图（带红框标注）

### Key Constraints for Executor Agent

```markdown
## 截图标注规范（问题截图）
- 红色矩形框，边框 3px，标注在问题元素上
- 必须基于当前可视视口，不能标注滚动后才能看到的区域
- 如果问题区域需要滚动，先滚动到位再截图
- 标注区域面积不能过大（不超过视口 50%）也不能过小（不小于 20x20px）

## 步骤截图规范（每步必截）
- 每完成一个操作步骤，立即截取当前页面全屏截图
- 不需要红框标注，只记录页面当前原始状态
- 操作描述用英文小写 + 下划线，简洁准确

## 新用户认知约束
- 新用户场景禁止直接提供搜索关键词
- 禁止通过 URL 直接导航到目标页面
- 遇到平台术语（Trade Assurance, MOQ, RFQ 等）必须标记为认知障碍
- Agent 需要模拟"不知道任何平台术语"的状态

## 问题分类标准
- Quick Win: 只需改文案/颜色/位置，不涉及逻辑改动
- 结构性问题: 需要改交互流程或信息架构
- 战略性机会: 涉及产品定位或商业模式层面的洞察
```

---

## Layer 2: Report Synthesizer — 报告合成层

### Input
所有走查轮次的 Markdown 结果合并成一个文件。

### Report Structure (4 Blocks)

#### Block 1: 体验温度地图
```
横轴: 用户旅程阶段 (含子环节)
纵轴: 画像 × 新老维度
色值: 基于加权问题分 (P0=4, P1=3, P2=2, P3=1)
交互: hover 显示该区域具体问题数量和严重度分布
```

#### Block 2: 体验洼地分析
```
从 3 个视角交叉分析:
1. 新老用户视角 — 新用户 vs 老用户的问题分布差异
2. 采购目标视角 — 标准品 vs 轻定制 vs 重定制
3. 地区视角 — 不同地区的差异化问题

每个视角给 Top 3 洞察
结合样本量权重（画像占比）计算加权严重度
```

#### Block 3: 链路断裂点
```
找到问题最集中的环节
链路图展示各环节健康度 (绿/黄/红)
叠加行业维度 (参数型 vs 视觉型) 看差异
```

#### Block 4: 全集问题数据库
```
可筛选表格:
- 左侧: 标题 + 问题分类 + 描述 + 优化建议
- 右侧: 带标注截图
- 筛选器: 画像类型 / 新老买家 / 品类 / 环节 / 严重度 / 问题分类 / 地区 / 行业
```

### Report Generation Prompt Template

```markdown
以下是对 {{PROJECT_NAME}} 的全链路体验走查结果，包含 {{N}} 个场景的走查发现。

请基于这些数据，生成一份 HTML 格式的走查报告，包含以下四个板块：

1. 体验温度地图：横轴是 {{JOURNEY_STAGES}} 的流程环节（含子环节），
   纵轴是不同画像 + 新老维度，
   单元格颜色基于问题加权分（P0=4, P1=3, P2=2, P3=1），
   hover 显示具体问题摘要

2. 体验洼地分析：从 {{ANALYSIS_DIMENSIONS}} 视角，
   结合各画像的样本量权重（{{PERSONA_WEIGHTS}}），
   找出加权后最严重的体验问题集中区域，每个视角给 Top 3 洞察

3. 链路断裂点：找出问题最集中的环节，用链路图展示各环节健康度

4. 全集问题数据库：所有问题的可筛选表格，
   左边文字描述右边截图，
   支持按 {{FILTER_DIMENSIONS}} 筛选

报告要求：
- 单个 HTML 文件，可独立打开
- 交互功能用原生 JS 实现，不依赖外部库
- 视觉风格专业简洁，适合高层汇报

以下是所有走查数据：

[合并后的所有走查 Markdown]
```

---

## Execution Workflow — 执行流程

### For 边然 (或任何设计师) 的操作步骤

```
Step 0: 填写配置表
  ↓ 用户提供: 走查流程 + 画像 + 变量维度
  ↓ Configurator Agent 生成 4 份文件

Step 1: 第一轮走查 (核心场景)
  ↓ 新会话 → 粘贴: 系统指令 + 画像 + 任务卡-01
  ↓ Agent 执行走查 → 输出 Markdown
  ↓ 你快速质检（截图标注、问题描述、严重度）
  ↓ 保存为 round1_findings.md

Step 2: 第二轮走查 (叠加维度，可选)
  ↓ 新会话 → 粘贴: 系统指令 + 画像 + 任务卡-02
  ↓ Agent 执行走查 → 输出 Markdown
  ↓ 保存为 round2_findings.md

Step 3: 合成报告
  ↓ 新会话 → 粘贴: 报告生成 Prompt + 所有 findings
  ↓ Agent 生成 HTML 报告
  ↓ 检查 → 微调 → 交付

Timeline per round: ~30-60 min (depending on site complexity)
Total: 2-3 hours for complete walkthrough + report
```

### Parallel Execution (提效)

如果工具支持，Round 1 和 Round 2 可以并行执行：

```
         ┌── Round 1 (核心场景) ──┐
Step 0 ──┤                        ├── Step 3 (合成报告)
         └── Round 2 (叠加维度) ──┘
```

---

## File Structure

```
ux-walkthrough-agent/
├── architecture.md              ← 你正在看的这个文件
├── templates/                   ← 可复用模板（框架层）
│   ├── system_instructions.template.md
│   ├── persona.template.md
│   ├── task_card.template.md
│   └── report_prompt.template.md
├── instances/                   ← 具体项目实例
│   └── alibaba-b2b/
│       ├── config.md            ← 项目配置
│       ├── system_instructions.md
│       ├── personas.md
│       ├── task_card_01_core.md
│       ├── task_card_02_region_industry.md
│       ├── round1_prompt.md
│       └── round2_prompt.md
├── outputs/                     ← 走查产出
│   └── alibaba-b2b/
│       ├── round1_findings.md
│       ├── round2_findings.md
│       └── final_report.html
└── rules/                       ← 评估规则库（越用越厚）
    ├── b2b_ecommerce.rules.md   ← B2B 电商场景规则
    ├── saas.rules.md            ← SaaS 产品规则（未来）
    └── mobile_app.rules.md      ← 移动端规则（未来）
```

---

## Alibaba.com B2B Instance — 国际站实例

### 配置摘要

| 配置项 | 值 |
|--------|-----|
| 用户旅程 | 找(首页导购/搜索) → 挑(商详页) → 询(沟通场景) |
| 画像 | 小微零售商(40%) / 中型品牌零售商(33.8%) / 大型品牌主(5%) / 服务提供商(12.1%) / 制造商(9.1%) |
| 品类维度 | 标准品(Buy Now) / 轻定制(Logo/颜色) / 重定制(OEM/ODM询盘) |
| 新老维度 | 老买家 / B类小白新买家 / B类资深但未用过国际站 |
| 地区维度 | 美洲 / 欧洲(德国) / 亚太(印尼) |
| 行业维度 | 参数型(汽摩配) / 视觉型(服装) |
| 特殊关注 | AI 功能体验强化走查 |
| 报告受众 | 业务老板(商业机会) + 设计老板(标准化流程) |

### 走查轮次设计

**Round 1 — 核心场景 (画像×品类×新老)**
- Agent 走一遍网站，在每个关键页面从多个画像角度评估
- 4次搜索覆盖品类差异（标准品/轻定制/重定制/制造商Tab）
- 每个页面从老用户、新手小白、新手资深三个认知层评估
- 产出: 核心链路的完整问题数据库

**Round 2 — 叠加维度 (地区×行业)**
- Part 1 地区差异: 美国→德国→印尼，各走一遍核心链路
  - 德国: 用德语测试 AI 翻译
  - 印尼: 用移动端视口(375px)测试
- Part 2 行业差异: 汽摩配(参数型) vs 服装(视觉型)
  - 对比搜索结果、商详页信息呈现、AI Mode
- 产出: 地区和行业维度的差异分析

### 场景矩阵有效组合

```
                     标准品    轻定制    重定制
小微零售商-老买家      ✅        ✅       ❌
小微零售商-新小白      ✅        ✅       ❌
小微零售商-新资深      ✅        ❌       ❌
中型品牌-老买家        ✅        ✅       ✅
中型品牌-新资深        ❌        ✅       ✅
大型品牌主-老买家      ❌        ❌       ✅  (叠加维度)
服务提供商-老买家      ✅        ✅       ❌  (叠加维度)
制造商-老买家          ✅        ❌       ❌  (叠加维度)
```

---

## How to Adapt for a New Project — 复用指南

### Example: 如果要走查另一个产品（比如一个 SaaS 工具）

1. **复制 `config.md` 模板**，填入新项目信息：
   ```markdown
   ## 用户旅程阶段
   - 注册/登录
   - 新手引导
   - 核心功能使用
   - 付费转化
   
   ## 用户画像
   - 个人开发者 — 占比 45%
   - 小团队管理者 — 占比 35%
   - 企业 IT 决策者 — 占比 20%
   ```

2. **运行 Configurator**（Claude Code 对话）：
   ```
   请基于以下配置，生成走查系统的 4 份文件：
   系统指令、用户画像、任务卡、执行 Prompt。
   [粘贴 config.md]
   ```

3. **执行走查和生成报告**，流程完全相同

### 什么是固定的（不需要改）
- 问题严重度等级 (P0-P3)
- 问题分类框架 (Quick Win / 结构性 / 战略性)
- 截图标注规范
- 报告 4 块板结构
- Output Schema 字段结构

### 什么是可变的（每次替换）
- 用户旅程阶段名称和内容
- 画像定义和权重
- 交叉变量维度和枚举值
- 搜索关键词和操作路径
- 行业/地区等叠加维度
