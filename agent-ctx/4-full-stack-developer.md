# Task 4 — full-stack-developer 工作记录

## Task
开发完整的视频号（微信视频号）接入层，包含：
1. `src/lib/wechat-video/connector.ts`：适配层 + Mock 实现 + 意向分计算
2. `src/app/api/waos/wechat-video/route.ts`：API route（7 个 actions）
3. `electron/preloads/video-preload.js`：DOM 注入 preload

## Work Log

1. 阅读前置材料：
   - `worklog.md`：旺财整体架构与已交付代码量（5344+ 行）
   - `src/lib/douyin/connector.ts`：Connector 接口模式 + 单例 getter
   - `src/app/api/waos/douyin/route.ts`：POST action switch + GET 状态返回
   - `electron/preloads/video-preload.js`：发现仅为 22 行 stub，需要彻底重写
2. 编写 `src/lib/wechat-video/connector.ts`（325 行）：
   - 严格定义 `VideoComment` / `VideoMessage` / `WechatVideoConnector` 三个接口
   - 实现意向分计算 `calculateIntent`：4 条规则 + 基础分 50 + clamp 0-100
   - 实现 `withTimeout` 超时保护工具，默认 10s
   - 实现 `MockWechatVideoConnector`：8 条奔驰销售种子评论（GLC/GLE/E级/S级迈巴赫/C级/EQE/AMG/vs X3 负面对比），覆盖 4 大意向类别
   - `getComments` 按 `videoPlayCount` 降序排序（高播放量视频优先截流）
   - `sendDM` 同时写入消息记录便于追溯
   - 单例 `getWechatVideoConnector()` 导出
3. 编写 `src/app/api/waos/wechat-video/route.ts`（127 行）：
   - `runtime = 'nodejs'`，`dynamic = 'force-dynamic'`
   - 7 个 actions：login / get_comments / get_messages / reply_comment / send_dm / like_video / logout
   - 完善的 try-catch 错误处理，不抛未捕获异常
   - GET 返回服务状态（service / loggedIn / commentCount / highIntentCount / actions / 前 10 条评论）
4. 重写 `electron/preloads/video-preload.js`（22 行 → 450 行）：
   - `MutationObserver` 监听评论区 DOM 变化，多套选择器兜底
   - 提取评论：内容 / 用户名 / videoId / 意向分（与 connector.ts 算法对齐，避免 IPC 往返）
   - 注入"旺财一键回复"按钮（翠绿色 `#10b981`，区别于视频号原 UI），点击上报给渲染进程 + IPC 给主进程
   - 私信防封延迟：2-5s 随机
   - 路由切换兜底扫描（视频号 SPA，1.5s 轮询 URL 变化）
   - 暴露 `window.wangcaiVideo` API：start/stop/onComment/getComments/scan/sendDM/setDmSendHook/likeVideo/replyComment
   - 兼容旧 API：`__wangcai` / `__wangcaiEvent` / `__wangcaiSetCallback`
5. 运行 `bun run lint`：
   - 新增 TS 文件（connector.ts / route.ts）零 lint 错误 ✅
   - `video-preload.js` 的 `require()` 错误是项目级架构性约束（Electron CommonJS），与 `douyin-preload.js` / `wechat-preload.js` 一致
6. 真实 API 验证（curl 直连 dev server）：
   - GET `/api/waos/wechat-video` → 8 条评论按 videoPlayCount 降序排列 ✅
   - login → success: true ✅
   - reply_comment(vc1) → success: true，vc1 状态变为 replied + aiReply 写入 ✅
   - send_dm(vu002) → success: true，新消息出现在 get_messages ✅
   - like_video(vv1) → success: true ✅
   - get_comments(videoId=vv1) → 正确过滤出 2 条 ✅
   - logout → success: true ✅
   - 意向分实例验证：
     * "奔驰GLC多少钱？现在有优惠吗" → 80（询价+30，基础 50）
     * "AMG GT 63 试驾还要预约吗" → 75（购车意向+25）
     * "EQE续航怎么样？价格太贵了吧" → 70（询价+30 + 负面-10）
     * "GLC太贵了不值这个价，算了看X3" → 40（负面-10）
     * "S级迈巴赫首付多少月供压力" → 50（无关键词命中）

## Stage Summary

### 产出文件清单
| 文件 | 行数 | 状态 |
|------|------|------|
| `src/lib/wechat-video/connector.ts` | 325 | 新建 |
| `src/app/api/waos/wechat-video/route.ts` | 127 | 新建 |
| `electron/preloads/video-preload.js` | 450 | 重写（原 22 行 stub） |
| **合计** | **902** | |

### 关键决策

1. **意向分规则按 rule 加分一次**：每条规则（询价 / 购车意向 / 好感 / 负面）即便命中多个关键词也只加一次分。例如"奔驰GLC多少钱？现在有优惠吗"虽然同时命中"多少钱"和"优惠"，但属于同一规则，只 +30 一次（最终 80 分而非 110 分 clamp 100）。这与产品语义一致：避免用户堆砌同义关键词刷分。
2. **`getComments` 排序无条件按 videoPlayCount 降序**：spec 明确要求"高播放量优先截流"。即便传了 videoId 过滤（同一视频评论播放量相同），仍保持稳定排序，便于上层 UI 一致展示。
3. **Mock `sendDM` 写入消息记录**：sendDM 不仅标记 comment.replyStatus = 'dm_sent'，还 push 一条 VideoMessage 到 messages 列表，便于后续 get_messages 追溯历史。
4. **preload 意向分本地计算**：避免每条评论都要 IPC 到主进程再算意向分，preload 端用相同算法（4 条正则规则）即时计算，DOM 提取后即可上报"评论 + 意向分"完整对象。
5. **preload 兼容旧 API**：保留 `__wangcai` / `__wangcaiEvent` / `__wangcaiSetCallback`，避免老代码引用断裂；同时新增 `window.wangcaiVideo` 完整 API。
6. **私信防封延迟 2-5s 随机**：避免固定间隔被视频号反作弊系统识别。可由主进程通过 `setDmSendHook` 注入真实发送逻辑。
7. **错误处理双层兜底**：connector 内部用 `withTimeout` 包 Promise；API route 外层 try-catch；GET 端 `.catch(() => [])` 防止 connector 异常导致 500。
8. **runtime = 'nodejs' + dynamic = 'force-dynamic'**：与 douyin route 保持一致，确保每次请求都重新执行（不缓存），适配实时变化的评论状态。

### 关键接口
```typescript
// Connector 接口
interface WechatVideoConnector {
  login(): Promise<boolean>
  isLoggedIn(): boolean
  getComments(videoId?: string): Promise<VideoComment[]>
  getMessages(): Promise<VideoMessage[]>
  replyComment(commentId: string, content: string): Promise<boolean>
  sendDM(userId: string, content: string): Promise<boolean>
  likeVideo(videoId: string): Promise<boolean>
  logout(): void
}

// 单例获取
getWechatVideoConnector(): WechatVideoConnector

// Preload 暴露的渲染进程 API
window.wangcaiVideo.start() / stop() / onComment(cb) / getComments() / scan()
window.wangcaiVideo.sendDM(userId, content)  // 带 2-5s 防封延迟
window.wangcaiVideo.setDmSendHook(fn)         // 主进程注入真实发送逻辑
window.wangcaiVideo.likeVideo()               // 模拟点击 like 按钮
window.wangcaiVideo.replyComment(id, content) // DOM 操作填入并点击发送

// API route
POST /api/waos/wechat-video { action, ... }
GET  /api/waos/wechat-video
```
