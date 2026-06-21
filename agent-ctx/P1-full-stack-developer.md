# Task ID: P1 · full-stack-developer · 朋友圈场控面板

## 任务概述
补齐 WAOS-X 模块9 的 2 项 ❌：
- 朋友圈场控面板 UI 框架
- 朋友圈巡视进度示例展示

## 前置阅读
1. ✅ `worklog.md` — 项目全貌与已完成工作
2. ✅ `src/lib/wechat-video/connector.ts` — Connector 模式参考
3. ✅ `src/app/api/waos/wechat-video/route.ts` — API route 模式参考
4. ✅ `src/components/waos/WeChatClient.tsx` 前 200 行 — 左侧导航结构
5. ✅ `src/store/useOpsStore.ts` 搜索"朋友圈" — 现有引用（AIMomentsPost/refreshMoments/MomentsLayout 旧 stub）

## 交付文件
| # | 路径 | 行数 | 类型 |
|---|------|------|------|
| 1 | `src/lib/moments/connector.ts` | ~490 | 新建 |
| 2 | `src/app/api/waos/moments/route.ts` | ~175 | 新建 |
| 3 | `src/components/waos/MomentsPanel.tsx` | ~870 | 新建 |
| 4 | `src/components/waos/WeChatClient.tsx` | -120 / +5 | 修改（移除旧 MomentsLayout + MomentPost stub，挂载 MomentsPanel）|
| 5 | `electron/preloads/wechat-preload.js` | 22 → ~470 | 重写（追加朋友圈 DOM 注入）|

合计约 2000 行新业务代码。

## 关键接口（供后续 agent 复用）

### Connector（`src/lib/moments/connector.ts`）
- `getMomentsConnector()` — 单例 MockMomentsConnector
- `MomentPost { id, authorId, authorName, authorAvatar, content, images, likeCount, commentCount, publishedAt, isLiked, isOwn }`
- `MomentComment { id, postId, userId, userName, avatar, content, intentScore, intentReason, replyStatus, aiReply?, timestamp }`
- `PatrolTask { id, target, status, progress, scannedCount, newCommentsCount, highIntentCount, startedAt?, completedAt?, logs: PatrolLog[] }`
- `PatrolLog { ts, level: 'info'|'warn'|'success', msg }`
- 意向分关键词表（与视频号/抖音对齐）：
  - 询价 +30（多少钱/价格/优惠/便宜/首付/月供）
  - 购车意向 +25（想买/换车/试驾/到店/预定/定金）
  - 好感 +10（好看/喜欢/关注/心动/羡慕）
  - 负面 -10（太贵/不值/算了/考虑下/再看看）

### API（`/api/waos/moments`）
POST actions：
- `login` / `logout`
- `get_posts`（可选 limit）
- `get_comments`（可选 postId 过滤）
- `patrol` — 启动巡视任务（后台 setInterval 每 500ms 推进 10%）
- `patrol_status` — 查询巡视进度（轮询）
- `reply_comment { commentId, content }`
- `like_post { postId }`
- `post_moment { content, images }`

GET 返回服务状态 + 巡视任务概要 + 前 6 条朋友圈。

### UI（`src/components/waos/MomentsPanel.tsx`）
- 顶部状态栏：巡视状态指示 + Progress 进度条 + 启动/暂停/恢复按钮 + 发朋友圈入口
- 三宫格统计：已扫描 / 新评论 / 高意向
- 朋友圈列表（max-h-[calc(100vh-340px)] overflow-y-auto）：6 条种子动态卡片
- 卡片展开后显示评论列表，每条评论带 HOT/WARM/COLD 三色 Badge + 意向分原因 + 回复入口 + AI 回复预览
- 底部巡视日志 Collapsible：时间线展示 logs（info 蓝 / warn 黄 / success 绿，Framer Motion 淡入）
- 发朋友圈 Dialog：内容 Textarea（500 字限制）+ 图片 URL Input（最多 9 张）+ 缩略图预览 + 删除按钮

### Electron Preload（`window.wangcaiMoments`）
- `start()` / `stop()` — 启停 MutationObserver 监听
- `onEvent(cb)` — 上报 moments_update / reply_click 事件
- `getPosts()` / `getComments(postId?)` — 读缓存
- `scan()` — 主动触发一次扫描
- `replyComment(commentId, content)` — 带 2-4s 防封延迟
- `likePost(postId)` — 带 2-4s 防封延迟
- `postMoment(content, images)` — 带 2-4s 防封延迟
- `isOnMomentsPage()` — URL 判断当前是否在朋友圈页面
- 兼容旧 API `__wangcai` / `__wangcaiEvent` / `__wangcaiSetCallback`

## 关键决策
1. **意向分算法跨平台对齐** — 朋友圈/视频号/抖音共用同一套关键词权重表（询价+30/试驾+25/好感+10/负面-10），便于跨场控面板横向比较客户意向
2. **patrol 后台执行 + 前端轮询** — Connector 内 setInterval 推进进度（每 500ms +10%），前端 useEffect setInterval 800ms 轮询 patrol_status；status=completed 时停止轮询并 refreshAll
3. **暂停采用客户端停止轮询策略** — 服务端巡视任务继续推进（5s 内必完成），UI 停止刷新显示"已暂停"；恢复后重新轮询；避免在 Connector 接口中增加 pausePatrol 方法
4. **图片 URL 输入最多 9 张** — 与微信朋友圈原生限制对齐，Dialog 内实时缩略图预览 + 删除
5. **评论分三色 Badge** — HOT（≥70 玫红）/ WARM（≥60 琥珀）/ COLD（<60 锌灰），与销售场景"高意向优先截流"策略对齐
6. **保留旧 store moments/refreshMoments 字段** — 不破坏现有 store 初始化流程，仅移除 WeChatClient 内的 MomentsLayout/MomentPost 旧 stub 函数
7. **preload 防封 2-4s** — 回复/点赞/发圈每次操作前 sleep 2-4s 随机，避免固定间隔被反作弊识别
8. **所有 Promise 加 10s 超时** — `withTimeout` 包装，与 wechat-video connector 保持一致

## 验证
- `bun run lint`：0 errors, 4 warnings（全部为预存无关警告，与本次改动无关）
- `curl` 实测 API 全通：
  - GET 返回 6 条朋友圈 / 16 条评论 / 9 条高意向
  - patrol 启动后 1s 时 progress 33% scanned 2 posts / 7 new comments / 5 high intent
  - patrol 4s 后 status=completed progress=100% / 6 posts / 16 comments / 9 high intent / 7 条日志
  - reply_comment 后 mc1 replyStatus=replied + aiReply 写入
  - post_moment 后 get_posts 返回 7 条，新 post 在最前
- dev.log 显示 `✓ Compiled in 274ms` + `POST /api/waos/moments 200` 全部 200 OK
