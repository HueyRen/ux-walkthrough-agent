# 走查任务卡 02 — 地区 × 行业 Overlay 走查

**走查轮次**: Round 2 (r2)
**目标**: 发现地区差异和行业差异带来的体验落差，验证 AI 翻译和本地化能力
**结构**: Part 1 地区差异（3地区）+ Part 2 行业差异（2行业）
**预计时长**: 3-5 小时

---

## 前置说明

本轮走查是 Round 1 核心链路的 overlay，聚焦在**特定条件下体验是否一致**。

每个地区/行业场景都要执行：搜索 → 商品详情 → 沟通/询盘 的完整小链路。

所有步骤截图**强制拍摄**，不可省略。

---

## Part 1: 地区差异走查

### 执行矩阵

| 地区 | 画像 | 搜索词 | 视口 | 语言设置 | 特殊关注点 |
|------|------|--------|------|----------|------------|
| 美国 | Carlos Mendez | "phone case 1000 pcs" | 1440px | 英文 | 基准体验 |
| 德国 | Anna Kowalski | "Kaffeetasse mit Logo" (德语) | 1440px | 德文/英文切换 | AI翻译、GDPR/CE合规信息 |
| 印尼 | Kenji Watanabe | "phone case" | **375px** | 英文 | 移动端体验、本地支付 |

---

### 地区 1: 美国买家（基准体验）

**画像**: Carlos Mendez（老买家，美洲，标准品）
**视口**: 1440px 桌面端
**语言**: 英文（默认）

#### 搜索阶段

1. **以英文环境访问 https://www.alibaba.com（不登录）**
   - 截图: `r2_s1_us_step01_navigate.png`

2. **搜索 "phone case 1000 pcs"**
   - 截图: `r2_s1_us_step02_search.png`

3. **截图搜索结果首屏，记录信息密度和呈现方式**
   - 截图: `r2_s1_us_step03_results_firstscreen.png`

4. **筛选: Trade Assurance + Verified Supplier + MOQ ≤ 1000**
   - 截图: `r2_s1_us_step04_filters_applied.png`

#### 商品详情阶段

5. **进入第一个符合条件的商品 PDP**
   - 截图: `r2_s1_us_step05_pdp_enter.png`

6. **记录价格展示方式（是否显示美元？是否有关税估算？）**
   - 截图: `r2_s1_us_step06_price_display.png`

7. **查看物流信息（是否显示美国到岸时间、运费估算）**
   - 截图: `r2_s1_us_step07_shipping_info.png`

#### 沟通阶段

8. **点击 Contact Supplier，截图询盘表单**
   - 截图: `r2_s1_us_step08_inquiry_form.png`

9. **记录以下基准数据（与其他地区对比用）**:
   - 搜索结果第一页商品数量
   - 筛选后剩余结果数
   - PDP 首屏显示的信息项
   - 询盘表单字段数量

---

### 地区 2: 德国买家（欧洲合规 + AI翻译）

**画像**: Anna Kowalski（B类资深，欧洲，轻定制）
**视口**: 1440px 桌面端
**语言**: 先用德语尝试，再测试 AI 翻译

**重要说明**: 德国买家测试的核心是「语言体验」和「欧洲合规信息」，必须实际用德语发消息测试 AI 翻译功能。

#### 语言体验阶段

1. **访问 https://www.alibaba.com，切换界面语言至德语（Deutsch）**
   - 找到语言切换入口（通常在页面顶部右侧或底部）
   - 截图: `r2_s2_de_step01_language_switch_entry.png`
   - 如果切换成功: `r2_s2_de_step01b_german_interface.png`
   - 如果无法切换: 记录为 [TERM_FLAG] + 问题，继续用英文进行

2. **用德语搜索定制马克杯: "Kaffeetasse mit Logo bedrucken"**
   - 截图: `r2_s2_de_step02_german_search.png`
   - 记录: 搜索词是否被识别？结果是否相关？

