// WAOS Engines Migration — uses existing PrismaClient
// Run: node scripts/migrate-waos-engines.js

const { PrismaClient } = require('@prisma/client')
const path = require('path')

// Point to project's .env for DATABASE_URL
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:' + path.join(__dirname, '..', 'db', 'wangcai.db')

const prisma = new PrismaClient()

async function migrate() {
  console.log('📦 WAOS Engines Migration...')

  const migrations = [
    // KnowledgeDoc 扩展
    `ALTER TABLE KnowledgeDoc ADD COLUMN effectScore REAL DEFAULT 0`,
    `ALTER TABLE KnowledgeDoc ADD COLUMN expiresAt DATETIME`,

    // TruthDocument
    `CREATE TABLE IF NOT EXISTS TruthDocument (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, category TEXT DEFAULT 'policy', priority INTEGER DEFAULT 0, validFrom DATETIME DEFAULT CURRENT_TIMESTAMP, validUntil DATETIME, isActive BOOLEAN DEFAULT 1, tags TEXT DEFAULT '[]', version INTEGER DEFAULT 1, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_truth_priority ON TruthDocument(priority)`,
    `CREATE INDEX IF NOT EXISTS idx_truth_category ON TruthDocument(category)`,

    // MemoryLong
    `CREATE TABLE IF NOT EXISTS MemoryLong (id TEXT PRIMARY KEY, customerId TEXT NOT NULL, fact TEXT NOT NULL, category TEXT DEFAULT 'general', importance REAL DEFAULT 50, decayFactor REAL DEFAULT 0.01, confidence REAL DEFAULT 1.0, version INTEGER DEFAULT 1, sourceEvents TEXT DEFAULT '[]', lastAccessed DATETIME DEFAULT CURRENT_TIMESTAMP, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_memory_customer ON MemoryLong(customerId)`,

    // RelationNode
    `CREATE TABLE IF NOT EXISTS RelationNode (id TEXT PRIMARY KEY, customerId TEXT, name TEXT NOT NULL, type TEXT DEFAULT 'customer', importance REAL DEFAULT 50, properties TEXT DEFAULT '{}', createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`,

    // RelationEdge
    `CREATE TABLE IF NOT EXISTS RelationEdge (id TEXT PRIMARY KEY, fromId TEXT NOT NULL REFERENCES RelationNode(id) ON DELETE CASCADE, toId TEXT NOT NULL REFERENCES RelationNode(id) ON DELETE CASCADE, type TEXT DEFAULT 'belongs_to', weight REAL DEFAULT 1.0, properties TEXT DEFAULT '{}', createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`,

    // EthicsRule
    `CREATE TABLE IF NOT EXISTS EthicsRule (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', category TEXT DEFAULT 'warning', pattern TEXT NOT NULL, action TEXT DEFAULT 'warn', isActive BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 50, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`,

    // DecisionLog
    `CREATE TABLE IF NOT EXISTS DecisionLog (id TEXT PRIMARY KEY, customerId TEXT NOT NULL, eventId TEXT, intent TEXT, stage TEXT, personaMix TEXT, action TEXT DEFAULT 'reply', templateId TEXT, replyContent TEXT, result TEXT, confidence REAL DEFAULT 0, latency INTEGER DEFAULT 0, tokensUsed INTEGER DEFAULT 0, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`,

    // LearningReview
    `CREATE TABLE IF NOT EXISTS LearningReview (id TEXT PRIMARY KEY, type TEXT DEFAULT 'template', suggestion TEXT DEFAULT '{}', source TEXT DEFAULT 'learning_engine', status TEXT DEFAULT 'pending', reviewedBy TEXT, reviewedAt DATETIME, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ]

  let ok = 0, skip = 0
  for (const sql of migrations) {
    try {
      await prisma.$executeRawUnsafe(sql)
      ok++
    } catch (e) {
      if (e.message.includes('duplicate') || e.message.includes('already exists')) {
        skip++
      } else {
        console.warn('  ⚠️', e.message.split('\n')[0])
        skip++
      }
    }
  }

  // Seed ethics rules
  const rules = [
    ['builtin_false_promise', '虚假承诺-包过', 'forbidden', '{"regex":"保证.*?通过|包[过录]|必过|100%"}', 'block', 100],
    ['builtin_insider', '违规承诺-内部名额', 'forbidden', '{"regex":"内部.*?名额|走后门|特殊渠道"}', 'block', 95],
    ['builtin_exaggerate', '夸大宣传', 'forbidden', '{"regex":"最好的|第一|唯一|全网最"}', 'warn', 80],
    ['builtin_anxiety', '焦虑制造', 'warning', '{"regex":"再不来.*?就[晚没].*?了|错过.*?后悔"}', 'warn', 70],
    ['builtin_defame', '贬低竞品', 'warning', '{"regex":"(其他|别家).*?(垃圾|不行|差)"}', 'warn', 60],
    ['builtin_refund', '退款承诺', 'review', '{"regex":"随时退款|无条件退款"}', 'flag_for_review', 50],
  ]
  for (const [id, name, cat, pattern, action, priority] of rules) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO EthicsRule (id, name, description, category, pattern, action, priority, createdAt, updatedAt) VALUES ('${id}', '${name}', '', '${cat}', '${pattern}', '${action}', ${priority}, datetime('now'), datetime('now'))`
      )
    } catch (e) { /* skip duplicates */ }
  }

  console.log(`✅ Done: ${ok} applied, ${skip} skipped, 6 ethics rules seeded`)
  await prisma.$disconnect()
}

migrate().catch(e => { console.error(e); process.exit(1) })
