# 用户画像库 — {{PROJECT_NAME}}

> **版本**: v1.0 | **最后更新**: {{DATE}} | **作者**: {{AUTHOR}}

---

## 使用说明

本文档定义了走查中需要切换视角评估的所有用户画像。
Agent 在走查时会根据任务卡（task_card.md）指定的画像 ID 切换评估视角。

**关键规则**:
- 每次走查评估时，Agent 需声明当前激活的画像（如 `[视角: Persona A]`）
- 多画像评估时，同一界面需按画像权重排序输出观察结论
- 标签（Tags）用于在评估规则库中自动匹配适用规则，不可随意修改
- 权重百分比总和必须为 **100%**
- 经验水平影响走查约束：新用户启用 **Discovery Mode**（不预设操作路径）

---

## 画像列表

### 画像 1: {{PERSONA_NAME_1}}

- **画像 ID**: `persona_{{ID_1}}`
- **权重占比**: {{WEIGHT_1}}%
- **背景描述**: {{BACKGROUND_1}}
- **行业**: {{INDUSTRY_1}}
- **公司规模**: {{COMPANY_SIZE_1}} (e.g., 1–10人 / 11–50人 / 50–200人 / 200人以上)
- **采购动机**: {{MOTIVATION_1}}
- **决策关注点**: {{DECISION_FACTORS_1}}
- **经验水平**: {{EXPERIENCE_LEVEL_1}} (老用户 / B类小白 / B类资深新用户)
- **典型采购品类**: {{TYPICAL_CATEGORIES_1}}
- **使用行为特征**: {{BEHAVIOR_1}}
- **标签**:
  ```
  persona_type={{TYPE_1}}
  category_affinity={{AFFINITY_1}}
  experience={{EXP_1}}
  decision_speed={{SPEED_1}}
  price_sensitivity={{PRICE_1}}
  ```

**走查约束**:
- Discovery Mode: {{YES_NO}} (新用户 = YES，不提示操作路径)
- 允许的专业术语假设: {{JARGON_ASSUMPTION_1}}
- 典型任务心智: {{MENTAL_MODEL_1}}

---

### 画像 2: {{PERSONA_NAME_2}}

- **画像 ID**: `persona_{{ID_2}}`
- **权重占比**: {{WEIGHT_2}}%
- **背景描述**: {{BACKGROUND_2}}
- **行业**: {{INDUSTRY_2}}
- **公司规模**: {{COMPANY_SIZE_2}}
- **采购动机**: {{MOTIVATION_2}}
- **决策关注点**: {{DECISION_FACTORS_2}}
- **经验水平**: {{EXPERIENCE_LEVEL_2}} (老用户 / B类小白 / B类资深新用户)
- **典型采购品类**: {{TYPICAL_CATEGORIES_2}}
- **使用行为特征**: {{BEHAVIOR_2}}
- **标签**:
  ```
  persona_type={{TYPE_2}}
  category_affinity={{AFFINITY_2}}
  experience={{EXP_2}}
  decision_speed={{SPEED_2}}
  price_sensitivity={{PRICE_2}}
  ```

**走查约束**:
- Discovery Mode: {{YES_NO}}
- 允许的专业术语假设: {{JARGON_ASSUMPTION_2}}
- 典型任务心智: {{MENTAL_MODEL_2}}

---

### 画像 3: {{PERSONA_NAME_3}}

- **画像 ID**: `persona_{{ID_3}}`
- **权重占比**: {{WEIGHT_3}}%
- **背景描述**: {{BACKGROUND_3}}
- **行业**: {{INDUSTRY_3}}
- **公司规模**: {{COMPANY_SIZE_3}}
- **采购动机**: {{MOTIVATION_3}}
- **决策关注点**: {{DECISION_FACTORS_3}}
- **经验水平**: {{EXPERIENCE_LEVEL_3}} (老用户 / B类小白 / B类资深新用户)
- **典型采购品类**: {{TYPICAL_CATEGORIES_3}}
- **使用行为特征**: {{BEHAVIOR_3}}
- **标签**:
  ```
  persona_type={{TYPE_3}}
  category_affinity={{AFFINITY_3}}
  experience={{EXP_3}}
  decision_speed={{SPEED_3}}
  price_sensitivity={{PRICE_3}}
  ```

**走查约束**:
- Discovery Mode: {{YES_NO}}
- 允许的专业术语假设: {{JARGON_ASSUMPTION_3}}
- 典型任务心智: {{MENTAL_MODEL_3}}

<!-- 如需添加更多画像，复制上方画像块并递增编号。确保所有权重之和 = 100% -->

---

## 画像权重汇总

| 画像 ID | 画像名称 | 权重 | 经验水平 | Discovery Mode |
|---------|----------|------|----------|----------------|
| `persona_{{ID_1}}` | {{PERSONA_NAME_1}} | {{WEIGHT_1}}% | {{EXPERIENCE_LEVEL_1}} | {{YES_NO}} |
| `persona_{{ID_2}}` | {{PERSONA_NAME_2}} | {{WEIGHT_2}}% | {{EXPERIENCE_LEVEL_2}} | {{YES_NO}} |
| `persona_{{ID_3}}` | {{PERSONA_NAME_3}} | {{WEIGHT_3}}% | {{EXPERIENCE_LEVEL_3}} | {{YES_NO}} |
| **合计** | — | **100%** | — | — |

---

## 评估规则匹配说明

标签字段用于在走查时自动匹配评估规则库（`rules/`）中的规则集：

| 标签键 | 可选值 | 匹配逻辑 |
|--------|--------|----------|
| `persona_type` | `sourcing_agent` / `end_buyer` / `distributor` | 精确匹配 |
| `category_affinity` | `general` / `electronics` / `apparel` / `machinery` | 模糊匹配 |
| `experience` | `new` / `intermediate` / `expert` | 范围匹配（new 触发新用户专项规则） |
| `decision_speed` | `fast` / `medium` / `slow` | 用于评估信息密度是否匹配 |
| `price_sensitivity` | `high` / `medium` / `low` | 用于评估价格信息呈现优先级 |

---

## 复用说明

### 保持固定的结构（跨项目不变）
- 文档头（版本/日期/作者）
- 使用说明与关键规则
- 画像字段结构（所有字段名称）
- 画像权重汇总表
- 评估规则匹配说明（表头）

### 每个项目需要替换的内容
- `{{PROJECT_NAME}}` — 替换为项目名称（如 "Accio Search"）
- `{{DATE}}` / `{{AUTHOR}}` — 替换为实际日期和作者
- 所有 `{{PERSONA_NAME_*}}` / `{{BACKGROUND_*}}` 等内容字段
- 标签值（根据实际画像特征填写）
- 评估规则匹配说明表格中的"可选值"（根据项目实际标签值补充）

### 画像数量
- 最少 2 个，推荐 3–5 个
- 超过 5 个画像时建议拆分为主画像库 + 扩展画像库两个文件
