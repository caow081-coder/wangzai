# 旺财（WAOS）Windows 打包指南

> **Task ID**: BUILD-GUIDE
> 本文档面向需要在 Windows 上打包「旺财」桌面端 exe 安装包的开发者。
> 仓库：https://github.com/caow081-coder/wangzai.git

---

## 目录

- [1. 环境准备](#1-环境准备)
- [2. 开发模式](#2-开发模式)
- [3. 打包 Windows exe](#3-打包-windows-exe)
- [4. 打包流程详解](#4-打包流程详解)
- [5. 安装后验证](#5-安装后验证)
- [6. 常见问题（FAQ）](#6-常见问题faq)
- [7. 生产环境配置](#7-生产环境配置)
- [8. 更新版本](#8-更新版本)
- [9. 自动更新（electron-updater）](#9-自动更新electron-updater)
- [附录：产物结构](#附录产物结构)

---

## 1. 环境准备

### 1.1 必备软件

| 软件 | 最低版本 | 推荐版本 | 说明 |
|------|---------|---------|------|
| **Node.js** | 18.0+ | 20 LTS | Next.js 16 要求 ≥18.18 |
| **Bun** | 1.0+ | 1.1+ | 项目主要包管理器与运行时 |
| **Git** | 2.30+ | 最新 | 代码版本管理 |
| **Windows** | 10 (1809+) | Windows 11 64 位 | 仅支持 x64 架构 |

### 1.2 可选软件（按需安装）

| 软件 | 用途 | 备注 |
|------|------|------|
| Visual Studio Build Tools | 原生模块编译（如 `sharp`、`better-sqlite3`） | 仅在 `bun install` 报 node-gyp 错误时安装 |
| 7-Zip | 解压 / 校验安装包 | 可选 |
| Resource Hacker | 查看 / 替换 exe 内嵌图标 | 仅定制图标时需要 |

### 1.3 安装 Bun（如未安装）

```powershell
# PowerShell（管理员）
irm bun.sh/install.ps1 | iex

# 验证
bun --version   # 应输出 1.0+
```

### 1.4 系统要求检查

```powershell
node --version     # v18.x 或更高
bun --version      # 1.x
git --version      # 2.x
where node         # 确认 Node 在 PATH 中
```

---

## 2. 开发模式

### 2.1 克隆与安装

```bash
git clone https://github.com/caow081-coder/wangzai.git
cd wangzai
bun install
```

> `bun install` 会比 npm 快 5–10 倍，并自动生成 `bun.lockb`。

### 2.2 配置环境变量

项目根目录已有 `.env` 文件，包含三个核心变量：

```bash
DATABASE_URL=file:./db/custom.db
ZHIPU_API_KEY=<your-zhipu-key>
DOUBAO_DOCKER_URL=http://localhost:9090
```

如需修改，直接编辑 `.env`。打包时该文件会被 `next build` 内联到 standalone 产物中。

### 2.3 初始化数据库

```bash
bun run db:push
```

此命令会：
1. 读取 `prisma/schema.prisma`
2. 在 `db/custom.db` 中创建 6 张业务表（Lead / Message / EventLog / SOP / Skill / Setting）
3. 自动生成 `@prisma/client` 类型

> 首次运行会自动创建 `db/` 目录与 `db/custom.db` 文件。

### 2.4 启动开发服务器

```bash
bun run dev
# 等价于：next dev -p 3000
```

浏览器打开 [http://localhost:3000](http://localhost:3000) 即可看到旺财主界面。

### 2.5 启动 Electron 开发模式（可选）

如需在真实 Electron 容器中测试（含微信扫码、视频号嵌入、IPC）：

```bash
# 终端 1：启动 Next.js dev
bun run dev

# 终端 2：启动 Electron
bun run electron:dev
```

Electron 会加载 `http://localhost:3000`，并启动内联 stream 服务（端口 3003）。

---

## 3. 打包 Windows exe

### 3.1 一键打包

```bash
# 确保已安装所有依赖
bun install

# 初始化数据库（生成 db/custom.db，打包时会被一起带上）
bun run db:push

# 一键打包
bun run electron:build
```

`electron:build` 命令实际执行三步：

```bash
next build                          # 1. 构建 Next.js 生产版本（输出 standalone）
node scripts/copy-assets.js         # 2. 复制 static / public / prisma / db / electron 到 standalone
electron-builder --win --x64        # 3. 调用 electron-builder 生成 NSIS 安装包
```

### 3.2 产物位置

打包成功后，安装包位于：

```
release/
├── 旺财 Setup 1.0.0.exe          ← 主安装包（约 180–250 MB）
├── 旺财 Setup 1.0.0.exe.blockmap  ← 增量更新用 blockmap
├── builder-effective-config.yaml  ← 实际生效的 electron-builder 配置
└── builder-debug.yml              ← 调试信息
```

### 3.3 打包时长预期

| 阶段 | 耗时（参考） | 说明 |
|------|------------|------|
| `next build` | 30–60 s | 22 个 API 路由 + 14 个组件 |
| `copy-assets` | 1–3 s | 仅文件复制 |
| `electron-builder` | 60–180 s | NSIS 压缩 + 7z 封装 |
| **总计** | **2–5 min** | 首次更慢（需下载 electron-builder 二进制） |

---

## 4. 打包流程详解

### 4.1 `next build`（Next.js 生产构建）

- 入口：`next.config.ts` 中 `output: "standalone"`
- 产物：`.next/standalone/server.js` + 最小化 `node_modules`
- 关键文件：
  - `.next/standalone/server.js` —— 生产模式 Next.js 服务器入口
  - `.next/static/` —— 编译后的 JS / CSS / 字体
  - `.next/standalone/.next/BUILD_ID` —— 构建版本号

> **注意**：`next.config.ts` 中 `typescript.ignoreBuildErrors: true`，打包不会因类型错误中断。
> 但建议开发时仍运行 `npx tsc --noEmit` 保持代码健康。

### 4.2 `copy-assets.js`（资源复制）

脚本路径：`scripts/copy-assets.js`

执行 5 个复制任务，全部使用 `path.join`，跨平台兼容：

| # | 源 | 目标 | 说明 |
|---|------|------|------|
| 1 | `.next/static` | `.next/standalone/.next/static` | Next.js 静态资源（JS/CSS/字体） |
| 2 | `public` | `.next/standalone/public` | logo / 图片等公开资源 |
| 3 | `prisma` | `.next/standalone/prisma` | `schema.prisma`（排除 `migrations/`） |
| 4 | `db` | `.next/standalone/db` | SQLite 数据库 `custom.db` |
| 5 | `electron` | `.next/standalone/electron` | 主进程源码（排除 `build/`） |

**特性：**
- 源目录不存在时打印警告并跳过，不中断打包
- `.next/standalone` 不存在时直接报错退出（提示先跑 `next build`）
- 兜底：若 `standalone/package.json` 缺失，会从根目录复制一份
- 完整 try/catch 包裹，任何异常都会带堆栈退出

### 4.3 `electron-builder --win --x64`（NSIS 安装包）

读取 `package.json` 中 `build` 配置生成 Windows 安装包。

**关键配置解读：**

```jsonc
{
  "asar": false,                  // 关闭 asar 打包
                                  // 原因：spawn('node', ['server.js']) 无法进入 asar 虚拟文件系统
                                  // 关闭后所有文件以真实目录结构存在于 resources/app/

  "files": [                      // 进入安装包的文件白名单
    "electron/**/*",              // Electron 主进程（main.js / preload / sandbox 等）
    "!electron/build/**",         // 排除 electron-builder 临时目录
    ".next/standalone/**/*",      // Next.js 生产服务器 + 业务代码
    ".next/static/**/*",          // 静态资源（备份一份，便于调试）
    "public/**/*",                // 公开静态资源
    "prisma/**/*",                // Prisma schema
    "db/**/*",                    // SQLite 数据库
    "package.json"                // electron-builder 读取 main 字段
  ],

  "extraResources": [             // 额外资源（放到 resources/db、resources/prisma）
    { "from": "db",    "to": "db" },
    { "from": "prisma", "to": "prisma" }
  ],

  "win": {
    "target": [{ "target": "nsis", "arch": ["x64"] }],
    "icon": "electron/build/icon.png",         // 512×512 PNG，符合 ≥256 要求
    "artifactName": "旺财 Setup ${version}.${ext}"
  },

  "nsis": {
    "oneClick": false,                          // 非一键安装（显示安装向导）
    "allowToChangeInstallationDirectory": true, // 允许用户选择安装目录
    "createDesktopShortcut": true,              // 创建桌面快捷方式
    "createStartMenuShortcut": true,            // 创建开始菜单快捷方式
    "shortcutName": "旺财",                     // 快捷方式名称
    "uninstallDisplayName": "旺财 ${version}",  // 控制面板中显示的卸载名称
    "deleteAppDataOnUninstall": false,          // 卸载时保留用户数据
    "language": "2052"                          // 简体中文（0x0804）
  }
}
```

---

## 5. 安装后验证

### 5.1 安装

1. 双击 `旺财 Setup 1.0.0.exe`
2. 选择安装语言（默认简体中文）
3. 接受许可协议
4. **选择安装目录**（默认 `C:\Users\<用户>\AppData\Local\Programs\旺财`）
5. 选择是否创建桌面 / 开始菜单快捷方式
6. 等待安装完成（约 30 s）

### 5.2 首次启动

1. 双击桌面「旺财」图标
2. 等待 5–15 秒（首次启动需初始化 Next.js 与内联 socket.io 服务）
3. 应用窗口自动弹出，标题为「旺财 · AI 私域营销助手」

### 5.3 目录结构（安装后）

```
C:\Users\<用户>\AppData\Local\Programs\旺财\
├── 旺财.exe                       ← 启动器
├── resources/
│   ├── app/                       ← 应用代码（asar=false）
│   │   ├── electron/              ← 主进程
│   │   ├── .next/standalone/      ← Next.js 服务器
│   │   │   ├── server.js
│   │   │   ├── .next/static/
│   │   │   ├── public/
│   │   │   ├── db/custom.db       ← SQLite 数据库（运行时读写）
│   │   │   ├── prisma/schema.prisma
│   │   │   └── electron/
│   │   └── package.json
│   ├── db/                        ← extraResources 备份的 db
│   └── prisma/                    ← extraResources 备份的 prisma
└── 旺财.ico
```

### 5.4 功能验证清单

| # | 验证项 | 预期结果 |
|---|--------|---------|
| 1 | 窗口标题 | `旺财 · AI 积域营销助手` |
| 2 | 顶栏 | logo + 🏆苏念安 + 微信3 / 通讯录 / 朋友圈 / 视频获客 + 6 数字快捷键 + 线索6 / 队列6 |
| 3 | 左侧微信面板 | 6 条会话（林晚秋 / 陈墨白 / 苏念安 / 江月明 / 顾倾城 / 沈听澜） |
| 4 | 右侧决策面板 | 林晚秋 意向 85 分 · HOT · 推荐话术 |
| 5 | AI 大脑 | 顶栏点「AI 大脑」→ 输入「奔驰C级多少钱」→ 智谱 GLM-4 返回真实回答 |
| 6 | 安全护盾 | 输入「OR 1=1」→ 返回 `inputSanitized: true` |
| 7 | 微信登录 | 点「微信连接」→ 弹出扫码窗口 → 用手机微信扫码 |
| 8 | 实时事件流 | 8–15 秒推送一条新线索（端口 3003 socket.io） |
| 9 | 设置 | 点设置图标 → 可修改 ZHIPU_API_KEY / DATABASE_URL / 人设 |
| 10 | 退出 | 窗口关闭 → 后台 Next.js / socket.io 进程一并退出 |

### 5.5 端口占用检查

启动后应有以下端口在监听：

```powershell
netstat -ano | findstr ":3000 :3003"
# 3000 → Next.js 生产服务器
# 3003 → 内联 socket.io stream 服务
```

---

## 6. 常见问题（FAQ）

### Q1：端口 3000 被占用

**现象**：启动后窗口空白 / 控制台报 `EADDRINUSE: address already in use 0.0.0.0:3000`

**解决**：

```powershell
# 查看占用 3000 的进程
netstat -ano | findstr ":3000"

# 杀掉进程（PID 替换为实际值）
taskkill /F /PID <PID>

# 或关闭其他 Next.js / bun 进程
taskkill /F /IM node.exe
taskkill /F /IM bun.exe
```

> main.js 已内置端口检测，若 3000 已占用会跳过启动 Next.js（假设外部已运行）。
> 但生产模式下应确保没有其他 Next.js 进程。

### Q2：端口 3003 被占用

**现象**：日志 `[WAOS-Stream] Port 3003 already in use`

**解决**：

```powershell
netstat -ano | findstr ":3003"
taskkill /F /PID <PID>
```

> 同样地，main.js 检测到 3003 占用会跳过启动内联 stream 服务。

### Q3：微信登录失败

**现象**：扫码后无响应 / 一直「连接中」

**排查**：

1. **微信客户端未启动**：确保 PC 端微信已登录
2. **ClawBot SDK 版本**：检查 `node_modules/weixin-agent-sdk` 是否存在
3. **网络问题**：微信扫码需要联网，检查防火墙
4. **Electron 版本**：当前使用 Electron 42，老版本可能不兼容

```powershell
# 在应用菜单「视图 → 开发者工具」中查看 console 错误
```

### Q4：AI 大脑无响应

**现象**：点「AI 大脑」后长时间无回复

**排查**：

1. **网络**：智谱 API 需要外网访问，`api.zhipu.ai` 可达
2. **API Key 失效**：设置中检查 `ZHIPU_API_KEY` 是否有效
3. **降级链触发**：日志会显示从 `zhipu_api` → `doubao_docker` → `cookie_reverse` → `zai` 的降级过程
4. **豆包 Docker 未启动**：`DOUBAO_DOCKER_URL=http://localhost:9090` 需本地启动豆包 Docker 服务
5. **限流**：单 IP 60 次/分钟，超限会被拦截

### Q5：打包失败

**通用排查**：

```powershell
# 1. 清理所有产物
Remove-Item -Recurse -Force .next, release -ErrorAction SilentlyContinue

# 2. 重新安装依赖
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
bun install

# 3. 重新打包
bun run electron:build
```

**常见错误**：

| 错误 | 原因 | 解决 |
|------|------|------|
| `icon size must be at least 256x256` | icon 太小 | 使用 `electron/build/icon.png`（512×512） |
| `Cannot find module 'electron-builder'` | 依赖未安装 | `bun install` |
| `next build` 报 module not found | `node_modules` 残缺 | 删除 `node_modules` 重装 |
| `EPERM: operation not permitted` | 文件被占用 | 关闭所有占用文件（VS Code / 杀毒软件） |
| `EBUSY: resource busy` | exe 正在运行 | 任务管理器结束 旺财.exe |

### Q6：打包体积过大

当前约 180–250 MB，主要来源：

| 占用 | 大小 | 优化建议 |
|------|------|---------|
| `node_modules`（Electron runtime） | ~80 MB | 已通过 standalone 最小化 |
| Electron 二进制 | ~90 MB | 不可避免 |
| `better-sqlite3` 原生模块 | ~10 MB | 可换 `sql.js`（纯 JS） |
| `sharp` 图像处理 | ~30 MB | 仅上传用到时可按需 lazy require |

### Q7：安装后数据库无法写入

**现象**：应用启动后报 `SQLITE_CANTOPEN` 或 `database is locked`

**原因**：安装目录（`Program Files`）默认只读

**解决**：

1. **方案 A（推荐）**：将 `DATABASE_URL` 改为用户目录

```bash
# 在 应用内「设置 → AI 大脑 → 数据库」中修改：
DATABASE_URL=file:${APPDATA}/wangcai/db/custom.db
```

2. **方案 B**：安装时选择用户目录（如 `C:\Users\<用户>\旺财`）

3. **方案 C**：以管理员身份运行旺财（不推荐）

### Q8：卸载后用户数据未清理

**说明**：当前配置 `deleteAppDataOnUninstall: false`，即卸载时保留：

- `%APPDATA%/wangcai/` —— 用户配置
- `%LOCALAPPDATA%/Programs/旺财/` 下的 db（若改了 DATABASE_URL）

如需彻底清理，手动删除上述目录即可。

---

## 7. 生产环境配置

### 7.1 环境变量

`.env` 文件（项目根目录）：

```bash
# SQLite 数据库路径（相对路径相对于 standalone 工作目录）
DATABASE_URL=file:./db/custom.db

# 智谱 GLM-4 API Key（AI 大脑主模型）
ZHIPU_API_KEY=<32位密钥>.<16位密钥>

# 豆包 Docker 服务地址（本地 LLM 降级用）
DOUBAO_DOCKER_URL=http://localhost:9090
```

**打包行为**：`next build` 会把 `.env` 内联到 `.next/standalone/.env`，安装后无需单独配置。

**运行时覆盖**：在 `%APPDATA%/wangcai/.env` 创建同名文件可覆盖默认值（需应用代码支持，未来增强）。

### 7.2 数据库路径

| 场景 | 路径 | 写权限 |
|------|------|--------|
| 开发模式 | `file:./db/custom.db` | ✅（项目目录可写） |
| 生产默认（安装到 AppData） | `<install>/resources/app/.next/standalone/db/custom.db` | ✅ |
| 生产用户隔离（推荐） | `file:${APPDATA}/wangcai/db/custom.db` | ✅ |
| 安装到 Program Files | 同上（Program Files 只读） | ❌ 需用方案 A |

### 7.3 日志路径

| 模式 | 路径 | 说明 |
|------|------|------|
| 开发 | `<项目根>/dev.log` | bun run dev 重定向输出 |
| 生产（当前） | 控制台 / Electron stdout | 通过 `旺财.exe > log.txt 2>&1` 启动可捕获 |
| 生产（未来） | `%APPDATA%/wangcai/logs/` | 待实现（需在 main.js 中加 electron-log） |

### 7.4 端口规划

| 端口 | 服务 | 协议 | 是否暴露 |
|------|------|------|---------|
| 3000 | Next.js 生产服务器 | HTTP | 仅本机 |
| 3003 | 内联 socket.io stream | WebSocket | 仅本机 |
| 9090 | 豆包 Docker（可选） | HTTP | 仅本机 |

> 三个端口均绑定 `0.0.0.0`，但建议防火墙仅允许本机访问。

### 7.5 安全建议

1. **API Key 轮换**：每 90 天更换 `ZHIPU_API_KEY`
2. **数据库备份**：定期复制 `%APPDATA%/wangcai/db/custom.db`
3. **网络隔离**：生产环境不要让 3000 / 3003 端口对外暴露
4. **Electron 安全**：当前 `contextIsolation: true, nodeIntegration: false`，符合安全规范

---

## 8. 更新版本

### 8.1 修改版本号

编辑 `package.json`：

```jsonc
{
  "version": "1.1.0"   // ← 修改此处（遵循 semver）
}
```

### 8.2 重新打包

```bash
bun run electron:build
# 产物：release/旺财 Setup 1.1.0.exe
```

### 8.3 版本号规范

| 类型 | 格式 | 示例 | 何时使用 |
|------|------|------|---------|
| 主版本 | X.0.0 | 2.0.0 | 破坏性变更（数据库迁移、API 不兼容） |
| 次版本 | 1.X.0 | 1.1.0 | 新功能（新 API、新组件） |
| 修订版 | 1.0.X | 1.0.1 | Bug 修复、文案调整 |

### 8.4 发布流程（建议）

```bash
# 1. 更新版本号
#    编辑 package.json: "version": "1.1.0"

# 2. 提交代码
git add -A
git commit -m "release: v1.1.0 - 新增视频号截流"

# 3. 打 tag
git tag v1.1.0
git push origin main --tags

# 4. 打包并发布（需设置 GH_TOKEN，详见第 9 章）
#    方式 A：本地打包 + 自动上传到 GitHub Releases
$env:GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"   # PowerShell
bun run electron:build

#    方式 B：仅本地打包，手动上传 exe + latest.yml
#    见第 8.4.1 节
```

> 自 v1.1.0 起，`package.json` 的 `build.publish` 已配置为 GitHub Releases，
> 打包时 electron-builder 会自动生成 `latest.yml` 并尝试上传到
> `https://github.com/caow081-coder/wangzai/releases`。
> 若未设置 `GH_TOKEN`，会跳过上传，需要手动发布（见 9.3）。

#### 8.4.1 手动上传到 GitHub Releases（无 GH_TOKEN 时）

1. 打包：`bun run electron:build`，产物在 `release/`
2. 打开 [Releases · caow081-coder/wangzai](https://github.com/caow081-coder/wangzai/releases/new)
3. 选择刚 push 的 tag（如 `v1.1.0`）
4. 上传以下三个文件：
   - `旺财 Setup 1.1.0.exe` — 主安装包
   - `旺财 Setup 1.1.0.exe.blockmap` — 增量更新用
   - `latest.yml` — electron-updater 比对版本用的元数据（**必须**）
5. 点击 **Publish release**

> ⚠️ `latest.yml` 是 electron-updater 找到新版本的关键文件。没有它，
> 客户端会一直显示"已是最新版本"。

### 8.5 自动更新（已实现）

自 v1.1.0 起，旺财已集成 [`electron-updater`](https://www.electron.build/auto-update)
实现自动更新。详见第 [9 章](#9-自动更新electron-updater)。

---

## 9. 自动更新（electron-updater）

旺财 v1.1.0+ 集成 [`electron-updater`](https://www.electron.build/auto-update)，
从 GitHub Releases 拉取 `latest.yml` 比对版本，发现新版本后提示用户下载安装。

### 9.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Releases (caow081-coder/wangzai)                        │
│  ├── 旺财 Setup 1.1.0.exe                                        │
│  ├── 旺财 Setup 1.1.0.exe.blockmap                               │
│  └── latest.yml              ← electron-updater 比对版本用       │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS GET
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Electron 主进程 (electron/main.js)                              │
│  ├── require('electron-updater').autoUpdater                     │
│  ├── 启动后延迟 3s 检查一次                                       │
│  ├── 每 4 小时定时检查                                            │
│  └── IPC: check-for-updates / download-update / install-update   │
└────────────────────────────────┬────────────────────────────────┘
                                 │ contextBridge
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  渲染进程 (Next.js)                                              │
│  ├── window.waosUpdater (preload.js 暴露)                        │
│  ├── <UpdateChecker />  全局监听 + Toast 通知 + 下载进度浮窗     │
│  └── <UpdateStatusInline />  设置 Dialog 里的"检查更新"按钮      │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 关键文件

| 文件 | 作用 |
|------|------|
| `electron/main.js` | 集成 `autoUpdater`，监听 `update-available` / `download-progress` / `update-downloaded`，注册 4 个 IPC handler |
| `electron/preload.js` | 通过 `contextBridge.exposeInMainWorld('waosUpdater', …)` 暴露更新 API |
| `src/components/waos/UpdateChecker.tsx` | 渲染进程：状态机 + Toast + 进度浮窗 + 设置面板内联组件 |
| `src/app/page.tsx` | 挂载 `<UpdateChecker />` |
| `src/components/waos/SettingsDialog.tsx` | 嵌入 `<UpdateStatusInline />` 提供"检查更新"按钮 |
| `package.json` 的 `build.publish` | 配置 GitHub Releases 作为发布渠道 |

### 9.3 发布新版本流程（开发者侧）

#### 步骤 1：创建 GitHub Token

1. 打开 https://github.com/settings/tokens/new
2. 勾选 `repo` 权限（用于上传 release 资产）
3. 生成后复制 token（形如 `ghp_xxxxx...`）

#### 步骤 2：设置环境变量

```powershell
# PowerShell（当前会话有效）
$env:GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# 持久化（写入用户环境变量）
[Environment]::SetEnvironmentVariable("GH_TOKEN", "ghp_xxx...", "User")

# 或写入 .bashrc / .zshrc
export GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
```

#### 步骤 3：更新版本号 + 提交 + 打 tag

```bash
# 编辑 package.json，把 "version" 改为 "1.1.0"
# 或用 npm version 命令自动改 + 打 tag
npm version 1.1.0 -m "release: v1.1.0"

git push origin main --tags
```

#### 步骤 4：打包 + 自动上传

```bash
bun run electron:build
```

打包完成后，`release/` 目录会出现：

```
release/
├── 旺财 Setup 1.1.0.exe              ← 安装包
├── 旺财 Setup 1.1.0.exe.blockmap     ← 增量更新 blockmap
└── latest.yml                        ← 版本元数据（electron-updater 读取）
```

electron-builder 检测到 `publish.provider=github` + `GH_TOKEN` 后，
会自动上传这三个文件到 GitHub Releases 的对应 tag。

#### 步骤 5：验证

打开 https://github.com/caow081-coder/wangzai/releases，
确认对应 tag 的 Release 已发布且包含三个资产文件。

### 9.4 用户端体验

已安装旧版本旺财的用户，下次启动应用时：

1. **启动后 5 秒**：渲染进程自动调用 `checkForUpdates`（被动）
2. **主进程** 同时在 3 秒后检查（双保险），找到新版本推送 `update-available` 事件
3. **Toast 通知**：「发现新版本 v1.1.0，点击下载更新」
4. 用户点击「下载更新」按钮：
   - 调用 `downloadUpdate()` IPC
   - 主进程开始下载，期间推送 `download-progress` 事件
   - 右下角浮窗显示进度条 `12% · 24.5 MB / 200 MB · 2.3 MB/s`
5. 下载完成后：
   - 主进程推送 `update-downloaded` 事件
   - Toast：「新版本已下载完成，点击重启并安装」
   - 浮窗显示「重启并安装」按钮
6. 用户点击「重启并安装」：
   - 调用 `installUpdate()` IPC → 主进程 `quitAndInstall()`
   - 应用关闭，NSIS 静默安装新版本，启动后即为新版本

> 若用户不点击「重启并安装」，下次退出应用时也会自动安装
> （`autoInstallOnAppQuit = true`）。

### 9.5 手动检查更新

用户可主动触发更新检查：

1. 打开旺财 → 点顶栏齿轮图标 → 打开「WAOS 控制台设置」
2. 滚动到「版本与更新」区块
3. 显示内容：
   - 当前版本：`v1.0.0`
   - 更新状态：`已是最新版本` / `发现新版本 v1.1.0` / `下载中…` / `已就绪`
   - 上次检查时间：`14:30`
4. 点击「检查更新」按钮 → 主动调用 `check-for-updates` IPC
5. 若有新版本，按钮会切换为「下载」，下载完成后切换为「重启并安装」

### 9.6 自动更新配置详解

`package.json` 的 `build.publish` 字段：

```jsonc
"publish": {
  "provider": "github",           // 使用 GitHub Releases
  "owner": "caow081-coder",       // 仓库所有者
  "repo": "wangzai",              // 仓库名
  "releaseType": "release"        // 仅发布到 release（不含 draft/prerelease）
}
```

`electron/main.js` 中的关键配置：

```js
autoUpdater.autoDownload = false           // 不自动下载，提示用户后再下载
autoUpdater.autoInstallOnAppQuit = true    // 退出时自动安装已下载的更新
autoUpdater.allowDowngrade = false         // 不允许降级
autoUpdater.allowPrerelease = false        // 不安装预发布版本
```

### 9.7 离线 / 内网部署

自动更新依赖 GitHub 公网访问。若部署在内网：

1. **方案 A**：使用 `generic` provider 替代 `github`

```jsonc
"publish": {
  "provider": "generic",
  "url": "https://your-internal-server/waos/releases/"
}
```

将 `latest.yml` + `旺财 Setup x.x.x.exe` + `.blockmap` 放到该 HTTP 服务器即可。

2. **方案 B**：禁用自动更新

将 `electron/main.js` 中的 `if (!isDev)` 改为 `if (false)`，
或设置环境变量 `WAOS_DISABLE_UPDATE=1` 后在 main.js 检测：

```js
if (!isDev && !process.env.WAOS_DISABLE_UPDATE) {
  // ...
}
```

### 9.8 故障排查

| 现象 | 可能原因 | 解决 |
|------|---------|------|
| 启动后无任何更新提示 | 1) 开发模式（`isDev=true`） 2) `latest.yml` 未上传到 Release | 打包后再测；检查 GitHub Release 是否包含 `latest.yml` |
| 一直显示「已是最新版本」 | `latest.yml` 中的 `version` 字段 ≤ 当前版本 | 确认 `package.json` 的 `version` 已升级且重新打包 |
| 下载失败 / 网络错误 | GitHub Releases 在国内访问慢 | 用户挂代理；或改用 `generic` provider 走国内 CDN |
| 下载完成但点击「重启并安装」无反应 | `quitAndInstall` 权限不足 | 让用户右键「以管理员身份运行」一次旺财 |
| Toast 一直显示「检查中…」 | 主进程 `autoUpdater.checkForUpdates()` 未返回 | 查看 `%APPDATA%/旺财/logs/` 或控制台 `[Updater]` 日志 |
| 上传到 GitHub Releases 失败 | `GH_TOKEN` 未设置或权限不足 | 重新生成 token，勾选 `repo` 权限 |

### 9.9 调试技巧

1. **查看主进程日志**：开发模式下 `bun run electron:dev`，控制台会打印：
   ```
   [Updater] electron-updater 已加载，当前版本: 1.1.0
   [Updater] 发现新版本: 1.2.0
   [Updater] 新版本已下载: 1.2.0
   ```

2. **手动触发更新检查**：在 DevTools Console 中执行：
   ```js
   await window.waosUpdater.checkForUpdates()
   ```

3. **模拟旧版本测试更新**：临时把 `package.json` 的 `version` 改小（如 `0.0.1`），
   重新 `bun run electron:build`，安装这个版本后启动，会立即触发更新到最新版。

4. **关闭自动下载**（默认已关闭）：用户必须手动点「下载更新」按钮才会下载，
   避免在弱网环境下占用带宽。

### 9.10 安全说明

- `electron-updater` 默认使用 HTTPS + 代码签名校验
- 当前 `verifyUpdateCodeSignature: false`（见 `package.json` 的 `win` 配置），
  因为本应用未做代码签名。**生产环境强烈建议启用代码签名**：
  1. 购买 Windows 代码签名证书（约 ¥1000-3000/年）
  2. 在 `package.json` 添加：
     ```jsonc
     "win": {
       "certificateFile": "certs/wangcai.pfx",
       "certificatePassword": "..."
     }
     ```
  3. 移除 `verifyUpdateCodeSignature: false`
- 未签名时，攻击者若劫持 GitHub Releases 可推送恶意更新。
  建议开启 GitHub 仓库的 2FA + branch protection。

---

## 附录：产物结构

### A.1 release/ 目录

```
release/
├── 旺财 Setup 1.0.0.exe                ← 主安装包（约 200 MB）
├── 旺财 Setup 1.0.0.exe.blockmap       ← 增量更新 blockmap
├── builder-effective-config.yaml       ← 生效的 electron-builder 配置快照
└── builder-debug.yml                   ← 调试元数据
```

### A.2 安装后目录

```
<安装目录>/
├── 旺财.exe                              ← Electron 启动器
├── 旺财.ico                              ← 应用图标
├── resources/
│   ├── app/                              ← 应用代码（asar=false）
│   │   ├── electron/                     ← 主进程
│   │   │   ├── main.js
│   │   │   ├── preload.js
│   │   │   ├── sandbox.js
│   │   │   ├── stream-service.js
│   │   │   ├── ui-actuation.js
│   │   │   └── preloads/                 ← 平台专用 preload
│   │   ├── .next/
│   │   │   ├── standalone/               ← Next.js 生产服务器
│   │   │   │   ├── server.js
│   │   │   │   ├── .env
│   │   │   │   ├── .next/static/
│   │   │   │   ├── public/
│   │   │   │   ├── db/custom.db
│   │   │   │   ├── prisma/schema.prisma
│   │   │   │   ├── electron/             ← standalone 内的 electron 副本
│   │   │   │   ├── node_modules/         ← 最小化依赖
│   │   │   │   └── package.json
│   │   │   └── static/                   ← 备份静态资源
│   │   ├── public/                       ← 备份公开资源
│   │   ├── prisma/schema.prisma
│   │   ├── db/custom.db
│   │   └── package.json
│   ├── db/                               ← extraResources
│   └── prisma/                           ← extraResources
└── Uninstall 旺财.exe                    ← 卸载程序
```

### A.3 用户数据目录（运行时）

```
%APPDATA%/wangcai/                        ← 用户配置（未来）
├── .env                                  ← 覆盖默认 env
├── db/custom.db                          ← 用户数据库（推荐迁移到此）
└── logs/                                 ← 运行日志（未来）
```

---

## 变更记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-06-21 | v1.0 | 初始版本：完整打包指南 + copy-assets.js 优化 + electron-builder 配置完善 |
| 2026-06-21 | v1.1 | 新增第 9 章：自动更新（electron-updater 集成）；更新 8.4 发布流程；8.5 改为已实现 |

---

**文档维护**：旺财 DevOps
**最后更新**：2026-06-21
**对应代码版本**：v1.1.0
