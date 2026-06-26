/**
 * WAOS Schema Migration Runner
 * 
 * 绕过 Prisma CLI 锁问题，直接执行 SQL 迁移
 * 用法: node scripts/migrate-waos-engines.mjs
 */

import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = join(__dirname, '..', 'db', 'wangcai.db')

if (!existsSync(dbPath)) {
  console.error('❌ Database not found at:', dbPath)
  process.exit(1)
}

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

console.log('📦 Running WAOS engines migration...')

const migrations = [
  // ─── KnowledgeDoc 扩展字段 ───
  `ALTER TABLE KnowledgeDoc ADD COLUMN effectScore REAL DEFAULT 0`,
  `ALTER TABLE KnowledgeDoc ADD COLUMN expiresAt DATETIME`,

  // ─── TruthDocument ───
  `CREATE TABLE IF NOT EXISTS TruthDocument (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'policy',
    priority INTEGER NOT NULL DEFAULT 0,
    validFrom DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    validUntil DATETIME,
    isActive BOOLEAN NOT NULL DEFAULT 1,
    tags TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_truth_priority ON TruthDocument(priority)`,
  `CREATE INDEX IF NOT EXISTS idx_truth_category ON TruthDocument(category)`,

  // ─── MemoryLong ───
  `CREATE TABLE IF NOT EXISTS MemoryLong (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL,
    fact TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    importance REAL NOT NULL DEFAULT 50,
    decayFactor REAL NOT NULL DEFAULT 0.01,
    confidence REAL NOT NULL DEFAULT 1.0,
    version INTEGER NOT NULL DEFAULT 1,
    sourceEvents TEXT NOT NULL DEFAULT '[]',
    lastAccessed DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_customer ON MemoryLong(customerId)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_importance ON MemoryLong(customerId, importance)`,

  // ─── RelationNode ───
  `CREATE TABLE IF NOT EXISTS RelationNode (
    id TEXT PRIMARY KEY,
    customerId TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'customer',
    importance REAL NOT NULL DEFAULT 50,
    properties TEXT NOT NULL DEFAULT '{}',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rnode_customer ON RelationNode(customerId)`,
  `CREATE INDEX IF NOT EXISTS idx_rnode_type ON RelationNode(type)`,

  // ─── RelationEdge ───
  `CREATE TABLE IF NOT EXISTS RelationEdge (
    id TEXT PRIMARY KEY,
    fromId TEXT NOT NULL,
    toId TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'belongs_to',
    weight REAL NOT NULL DEFAULT 1.0,
    properties TEXT NOT NULL DEFAULT '{}',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fromId) REFERENCES RelationNode(id) ON DELETE CASCADE,
    FOREIGN KEY (toId) REFERENCES RelationNode(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_redge_from ON RelationEdge(fromId)`,
  `CREATE INDEX IF NOT EXISTS idx_redge_to ON RelationEdge(toId)`,

  // ─── EthicsRule ───
  `CREATE TABLE IF NOT EXISTS EthicsRule (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'warning',
    pattern TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'warn',
    isActive BOOLEAN NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 50,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ethics_category ON EthicsRule(category)`,
  `CREATE INDEX IF NOT EXISTS idx_ethics_active ON EthicsRule(isActive)`,

  // ─── DecisionLog ───
  `CREATE TABLE IF NOT EXISTS DecisionLog (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL,
    eventId TEXT,
    intent TEXT,
    stage TEXT,
    personaMix TEXT,
    action TEXT NOT NULL DEFAULT 'reply',
    templateId TEXT,
    replyContent TEXT,
    result TEXT,
    confidence REAL NOT NULL DEFAULT 0,
    latency INTEGER NOT NULL DEFAULT 0,
    tokensUsed INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dlog_customer ON DecisionLog(customerId, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_dlog_result ON DecisionLog(result)`,

  // ─── LearningReview ───
  `CREATE TABLE IF NOT EXISTS LearningReview (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'template',
    suggestion TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'learning_engine',
    status TEXT NOT NULL DEFAULT 'pending',
    reviewedBy TEXT,
    reviewedAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lreview_status ON LearningReview(status)`,
  `CREATE INDEX IF NOT EXISTS idx_lreview_type ON LearningReview(type)`,
]

// ─── 执行迁移 ───
let applied = 0
let skipped = 0

for (const sql of migrations) {
  try {
    db.exec(sql)
    applied++
  } catch (e) {
    if (e.message.includes('duplicate column') || e.message.includes('already exists')) {
      skipped++
    } else {
      console.warn(`  ⚠️  ${e.message.split('\n')[0]}`)
      skipped++
    }
  }
}

// ─── 种子数据：内置伦理规则 ───
const seedEthics = [
  ['虚假承诺-包过', '不得做出包过/100%通过等虚假承诺', 'forbidden', '{"regex":"保证.*?通过|包[过录]|必过|100%|肯定.*?录取"}', 'block', 100],
  ['违规承诺-内部名额', '不得暗示特殊渠道或内部名额', 'forbidden', '{"regex":"内部.*?名额|走后门|特殊渠道|关系.*?名额"}', 'block', 95],
  ['夸大宣传', '不得使用绝对化广告用语', 'forbidden', '{"regex":"最好的|第一|唯一|全网最|绝对最"}', 'warn', 80],
  ['焦虑制造', '避免过度制造焦虑促单', 'warning', '{"regex":"再不来.*?就[晚没].*?了|错过.*?后悔|最后.*?机会"}', 'warn', 70],
  ['贬低竞品', '避免贬低竞品', 'warning', '{"regex":"(其他|别家|他们).*?(垃圾|不行|差|烂|坑)"}', 'warn', 60],
  ['退款承诺', '退款承诺需核实政策', 'review', '{"regex":"随时退款|无条件退款|不满意.*?退款"}', 'flag_for_review', 50],
]

const insertEthics = db.prepare(
  `INSERT OR IGNORE INTO EthicsRule (id, name, description, category, pattern, action, priority, createdAt, updatedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
)

for (const [name, desc, cat, pattern, action, priority] of seedEthics) {
  const id = 'builtin_' + name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
  insertEthics.run(id, name, desc, cat, pattern, action, priority)
}

db.close()

console.log(`✅ Migration complete: ${applied} applied, ${skipped} skipped, 6 ethics rules seeded`)
