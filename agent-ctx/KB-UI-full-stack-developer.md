# Task KB-UI 工作记录

## 任务概要
开发旺财 RAG 知识库管理 UI（三栏全屏 Dialog）：分类树 + 文档表格 + 检索测试 + 文档详情编辑 + 添加/批量导入/初始化种子。

## 前置阅读
- worklog.md（项目背景）
- src/lib/rag/knowledge.ts（TF-IDF 本地 RAG 服务，发现 search bug）
- src/app/api/waos/knowledge/route.ts（GET list/search/stats + POST add/delete/init_seed）
- src/components/waos/SettingsDialog.tsx（设置 Dialog 结构）
- src/store/useOpsStore.ts（已存在 knowledgePanelOpen/openKnowledgePanel/closeKnowledgePanel）
- prisma/schema.prisma（KnowledgeDoc 模型）

## 关键发现与修复

### Bug：search API 报错 "Cannot read properties of undefined (reading 'includes')"
- 文件：src/lib/rag/knowledge.ts:91-97
- 原因：`findUnique` 的 `select` 没有包含 `keywords` 字段，但 `matchedKeywords` 计算时调用了 `doc.keywords.includes(t)`
- 修复：在 `select` 中加上 `keywords: true`
- 验证：`GET /api/waos/knowledge?view=search&q=GLC多少钱` 返回 200 + 正确 results
- 修复前 search API 完全不可用，是个隐藏 bug（之前没人调用 search view 所以没暴露）

## 产出文件

### 新建（1 个）
1. **src/components/waos/KnowledgePanel.tsx**（1116 行）
   - 三栏布局全屏 Dialog：左 180px 分类树 / 中 自适应 文档表格+搜索 / 右 280px 详情编辑
   - **左栏**：9 个分类按钮（全部/车型/配置/价格/金融/保养/试驾/竞品/FAQ），每个带 emoji 图标 + 文档数 badge，底部统计摘要（总文档/总命中）
   - **中栏顶部**：搜索测试框，350ms 防抖，实时调 search API
     - 显示 Top5 结果，每条带：排名 badge / 标题 / 相似度百分比（emerald 色）/ 内容预览（关键词高亮）/ 匹配关键词 chips（黄色背景）
     - 关键词高亮用 `<HighlightedText>` 子组件 + 正则 split + `<mark className="bg-yellow-200 dark:bg-yellow-500/30">`
     - 搜索结果可点击跳转到对应文档（如在当前列表中）
   - **中栏工具栏**：添加文档 / 批量导入（隐藏 file input）/ 初始化种子（仅当 stats.total=0 时显示）/ 刷新
   - **中栏表格**：标题（FileText 图标）/ 分类 badge / 优先级 badge（颜色阈值 80 emerald / 50 amber / 20 sky / 其他 zinc）/ 命中次数 / 更新时间（相对时间，刚刚/X分钟前/X小时前/X天前/M/D）/ 删除按钮
   - **右栏详情**：标题 Input / 内容 Textarea（6 行 min-h-120px）/ 分类 Select / 标签 Input（逗号分隔）/ 优先级 Slider（0-100，emerald 主题）/ 元数据（id/命中次数/更新时间）/ 保存 + 删除按钮
   - 保存逻辑：因后端无 update action，用「删旧 + 加新」模拟，每次都会重建 RAG 索引
   - **添加文档 Dialog**：完整表单（标题/内容/分类/优先级 Slider/标签），独立 Dialog 嵌套在主 Dialog 内
   - **删除确认 Dialog**：避免误删
   - **批量导入**：解析 JSON 数组，逐条调 add API，返回「成功 X 条 · 失败 Y 条」
   - **初始化种子**：调用 init_seed action，导入 16 条种子知识
   - **空状态**：表格无数据时显示 Inbox 图标 + 引导按钮
   - 动画：Framer Motion（搜索结果展开 height/opacity、结果项 x 平移渐入）
   - 深色模式：所有颜色用 `dark:` 前缀，背景用 `bg-background`/`bg-muted/20` 等语义色
   - 中文注释 + TypeScript 严格类型（KnowledgeDoc/SearchResultItem/Stats/DocForm/Category）