3. **如果德语搜索无效，改用英语搜索 "custom logo mug"，记录语言切换行为**
   - 截图: `r2_s2_de_step03_english_fallback.png`

#### 欧洲合规信息阶段

4. **进入一个马克杯/礼品类 PDP**
   - 截图: `r2_s2_de_step04_pdp_enter.png`

5. **寻找 CE 认证信息（欧洲合规必需）**
   - 位置可能在: 认证区、产品描述、供应商资质
   - 截图: `r2_s2_de_step05_ce_certification.png`
   - 记录: CE 认证是否存在？是否突出展示？对欧洲买家是否容易找到？

6. **寻找 REACH / RoHS 合规信息（礼品类欧洲常见要求）**
   - 截图: `r2_s2_de_step06_reach_rohs.png`

7. **检查是否有德国/欧洲本地化的物流时效和价格**
   - 截图: `r2_s2_de_step07_eu_shipping.png`

#### AI 翻译测试（关键测试环节）

8. **进入与任一供应商的聊天界面（Trade Manager / Messenger）**
   - 截图: `r2_s2_de_step08_chat_enter.png`

9. **用德语发送一条测试消息**:
   - 消息内容: "Guten Tag, ich möchte 500 Tassen mit meinem Firmenlogo bestellen. Können Sie mir bitte ein Angebot machen? Ich benötige auch Informationen über CE-Zertifizierung."
   - 中文含义: "您好，我想订购500个带我公司Logo的杯子。请报价，并提供CE认证信息。"
   - 截图: `r2_s2_de_step09_german_message_sent.png`

10. **截图供应商收到后的界面（是否有自动翻译提示？平台是否将德语翻译为中文？）**
    - 截图: `r2_s2_de_step10_translation_result.png`
    - 记录: 翻译是否自动触发？翻译质量如何（是否通顺）？

11. **检查询盘表单是否支持德语输入，并且字段提示是否为德语**
    - 截图: `r2_s2_de_step11_inquiry_form_german.png`

#### GDPR 与隐私合规

12. **寻找 GDPR 合规提示或 Cookie 同意弹窗（欧洲法规要求）**
    - 截图: `r2_s2_de_step12_gdpr_cookie_banner.png`
    - 记录: 是否有 Cookie 同意弹窗？是否符合 GDPR 要求（有拒绝选项）？

---

### 地区 3: 印尼买家（移动端 + 新兴市场）

**画像**: Kenji Watanabe（B类资深，亚太），但适配印尼场景
**视口**: **375px 移动端**（必须在走查开始前将浏览器调整为 375px 宽度）
**语言**: 英文
**特殊约束**: 全程使用 375px 视口，模拟移动端体验

**重要说明**: 印尼有大量买家通过手机访问 Alibaba，移动端体验至关重要。

#### 移动端基础体验

1. **调整浏览器视口至 375px 宽度**
   - 截图: `r2_s3_id_step01_375px_viewport.png`（截图需包含视口宽度信息）

2. **访问 https://www.alibaba.com，截图移动端首页**
   - 截图: `r2_s3_id_step02_mobile_homepage.png`
   - 记录: 是否自动跳转到移动版？还是显示桌面版缩小版？

3. **评估移动端导航（汉堡菜单/底部导航/搜索栏触达）**
   - 截图: `r2_s3_id_step03_mobile_navigation.png`

#### 移动端搜索体验

4. **点击搜索框，输入 "phone case"（模拟拇指操作区域）**
   - 截图: `r2_s3_id_step04_mobile_search_input.png`

5. **截图移动端搜索结果首屏**
   - 截图: `r2_s3_id_step05_mobile_results.png`
   - 记录: 一屏能看到几个商品？图片大小？价格是否可读？

6. **尝试使用移动端筛选（通常是底部抽屉或顶部 Tab）**
   - 截图: `r2_s3_id_step06_mobile_filters.png`

