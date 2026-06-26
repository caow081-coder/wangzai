# 旺财 WAOS — AI 私域营销助手桌面客户端

> 肉肉（奔驰商务车新媒体运营数字分身）的桌面端载体。基于 Electron + Next.js 16 构建的独立桌面应用，内置 27 个 API 端点，覆盖智能回复、知识库、SOP 流程、多平台接入等完整营销工作流。

## 技术栈

| 层 | 技术 |
|---|------|
| 桌面壳 | Electron 42.5 |
| 前端框架 | Next.js 16 (App Router) + React 19 |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 数据库 | SQLite (Prisma 6 ORM) + PII 自动加密 |
| 实时通信 | Socket.IO (内嵌 WebSocket 服务) |
| AI 大脑 | 多 LLM Provider 路由 (z-ai-web-dev-sdk) |
| 打包 | electron-builder (NSIS / AppImage) |

## 系统要求

| 平台 | 最低要求 |
|------|---------|
| **Windows** | Windows 10 64-bit, Node.js 20+ |
| **macOS** | macOS 12+ (Intel / Apple Silicon) |
| **Linux** | Ubuntu 20.04+ / Fedora 36+ |

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/caow081-coder/wangzai.git
cd wangzai
```

### 2. 安装依赖

```bash
npm install
```

> 首次安装会自动执行 `prisma generate` 生成数据库客户端。

### 3. 初始化数据库

```bash
npx prisma db push
```

> 如果 `db/custom.db` 已存在（仓库自带），此步可跳过。

### 4. 开发模式运行

```bash
npm run dev
```

浏览器访问 `http://localhost:3000` 即可看到完整界面。

### 5. Electron 桌面模式开发

```bash
npm run electron:dev
```

> 会启动 Next.js 开发服务器，然后打开 Electron 窗口加载页面。

## 打包发布

### Windows (.exe 安装包)

```bash
npm run electron:build
```

这条命令会依次执行：
1. `next build` — Next.js 生产构建
2. `node scripts/copy-assets.js` — 复制静态资源、数据库、Electron 源码到 standalone
3. `electron-builder --win --x64` — 打包为 NSIS 安装程序

产物位于 `release/旺财 Setup 1.0.0.exe`

### macOS (.dmg)

```bash
npx electron-builder --mac
```

### Linux (.AppImage)

```bash
npx electron-builder --linux AppImage --x64
```

产物位于 `release/旺财-1.0.0.AppImage`

## 项目结构

```
wangzai/
├── electron/                  # Electron 主进程
│   ├── main.js                #   入口：启动 Next.js + 创建窗口 + 自动更新
│   ├── preload.js             #   渲染进程桥接 (waosDesktop / waosUpdater API)
│   ├── stream-service.js      #   内嵌 WebSocket 实时事件流 (port 3003)
│   ├── sandbox.js             #   沙箱隔离脚本
│   ├── ui-actuation.js        #   UI 自动化操作
│   ├── standalone-backup.js   #   独立备份工具
│   ├── preloads/              #   平台注入脚本
│   │   ├── wechat-preload.js  #     微信
│   │   ├── douyin-preload.js  #     抖音
│   │   └── video-preload.js   #     视频号
│   └── build/                 #   打包资源 (图标)
│       ├── icon.ico
│       ├── icon.png
│       └── icon.svg
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── page.tsx           #   主界面
│   │   ├── layout.tsx         #   根布局
│   │   └── api/waos/          #   27 个 API 端点
│   │       ├── health/        #     健康检查
│   │       ├── reply/         #     AI 回复工作室
│   │       ├── llm/           #     LLM 多模型调用
│   │       ├── brain/         #     AI 大脑 (提取/代理/验证)
│   │       ├── knowledge/     #     知识库 RAG
│   │       ├── leads/         #     CRM 线索管理
│   │       ├── auto-reply/    #     自动回复
│   │       ├── safety/        #     安全护盾 (防注入/违禁词)
│   │       ├── sop/           #     SOP 流程引擎
│   │       ├── moments/       #     朋友圈管理
│   │       ├── wechat/        #     微信接入
│   │       ├── douyin/        #     抖音接入
│   │       ├── wechat-video/  #     视频号接入
│   │       ├── backup/        #     数据备份
│   │       ├── tts/           #     语音合成
│   │       ├── asr/           #     语音识别
│   │       ├── vlm/           #     图片理解
│   │       ├── metrics/       #     运营指标
│   │       ├── engines/       #     引擎管理
│   │       ├── errors/        #     错误追踪
│   │       ├── monitoring/    #   系统监控
│   │       ├── reverse/       #     逆向服务
│   │       └── ...
│   ├── components/
│   │   ├── ui/                #   shadcn/ui 基础组件 (40+)
│   │   └── waos/              #   业务组件 (30+)
│   ├── lib/
│   │   ├── db.ts              #   Prisma + PII 加密中间件
│   │   ├── backup.ts          #   数据备份/恢复
│   │   ├── safety.ts          #   安全检测引擎
│   │   ├── crypto.ts          #   AES-256-GCM 加密
│   │   ├── identity/kernel.ts #   身份漂移 + 快速规则引擎
│   │   ├── rag/knowledge.ts   #   RAG 知识检索
│   │   ├── sop/               #   SOP 流程 (类型/注册/运行时/模板)
│   │   ├── monitoring/        #   监控 (错误追踪/指标/日志)
│   │   ├── wechat/bridge.ts   #   微信 SDK 桥接 (weixin-agent-sdk)
│   │   ├── douyin/connector.ts
│   │   ├── moments/connector.ts
│   │   └── ...
│   ├── hooks/                 #   React Hooks
│   └── store/                 #   Zustand 状态管理
├── prisma/
│   └── schema.prisma          #   数据模型 (Message/Lead/Comment/Persona 等)
├── db/
│   └── custom.db              #   SQLite 数据库文件
├── scripts/
│   ├── copy-assets.js         #   构建后资源复制 (standalone 打包必需)
│   └── stress-prod.py         #   生产模式压力测试脚本
├── public/                    #   静态资源
└── package.json               #   项目配置 + electron-builder 配置
```

