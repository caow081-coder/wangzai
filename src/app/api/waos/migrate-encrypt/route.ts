/**
 * PII 数据迁移 API
 *
 * POST /api/waos/migrate-encrypt  { action: 'migrate' | 'verify' }
 *   - migrate: 把明文数据加密
 *   - verify: 验证加密覆盖率
 */

import { NextRequest, NextResponse } from 'next/server'
import { migrateEncryptExistingData, verifyEncryption } from '@/lib/migrate-encrypt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body.action

  try {
    if (action === 'migrate') {
      const result = await migrateEncryptExistingData()
      return NextResponse.json({
        success: true,
        ...result,
        message: `迁移完成：Message ${result.message} 条 / Lead ${result.lead} 条 / Comment ${result.comment} 条 / 总计 ${result.total} 条`,
      })
    }

    if (action === 'verify') {
      const result = await verifyEncryption()
      return NextResponse.json({
        success: true,
        ...result,
        message: result.isAllEncrypted
          ? '✅ 所有 PII 数据已加密'
          : `⚠️ 仍有明文：Message ${result.messagePlain} / Lead ${result.leadPlain} / Comment ${result.commentPlain}`,
      })
    }

    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'unknown',
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const result = await verifyEncryption()
    return NextResponse.json({
      success: true,
      ...result,
      message: result.isAllEncrypted ? '✅ 全部加密' : '⚠️ 有明文数据',
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
