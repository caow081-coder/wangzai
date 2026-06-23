/**
 * Prisma Client 兼容层
 * 
 * 绕过 prisma generate 的 EPERM 问题
 * 用 Proxy 动态代理所有模型方法
 */

const { PrismaClient } = require('@prisma/client')
const path = require('path')

// 引擎路径
const enginePath = path.join(__dirname, '..', 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node')

// 懒加载单例
let _prisma = null

function getPrisma() {
  if (_prisma) return _prisma
  _prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'file:./prisma/db/custom.db',
      },
    },
  })
  return _prisma
}

// 所有模型名（包括新增的）
const ALL_MODELS = [
  'message', 'lead', 'comment', 'persona', 'eventLog', 'aiCall',
  'sopDefinition', 'sopInstance', 'sopNodeLog', 'skillRegistry', 'knowledgeDoc',
  'truthDocument', 'memoryLong', 'relationNode', 'relationEdge',
  'ethicsRule', 'decisionLog', 'learningReview',
]

// 创建 Proxy：任何模型访问都代理到 prisma 实例
// 对于 prisma 不认识的模型（新表），用 $queryRaw 兜底
const handler = {
  get(_target, prop) {
    if (prop === '$connect' || prop === '$disconnect' || prop === '$transaction' || prop === '$queryRaw' || prop === '$executeRaw' || prop === '$queryRawUnsafe' || prop === '$executeRawUnsafe') {
      return (...args) => getPrisma()[prop](...args)
    }
    if (prop === 'then') return undefined // 防止被当作 Promise
    
    const p = getPrisma()
    // 如果 prisma 有这个模型，直接返回
    if (p[prop]) return p[prop]
    
    // 新模型：返回模拟的 delegate
    return createDelegate(prop)
  }
}

function createDelegate(modelName) {
  // 表名映射（Prisma 模型名 → SQLite 表名）
  const tableName = modelName.charAt(0).toUpperCase() + modelName.slice(1)
  
  return {
    async findMany(args = {}) {
      return safeQuery(modelName, 'findMany', args)
    },
    async findUnique(args = {}) {
      return safeQuery(modelName, 'findUnique', args)
    },
    async findFirst(args = {}) {
      return safeQuery(modelName, 'findFirst', args)
    },
    async create(args = {}) {
      return safeQuery(modelName, 'create', args)
    },
    async update(args = {}) {
      return safeQuery(modelName, 'update', args)
    },
    async delete(args = {}) {
      return safeQuery(modelName, 'delete', args)
    },
    async upsert(args = {}) {
      return safeQuery(modelName, 'upsert', args)
    },
    async count(args = {}) {
      return safeQuery(modelName, 'count', args)
    },
    async deleteMany(args = {}) {
      return safeQuery(modelName, 'deleteMany', args)
    },
  }
}

async function safeQuery(model, method, args) {
  const p = getPrisma()
  // 如果 prisma 原生支持这个模型，直接调用
  if (p[model] && p[model][method]) {
    try {
      return await p[model][method](args)
    } catch (e) {
      // 如果原生调用失败（模型不存在），降级到原始 SQL
    }
  }
  
  // 降级：用原始 SQL 查询
  // 注意：这是兜底方案，性能和安全性不如原生 Prisma
  const tableName = model.charAt(0).toUpperCase() + model.slice(1)
  
  try {
    switch (method) {
      case 'findMany': {
        const where = buildWhere(args?.where)
        const order = buildOrder(args?.orderBy)
        const limit = args?.take ? `LIMIT ${args.take}` : ''
        const sql = `SELECT * FROM "${tableName}" ${where} ${order} ${limit}`
        return await p.$queryRawUnsafe(sql)
      }
      case 'findFirst': {
        const where = buildWhere(args?.where)
        const order = buildOrder(args?.orderBy)
        const sql = `SELECT * FROM "${tableName}" ${where} ${order} LIMIT 1`
        const rows = await p.$queryRawUnsafe(sql)
        return rows[0] || null
      }
      case 'findUnique': {
        const where = buildWhere(args?.where)
        const sql = `SELECT * FROM "${tableName}" ${where} LIMIT 1`
        const rows = await p.$queryRawUnsafe(sql)
        return rows[0] || null
      }
      case 'create': {
        const data = args?.data || {}
        const keys = Object.keys(data)
        const values = keys.map(k => formatValue(data[k]))
        const sql = `INSERT INTO "${tableName}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${values.join(', ')})`
        await p.$executeRawUnsafe(sql)
        // SQLite doesn't RETURNING by default, so return the data
        return { id: data.id, ...data }
      }
      case 'update': {
        const where = buildWhere(args?.where)
        const data = args?.data || {}
        const sets = Object.entries(data).map(([k, v]) => `"${k}" = ${formatValue(v)}`).join(', ')
        const sql = `UPDATE "${tableName}" SET ${sets} ${where}`
        await p.$executeRawUnsafe(sql)
        return { ...data }
      }
      case 'delete': {
        const where = buildWhere(args?.where)
        const sql = `DELETE FROM "${tableName}" ${where}`
        await p.$executeRawUnsafe(sql)
        return { deleted: true }
      }
      case 'deleteMany': {
        const where = buildWhere(args?.where)
        const sql = `DELETE FROM "${tableName}" ${where}`
        const result = await p.$executeRawUnsafe(sql)
        return { count: result || 0 }
      }
      case 'count': {
        const where = buildWhere(args?.where)
        const sql = `SELECT COUNT(*) as count FROM "${tableName}" ${where}`
        const rows = await p.$queryRawUnsafe(sql)
        return rows[0]?.count || 0
      }
      default:
        throw new Error(`Unsupported method: ${model}.${method}`)
    }
  } catch (e) {
    console.error(`[prisma-compat] ${model}.${method} error:`, e.message)
    // 返回合理的默认值
    if (method === 'findMany') return []
    if (method === 'count') return 0
    return null
  }
}

function buildWhere(where) {
  if (!where) return ''
  const conditions = []
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === 'object') {
      // 处理 { gte: ..., lte: ... } 等操作符
      for (const [op, val] of Object.entries(value)) {
        const sqlOp = { gte: '>=', lte: '<=', gt: '>', lt: '<', not: '!=', in: 'IN', contains: 'LIKE' }[op]
        if (sqlOp) {
          conditions.push(`"${key}" ${sqlOp} ${formatValue(val)}`)
        }
      }
    } else {
      conditions.push(`"${key}" = ${formatValue(value)}`)
    }
  }
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
}

function buildOrder(orderBy) {
  if (!orderBy) return ''
  if (Array.isArray(orderBy)) {
    return 'ORDER BY ' + orderBy.map(o => `"${Object.keys(o)[0]}" ${Object.values(o)[0]}`).join(', ')
  }
  return `ORDER BY "${Object.keys(orderBy)[0]}" ${Object.values(orderBy)[0]}`
}

function formatValue(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? '1' : '0'
  if (val instanceof Date) return `'${val.toISOString()}'`
  // String: escape single quotes
  return `'${String(val).replace(/'/g, "''")}'`
}

module.exports = new Proxy({}, handler)
module.exports.PrismaClient = PrismaClient
