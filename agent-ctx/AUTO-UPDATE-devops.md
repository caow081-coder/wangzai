# Task ID: AUTO-UPDATE · DevOps 工程师 · electron-updater 自动更新集成

## 任务概述
集成 `electron-updater` 让旺财桌面客户端支持从 GitHub Releases 自动检查、下载、安装更新。

## 前置阅读
1. ✅ `/home/z/my-project/worklog.md` — 项目全貌与已完成工作
2. ✅ `/home/z/my-project/electron/main.js` — 前 60 行了解 require 结构 + `isDev = !app.isPackaged`；后 50 行了解 IPC handler 末尾位置
3. ✅ `/home/z/my-project/package.json` — `build.publish` 原为 `null`，`build.win` 已配置 NSIS
4. ✅ `/home/z/my-project/docs/BUILD.md` — 8.5 节"未来增强"占位，可改为"已实现"
5. ✅ `/home/z/my-project/src/components/waos/SettingsDialog.tsx` — 找到「通知」Section 后插入「版本与更新」
6. ✅ `/home/z/my-project/src/app/page.tsx` — 在 `<DownloadFloat />` 后挂载 `<UpdateChecker />`
7. ✅ `/home/z/my-project/src/hooks/waos/useElectronBridge.tsx` — 已有 `waosDesktop` 全局类型声明模式可借鉴

## 交付文件清单

| # | 路径 | 类型 | 变更行数 |
|---|------|------|---------|
| 1 | `package.json` | 修改 | +6 -1（新增 `electron-updater` 依赖 + `publish` 配置） |
| 2 | `electron/main.js` | 修改 | +130（autoUpdater 初始化块 + 4 个 IPC handler） |
| 3 | `electron/preload.js` | 修改 | +55（顶部 require 探测 + 末尾 `waosUpdater` contextBridge） |
| 4 | `src/components/waos/UpdateChecker.tsx` | 新建 | ~460 行（Zustand store + 2 个组件 + 3 个主动作） |
| 5 | `src/app/page.tsx` | 修改 | +2 行（import + 挂载） |
| 6 | `src/components/waos/SettingsDialog.tsx` | 修改 | +3 行（import + `<UpdateStatusInline />`） |
| 7 | `docs/BUILD.md` | 修改 | +220 行（新增第 9 章 10 节 + 更新 8.4/8.5 + 变更记录） |

## 关键接口（供后续 agent 复用）

### 主进程 IPC（`electron/main.js`）
```js
ipcMain.handle('check-for-updates', async () => /* { available, info?, currentVersion?, reason?, error? } */)
ipcMain.handle('download-update',    async () => /* { success, reason?, error? } */)
ipcMain.handle('install-update',     async () => /* { success, reason?, error? } */)
ipcMain.handle('get-app-version',    async () => /* { version, isPackaged } */)
```

### 主进程 → 渲染进程事件
| 事件名 | payload | 触发时机 |
|--------|---------|---------|
| `update-available` | `{ version, releaseDate, releaseNotes }` | 发现新版本 |
| `update-download-progress` | `{ percent, transferred, total, bytesPerSecond }` | 下载中（每秒） |
| `update-downloaded` | `{ version, ... }` | 下载完成 |

### 渲染进程 API（`window.waosUpdater`，由 `electron/preload.js` 暴露）
```ts
window.waosUpdater = {
  isAvailable: boolean,
  checkForUpdates:  () => Promise<CheckResult>,
  downloadUpdate:   () => Promise<DownloadResult>,
  installUpdate:    () => Promise<InstallResult>,
  getAppVersion:    () => Promise<{ version, isPackaged }>,
  onUpdateAvailable:        (cb) => unsubscribe,
  onUpdateDownloaded:       (cb) => unsubscribe,
  onUpdateDownloadProgress: (cb) => unsubscribe,
}
```

### React 组件（`src/components/waos/UpdateChecker.tsx`）
| 导出 | 用途 |
|------|------|
| `<UpdateChecker />` | 全局监听组件，挂在 `page.tsx`。启动 5s 后自动检查，弹 Toast + 进度浮窗 |
| `<UpdateStatusInline />` | 嵌入 `SettingsDialog`，显示当前版本/状态 + 检查/下载/安装按钮 |
| `useUpdaterStore` | Zustand store（status / currentVersion / newVersion / progress / errorMsg / lastCheckedAt） |

## 设计要点

