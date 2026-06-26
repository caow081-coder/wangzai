/**
 * copy-assets.js — 旺财（WAOS）打包资源复制脚本
 *
 * 在 `next build` 完成后运行（npm script: postbuild），将运行时所需的所有
 * 静态资源、配置、数据库文件、Electron 主进程源码等汇拢到 `.next/standalone/`
 * 目录下，使 electron-builder 只需打包 `.next/standalone/` 即可得到完整可
 * 运行的应用。
 *
 * 复制清单：
 *   1. .next/static            → .next/standalone/.next/static   （Next.js 静态资源：JS/CSS/字体）
 *   2. public                  → .next/standalone/public         （公开静态资源：logo / 图片）
 *   3. prisma                  → .next/standalone/prisma         （Prisma schema 文件，运行时迁移用）
 *   4. db                      → .next/standalone/db             （SQLite 数据库文件，运行时读写）
 *   5. electron                → .next/standalone/electron       （Electron 主进程：main.js / preload / sandbox / stream-service）
 *   6. electron主进程运行时依赖  → .next/standalone/node_modules   （socket.io / electron-updater / weixin-agent-sdk 等不在standalone自动追踪中的包）
 *
 * 设计要点：
 *   - 全程使用 path.join，跨平台兼容（Windows / Linux / macOS）
 *   - 源目录不存在时打印警告并跳过，不抛异常（允许部分资源可选）
 *   - `.next/standalone` 不存在直接报错退出（说明 next build 未启用 standalone）
 *   - 复制 electron 目录时排除 `build/` 子目录（打包产物，不应进入 standalone）
 *   - 中文注释 + 进度日志，方便排查
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── 通用目录递归复制 ───────────────────────────────────────
/**
 * 递归复制目录（含子目录与文件）
 * @param {string} src 源目录绝对路径
 * @param {string} dest 目标目录绝对路径
 * @param {string[]} [exclude=[]] 需要跳过的子目录或文件名（仅按名称匹配，不递归判断）
 */
function copyDir(src, dest, exclude = []) {
  if (!fs.existsSync(src)) {
    console.warn(`  [skip] 源目录不存在: ${src}`);
    return false;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, exclude);
    } else {
      fs.copyFileSync(s, d);
    }
  }
  return true;
}

// ─── 单个文件复制（带父目录创建）────────────────────────────
function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  [skip] 源文件不存在: ${src}`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

// ─── 主流程 ─────────────────────────────────────────────────
function main() {
  const root = process.cwd();
  const standaloneDir = path.join(root, '.next', 'standalone');

  console.log('────────────────────────────────────────────────');
  console.log(' 旺财打包资源复制 (copy-assets.js)');
  console.log(' 项目根目录:', root);
  console.log(' 目标 standalone:', standaloneDir);
  console.log('────────────────────────────────────────────────');

  // 前置检查：standalone 目录必须存在
  if (!fs.existsSync(standaloneDir)) {
    console.error('\n[ERROR] .next/standalone 目录不存在！');
    console.error('请先运行 `next build`（需在 next.config 中启用 output: "standalone"）。');
    process.exit(1);
  }

  // 任务清单：[名称, 源, 目标, 排除项]
  const tasks = [
    {
      name: 'Next.js 静态资源 (.next/static)',
      src: path.join(root, '.next', 'static'),
      dest: path.join(standaloneDir, '.next', 'static'),
      exclude: [],
    },
    {
      name: '公开资源 (public)',
      src: path.join(root, 'public'),
      dest: path.join(standaloneDir, 'public'),
      exclude: [],
    },
    {
      name: 'Prisma schema (prisma)',
      src: path.join(root, 'prisma'),
      dest: path.join(standaloneDir, 'prisma'),
      // 跳过 migrations 历史与生成缓存，运行时不需要
      exclude: ['migrations', 'migration_lock.toml'],
    },
    {
      name: 'SQLite 数据库 (db)',
      src: path.join(root, 'db'),
      dest: path.join(standaloneDir, 'db'),
      exclude: [],
    },
    {
      name: 'Electron 主进程 (electron)',
      src: path.join(root, 'electron'),
      dest: path.join(standaloneDir, 'electron'),
      // build/ 是 electron-builder 临时目录，preloads/ 已在 files 配置中
      // 这里不排除 preloads，让 preload 脚本也进入 standalone（main.js 通过相对路径引用）
      exclude: ['build'],
    },
  ];

  let success = 0;
  let skipped = 0;

  for (const t of tasks) {
    console.log(`\n[复制] ${t.name}`);
    console.log(`  ${t.src}  →  ${t.dest}`);
    const ok = copyDir(t.src, t.dest, t.exclude);
    if (ok) success++;
    else skipped++;
  }

  // ─── 安装 Electron 主进程运行时依赖 ────────────────────────
  // Next.js standalone 只追踪服务端 API route 实际 require 的包。
  // Electron 主进程 (main.js / stream-service.js) require 的包不在追踪范围内，
  // 需要手动补充到 standalone/node_modules。
  const electronDeps = [
    'socket.io',          // stream-service.js: WebSocket 实时事件流
    'socket.io-client',   // 前端 SDK
    'electron-updater',   // main.js: 自动更新
    'weixin-agent-sdk',   // bridge.ts: 动态 import 微信 SDK stub
    'uuid',               // 多处使用
  ];
  const existingModules = fs.existsSync(path.join(standaloneDir, 'node_modules'))
    ? fs.readdirSync(path.join(standaloneDir, 'node_modules'))
    : [];
  const missingDeps = electronDeps.filter(d => !existingModules.includes(d));

  if (missingDeps.length > 0) {
    console.log(`\n[安装] Electron 主进程运行时依赖: ${missingDeps.join(', ')}`);
    try {
      execSync(
        `npm install --production --no-save ${missingDeps.join(' ')}`,
        { cwd: standaloneDir, stdio: 'pipe', timeout: 120000 }
      );
      console.log('  ✅ 安装完成');
      success++;
    } catch (err) {
      console.error('  ❌ 安装失败:', err.message?.substring(0, 200));
      skipped++;
    }
  } else {
    console.log('\n[跳过] Electron 运行时依赖已完整');
  }

  // 兜底：确保 standalone 下的 package.json 存在（electron-builder 需要）
  const standalonePkg = path.join(standaloneDir, 'package.json');
  const rootPkg = path.join(root, 'package.json');
  if (!fs.existsSync(standalonePkg) && fs.existsSync(rootPkg)) {
    console.log('\n[复制] package.json → standalone/package.json');
    copyFile(rootPkg, standalonePkg);
    success++;
  }

  console.log('\n────────────────────────────────────────────────');
  console.log(` 资源复制完成！成功 ${success} 项，跳过 ${skipped} 项。`);
  console.log('────────────────────────────────────────────────\n');
}

// 入口：捕获未处理异常，避免静默失败
try {
  main();
} catch (err) {
  console.error('\n[FATAL] copy-assets.js 执行失败:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
