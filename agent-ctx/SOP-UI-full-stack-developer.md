# Task SOP-UI 工作记录

## 任务概要
开发旺财 SOP 引擎完整 UI（Phase 4-7），含可视化设计器、SOP 列表、属性面板、运行日志面板，并接入 WeChatClient 左侧导航栏。

## 前置阅读
- worklog.md（项目背景 + 前序 Task 进度）
- src/lib/sop/types.ts（SopNode/SopEdge/SopDefinition/SopInstance/SopNodeLog 完整类型）
- src/lib/sop/skills.ts（9 Skill 定义：intent_recognition / value_evaluation / strategy_select / reply_generate / crm_update / send_message / schedule_followup / human_handoff / knowledge_search）
- src/lib/sop/templates.ts（3 预设模板：高意向成交 16 节点 / 沉睡唤醒 12 节点 / 投诉安抚 12 节点，含坐标布局）
- src/lib/sop/runtime.ts（createSopDefinition / updateSopDefinition / listInstances / getInstanceLogs / pauseInstance / resumeInstance / abortInstance）
- src/app/api/waos/sop/route.ts（10 action 完整 POST + 6 view 完整 GET）
- src/components/waos/WeChatClient.tsx（NavButton 模式 + 4 个 navTab + 右侧内容区条件渲染）

## 产出文件

### 新建（4 个）
1. **src/components/waos/sop/SopNodePalette.tsx**（161 行）
   - Skill 工具箱组件
   - 从 /api/waos/sop?view=skills 拉取 9 个 Skill
   - 按 category 分组：recognition/evaluation/generation/execution/notification
   - 每类有专属图标 + 颜色（Brain 紫 / Target 琥珀 / GitBranch 翠绿 / Send 天蓝 / Bell 玫红）
   - HTML5 native drag-and-drop + onClick 双触发

2. **src/components/waos/sop/SopDesigner.tsx**（625 行）
   - SVG 画布 + HTML 节点 div 叠加（SVG 画连线，div 渲染节点）
   - 6 种节点类型不同颜色/形状：
     - trigger 🟢 绿色圆角（120×44）
     - skill ⚡ 蓝色矩形（170×64）
     - condition ◆ 橙色菱形（SVG polygon 130×90）
     - wait ⏳ 紫色矩形（150×50）
     - notify 🔔 黄色矩形（170×60）
     - end 🟥 红色圆角（120×44）
   - 贝塞尔曲线连线，YES 绿/NO 红/default 灰，带 arrow marker
   - 节点拖拽（onMouseDown + 全局 mousemove/mouseup + drag preview state）
   - 运行时高亮：脉冲光环 + stroke-dasharray 流动动画
   - 缩放：Ctrl+wheel + 工具栏按钮（40%-200%）
   - 顶部工具栏：保存 / 运行 / 暂停 / 恢复 / 终止 / 工具箱切换 / 缩放
   - Skill 拖入画布（HTML5 dataTransfer 透传 JSON）

3. **src/components/waos/sop/SopRunLog.tsx**（395 行）
   - 底部可折叠时间线日志面板
   - 4 状态徽章：success ✅ 绿 / failed ❌ 红 / running ⏳ 黄闪烁 / skipped ⏭️ 灰
   - 筛选：按 SOP 实例（全部/当前选中/具体实例）+ 按状态
   - 搜索框（按节点名/Skill 名/错误信息）
   - 运行中每 2 秒自动刷新（setInterval + isRunning 依赖）
   - 点击单条展开 input/output JSON 详情（双栏 grid）
   - 头部状态计数胶囊 + 最后更新时间

4. **src/components/waos/sop/SopPanel.tsx**（1145 行）
   - 顶层三栏布局 + 底部日志
   - 左栏 200px：SOP 列表，按 3 分类（默认/营销/售后）+ 其他分组
     - 每条显示：名称 + 描述 + 触发方式徽章 + 节点数 + 版本号 + 激活开关 + hover 删除按钮
     - 选中高亮 sky-500 边框 + shadow
     - 底部「+ 新建 SOP」按钮
     - 空状态显示「初始化预设模板」按钮
   - 中栏：SopDesigner
   - 右栏 260px：PropertiesPanel
     - 未选中节点显示空状态提示
     - 选中后显示：节点名称 Input + 类型徽章 + 类型专属编辑器
     - SkillNodeEditor：Skill 下拉 + 参数 JSON Textarea + Apply 按钮（key 重 mount 同步外部更新）
     - ConditionNodeEditor：字段 Input + 操作符 Select + 值 Input（自动推断 number/boolean/null/string）
     - WaitNodeEditor：6 个预设时长按钮（30分钟/1小时/3小时/1天/3天/7天）+ 自定义毫秒
     - NotifyNodeEditor：级别 Select（info/warn/error）+ 通知内容 Textarea
     - EndNodeEditor：结束状态 Select（success/failed/human_handoff）
     - 底部删除按钮（trigger 节点禁用）
   - 3 个对话框：CreateSopDialog（创建空 SOP，自动包含 trigger → end）/ RunSopDialog（输入客户信息运行）/ AlertDialog（删除确认）

