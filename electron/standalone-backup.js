/**
 * WAOS 数据库自动备份服务（Electron CommonJS 版）
 * 供 electron/main.js 直接 require
 */
const fs = require('fs')
const path = require('path')

const BACKUP_DIR = path.join(process.cwd(), 'backups')
const DB_PATH = path.join(process.cwd(), 'db', 'custom.db')
const RETENTION_DAYS = 7

let backupInterval = null

function startScheduledBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  // 每 24 小时备份
  backupInterval = setInterval(async () => {
    try {
      await createBackup()
      await cleanOldBackups()
    } catch (e) {
      console.error('[Backup] 定时备份失败:', e.message || e)
    }
  }, 24 * 60 * 60 * 1000)

  // 首次启动 60 秒后备份
  setTimeout(() => createBackup().catch(console.error), 60000)

  console.log('[Backup] 定时备份已启动（每24小时，保留7天）')
  return backupInterval
}

function stopScheduledBackup() {
  if (backupInterval) {
    clearInterval(backupInterval)
    backupInterval = null
  }
}

async function createBackup() {
  if (!fs.existsSync(DB_PATH)) throw new Error('数据库文件不存在')
  const date = new Date().toISOString().slice(0, 10)
  const backupPath = path.join(BACKUP_DIR, `waos-backup-${date}.db`)
  fs.copyFileSync(DB_PATH, backupPath)
  console.log(`[Backup] 已备份到 ${backupPath}`)
  return { path: backupPath, size: fs.statSync(backupPath).size }
}

async function cleanOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return 0
  const files = fs.readdirSync(BACKUP_DIR)
  const now = Date.now()
  let cleaned = 0
  for (const file of files) {
    if (!file.startsWith('waos-backup-')) continue
    const filePath = path.join(BACKUP_DIR, file)
    const stat = fs.statSync(filePath)
    const ageDays = (now - stat.mtimeMs) / (24 * 60 * 60 * 1000)
    if (ageDays > RETENTION_DAYS) {
      fs.unlinkSync(filePath)
      cleaned++
    }
  }
  return cleaned
}

module.exports = { startScheduledBackup, stopScheduledBackup, createBackup, cleanOldBackups }
