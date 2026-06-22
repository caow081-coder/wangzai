# WAOS Desktop Client

WAOS 私域操作系统运营控制台 — 基于 Electron 的桌面客户端。

## 架构

```
┌─────────────────────────────────────────┐
│           Electron Main Process         │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐ │
│  │ waos-stream │  │   Next.js App    │ │
│  │  (port 3003)│  │   (port 3000)    │ │
│  │  WebSocket  │  │   React UI       │ │
│  └─────────────┘  └──────────────────┘ │
│         │                  │            │
│         └────────┬─────────┘            │
│                  │                      │
│         ┌────────▼─────────┐            │
│         │  BrowserWindow   │            │
│         │  (Chromium)      │            │
│         │  loads :3000     │            │
│         └──────────────────┘            │
└─────────────────────────────────────────┘
```

## 开发模式运行

```bash
# 1. 启动 WebSocket 服务
cd mini-services/waos-stream && bun run dev &

# 2. 启动 Next.js
cd /home/z/my-project && bun run dev &

# 3. 启动 Electron 桌面客户端
cd /home/z/my-project && bun run electron:dev
```

或一行命令：
```bash
cd /home/z/my-project && (cd mini-services/waos-stream && bun run dev &) && (bun run dev &) && sleep 5 && bun run electron:dev
```

## 打包生产版本

### 前置要求
- Node.js 18+
- bun (用于运行 waos-stream 服务)
- 平台原生依赖：
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools + .NET
  - **Linux**: `sudo apt install libgtk-3-dev libnotify-dev libnss3 libxss1 libxtst6 xauth`

### 打包命令

```bash
# 构建所有平台（当前操作系统）
cd /home/z/my-project
bun run electron:build

# 仅打包不制作安装程序（快速测试）
bun run electron:build:dir
```

产物在 `release/` 目录：
- **macOS**: `release/WAOS-3.0.0.dmg` + `WAOS-3.0.0-mac.zip`
- **Windows**: `release/WAOS Setup 3.0.0.exe` + `WAOS 3.0.0.exe`
- **Linux**: `release/WAOS-3.0.0.AppImage` + `WAOS-3.0.0.deb`

### 跨平台打包

如需打包其他平台（需要在对应 OS 上运行）：
```bash
# macOS 上打 Windows 包
bun run electron:build --win

# macOS 上打 Linux 包
bun run electron:build --linux
```

## 桌面客户端特性

- ✅ **原生窗口** — 1600x1000 默认尺寸，最小 1200x700
- ✅ **自动启动内置服务** — Next.js + WebSocket 一键启动
- ✅ **端口冲突检测** — 若 3000/3003 已占用则复用现有服务
- ✅ **macOS 原生标题栏** — `hiddenInset` 风格
- ✅ **自定义菜单** — 中文菜单（文件/编辑/视图/窗口）
- ✅ **外链系统浏览器打开** — 点击外部链接自动打开默认浏览器
- ✅ **应用图标** — emerald 渐变 radio wave 图标
- ✅ **开发工具** — 开发模式自动打开 DevTools

## 环境要求

- **运行时**: Electron 42.x（内置 Chromium）
- **bun**: 用于运行 waos-stream mini-service（必须安装）
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Node.js**: 18+（Electron 运行需要）

## 故障排查

### Q: 启动报 "bun not found"
A: waos-stream 需要 bun 运行。请安装: `curl -fsSL https://bun.sh/install | bash`

### Q: 端口 3000/3003 被占用
A: Electron 会自动检测并复用已运行的服务。如需启动新实例，先 `kill` 占用端口的进程。

### Q: 窗口空白
A: 等 Next.js 编译完成（首次启动约 5-10 秒）。查看终端日志确认 `Next.js ready!`。

### Q: Linux 下 dbus/gpu 错误
A: 沙箱环境限制，真实桌面环境不会出现。如需在无头环境测试，用 `xvfb-run`。

## 文件结构

```
electron/
├── main.js          # Electron 主进程
├── preload.js       # 预加载脚本（contextBridge）
└── build/
    ├── icon.png     # 应用图标 (512x512)
    └── icon.svg     # 图标源文件
```
