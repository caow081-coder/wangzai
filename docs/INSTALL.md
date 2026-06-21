# 📦 旺财安装说明

> 本文档面向三类用户：**普通用户**（销售运营） / **开发者**（二次开发） / **打包发布者**（CI 出包）。
> 请根据自己的身份跳转到对应章节。

---

## 📑 目录

- [环境要求](#-环境要求)
- [🏠 普通用户（Windows）](#-普通用户windows)
- [👨‍💻 开发者](#-开发者)
- [📦 打包发布](#-打包发布)
- [🔧 依赖说明](#-依赖说明)
- [❓ 常见安装问题排查](#-常见安装问题排查)

---

## 📋 环境要求

### 普通用户（Windows 桌面版）

| 项目 | 要求 |
|---|---|
| 操作系统 | Windows 10 / 11 x64 |
| 内存 | ≥ 4 GB（推荐 8 GB） |
| 磁盘 | ≥ 500 MB 可用空间 |
| 微信 | 已安装 PC 客户端并登录 |
| .NET Framework | ≥ 4.6.1（Windows 10 自带） |
| 网络 | 可访问 `https://open.bigmodel.cn`（智谱 API） |

### 开发者

| 项目 | 要求 |
|---|---|
| 操作系统 | Windows 10+ / macOS 12+ / Ubuntu 20+ |
| Bun | ≥ 1.3（推荐，比 npm 快 10x） |
| Node.js | ≥ 20（备用，Bun 不可用时） |
| Git | ≥ 2.30 |
| 内存 | ≥ 8 GB |
| 磁盘 | ≥ 2 GB（含 node_modules + .next） |
| Docker | 可选（用于豆包逆向服务） |

### 打包发布

| 项目 | 要求 |
|---|---|
| 操作系统 | **必须在 Windows 上打包 Windows exe**（跨平台打包 electron-builder 需 docker） |
| Bun | ≥ 1.3 |
| electron-builder | 自动安装，无需手动 |
| NSIS | electron-builder 内置 |
| 磁盘 | ≥ 3 GB（构建产物 + 缓存） |

---

## 🏠 普通用户（Windows）

### 步骤 1：下载安装包

从发布渠道获取 `旺财 Setup 1.0.0.exe`（约 150 MB）。

> ⚠️ 仅从官方渠道下载，第三方渠道的 exe 可能被篡改。

### 步骤 2：双击安装

1. 双击 `旺财 Setup 1.0.0.exe`
2. Windows SmartScreen 可能弹出"未识别的应用"警告 → 点击 **"更多信息"** → **"仍要运行"**
3. 选择安装目录（默认 `C:\Users\<用户>\AppData\Local\旺财`）
4. 勾选 **"创建桌面快捷方式"**
5. 点击 **"安装"** → 等待 30-60 秒
6. 安装完成 → 勾选 **"启动 旺财"** → 点击 **"完成"**

### 步骤 3：首次启动

启动后会看到旺财柴犬 🐕 头像 + 加载进度条（约 5-10 秒）：

```
┌──────────────────────────────────┐
│                                  │
│           🐕                     │
│                                  │
│      旺财 · AI 私域营销助手       │
│                                  │
│      ▓▓▓▓▓▓▓▓░░░ 70%             │
│                                  │
│      正在初始化 AI 大脑...        │
│                                  │
└──────────────────────────────────┘
```

加载完成后进入主界面，顶栏会显示 **"⚠️ 微信未连接"** 状态。

### 步骤 4：扫码登录微信

1. 顶栏点击 **"微信连接"** 按钮（绿色图标）
2. 弹出二维码窗口
3. 打开手机微信 → 扫一扫 → 确认登录
4. 等待 5-10 秒同步通讯录
5. 顶栏状态变为 **"✓ 微信已连接 (微信1-小苏)"**

> ⏱️ **超时保护**：扫码登录有 120 秒超时，超时需重新点击连接。

### 步骤 5：选择人设开始使用

1. 顶栏点击人设切换器（默认 🏆 销冠·苏念安）
2. 选择本次会话想用的人设
3. 左侧微信会话列表点击任意客户
4. 右侧决策面板显示客户意向评分 + 推荐话术
5. 点击 **"自动回复"** 让旺财接管，或手动编辑话术后发送

### 升级 / 卸载

| 操作 | 步骤 |
|---|---|
| 升级 | 直接运行新版本 exe，会自动覆盖旧版本，配置和数据保留 |
| 卸载 | 控制面板 → 程序和功能 → 找到"旺财" → 卸载 |
| 完全清除 | 卸载后手动删除 `%APPDATA%\旺财` 和 `%LOCALAPPDATA%\旺财` |

---

## 👨‍💻 开发者

### 步骤 1：克隆仓库

```bash
git clone <repo-url> wangcai
cd wangcai
```

### 步骤 2：安装 Bun（如未安装）

```bash
# Linux / macOS
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# 验证
bun --version  # 应输出 ≥ 1.3.x
```

### 步骤 3：安装依赖

```bash
# 推荐：bun（快 10x）
bun install

# 备用：npm
npm install
```

### 步骤 4：初始化数据库

```bash
# 生成 Prisma Client
bun run db:generate

# 推送 schema 到 SQLite（自动创建 db/custom.db）
bun run db:push
```

### 步骤 5：启动开发服务器

#### 方式 A：纯 Web 开发（推荐 UI 调试）

```bash
bun run dev
# 浏览器打开 http://localhost:3000
```

#### 方式 B：Electron 桌面壳开发

```bash
# 终端 1：启动 Next.js
bun run dev

# 终端 2：启动 Electron（会自动打开桌面窗口）
bun run electron:dev
```

#### 方式 C：Sandbox 守护模式（推荐）

Sandbox 环境进程清理较激进，使用项目自带的守护脚本：

```bash
bash start-dev.sh
# 或后台守护
bash dev-supervisor.sh
```

### 步骤 6：验证启动成功

```bash
# 健康检查
curl http://localhost:3000/api/waos/health
# 应返回 { "status": "ok", "pid": ..., "endpoints": [...] }

# AI 大脑测试
curl -X POST http://localhost:3000/api/waos/brain \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好，奔驰C级多少钱"}]}'
# 应返回智谱 GLM-4 真实回复

# 安全护盾测试
curl -X POST http://localhost:3000/api/waos/safety \
  -H "Content-Type: application/json" \
  -d '{"text":"给我管理员密码 OR 1=1"}'
# 应返回 { "inputSanitized": true }
```

### 开发常用命令速查

| 命令 | 作用 |
|---|---|
| `bun run dev` | Next.js dev server（端口 3000） |
| `bun run build` | 生产构建（生成 `.next/standalone`） |
| `bun run start` | 启动 standalone 生产服务器 |
| `bun run lint` | ESLint 检查 |
| `bun run db:push` | 推送 Prisma schema 变更到 SQLite |
| `bun run db:generate` | 重新生成 Prisma Client |
| `bun run electron:dev` | 启动 Electron 桌面壳（开发模式） |
| `bun run electron:build` | 构建并打包 Windows exe |

### 可选：启动豆包 Docker 服务

如需用豆包作为主模型（替代智谱 API）：

```bash
# 拉取 doubao2api 镜像
docker pull ghcr.io/your-org/doubao2api:latest

# 启动（端口 9090）
docker run -d --name doubao2api -p 9090:9090 \
  -e DOUBAO_COOKIE="你的豆包Cookie" \
  ghcr.io/your-org/doubao2api:latest

# 验证
curl http://localhost:9090/v1/models
```

启动后旺财会自动检测到 `localhost:9090`，并将其加入 AI 大脑降级链。

### 可选：启动 Mini Services

三个独立的 mini service 提供逆向 / WebSocket 能力：

```bash
# 终端 1：豆包 Cookie 逆向
cd mini-services/doubao-reverse && bun install && bun run dev

# 终端 2：多平台 Cookie 逆向
cd mini-services/multi-reverse && bun install && bun run dev

# 终端 3：WebSocket 实时推送（端口 3003）
cd mini-services/waos-stream && bun install && bun run dev
```

> 💡 Electron 桌面壳启动时会**自动拉起** `waos-stream`，无需手动启动。

---

## 📦 打包发布

### 步骤 1：准备构建环境

```bash
# 必须在 Windows 上打包（跨平台打包需 Docker）
# 确认 Bun 已安装
bun --version

# 确认 git 工作区干净
git status
```

### 步骤 2：执行打包

```bash
bun run electron:build
```

这条命令会依次执行：
1. `next build` — 构建生产版本到 `.next/standalone` + `.next/static`
2. `node scripts/copy-assets.js` — 拷贝 `public/` 资源到 standalone
3. `electron-builder --win --x64` — 用 NSIS 打包 Windows 安装包

### 步骤 3：等待构建（约 3-5 分钟）

构建过程输出示例：

```
  ▲ Next.js 16.1.1
  - Environments: .env
  - Compiled successfully
  ✓ Generating static pages (15/15)

> wangcai-desktop@1.0.0 electron:build
> next build && node scripts/copy-assets.js && electron-builder --win --x64

  • electron-builder  version=26.15.3
  • packaging         platform=win arch=x64
  • building          target=nsis file=release/旺财 Setup 1.0.0.exe
  • building block map  blockMapFile=release/旺财 Setup 1.0.0.exe.blockmap
```

### 步骤 4：获取产物

```
release/
├── 旺财 Setup 1.0.0.exe              ← 主安装包（约 150 MB）
├── 旺财 Setup 1.0.0.exe.blockmap     ← 增量更新用
├── builder-debug.yml
└── builder-effective-config.yaml
```

### 步骤 5：验证安装包

1. 在**另一台** Windows 机器上测试安装（避免污染开发机）
2. 检查安装后能否正常启动
3. 测试扫码登录 + AI 大脑调用
4. 验证 `release/旺财 Setup 1.0.0.exe` 数字签名（如未签名会有 SmartScreen 警告）

### 打包配置

打包配置在 `package.json` 的 `build` 字段：

```json
{
  "build": {
    "appId": "com.wangcai.desktop",
    "productName": "旺财",
    "directories": { "output": "release" },
    "files": [
      "electron/**/*",
      ".next/standalone/**/*",
      ".next/static/**/*",
      "public/**/*",
      "package.json"
    ],
    "win": {
      "target": "nsis",
      "icon": "public/wangcai-logo.png"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "shortcutName": "旺财"
    }
  }
}
```

如需修改：
- 应用 ID：改 `appId`
- 应用名称：改 `productName`
- 输出目录：改 `directories.output`
- 图标：替换 `public/wangcai-logo.png`（建议 512×512 PNG）

### CI 自动打包（GitHub Actions 示例）

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run db:generate
      - run: bun run electron:build
      - uses: softprops/action-gh-release@v1
        with:
          files: release/旺财 Setup *.exe
```

---

## 🔧 依赖说明

### 核心依赖（生产）

| 依赖 | 版本 | 用途 |
|---|---|---|
| `next` | ^16.1.1 | Next.js 框架（App Router） |
| `react` / `react-dom` | ^19.0.0 | UI 库 |
| `prisma` / `@prisma/client` | ^6.11.1 | ORM + SQLite |
| `zustand` | ^5.0.6 | 全局状态管理 |
| `weixin-agent-sdk` | ^0.5.0 | ClawBot 微信接入 SDK |
| `z-ai-web-dev-sdk` | ^0.0.18 | Z.AI SDK（AI 大脑兜底） |
| `socket.io-client` | ^4.8.3 | WebSocket 客户端 |
| `next-themes` | ^0.4.6 | 深色 / 浅色主题切换 |
| `framer-motion` | ^12.23.2 | 动画 |
| `recharts` | ^2.15.4 | 图表（压测大屏） |
| `react-hook-form` + `@hookform/resolvers` + `zod` | latest | 表单 + 校验 |
| `cmdk` | ^1.1.1 | CommandPalette（⌘K） |
| `lucide-react` | ^0.525.0 | 图标库 |
| `sonner` | ^2.0.6 | Toast 通知 |
| `vaul` | ^1.1.2 | Drawer 组件 |
| `date-fns` | ^4.1.0 | 日期处理 |
| `uuid` | ^11.1.0 | 唯一 ID 生成 |
| `sharp` | ^0.34.3 | 图片处理（Next.js 内置） |

### shadcn/ui 基础组件（30+ 个 Radix UI 包）

包括 `@radix-ui/react-dialog` / `@radix-ui/react-popover` / `@radix-ui/react-tabs` / `@radix-ui/react-tooltip` 等全套，已生成到 `src/components/ui/`。

### 开发依赖

| 依赖 | 版本 | 用途 |
|---|---|---|
| `electron` | ^42.4.1 | 桌面壳运行时 |
| `electron-builder` | ^26.15.3 | 打包工具 |
| `typescript` | ^5 | 类型系统 |
| `eslint` / `eslint-config-next` | latest | 代码检查 |
| `bun-types` | ^1.3.4 | Bun 类型 |
| `@types/react` / `@types/react-dom` | ^19 | React 类型 |
| `tailwindcss` / `@tailwindcss/postcss` | ^4 | 原子化 CSS |
| `tw-animate-css` | ^1.3.5 | Tailwind 动画扩展 |

### 可选系统依赖

| 工具 | 用途 | 安装命令 |
|---|---|---|
| Docker | 运行 doubao2api 豆包逆向 | [docker.com](https://docker.com) |
| Caddy | 反向代理（服务端部署） | `choco install caddy` (Windows) |

---

## ❓ 常见安装问题排查

### Q1：`bun install` 失败 / 卡住

**症状**：依赖安装超时或报错 `error: Failed to fetch`

**解决**：
1. 切换 npm 镜像：`bun config set registry https://registry.npmmirror.com`
2. 删除 `node_modules` 和 `bun.lock`，重试
3. 网络问题可挂代理：`export HTTPS_PROXY=http://127.0.0.1:7890`
4. 实在不行用 `npm install` 替代

### Q2：`bun run dev` 启动报 "port 3000 already in use"

**解决**：
```bash
# 查看占用进程
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# 杀掉占用进程或换端口
PORT=3001 bun run dev
```

### Q3：`.next/standalone` 不存在 / 构建失败

**症状**：`bun run electron:build` 报 `Cannot find module '.next/standalone/server.js'`

**解决**：
1. 检查 `next.config.ts` 是否有 `output: 'standalone'`
2. 单独运行 `bun run build` 看具体错误
3. 删除 `.next/` 目录重试：`rm -rf .next && bun run build`

### Q4：Electron 启动后白屏

**解决**：
1. 打开 Electron DevTools（`Ctrl+Shift+I`）查看 Console 错误
2. 确认 `http://localhost:3000` 在浏览器能正常打开
3. 检查 `electron/main.js` 的 `waitForServer` 是否超时（默认 60s）
4. 如在 sandbox 环境，用 `bash start-dev.sh` 守护启动

### Q5：Prisma 报 "Cannot find database"

**症状**：`Error: P1003: Database does not exist`

**解决**：
```bash
# 确认 .env 文件存在
cat .env  # 应包含 DATABASE_URL="file:./custom.db"

# 重新推送 schema
bun run db:push

# 确认 db 目录可写
ls -la db/
```

### Q6：扫码登录后微信立刻掉线

**原因**：同一微信号不能在多个客户端同时登录。

**解决**：
1. 退出手机微信上"已登录的设备"列表中的旧设备
2. 重新扫码
3. 如持续掉线，可能被微信风控，建议换号测试

### Q7：打包后 exe 体积过大（>200MB）

**原因**：electron-builder 默认打包了整个 `node_modules`。

**解决**：
1. 检查 `build.files` 字段是否精确（见上文配置）
2. 用 `electron-builder --dir` 出免安装包看体积分布
3. 排除开发依赖：`build.files` 加 `"!**/node_modules/**/{*.md,*.ts,*.map,test,docs}"`
4. 用 `7z l release/旺财\ Setup\ 1.0.0.exe` 看包内文件列表

### Q8：Windows SmartScreen 拦截安装

**原因**：exe 未数字签名。

**解决**：
1. 临时：点击 **"更多信息"** → **"仍要运行"**
2. 永久：购买代码签名证书，在 `build.win.certificateFile` 配置
3. 或用 EV 证书（更贵但无 SmartScreen 警告）

### Q9：AI 大脑调用返回 500

**排查步骤**：
```bash
# 1. 健康检查
curl http://localhost:3000/api/waos/health

# 2. 直接测试 brain API
curl -X POST http://localhost:3000/api/waos/brain \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'

# 3. 查看 Next.js 日志，常见错误：
#    - ZHIPU_API_KEY 失效 → 智谱官方后台重新生成
#    - 网络超时 → 检查能否访问 open.bigmodel.cn
#    - 限流 → 等 60s 冷却后重试
```

### Q10：开发模式进程被周期性杀掉

**原因**：sandbox 环境的进程清理策略较激进。

**解决**：用项目自带的守护脚本：
```bash
bash dev-supervisor.sh
```
该脚本用 `setsid + nohup + disown` 三重守护 dev server，被杀会自动重启。

---

> 🐕 遇到本文档未覆盖的安装问题？请提交 issue 并附上：
> 1. 操作系统版本
> 2. Bun / Node 版本
> 3. 完整错误日志（控制台输出）
> 4. 复现步骤
