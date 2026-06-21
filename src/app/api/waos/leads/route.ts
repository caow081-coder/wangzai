/**
 * WAOS leads API
 * GET  /api/waos/leads      — list leads (last 50 from DB)
 * POST /api/waos/leads      — create a lead (with idempotency check)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get('limit') || 50)
  const stage = req.nextUrl.searchParams.get('stage')
  const source = req.nextUrl.searchParams.get('source')

  try {
    const where: any = {}
    if (stage) where.stage = stage
    if (source) where.source = source

    const leads = await db.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, limit)),
      include: { persona: true, tags: true, messages: { take: 10, orderBy: { createdAt: 'desc' } } },
    })
    return NextResponse.json({ count: leads.length, leads })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { externalId, source, userExternalId, userName, lastMessage } = body

    if (!externalId || !source) {
      return NextResponse.json({ error: 'externalId and source required' }, { status: 400 })
    }

    const existing = await db.lead.findUnique({ where: { externalId } })
    if (existing) {
      return NextResponse.json({ status: 'idempotent', lead: existing }, { status: 200 })
    }

    const lead = await db.lead.create({
      data: {
        externalId,
        source,
        userExternalId: userExternalId || `u_${externalId}`,
        userName: userName || '匿名用户',
        lastMessage,
        stage: 'new',
        intentScore: 0,
        valueScore: 0,
        priorityScore: 0,
      },
    })

    await db.event.create({
      data: {
        eventType: 'lead.created',
        payload: JSON.stringify({ leadId: lead.id, source, externalId }),
        level: 'info',
      },
    })

    return NextResponse.json({ status: 'created', lead }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}