#### 移动端商品详情

7. **点击一个商品进入移动端 PDP**
   - 截图: `r2_s3_id_step07_mobile_pdp.png`

8. **评估移动端 PDP 的关键信息可读性**
   - 价格/MOQ/供应商信息/CTA 按钮 是否在合理的触达位置？
   - 截图: `r2_s3_id_step08_mobile_pdp_key_info.png`

9. **检查 CTA 按钮是否满足移动端触控目标尺寸（建议 44px 以上）**
   - 截图: `r2_s3_id_step09_mobile_cta_size.png`

#### 本地支付与物流

10. **在 PDP 或询盘流程中，寻找印尼本地支付方式（GoPay、OVO、Dana、BRI 等）**
    - 截图: `r2_s3_id_step10_local_payment.png`
    - 记录: 是否支持印尼本地支付？还是只有国际支付方式？

11. **查看是否有发货至印尼的物流时效和成本信息**
    - 截图: `r2_s3_id_step11_indonesia_shipping.png`

#### 移动端询盘

12. **在移动端尝试点击 "Contact Supplier"，评估询盘表单的移动端体验**
    - 截图: `r2_s3_id_step12_mobile_inquiry_form.png`
    - 记录: 表单在 375px 下是否可用？键盘是否遮挡关键字段？

---

### Part 1 地区对比分析

完成三个地区走查后，填写以下对比表：

```markdown
## 地区体验对比汇总

| 维度 | 美国 (Carlos) | 德国 (Anna) | 印尼 (Kenji/移动) | 评注 |
|------|---------------|-------------|-------------------|------|
| 界面语言支持 | 英文(完整) | | | |
| 搜索结果质量 | | | | |
| 价格货币展示 | USD | EUR/USD | | |
| 欧洲合规信息可见度 | N/A | | N/A | |
| GDPR/Cookie 合规 | N/A | | N/A | |
| 本地支付方式 | PayPal/CC | | GoPay/OVO? | |
| AI 翻译可用性 | N/A | 测试结果 | N/A | |
| 移动端适配 | (桌面测试) | (桌面测试) | 375px测试 | |
| 物流信息本地化 | | | | |
| 认知负荷评分(1-5) | | | | |
| 主要体验问题数 | | | | |
```

---

## Part 2: 行业差异走查

### 走查矩阵

| 行业 | 类型 | 画像 | 搜索词 | 核心评估维度 |
|------|------|------|--------|-------------|
| 汽摩配 | 参数型 | Ahmad Hassan | "motorcycle brake pad" | 规格参数筛选、技术术语、认证信息 |
| 服装 | 视觉型 | Isabelle Durand | "linen dress wholesale" | 图片质量、颜色选择、面料信息 |

---

### 行业 1: 汽摩配（参数型品类）

**画像**: Ahmad Hassan（制造商老买家，找原材料/零部件）
**核心诉求**: 精准参数匹配，不是外观，而是规格型号

#### 搜索阶段

1. **恢复桌面端视口 (1440px)，访问 alibaba.com**
   - 截图: `r2_s4_auto_step01_navigate.png`

2. **搜索 "motorcycle brake pad"（摩托车刹车片）**
   - 截图: `r2_s4_auto_step02_search.png`

3. **截图搜索结果首屏，重点观察：商品卡片展示哪些参数信息？**
   - 截图: `r2_s4_auto_step03_results_info_density.png`
   - 记录每张卡片上的信息项（图片、名称、价格、MOQ、参数等）

4. **查看左侧筛选面板：参数维度（品牌、OEM号、材质、车型适配）**
   - 截图: `r2_s4_auto_step04_filter_panel_params.png`
   - 记录: 汽配品类筛选维度数量 vs 手机壳（对比参考）

5. **尝试筛选: 材质=Semi-metallic + 车型适配 Honda（如有）**
   - 截图: `r2_s4_auto_step05_filter_applied.png`

#### 商品详情阶段

