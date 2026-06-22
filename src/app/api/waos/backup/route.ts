/**
 * 数据库备份 API
 * GET  /api/waos/backup          — 列出备份
 * POST /api/waos/backup          — { action: 'backup'|'restore'|'clean', name?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createBackup, listBackups, restoreBackup, cleanOldBackups } from '@/lib/backup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const backups = listBackups()
    return NextResponse.json({ success: true, backups, count: backups.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body.action

  try {
    if (action === 'backup') {
      const result = await createBackup()
      return NextResponse.json({ success: true, ...result, message: '备份成功' })
    }
    if (action === 'restore') {
      if (!body.name) return NextResponse.json({ error: '缺少备份名称' }, { status: 400 })
      await restoreBackup(body.name)
      return NextResponse.json({ success: true, message: `已从 ${body.name} 恢复` })
    }
    if (action === 'clean') {
      const cleaned = await cleanOldBackups()
      return NextResponse.json({ success: true, cleaned, message: `清理了 ${cleaned} 个旧备份` })
    }
    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
