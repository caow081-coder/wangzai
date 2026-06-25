/**
 * WAOS 数据库自动备份服务
 *
 * 对齐 6.22审计优化 Sprint 4: 每天凌晨2点备份，保留7天
 */

import fs from 'fs'
import path from 'path'

const BACKUP_DIR = path.join(process.cwd(), 'backups')
const DB_PATH = path.join(process.cwd(), 'db', 'custom.db')
const RETENTION_DAYS = 7

let backupInterval: NodeJS.Timeout | null = null

/** 启动定时备份（每 24 小时检查一次）*/
export function startScheduledBackup(): NodeJS.Timeout {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  // 每 24 小时备份一次
  backupInterval = setInterval(async () => {
    try {
      await createBackup()
      await cleanOldBackups()
    } catch (e) {
      console.error('[Backup] 定时备份失败:', e instanceof Error ? e.message : e)
    }
  }, 24 * 60 * 60 * 1000)

  // 首次启动延迟 60 秒后备份
  setTimeout(() => createBackup().catch(console.error), 60000)

  console.log('[Backup] 定时备份已启动（每24小时）')
  return backupInterval
}

/** 停止定时备份 */
export function stopScheduledBackup() {
  if (backupInterval) {
    clearInterval(backupInterval)
    backupInterval = null
  }
}

/** 创建备份 */
export async function createBackup(): Promise<{ path: string; size: number }> {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error('数据库文件不存在')
  }
  const date = new Date().toISOString().slice(0, 10)
  const backupPath = path.join(BACKUP_DIR, `waos-backup-${date}.db`)
  fs.copyFileSync(DB_PATH, backupPath)
  const size = fs.statSync(backupPath).size
  console.log(`[Backup] 已备份到 ${backupPath} (${Math.round(size / 1024)}KB)`)
  return { path: backupPath, size }
}

/** 清理旧备份（超过保留期）*/
export async function cleanOldBackups(): Promise<number> {
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
      console.log(`[Backup] 清理旧备份 ${file}`)
    }
  }
  return cleaned
}

/** 列出所有备份 */
export function listBackups(): Array<{ name: string; size: number; date: Date; path: string }> {
  if (!fs.existsSync(BACKUP_DIR)) return []
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('waos-backup-'))
    .map(f => {
      const filePath = path.join(BACKUP_DIR, f)
      const stat = fs.statSync(filePath)
      return { name: f, size: stat.size, date: stat.mtime, path: filePath }
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}

/** 从备份恢复 */
export async function restoreBackup(backupName: string): Promise<void> {
  const backupPath = path.join(BACKUP_DIR, backupName)
  if (!fs.existsSync(backupPath)) {
    throw new Error(`备份文件不存在: ${backupName}`)
  }
  if (!fs.existsSync(DB_PATH)) {
    throw new Error('当前数据库不存在')
  }
  // 先备份当前数据库（安全网）
  const tempBackup = DB_PATH + '.before-restore'
  fs.copyFileSync(DB_PATH, tempBackup)
  // 恢复
  fs.copyFileSync(backupPath, DB_PATH)
  console.log(`[Backup] 已从 ${backupName} 恢复数据库`)
}