1. **生产模式才启用**：`autoUpdater` 初始化包裹在 `if (!isDev)` 中（`isDev = !app.isPackaged`），开发模式保持 `null`，所有 IPC 返回 `{ available: false, reason: '非生产模式…' }`
2. **不自动下载**：`autoUpdater.autoDownload = false`，必须用户点击「下载更新」才下载，避免弱网占带宽
3. **退出时自动安装**：`autoUpdater.autoInstallOnAppQuit = true`，用户不点「重启」也会在下次退出时安装
4. **双保险检查**：主进程 `app.whenReady()` 后延迟 3s 检查 + 渲染进程 mount 后延迟 5s 主动 IPC 检查
5. **每 4 小时定时检查**：长运行应用能感知新版本
6. **全链路 try-catch**：所有 IPC handler、事件转发、渲染进程动作都加 try-catch
7. **网页端降级**：`window.waosUpdater?.isAvailable` 检测，非 Electron 环境下 `UpdateChecker` return null
8. **进度可视化**：浮窗显示百分比 + 已下载/总字节 + 速度（自动单位 B/KB/MB）
9. **状态机驱动 UI**：8 状态（idle/checking/available/no-update/downloading/downloaded/error/unavailable）
10. **深色模式兼容**：浮窗用 `bg-background/95` + `border-border`，自动适配
11. **事件监听可取消**：preload 的 `onUpdateXxx` 都返回 unsubscribe 函数，避免 React 重复 mount 监听器泄漏
12. **避免 effect 内 setState**：浮窗可见性直接派生自 `status`（`isActiveStatus(status)`），不用 useState

## 验证

| 项 | 命令 | 结果 |
|----|------|------|
| 依赖安装 | `bun add electron-updater` | ✅ `electron-updater@6.8.9` |
| 主进程语法 | `node --check electron/main.js` | ✅ OK |
| preload 语法 | `node --check electron/preload.js` | ✅ OK |
| ESLint | `bun run lint` | ✅ 0 errors, 4 warnings（均为既存无关警告：BrainSettings/Splashscreen/TopBar 的 Unused eslint-disable） |
| TypeScript | `bunx tsc --noEmit` | ✅ UpdateChecker/page.tsx/SettingsDialog 0 错误（其他无关文件既存错误未触动） |
| dev server | `tail dev.log` | ✅ Ready in 824ms，无新错误 |

## 用户端体验流程
```
启动旺财（已安装 v1.0.0）
  ↓ 5s 后
渲染进程自动 checkForUpdates
  ↓
GitHub Releases 上有 v1.1.0
  ↓
主进程推送 update-available
  ↓
Toast: 「✨ 发现新版本 v1.1.0，点击下载更新」
  ↓ 用户点击「下载更新」
调用 downloadUpdate IPC
  ↓
主进程下载中，每秒推送 download-progress
  ↓
右下角浮窗: 进度条 12% · 24.5 MB / 200 MB · 2.3 MB/s
  ↓ 下载完成
主进程推送 update-downloaded
  ↓
Toast: 「✅ 已下载完成，点击重启并安装」+ 浮窗「重启并安装」按钮
  ↓ 用户点击
调用 installUpdate IPC → quitAndInstall()
  ↓
NSIS 静默安装 v1.1.0，自动启动
```

## 后续可增强项（未来工作）
1. **代码签名**：当前 `verifyUpdateCodeSignature: false`，未签名有安全隐患（见 BUILD.md 9.10）
2. **增量更新**：已通过 `.blockmap` 文件启用
3. **多通道**：可加 `beta` / `stable` 通道切换
4. **更新日志展示**：当前 releaseNotes 仅保存，未来可在 Toast 中渲染 markdown
5. **下载暂停/取消**：`autoUpdater.cancelDownload()` 可加「取消下载」按钮
6. **electron-log 集成**：将 `[Updater]` 日志写入 `%APPDATA%/wangcai/logs/`

## 注意事项（给后续 agent）
- `electron-updater` 必须在 `dependencies`（不是 `devDependencies`），否则打包时不会进入 standalone
- `package.json` 的 `build.publish` 现在是 GitHub Releases 配置，发布时必须设置 `GH_TOKEN` 环境变量
- `latest.yml` 是 electron-updater 找到新版本的关键文件，没有它客户端会一直显示"已是最新"
- 测试自动更新：把 `package.json` 的 `version` 改小（如 `0.0.1`）重新打包，安装后会立即触发更新
- `electron-updater` 不支持开发模式（`app.isPackaged === false` 时），所以 `bun run electron:dev` 测不了自动更新，必须 `electron:build` 后才能测

## 工作记录
- 工作日志已追加到 `/home/z/my-project/worklog.md`（`## AUTO-UPDATE · electron-updater 自动更新集成（2026-06-21）` 章节）