6. **进入一个汽配商品 PDP**
   - 截图: `r2_s4_auto_step06_pdp_enter.png`

7. **评估参数规格表的呈现质量**
   - 截图: `r2_s4_auto_step07_specs_table.png`
   - 记录: 规格表是否清晰？字段是否完整（OEM号、规格尺寸、适配车型列表）？

8. **查找技术认证信息（IATF 16949、E-mark、DOT 等）**
   - 截图: `r2_s4_auto_step08_technical_certs.png`

9. **评估 AI 搜索在技术术语场景下的表现**
   - 如有 AI 搜索功能，用 "brake pad for Honda CB500 front wheel" 测试语义理解
   - 截图: `r2_s4_auto_step09_ai_tech_search.png`

10. **查找 Cross-reference / OEM Number 搜索功能**
    - 这是汽配买家最核心的需求：用 OEM 号直接找零件
    - 截图: `r2_s4_auto_step10_oemnum_search.png`

#### 汽摩配专项检查项

- [ ] 搜索结果卡片是否显示关键参数（而非仅图片+价格）？
- [ ] 是否有按 OEM 号/车型搜索的功能？
- [ ] 规格表字段是否标准化（跨供应商字段一致性）？
- [ ] 工业认证（IATF/E-mark）是否在搜索结果层可见？
- [ ] 图片重要性是否低于参数重要性？布局是否反映这一优先级？

---

### 行业 2: 服装（视觉型品类）

**画像**: Isabelle Durand（中型品牌零售商老买家，视觉敏感）
**核心诉求**: 高质量图片、颜色准确性、面料质感传达

#### 搜索阶段

1. **搜索 "linen dress wholesale"（亚麻连衣裙批发）**
   - 截图: `r2_s5_fashion_step01_search.png`

2. **截图搜索结果首屏，重点观察：图片质量和大小**
   - 截图: `r2_s5_fashion_step02_results_visual_quality.png`
   - 记录: 图片展示比例（图片区域 vs 文字区域）、图片是否清晰、是否有多图轮播

3. **查看筛选面板：服装品类的筛选维度（颜色、面料、尺码体系、风格）**
   - 截图: `r2_s5_fashion_step03_filter_fashion_params.png`

4. **尝试按颜色筛选（如 Beige/Ivory 亚麻色调）**
   - 截图: `r2_s5_fashion_step04_color_filter.png`

5. **使用图片搜索功能（以图搜图）——上传或输入参考图片URL**
   - 截图: `r2_s5_fashion_step05_image_search.png`

#### 商品详情阶段

6. **进入一个服装类 PDP**
   - 截图: `r2_s5_fashion_step06_pdp_enter.png`

7. **评估主图质量和图片数量（是否有多角度、上身效果图、细节图）**
   - 截图: `r2_s5_fashion_step07_image_gallery.png`
   - 记录: 图片数量、是否有视频、是否有面料细节图

8. **查看颜色选择器的体验（是否有色卡/实物颜色图？颜色命名是否准确？）**
   - 截图: `r2_s5_fashion_step08_color_picker.png`

9. **查找面料成分和洗涤说明信息**
   - 截图: `r2_s5_fashion_step09_fabric_details.png`

10. **查找尺码表（是否有真实尺码数据 vs 模特标准尺码？）**
    - 截图: `r2_s5_fashion_step10_size_chart.png`

11. **评估 AI 功能在视觉型品类的应用（AI图像识别、色彩匹配建议等）**
    - 截图: `r2_s5_fashion_step11_ai_visual_features.png`

12. **查看可定制选项（颜色定制、印花定制、面料替换）**
    - 截图: `r2_s5_fashion_step12_customization.png`

#### 服装专项检查项

