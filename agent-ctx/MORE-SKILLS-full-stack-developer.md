# Task MORE-SKILLS 工作记录

## 任务概要
在现有 9 个 Skill 基础上，新增 3 个原子能力（emotion_analysis / competitor_compare / price_calculator），覆盖「情绪识别 / 竞品对比 / 价格计算」三大销售场景。Skill 总数 9 → 12。

## 前置阅读
- /home/z/my-project/worklog.md（项目背景 + 前序 Task 进度）
- /home/z/my-project/src/lib/sop/skills.ts（9 个现有 Skill 的实现模式：SkillDefinition + execute + ok/fail）
- /home/z/my-project/src/lib/sop/types.ts（Skill/SkillContext/SkillResult/SkillDefinition 类型，SkillContext 有 `[key: string]: unknown` 索引签名）
- /home/z/my-project/src/lib/identity/kernel.ts（IdentityVector 6 字段：trust/intent/emotion/urgency/resistance/value）
- /home/z/my-project/src/lib/rag/knowledge.ts（search 函数签名 + TF-IDF + 余弦相似度）
- /home/z/my-project/src/lib/sop/registry.ts（构造函数循环 ALL_SKILLS 自动注册，无需改动）
- /home/z/my-project/agent-ctx/MORE-SOP-full-stack-developer.md（前序 MORE-SOP 任务，了解 templates.ts 模式）

## 产出

### 修改文件：1 个
**src/lib/sop/skills.ts**（439 行 → 820 行，**净增 381 行**）

### 3 个新 Skill 接口

#### Skill 10：emotion_analysis（category: recognition，lines 431-523）
- **输入**：`{ message: string, identity?: IdentityVector }`
- **输出**：`{ emotion: 'angry'|'anxious'|'excited'|'satisfied'|'neutral', score: number, suggestion: string, matchedKeywords: string[], identityEmotion: number|null }`
- **算法**：
  1. 关键词优先级匹配（按 EMOTION_KEYWORDS 数组顺序）：angry > satisfied > anxious > excited > neutral
  2. 分值区间：angry 0-30（递减，越愤怒分越低）/ satisfied 70-100 / anxious 30-50 / excited 50-70 / neutral 50
  3. 每多命中一个关键词，分数 ±10（step=10）
  4. 上下文兜底：关键词未命中且 identity.emotion < 30 → angry(25)；> 75 → satisfied(80)
- **EMOTION_KEYWORDS 词典**（按 spec）：
  - angry: 生气/投诉/骗子/退款/差评/无语/离谱
  - satisfied: 谢谢/满意/不错/推荐/好评
  - anxious: 着急/马上/今天/能不能快点/还有多久
  - excited: 期待/想要/喜欢/什么时候能
- **EMOTION_SUGGESTIONS**（5 类应对建议）：
  - angry: "客户情绪激动，建议立即安抚+转人工"
  - anxious: "客户着急，加快响应+给出明确时间"
  - excited: "客户期待，推进试驾邀约"
  - satisfied: "客户满意，引导转介绍"
  - neutral: "客户平静，正常沟通"

#### Skill 11：competitor_compare（category: recognition，lines 525-695）
- **输入**：`{ message: string }`
- **输出**：`{ detected: boolean, competitor: string, ourModel: string, advantages: string[], disadvantages: string[], suggestedPitch: string, ragSource: string|null }`
- **算法**：
  1. 正则匹配 10 条竞品映射（COMPETITOR_MAP）：
     - X3 → GLC / 5系 → E级 / X5 → GLE / 3系 → C级 / Model S → EQE
     - A4 → C级 / A6 → E级 / Q5 → GLC / 雷克萨斯(RX/ES) → GLE / 特斯拉(Model 3) → EQE
  2. 调用 RAG `POST /api/waos/knowledge` action=search query="{ourModel} vs {competitor} 对比"（10s 超时，AbortSignal.timeout(10000)）
  3. RAG 不可用 → 降级到硬编码优劣势 + 推荐话术（console.warn + 不中断 SOP，与 knowledge_search 降级策略一致）
  4. RAG 可用 → 硬编码话术后附 RAG 内容片段（前 120 字 + "..." 截断）
- **特点**：每条映射含 3-4 项 advantages + 2 项 disadvantages（客观承认我方劣势，建立信任）+ 1 段 pitch 推荐话术

#### Skill 12：price_calculator（category: evaluation，lines 697-802）
- **输入**：`{ carModel: string, downPaymentRatio: 0.2-0.5, months: 36|48|60, interestRate: 0-0.05 }`
- **输出**：`{ carModel, price, priceRange, downPayment, downPaymentRatio, loanAmount, monthlyPayment, monthlyPaymentWan, totalInterest, months, interestRate, years, breakdown }`
- **车型价格字典**（CAR_PRICE_DICT，单位万元，min-max-mid）：
  - C级 33-38-35.5 / GLC 42-53-47.5 / GLE 70-88-79 / E级 44-60-52 / S级 96-204-150 / EQE 47-53-50 / AMG C63 80-100-90