## API 端点一览

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/waos/health` | 系统健康状态 + 端点列表 |
| GET/POST | `/api/waos/reply` | AI 回复工作室 |
| GET/POST | `/api/waos/llm` | LLM 多模型调用 |
| GET/POST | `/api/waos/safety` | 安全护盾 (防注入/违禁词/价格承诺) |
| GET/POST | `/api/waos/auto-reply` | 自动回复执行 |
| GET | `/api/waos/leads` | CRM 线索列表 |
| GET | `/api/waos/metrics` | 运营指标 |
| GET/POST | `/api/waos/knowledge` | 知识库 RAG 检索 |
| GET/POST | `/api/waos/sop` | SOP 流程引擎 |
| GET | `/api/waos/moments` | 朋友圈内容管理 |
| GET/POST | `/api/waos/wechat` | 微信接入状态 |
| GET/POST | `/api/waos/douyin` | 抖音评论/数据 |
| GET/POST | `/api/waos/wechat-video` | 视频号管理 |
| POST | `/api/waos/backup` | 数据备份创建/恢复 |
| GET/POST | `/api/waos/tts` | 语音合成 |
| GET/POST | `/api/waos/asr` | 语音识别 |
| GET/POST | `/api/waos/vlm` | 图片理解 |
| GET | `/api/waos/engines` | 引擎配置 |
| GET | `/api/waos/errors` | 错误追踪 |
| GET | `/api/waos/monitoring` | 系统监控 |
| GET/POST | `/api/waos/reverse` | 逆向服务 |
| GET | `/api/waos/metrics-monitoring` | 实时监控面板 |
| GET/POST | `/api/waos/migrate-encrypt` | 数据加密迁移 |
| GET/POST | `/api/waos/brain` | AI 大脑 |
| POST | `/api/waos/brain/extract` | 信息提取 |
| POST | `/api/waos/brain/verify` | Token 验证 |
| POST | `/api/waos/brain/proxy/*` | LLM 代理 |

## 核心功能

### 智能回复 (Reply Studio)
- 基于身份漂移模型的多轮对话，自动感知客户信任度/意图/情绪
- 支持多人格混合 (Persona Blend)，按场景动态调整话术风格
- 快速规则引擎 + AI 大脑双层架构

### 安全护盾 (Safety Shield)
- 4 层防御：Prompt 注入检测 → 违禁词拦截 → 价格承诺检测 → Unicode 规范化反绕过
- 中英文双语规则库

### 知识库 (RAG)
- 本地向量检索，支持产品参数、话术模板、FAQ
- 知识老化机制，自动降低过期内容权重

### SOP 流程引擎
- 可视化流程设计器
- 内置销售 SOP 模板
- 运行时状态机 + 执行日志

### 数据安全
- PII 字段 AES-256-GCM 自动加密 (姓名/手机/微信ID)
- 读写无感：业务代码零改动
- SQLite WAL 模式 + 5 秒忙等待，保证并发安全

### 自动更新
- 基于 GitHub Releases 的 electron-updater
- 下载进度条 + 退出时自动安装

## 构建流程说明

```
next build                    # 1. Next.js 生产构建 (output: standalone)
    ↓
copy-assets.js                # 2. 复制资源到 .next/standalone/
    ├── .next/static → standalone/.next/static
    ├── public → standalone/public
    ├── prisma → standalone/prisma
    ├── db → standalone/db
    ├── electron → standalone/electron
    └── npm install socket.io electron-updater ...  # 补充 Electron 运行时依赖
    ↓
electron-builder              # 3. 打包为平台安装包
    ├── files: electron/**, .next/standalone/**, .next/static/**, public/**, prisma/**, db/**
    ├── extraResources: db/, prisma/ (放在 asar 外部，运行时可写)
    └── asarUnpack: sharp, @prisma/client (原生模块不打包进 asar)
```

## 常见问题

**Q: Windows 打包报错 `wine not found`？**
A: Windows 打包需要在 Windows 系统上执行 `npm run electron:build`，Linux/macOS 无法交叉编译 .exe。

**Q: 启动后白屏？**
A: 等待 5-10 秒，Next.js standalone 服务器需要启动时间。检查日志确认端口 3000 是否被占用。

**Q: 微信接入报错？**
A: `weixin-agent-sdk` 需要在有微信客户端的环境中使用。开发/测试时该模块以 stub 模式运行，不会影响其他功能。

**Q: 如何修改数据库？**
A: 编辑 `prisma/schema.prisma`，然后运行 `npx prisma db push`。

## License

Private — All rights reserved.