- [ ] 搜索结果图片质量是否达到品牌买家的视觉标准？
- [ ] 颜色筛选是否准确（色块 vs 颜色名称）？
- [ ] 图片数量是否足够（5张以上）？是否有上身效果图？
- [ ] 面料信息是否完整（成分%、克重 gsm、手感描述）？
- [ ] 尺码表是否有实测数据（非仅标称尺码）？
- [ ] 颜色色卡是否准确传达实物颜色？
- [ ] 以图搜图功能是否可用、结果是否相关？

---

### Part 2 行业对比分析（必填）

完成两个行业走查后，**必须**填写以下对比表：

```markdown
## 参数型 vs 视觉型 行业体验对比

| 评估维度 | 汽摩配（参数型） | 服装（视觉型） | 平台表现 | 建议 |
|----------|-----------------|---------------|----------|------|
| **搜索结果布局** | | | | |
| - 图片区域占比 | | | 是否按品类优化？ | |
| - 参数信息密度 | | | | |
| - 首屏商品数量 | | | | |
| **搜索结果呈现方式** | | | | |
| - 卡片信息优先级 | 规格>图片 | 图片>规格 | 是否自适应？ | |
| - 关键参数是否在卡片可见 | OEM号/材质 | 颜色/面料 | | |
| **筛选系统** | | | | |
| - 行业专属筛选维度数量 | | | | |
| - 核心维度是否覆盖 | OEM号/车型 | 颜色/面料/风格 | | |
| - 筛选精度 | | | | |
| **商品详情页** | | | | |
| - 规格/参数表质量 | | | | |
| - 图片数量和质量 | | | | |
| - 品类专属信息块 | 认证/适配表 | 面料/尺码表 | | |
| **AI 功能表现** | | | | |
| - AI Search 语义理解 | | | | |
| - AI 推荐质量 | | | | |
| - 以图搜图（服装）| N/A | | | |
| **认知负荷评分(1-5)** | | | | |
| **主要体验问题数** | | | | |
| **最严重的问题** | | | | |
```

---

## Round 2 输出要求

### Part 1 地区差异输出
1. 三地区详细问题清单（含截图）
2. **地区体验对比汇总表**（见上方模板）
3. AI 翻译专项评估（德语测试结果）
4. 移动端体验专项报告（印尼场景）

### Part 2 行业差异输出
1. 两行业详细问题清单（含截图）
2. **参数型 vs 视觉型对比分析表**（必须完整填写）
3. AI Mode 在不同行业场景的效果评估

### 跨轮次综合发现
- 与 Round 1 发现对比：哪些问题在特定地区/行业更严重？
- 优先级更新：是否有 Round 1 的 P2 问题在某些场景升级为 P1？

### 截图清单 (Round 2 Screenshot Manifest)

```markdown
# Round 2 截图清单

## Part 1: 地区差异截图

### 美国地区 (r2_s1_us_*)
| 文件名 | 步骤 | 描述 |
|--------|------|------|
| r2_s1_us_step01_navigate.png | 01 | |
| ... | | |

### 德国地区 (r2_s2_de_*)
| 文件名 | 步骤 | 描述 |
|--------|------|------|
| r2_s2_de_step01_language_switch_entry.png | 01 | |
| r2_s2_de_step09_german_message_sent.png | 09 | 关键: 德语消息发送 |
| r2_s2_de_step10_translation_result.png | 10 | 关键: AI翻译结果 |
| ... | | |

### 印尼地区/移动端 (r2_s3_id_*)
| 文件名 | 步骤 | 描述 |
|--------|------|------|
| r2_s3_id_step01_375px_viewport.png | 01 | 关键: 视口设置确认 |
| ... | | |

## Part 2: 行业差异截图

### 汽摩配 (r2_s4_auto_*)
| 文件名 | 步骤 | 描述 |
|--------|------|------|
| ... | | |

### 服装 (r2_s5_fashion_*)
| 文件名 | 步骤 | 描述 |
|--------|------|------|
| ... | | |

## 汇总
- Round 2 步骤截图总计: X 张
- Round 2 问题截图总计: X 张
```