### 修改（3 个）
2. **src/components/waos/SettingsDialog.tsx**（+27 行，原 341 → 现 365）
   - 新增 `BookOpen` 图标导入
   - 新增 `openKnowledgePanel` store 方法获取
   - 新增 `handleOpenKnowledge()` 处理函数：关闭设置 Dialog + 打开 KnowledgePanel + toast 提示
   - 在「模块快捷入口」section 下方新增独立 section，绿色高亮按钮「📖 知识库管理」，副标题「RAG · 文档 CRUD · 检索测试 · 批量导入」，hover 时右箭头平移

3. **src/app/page.tsx**（+2 行，原 76 → 现 78）
   - 导入 `KnowledgePanel`
   - 在 `<BrainSettings />` 与 `<DownloadFloat />` 之间挂载 `<KnowledgePanel />`

4. **src/lib/rag/knowledge.ts**（+1 行，原 172 → 现 173）
   - 修复 search API bug：`findUnique` 的 `select` 加上 `keywords: true`

## 验证结果

### Lint
```
0 errors, 4 warnings（warnings 全部在已存在文件 BrainSettings/Splashscreen/TopBar，与本次任务无关）
```

### API 实测（curl）
| 端点 | 输入 | 结果 |
|-----|------|------|
| GET /api/waos/knowledge?view=stats | — | ✅ total:16, byCategory:{车型:7,保养:2,金融:2,FAQ:2,试驾:1,竞品:2}, totalHits:0 |
| GET /api/waos/knowledge?view=list | — | ✅ 返回 16 条文档完整字段 |
| GET /api/waos/knowledge?view=search&q=GLC多少钱 | — | ✅ 修复前 500，修复后 200，返回 5 条带 score+matchedKeywords |
| GET / | — | ✅ HTTP 200, 89KB |

### Dev server
- `bash start-dev.sh` 启动成功
- `Ready in 850ms`
- 编译无错误
- Prisma 查询日志正常（含 keywords 字段）

## 技术细节

### 状态管理
- 全部用 React hooks（useState/useEffect/useMemo/useCallback），无外部状态依赖
- 通过 `useOpsStore(s => s.knowledgePanelOpen)` 受控开关
- 表单 dirty 状态追踪（`dirty` flag + 黄色「未保存」badge）

### 关键词高亮实现
```tsx
function HighlightedText({ text, keywords }) {
  // 1. 按长度降序避免短词覆盖长词
  // 2. 转义正则特殊字符
  // 3. split 拆分，匹配部分包 <mark>
}
```

### 编辑保存策略
后端 API 只有 add/delete，无 update。保存编辑用「先 delete 再 add」：
1. POST delete 旧 id
2. POST add 新内容（title/content/category/tags/priority）
3. RAG 服务 `initialized = false` 自动触发重建索引

### 设计选择
- 颜色主题：emerald（主操作）+ amber（优先级中段）+ sky（优先级低段）+ zinc（默认/边界）+ yellow（关键词高亮）
- 与现有 SettingsDialog 的 emerald 主色调保持一致
- 全屏 Dialog：max-w-[95vw] w-[95vw] h-[90vh]
- 表格用 shadcn Table 组件，hover 行 emerald 高亮

## 不破坏现有功能验证
- SettingsDialog 原 6 模块快捷入口、调度器参数、显示偏好、通知规则、版本更新、重置按钮全部保留
- page.tsx 其他 14 个组件全部保留，仅新增 1 行 KnowledgePanel
- useOpsStore 未做任何修改（knowledgePanelOpen 系列方法在前序 task 已存在）
- knowledge.ts 仅修复 search bug，未改 addDoc/deleteDoc/listDocs/initSeedKnowledgeBase 任何逻辑

## 完成时间
2026-06-21
