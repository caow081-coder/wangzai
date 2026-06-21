# Task ID: TEMPLATE-DASHBOARD
# Agent: full-stack-developer
# Task: 旺财两大功能并行开发 — 人设模板市场（导入/导出/分享） + 数据看板（转化漏斗 + 效果分析）

## 前置阅读
- worklog.md（项目状态澄清 + 历史 Task 记录）
- useOpsStore.ts 第 141-233 行（Persona 接口完整结构，含 business/contact/skillConfig/styleExtends）
- PersonaEditor.tsx 前 50 行（5 Tabs 编辑器结构）
- ProDrawer.tsx 前 80 行（12 Tab 控制台 + TABS 数组）
- Charts.tsx 前 50 行（recharts 配色/样式/axisStyle 参考）

## 产出文件

| 文件 | 状态 | 行数 | 说明 |
|------|------|------|------|
| src/store/useOpsStore.ts | 修改 | 4519 (原 3861，+658) | PERSONA_TEMPLATES 8 模板 + 6 个新 store 方法 + 4 个辅助函数 + 2 个新状态字段 |
| src/components/waos/PersonaMarket.tsx | 新建 | 508 | 模板市场 Dialog，3 列卡片 + 导入/导出/分享码 |
| src/components/waos/DashboardPanel.tsx | 新建 | 681 | 完整数据看板 Dialog，7 个图表卡片 + SOP API 拉取 |
| src/components/waos/ProDrawer.tsx | 修改 | 1408 (原 1171，+237) | 新增 'dashboard' tab + DashboardInlineView 精简版 |
| src/components/waos/PersonaEditor.tsx | 修改 | 841 (原 837，+4) | Footer 新增"模板市场"按钮 |
| src/components/waos/TopBar.tsx | 修改 | 356 (原 350，+6) | 人设下拉新增"模板市场"入口 |
| src/app/page.tsx | 修改 | 74 (原 70，+4) | 渲染 PersonaMarket + DashboardPanel |

合计新增约 2090 行业务代码。

## 功能 A：人设模板市场

### Store 新增方法
```typescript
openPersonaMarket: () => void
closePersonaMarket: () => void
exportPersona: (id: string) => string  // 返回 JSON 字符串
importPersona: (json: string) => string | null  // 返回新 ID 或 null
applyPersonaTemplate: (templateId: string) => string  // 应用预设模板
generateShareCode: (id: string) => string  // base64 短分享码
importFromShareCode: (code: string) => string | null
openDashboardPanel: () => void
closeDashboardPanel: () => void
```

### 8 个预设模板
1. **tpl_star_sales** — 明星销售 · 苏念安（销冠，30-80 万）
2. **tpl_closer** — 逼单能手 · 顾倾城（80-200 万）
3. **tpl_service** — 售后管家 · 叶之秋（30-200 万全系维护）
4. **tpl_content_ops** — 短视频运营 · 陈墨白（30-120 万）
5. **tpl_market_dev** — 市场拓展 · 江月明（50-200 万 V级 MPV）
6. **tpl_new_energy** — 新能源专员 · 林星辰（EQE/EQS/EQA，40-100 万）⭐ 新增
7. **tpl_performance** — 性能车顾问 · 陆擎峰（AMG 全系，80-300 万）⭐ 新增
8. **tpl_used_car** — 二手车评估师 · 老周（星睿认证，20-80 万）⭐ 新增

### PersonaMarket UI
- Dialog 全屏弹窗（max-w-6xl）
- 顶部工具条：导入 JSON / 分享码输入 / 分类筛选
- 3 列卡片网格（Framer Motion 错峰入场）
- 每卡片：渐变头像 + 名称 + 角色徽章 + 分类徽章 + 成交率 + 车型标签 + 价格区间 + 核心技能 + 应用/导出按钮
- 底部"我的人设"列表：导出/复制/分享码三个图标按钮
- AnimatePresence 折叠的分享码输出区

### 入口
- PersonaEditor Footer："📋 模板市场"按钮（emerald 配色）
- TopBar 人设下拉："📋 模板市场"入口

## 功能 B：数据看板

### DashboardPanel（完整 Dialog，681 行）
7 个图表卡片：
1. **转化漏斗**（新客→跟进中→高意向→已成交，CSS 渐变 + Motion 宽度动画）
2. **各人设成交率对比**（BarChart，按 CVR 降序，LabelList 百分比）
3. **各渠道线索量**（PieChart 环形，微信/抖音/视频号/评论）
4. **AI vs 人工回复**（PieChart + 右侧图例百分比）
5. **SOP 执行统计**（成功率/失败率/平均耗时，从 /api/waos/sop?view=instances 拉取）
6. **近 7 天趋势**（LineChart 双线：线索量 + 成交量）
7. **TOP 销售排行榜**（前 5，🥇🥈🥉 + 活跃/容量 + CVR%）

### DashboardInlineView（ProDrawer 精简版，237 行）
- "打开完整数据看板"按钮 → openDashboardPanel()
- 4 KPI + 转化漏斗 + 人设 CVR 柱状图 + 渠道/AI 占比并排饼图 + TOP 3 排行

### 入口
- ProDrawer 新增 'dashboard' tab "效果分析"

## 关键决策
1. PERSONA_TEMPLATES 业务字段优先 — personality/tone/extendedActions 用 normalizePersona 兜底
2. 导出格式带 `__type: 'waos-persona-v1'` 标记，导入兼容封装/裸对象两种格式
3. 分享码用 `btoa(unescape(encodeURIComponent(json)))` 处理 UTF-8 中文
4. SOP 数据真实拉取 `/api/waos/sop?view=instances&limit=200`（实测 200 OK 返回 completed 实例）
5. DashboardPanel 独立 Dialog + DashboardInlineView 精简版双入口
6. 转化漏斗用纯 CSS + Motion 实现（非 recharts），可读性更高
7. 所有图表配色避开 indigo/blue，与既有 Charts.tsx 配色体系一致

## 验证
- `bun run lint`：0 errors, 4 warnings（4 个 warning 均为既有文件，与本次改动无关）
- dev server 实测：GET / 200 in 421ms，GET /api/waos/sop?view=instances&limit=200 200 OK
- 多次 `✓ Compiled` 无报错
