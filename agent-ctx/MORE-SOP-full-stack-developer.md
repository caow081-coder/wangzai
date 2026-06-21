# Task MORE-SOP 工作记录

## 任务概要
在现有 3 个预设 SOP 模板（高意向成交/沉睡唤醒/投诉安抚）基础上，新增 4 个模板凑齐 7 个，覆盖奔驰销售全场景。

## 前置阅读
- /home/z/my-project/worklog.md（项目背景 + 前序 Task 进度）
- /home/z/my-project/src/lib/sop/templates.ts（3 个现有模板的写法、坐标布局、命名约定）
- /home/z/my-project/src/lib/sop/skills.ts（9 个 Skill：intent_recognition / value_evaluation / strategy_select / reply_generate / crm_update / send_message / schedule_followup / human_handoff / knowledge_search）
- /home/z/my-project/src/lib/sop/types.ts（SopNode/SopEdge/SopDefinition 类型，condition operator 含 ==/!=/>=/<=/>/</contains）
- /home/z/my-project/agent-ctx/SOP-UI-full-stack-developer.md（前序 SOP-UI 任务，了解 SopPanel 3 分类：默认流程/营销流程/售后流程）

## 产出

### 修改文件：1 个
**src/lib/sop/templates.ts**（175 行 → 348 行，新增 173 行）

新增 4 个模板（nodes + edges 数组）：

| # | 模板名 | 节点数 | 边数 | 分类 | 触发方式 | 触发条件 |
|---|--------|--------|------|------|----------|----------|
| 4 | 裂变引流 SOP | 11 | 10 | 营销流程 | auto_event | messageRegex: `推荐\|朋友介绍\|转发\|分享` |
| 5 | 活动通知 SOP | 12 | 11 | 营销流程 | auto_schedule | cron: `0 0 9 * * 1`（每周一 9 点） |
| 6 | 售后跟进 SOP | 14 | 13 | 售后流程 | auto_event | intent=GENERAL + messageRegex: `保养\|维修\|售后\|保险\|续保` |
| 7 | 新客欢迎 SOP | 12 | 11 | 默认流程 | auto_event | isNew=true |

4 个新模板合计：**49 节点 / 45 边**
全场景 7 个模板合计：**89 节点 / 78 边**

### 各模板流程要点

#### 模板 4：裂变引流 SOP（11 节点）
- 开始(n1) → 意图识别(n2) → 条件:消息含推荐关键词?(n3)
  - YES: 策略选择 RECONNECT_HOOK(n4) → 生成裂变话术(n5) → 发送消息(n6) → CRM更新 tags=fission_referral(n7) → 通知运营(n8) → 结束-裂变成功(n9)
  - NO: 标准回复(n10) → 结束-标准(n11)
- 关键点：condition 用 `operator:'contains', value:'推荐'`

#### 模板 5：活动通知 SOP（12 节点）
- 开始(n1) → 知识库检索 query=本周活动(n2) → 策略选择 STANDARD_REPLY(n3) → 生成活动话术(n4) → 发送消息(n5) → 等待2小时(n6) → 条件:客户回复?(n7)
  - YES: 跟进回复(n8) → CRM更新 stage=following(n9) → 结束-跟进中(n10)
  - NO: 48小时后再次通知(n11) → 结束-已安排跟进(n12)
- 关键点：triggerType=auto_schedule + cron 表达式

#### 模板 6：售后跟进 SOP（14 节点）
- 开始(n1) → 意图识别(n2) → 知识库检索 query=保养维修(n3) → 策略选择 SOFT_RECOVERY(n4) → 生成售后话术(n5) → 发送消息(n6) → CRM更新 tags=after_sales_follow(n7) → 通知售后主管(n8) → 等待1天(n9) → 条件:客户回复?(n10)
  - YES: 跟进回复(n11) → 结束-跟进中(n12)
  - NO: 转人工电话回访(n13) → 结束-转人工(n14)
- 关键点：双触发条件 intent + messageRegex，endStatus=human_handoff

#### 模板 7：新客欢迎 SOP（12 节点）
- 开始(n1) → 策略选择 STANDARD_REPLY(n2) → 生成欢迎话术(n3) → 发送消息(n4) → CRM更新 status=following(n5) → 通知销售(n6) → 等待4小时(n7) → 条件:客户回复?(n8)
  - YES: 深入沟通(n9) → 结束-跟进中(n10)
  - NO: 24小时后首次跟进(n11) → 结束-已安排跟进(n12)
- 关键点：triggerCondition { isNew: true }，无意图识别步骤（直接走 STANDARD_REPLY）

### 修改清单

1. **顶部注释**：从「3 个开箱即用」改为「7 个开箱即用」，新增 4 条模板简介
2. **新增 8 个 const 数组**（4 模板 × 2 数组 nodes/edges）
3. **initPresetTemplates 函数 presets 数组追加 4 项**（含 name/description/triggerType/triggerCondition/nodes/edges/category/idHint）
4. **PRESET_TEMPLATES 导出数组追加 4 项**（供 UI 预览，含 name/description/nodes/edges）

### 坐标布局策略

所有新模板沿用现有 3 个模板的布局惯例：
- 主流程节点居中 x=250
- YES 分支左偏 x=100
- NO 分支右偏 x=450
- y 步进 90px（节点高度约 60-80px，留出连线空间）
- 起始 y=50

### 验证

- `bun run lint`：0 errors, 4 warnings（均为既存无关警告：BrainSettings/Splashscreen/TopBar 的 Unused eslint-disable）
- `bunx tsc --noEmit`：templates.ts 0 错误
- curl POST /api/waos/sop action=init_presets：4 个新模板成功创建
  ```
  [SOP] 预设模板已存在: 高意向客户成交 SOP
  [SOP] 预设模板已存在: 沉睡客户唤醒 SOP
  [SOP] 预设模板已存在: 投诉客户安抚 SOP
  [SOP] 预设模板已创建: 裂变引流 SOP
  [SOP] 预设模板已创建: 活动通知 SOP
  [SOP] 预设模板已创建: 售后跟进 SOP
  [SOP] 预设模板已创建: 新客欢迎 SOP
  ```
- curl GET /api/waos/sop?view=definitions：返回 7 个模板，节点数验证正确

### 后续可消费点

- SopPanel 左栏会自动显示 7 个模板（3 分类：默认流程 3 个 / 营销流程 2 个 / 售后流程 2 个）
- 用户可在 SopDesigner 中查看 4 个新模板的可视化流程图
- 活动通知 SOP 的 cron 触发目前是元数据，runtime 还未实现 cron 调度（schedule_followup 是一次性 timer），后续可扩展
- 售后跟进 SOP 的双触发条件（intent + messageRegex）需要在 trigger matcher 中实现 AND 逻辑