### 修改（3 个）
5. **src/components/waos/WeChatClient.tsx**（+5 行）
   - 导入 SopPanel
   - NavTab 类型加 'sop'
   - nav 区在视频获客下方添加 🤖 SOP引擎 NavButton
   - 条件渲染 `{navTab === 'sop' && <SopPanel />}`

6. **src/store/useOpsStore.ts**（+1 行修改）
   - clientTab 类型加 'sop'：`'chat' | 'moments' | 'contacts' | 'intercept' | 'sop'`

7. **src/app/globals.css**（+30 行）
   - @keyframes sop-flow（stroke-dashoffset 0 → -20，用于边线流动动画）
   - .waos-scrollbar（自定义滚动条 6px）
   - .bg-grid（画布网格背景定位）

## 关键技术决策

1. **不依赖 react-flow 等重库**：纯 SVG + HTML div 实现，节点 div 易于拖拽/编辑/动画，SVG 适合连线
2. **菱形 condition 节点用 SVG polygon**：父 div 设 text color，polygon 用 fill="currentColor" fillOpacity=0.15 + stroke="currentColor"，避免 clip-path 边框丢失
3. **节点拖拽用本地 drag state**：仅在 mouseUp 时调 onNodesChange 提交最终位置，避免父组件每次 mousemove 重渲染（性能优化）
4. **HTML5 native drag-and-drop**：不引入 dnd-kit，Skill 工具箱 + 节点拖拽都用原生 mouse 事件和 dataTransfer
5. **边线智能选边**：水平距离 > 0.8 节点宽时用 right/left 锚点，否则用 bottom/top，避免长水平线被画成大 S 弯
6. **运行时双层高亮**：节点脉冲光环（Framer Motion scale 0.95→1.05 + boxShadow）+ 流出边 stroke-dasharray 流动动画（CSS keyframes sop-flow 0.8s linear infinite）
7. **PropertiesPanel 受控 props**：onUpdate 透传到 SopPanel，单一数据源
8. **SkillNodeEditor key 重 mount**：key={node.id + JSON.stringify(skillParams)}，外部更新时自然 reset local state，避免 setState-in-effect
9. **创建空 SOP 自动骨架**：trigger → end，避免用户面对空白画布
10. **运行 SOP 对话框**：默认填测试客户信息（test_001/测试客户/奔驰C级多少钱？），便于端到端测试

## React 19 严格模式适配（解决 4 处 set-state-in-effect error）

- SkillNodeEditor 原用 useEffect 同步 paramText → 改用 key 重 mount
- CreateSopDialog/RunSopDialog 原用 useEffect 重置表单 → 删除（Radix Dialog 关闭即卸载，重新打开 useState 自然重置）
- SopDesigner 原用 useEffect setIsDirty(false) → 移除本地 isDirty，改为父组件 isDirty prop 受控
- 修复 SopDesigner JSX 语法错误（菱形 SVG ternary 缺 `}` 闭合）

## 验证

- `bun run lint`：0 errors, 4 warnings（全部为既存无关警告：BrainSettings/Splashscreen/TopBar 的 Unused eslint-disable）
- curl /api/waos/sop?view=definitions：返回 3 个预设 SOP
- curl /api/waos/sop?view=skills：返回 9 个 Skill 分 5 类
- curl /：HTTP 200
- dev.log：✓ Compiled 多次成功，无 error

## WAOS-X SOP 引擎 Phase 4-7 完成情况

- Phase 4 可视化设计器 ✅
- Phase 5 SOP 列表 ✅
- Phase 6 属性面板 ✅
- Phase 7 运行日志 ✅

## 后续可消费点

- SopDesigner 当前节点高亮可直接读取 currentInstance.currentNodeId，未来可叠加进度条
- SopRunLog 全实例模式可作为「全局执行历史」
- PropertiesPanel 的 Skill 参数 JSON 编辑器可升级为基于 inputSchema 的表单生成器
- SopNodePalette 拖入位置目前是鼠标释放点，未来可加吸附网格
