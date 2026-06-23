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
}

export const db = globalForPrisma.prisma!

// ─── WAOS 新模型兼容层（表已在 SQLite 但 Prisma Client 未重新生成）─────
// 原因: prisma generate 被 Hermes 进程锁住 DLL 无法执行
// 方案: 用 Proxy 拦截新模型调用，转发到 $queryRawUnsafe
const NEW_MODELS = ['truthDocument', 'memoryLong', 'relationNode', 'relationEdge', 'ethicsRule', 'decisionLog', 'learningReview'] as const
type NewModel = typeof NEW_MODELS[number]

function createRawDelegate(modelName: string) {
  const tableName = modelName.charAt(0).toUpperCase() + modelName.slice(1)
  return {
    async findMany(args: any = {}) {
      const where = args.where ? `WHERE ${Object.entries(args.where).map(([k,v]) => `"${k}" = ${typeof v === 'string' ? `'${v.replace(/'/g,"''")}'` : v}`).join(' AND ')}` : ''
      const order = args.orderBy ? `ORDER BY "${Object.keys(args.orderBy)[0]}" ${Object.values(args.orderBy)[0]}` : ''
      const limit = args.take ? `LIMIT ${args.take}` : ''
      const offset = args.skip ? `OFFSET ${args.skip}` : ''
      return db.$queryRawUnsafe(`SELECT * FROM "${tableName}" ${where} ${order} ${limit} ${offset}`)
    },
    async findFirst(args: any = {}) {
      const rows = await this.findMany({ ...args, take: 1 })
      return rows[0] || null
    },
    async findUnique(args: any = {}) {
      return this.findFirst(args)
    },
    async create(args: any = {}) {
      const data = args.data || {}
      const keys = Object.keys(data)
      const vals = keys.map(k => typeof data[k] === 'string' ? `'${data[k].replace(/'/g,"''")}'` : data[k] ?? 'NULL')
      await db.$executeRawUnsafe(`INSERT INTO "${tableName}" (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${vals.join(',')})`)
      return data
    },
    async update(args: any = {}) {
      const where = args.where ? Object.entries(args.where).map(([k,v]) => `"${k}" = ${typeof v === 'string' ? `'${v}'` : v}`).join(' AND ') : ''
      const sets = args.data ? Object.entries(args.data).map(([k,v]) => `"${k}" = ${typeof v === 'string' ? `'${v.replace(/'/g,"''")}'` : v}`).join(', ') : ''
      await db.$executeRawUnsafe(`UPDATE "${tableName}" SET ${sets} WHERE ${where}`)
      return args.data
    },
    async delete(args: any = {}) {
      const where = args.where ? Object.entries(args.where).map(([k,v]) => `"${k}" = ${typeof v === 'string' ? `'${v}'` : v}`).join(' AND ') : ''
      await db.$executeRawUnsafe(`DELETE FROM "${tableName}" WHERE ${where}`)
      return { deleted: true }
    },
    async deleteMany(args: any = {}) {
      const where = args.where ? Object.entries(args.where).map(([k,v]) => `"${k}" = ${typeof v === 'string' ? `'${v}'` : v}`).join(' AND ') : ''
      await db.$executeRawUnsafe(`DELETE FROM "${tableName}" WHERE ${where}`)
      return { count: 1 }
    },
    async count(args: any = {}) {
      const where = args.where ? `WHERE ${Object.entries(args.where).map(([k,v]) => `"${k}" = ${typeof v === 'string' ? `'${v}'` : v}`).join(' AND ')}` : ''
      const rows = await db.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "${tableName}" ${where}`)
      return (rows as any)[0]?.c || 0
    },
  }
}

// 为新模型注入 delegate（运行时动态添加）
for (const model of NEW_MODELS) {
  if (!(model in db)) {
    (db as any)[model] = createRawDelegate(model)
  }
}

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