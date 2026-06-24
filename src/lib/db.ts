import { PrismaClient, Prisma } from '@prisma/client'
import { encrypt, decrypt, isEncrypted, MESSAGE_ENCRYPT_FIELDS, LEAD_ENCRYPT_FIELDS, COMMENT_ENCRYPT_FIELDS } from '@/lib/crypto'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ─── PII 自动加密/解密中间件 ─────────────────────────────────────────────
// 对齐 6.22审计优化 Sprint 1: 业务代码无感知，读自动解密，写自动加密
// 加密字段配置在 crypto.ts 的 MESSAGE_ENCRYPT_FIELDS / LEAD_ENCRYPT_FIELDS / COMMENT_ENCRYPT_FIELDS

// Model → 需加密字段映射
const ENCRYPT_MAP: Record<string, readonly string[]> = {
  Message: MESSAGE_ENCRYPT_FIELDS,
  Lead: LEAD_ENCRYPT_FIELDS,
  Comment: COMMENT_ENCRYPT_FIELDS,
}

function encryptRecord(model: string, data: Record<string, unknown>): Record<string, unknown> {
  const fields = ENCRYPT_MAP[model]
  if (!fields || !data) return data
  const result = { ...data }
  for (const field of fields) {
    const val = result[field]
    if (typeof val === 'string' && val && !isEncrypted(val)) {
      result[field] = encrypt(val)
    }
  }
  return result
}

function decryptRecord(model: string, data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return data
  const fields = ENCRYPT_MAP[model]
  if (!fields) return data
  const result = { ...data }
  for (const field of fields) {
    const val = result[field]
    if (typeof val === 'string' && isEncrypted(val)) {
      result[field] = decrypt(val)
    }
  }
  return result
}

if (!globalForPrisma.prisma) {
  const prismaClient = new PrismaClient({
    log: ['error', 'warn'],
  })

  // 加密中间件：用 $extends query 扩展（Prisma 6.x 推荐方式，$use 已废弃）
  // 对齐 6.22审计优化 Sprint 1: 业务代码无感知，读自动解密，写自动加密
  const encryptedClient = prismaClient.$extends({
    query: {
      message: {
        async create({ args, query }) {
          if (args.data && typeof args.data === 'object') {
            args.data = encryptRecord('Message', args.data as Record<string, unknown>) as any
          }
          return query(args)
        },
        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d) => encryptRecord('Message', d as Record<string, unknown>) as any)
          }
          return query(args)
        },
        async update({ args, query }) {
          if (args.data && typeof args.data === 'object') {
            args.data = encryptRecord('Message', args.data as Record<string, unknown>) as any
          }
          return query(args)
        },
        async upsert({ args, query }) {
          if (args.create && typeof args.create === 'object') {
            args.create = encryptRecord('Message', args.create as Record<string, unknown>) as any
          }
          if (args.update && typeof args.update === 'object') {
            args.update = encryptRecord('Message', args.update as Record<string, unknown>) as any
          }
          return query(args)
        },
        async findUnique({ args, query }) {
          const result = await query(args)
          return decryptRecord('Message', result as Record<string, unknown> | null) as any
        },
        async findFirst({ args, query }) {
          const result = await query(args)
          return decryptRecord('Message', result as Record<string, unknown> | null) as any
        },
        async findMany({ args, query }) {
          const results = await query(args)
          return Array.isArray(results) ? results.map((r) => decryptRecord('Message', r as Record<string, unknown>)) : results
        },
      },
      lead: {
        async create({ args, query }) {
          if (args.data && typeof args.data === 'object') {
            args.data = encryptRecord('Lead', args.data as Record<string, unknown>) as any
          }
          return query(args)
        },
        async update({ args, query }) {
          if (args.data && typeof args.data === 'object') {
            args.data = encryptRecord('Lead', args.data as Record<string, unknown>) as any
          }
          return query(args)
        },
        async findUnique({ args, query }) {
          const result = await query(args)
          return decryptRecord('Lead', result as Record<string, unknown> | null) as any
        },
        async findFirst({ args, query }) {
          const result = await query(args)
          return decryptRecord('Lead', result as Record<string, unknown> | null) as any
        },
        async findMany({ args, query }) {
          const results = await query(args)
          return Array.isArray(results) ? results.map((r) => decryptRecord('Lead', r as Record<string, unknown>)) : results
        },
      },
      comment: {
        async create({ args, query }) {
          if (args.data && typeof args.data === 'object') {
            args.data = encryptRecord('Comment', args.data as Record<string, unknown>) as any
          }
          return query(args)
        },
        async update({ args, query }) {
          if (args.data && typeof args.data === 'object') {
            args.data = encryptRecord('Comment', args.data as Record<string, unknown>) as any
          }
          return query(args)
        },
        async findUnique({ args, query }) {
          const result = await query(args)
          return decryptRecord('Comment', result as Record<string, unknown> | null) as any
        },
        async findFirst({ args, query }) {
          const result = await query(args)
          return decryptRecord('Comment', result as Record<string, unknown> | null) as any
        },
        async findMany({ args, query }) {
          const results = await query(args)
          return Array.isArray(results) ? results.map((r) => decryptRecord('Comment', r as Record<string, unknown>)) : results
        },
      },
    },
  })

  globalForPrisma.prisma = encryptedClient as unknown as PrismaClient

  // P0 FIX: prisma generate 已修复，所有模型走 Prisma 原生 delegate
  // 删除了 prisma-compat.js 和 createRawDelegate 中的 SQL 字符串拼接（SQL 注入风险）

  // AUDIT-SEC-REL: 启用 SQLite WAL 模式
  // BUG FIX: 原代码此处在 if (!globalForPrisma.prisma) 判断里，
  //   但 prisma 已在上面的代码中赋值，导致 PRAGMA 永远不会执行。
  //   现已移入同一代码块内，在 prisma 赋值后立即执行。
  prismaClient.$executeRawUnsafe('PRAGMA journal_mode = WAL;')
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
  prismaClient.$executeRawUnsafe('PRAGMA synchronous = NORMAL;').catch(() => {})
  // 单连接使用 5 秒忙等待，避免并发场景立即报 locked
  prismaClient.$executeRawUnsafe('PRAGMA busy_timeout = 5000;').catch(() => {})
  // 外键约束默认在 SQLite 中关闭，开启以保证 Lead/Message 等关系完整性
  prismaClient.$executeRawUnsafe('PRAGMA foreign_keys = ON;').catch(() => {})
}

export const db = globalForPrisma.prisma!

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db