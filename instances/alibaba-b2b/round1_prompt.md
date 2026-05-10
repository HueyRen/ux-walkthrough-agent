# Round 1 执行 Prompt

**用途**: 将此 prompt 复制到支持浏览器操作的 AI Agent 中（如 Claude with browser tool），即可开始执行 Round 1 核心链路走查。

**使用方式**:
1. 将下方提示词复制到 agent 对话框
2. 将三份文档内容分别粘贴到对应的 `[粘贴 XXX]` 占位符位置
3. 发送，等待 agent 开始执行

---

## 执行提示词

```
请阅读以下三份文档，然后严格按照走查任务卡中的路线图逐站执行走查。

第一份是你的系统指令，定义了你的角色、工作规范和输出格式，全程遵守。
第二份是买家画像库，走查过程中切换视角时参考对应画像的特征描述。
第三份是本次走查任务卡，按照其中的站点顺序逐个执行。

要求：
1. 每个站点必须实际打开页面操作，不要凭想象描述
2. 每完成一个操作步骤，立即截取全屏步骤截图并按规范命名
3. 每发现一个问题，截图并用红框标注具体问题元素
4. 走完全部站点后，按系统指令中的输出格式产出完整报告
5. 报告末尾附上完整截图清单（所有步骤截图 + 所有问题截图）
6. 报告用 Markdown 格式输出

开始前，确认以下前提条件：
- 浏览器已清除 cookies 和缓存
- 视口设置为 1440px 宽
- 以未登录状态访问 alibaba.com
- 截图存储目录: ./screenshots/round1/

如果在执行过程中遇到页面加载失败，等待 10 秒后重试一次。仍然失败则记录为 P1 问题并继续。

---

【文档一：走查系统指令】

[粘贴 system_instructions.md 的完整内容]

---

【文档二：买家画像】

[粘贴 personas.md 的完整内容]

---

【文档三：走查任务卡-01（核心链路）】

[粘贴 task_card_01_core.md 的完整内容]

---

现在开始执行。从站点 1（首页着陆）开始，按顺序逐站执行，不要跳站。每完成一个站点，输出该站点的走查结果，然后继续下一个站点。全部完成后，输出完整的走查报告。
```

---

## 使用说明

### 文档粘贴顺序
1. **文档一**: 复制 `system_instructions.md` 的全部内容
2. **文档二**: 复制 `personas.md` 的全部内容
3. **文档三**: 复制 `task_card_01_core.md` 的全部内容

### 预期执行行为
Agent 应该：
- 先回复"已理解三份文档，开始执行站点1"类似的确认
- 逐站执行，每站输出:
  - 操作记录（步骤 + 截图文件名）
  - 发现的问题（按 Schema 格式）
  - AI 功能观察（如有）
  - 平台术语 Flag（如有）
  - 截图检查表
- 全部9站完成后，输出完整报告

### 如果 Agent 偏离轨道
如果 agent 开始描述而不是操作，发送以下纠偏指令：

```
停止描述，请实际打开浏览器操作页面。你现在应该在 [当前站点] 的 [当前步骤]。请截取页面截图，不要凭想象描述。
```

如果 agent 跳过了截图：

```
你跳过了步骤截图。请回到上一步，截取该步骤的截图，文件名按规范命名，然后继续。
```

### 中途恢复指令
如果走查中断（如浏览器崩溃、连接断开），发送以下指令恢复：

```
走查在站点 [X] 的步骤 [Y] 中断。请从该步骤继续，保持截图命名连续性。已完成的截图不需要重拍。
```

### 报告验证清单

收到完整报告后，验证以下项目：

- [ ] 9 个站点全部覆盖（S1-S9）
- [ ] 每个站点都有截图检查表
- [ ] 每个问题都有完整的 Schema（所有字段填写）
- [ ] 严重度分级合理（有 P0/P1/P2/P3 的分布，不要全是 P2）
- [ ] 分类合理（Quick Win / 结构性 / 商业机会 三类都有）
- [ ] AI 功能专项部分存在
- [ ] 平台术语 Flag 部分存在
- [ ] 新用户认知负荷评分（每站点一个）
- [ ] 截图 Manifest 存在且完整
- [ ] 报告结构符合系统指令中的"完整报告结构"

---

## 快速版 Prompt（单文档版）

如果你的 Agent 不支持粘贴多段文档，可以使用以下单文档合并格式：

```
你是 Alibaba.com 国际站 B2B 体验走查专家。

你的工作规范如下：
- 必须实际操作浏览器，不允许凭想象描述页面
- 每个步骤完成后立即截图，按规范命名
- 每发现问题立即截图标注红框
- 严格按站点顺序执行，不跳站

截图命名规范：
- 步骤截图: {round}_{station}_{step}_{action}.png（如 r1_s1_homepage_step01_navigate.png）
- 问题截图: {round}_{station}_issue_{seq}_{brief}.png（如 r1_s1_homepage_issue_01_nav_overflow.png）

问题严重度：P0阻断 / P1严重 / P2一般 / P3轻微
问题分类：Quick Win / 结构性体验问题 / 商业战略性机会

平台术语必须 Flag（含 Trade Assurance、MOQ、RFQ、Gold Supplier、Verified Supplier、Ready to Ship、Customization Hub、OEM/ODM）

每站点结束输出：问题列表 + AI功能观察 + 术语Flag + 截图检查表

现在请从零开始走查以下 9 个站点：
1. 首页（Lisa Chen视角为主，Carlos Mendez辅）
2. 搜索"phone case"（Carlos主，Lisa辅）
3. 标准品PDP（Carlos主，Lisa+Kenji辅）
4. 搜索"custom logo mug"（Anna主，Isabelle辅）
5. 轻定制PDP（Anna主，Isabelle辅）
6. 搜索"OEM bluetooth speaker"（Marcus主，Ryan辅）
7. 重定制PDP（Marcus主，David辅）
8. 沟通询盘流程（Anna主，Carlos辅）
9. Manufacturers Tab（Marcus主，Ahmad辅）

画像简要说明：
- Lisa Chen: 美国B类小白，第一次用Alibaba，不懂平台术语
- Carlos Mendez: 墨西哥老买家，Amazon卖家，熟悉平台
- Kenji Watanabe: 日本B类资深，有采购经验但第一次用国际站
- Anna Kowalski: 波兰B类资深，企业礼品采购，第一次用Alibaba
- Isabelle Durand: 法国老买家，家居品牌，视觉型品类
- Marcus Thompson: 美国老买家，运动品牌供应链经理
- Ryan Park: 韩国老买家，3C品牌，ODM需求
- David Chen: 美国大型品牌VP，深度OEM需求
- Ahmad Hassan: 巴基斯坦纺织厂老板，找原材料

开始，从站点1首页开始，以未登录状态、1440px视口打开 https://www.alibaba.com。
```
