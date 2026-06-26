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
  // 所有PRAGMA用$queryRawUnsafe（返回结果集兼容SQLite），全部.catch吞掉错误
  // PRAGMA失败不影响应用功能，SQLite默认journal模式也可正常工作
  const pragmas = [
    'PRAGMA journal_mode = WAL;',
    'PRAGMA synchronous = NORMAL;',
    'PRAGMA busy_timeout = 5000;',
    'PRAGMA foreign_keys = ON;',
  ]
  for (const sql of pragmas) {
    prismaClient.$queryRawUnsafe(sql).catch(() => { /* PRAGMA失败不致命 */ })
  }
}

export const db = globalForPrisma.prisma!

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db