- **公式**（简化等额本息近似，对齐 spec）：
  - 裸车价 = 车型中位价
  - 首付 = 裸车价 × downPaymentRatio
  - 贷款额 = 裸车价 - 首付
  - 年数 = months / 12
  - 总利息 = 贷款额 × 年利率 × 年数
  - 月供 = 贷款额 × (1 + 年利率 × 年数) / 期数
- **breakdown 示例**："奔驰GLC 裸车 47.5万，首付 30% = 14.25万，贷款 33.25万，60期月供 5883元，总利息 2.66万"
- **校验**：4 个参数全量校验
  - 车型：先精确匹配，再模糊匹配（"C260L" → "C级"），失败返回支持的车型列表
  - 首付比例：0.2-0.5，否则 fail()
  - 分期数：必须为 36/48/60，否则 fail()
  - 利率：0-5%，否则 fail()
- **默认值**：downPaymentRatio=0.3 / months=36 / interestRate=0.0299（2.99%）

### 修改清单

1. **顶部注释**（lines 1-17）：从「9 个原子能力」改为「12 个原子能力」，新增 3 条 skill 简介行
2. **新增 EmotionType 类型**（line 24）：`'angry' | 'anxious' | 'excited' | 'satisfied' | 'neutral'` 字面量联合
3. **新增 Skill 10 emotion_analysis**（lines 431-523）：
   - emotionAnalysisDef: SkillDefinition
   - EMOTION_KEYWORDS 词典（4 类 × 5-7 关键词，含 base/step/min/max/descending 配置）
   - EMOTION_SUGGESTIONS 映射（Record<EmotionType, string>）
   - emotionAnalysisSkill: Skill（execute 实现：关键词匹配 + identity 上下文调整）
4. **新增 Skill 11 competitor_compare**（lines 525-695）：
   - competitorCompareDef: SkillDefinition
   - CompetitorEntry 接口（pattern/competitor/ourModel/advantages/disadvantages/pitch）
   - COMPETITOR_MAP 数组（10 条竞品映射，覆盖宝马/奥迪/雷克萨斯/特斯拉全主流竞品）
   - competitorCompareSkill: Skill（execute 实现：正则匹配 + RAG 调用 + 降级兜底）
5. **新增 Skill 12 price_calculator**（lines 697-802）：
   - priceCalculatorDef: SkillDefinition
   - CarPriceEntry 接口（min/max/mid/label）
   - CAR_PRICE_DICT 字典（7 款奔驰车型）
   - priceCalculatorSkill: Skill（execute 实现：参数校验 + 月供计算 + breakdown 生成）
6. **ALL_SKILLS 数组追加 3 项**（lines 815-817）：emotionAnalysisSkill / competitorCompareSkill / priceCalculatorSkill
7. **SKILL_DEFINITIONS**（line 820）：未改动，通过 `.map` 自动包含 12 个定义

### 验证

- `bun run lint`：**0 errors, 4 warnings**（均为既存无关警告：BrainSettings/Splashscreen/TopBar 的 Unused eslint-disable，与本任务无关）
- `bunx tsc --noEmit`：**src/lib/sop/ 目录 0 错误**（其他无关文件如 DashboardPanel/ProDrawer/knowledge.ts 既存错误未触动）
- 文件结构验证：12 个 Skill 按编号 1-12 顺序排列，ALL_SKILLS 数组 12 项齐全

### 设计要点

1. **遵循现有模式**：3 个 Skill 均用 `SkillDefinition` + `execute(ctx): Promise<SkillResult>` + `ok()/fail()` 辅助函数，与现有 9 个 Skill 完全一致
2. **错误兜底**：competitor_compare 的 RAG 调用失败时降级到硬编码（不中断 SOP），与 knowledge_search 的降级策略一致
3. **超时保护**：competitor_compare 的 fetch 用 `AbortSignal.timeout(10000)`，与 crm_update/send_message/knowledge_search 一致
4. **类型严格**：新增 `EmotionType` 字面量联合 + `CompetitorEntry`/`CarPriceEntry` 接口，避免 any
5. **参数校验**：price_calculator 对 4 个输入参数全量校验（车型/首付比例/分期数/利率），失败立即 fail() + 明确错误信息
6. **中文注释**：所有关键逻辑块均有中文注释说明算法
7. **不破坏现有 9 个 Skill**：仅在 ALL_SKILLS 数组追加 3 项，未修改任何现有 Skill 代码

### 后续可消费点

- registry.ts 的 `getSkillRegistry().list()` 自动返回 12 个 Skill 定义
- registry.ts 的 `syncToDatabase()` 自动 upsert 12 个 Skill 到 SkillRegistry 表
- SopPanel/SopDesigner 可拖拽使用新增的 3 个 Skill 节点
- emotion_analysis 可作为 SOP 流程的前置节点，根据 emotion 分支到不同策略（angry → human_handoff，excited → reply_generate 试驾邀约）
- competitor_compare 可在客户提及竞品时自动触发，输出 suggestedPitch 直接喂给 send_message
- price_calculator 可在客户询问金融方案时调用，breakdown 直接展示给销售或客户
