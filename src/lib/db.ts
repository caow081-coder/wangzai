import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

// AUDIT-SEC-REL: 启用 SQLite WAL 模式
// 默认 journal_mode=DELETE，写操作会阻塞读操作，并发场景下出现 "database is locked" 错误。
// WAL 模式允许读写并发，断电时通过 -wal 文件恢复，更可靠。
// 使用 $executeRawUnsafe 执行 PRAGMA 是 Prisma 官方推荐的 SQLite 配置方式。
// 注意：Prisma 不同版本对 PRAGMA 返回值类型不一致（number | string），统一用 String() 归一化。
if (!globalForPrisma.prisma) {
  db.$executeRawUnsafe('PRAGMA journal_mode = WAL;')
    .then((mode) => {
      const modeStr = String(mode).toLowerCase()
      if (modeStr !== 'wal') {
        console.warn(`[DB] PRAGMA journal_mode 设置失败，当前为: ${modeStr}`)
      } else {
        console.log('[DB] SQLite WAL 模式已启用（读写并发 + 断电恢复）')
      }
    })
    .catch((err) => {
      console.error('[DB] 启用 WAL 模式失败:', err.message)
    })

  // 同步关闭时确保所有写入落盘（NORMAL 模式足够，FULL 太慢）
  db.$executeRawUnsafe('PRAGMA synchronous = NORMAL;').catch(() => {})
  // 单连接使用 5 秒忙等待，避免并发场景立即报 locked
  db.$executeRawUnsafe('PRAGMA busy_timeout = 5000;').catch(() => {})
  // 外键约束默认在 SQLite 中关闭，开启以保证 Lead/Message 等关系完整性
  db.$executeRawUnsafe('PRAGMA foreign_keys = ON;').catch(() => {})
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db