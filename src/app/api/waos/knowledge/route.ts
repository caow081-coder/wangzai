/**
 * WAOS RAG 知识库 API
 *
 * GET  /api/waos/knowledge?view=list&category=车型  — 列出文档
 * GET  /api/waos/knowledge?view=search&q=GLC多少钱  — 检索
 * POST /api/waos/knowledge  { action: 'add'|'delete'|'init_seed'|'search', ... }
 */

import { NextRequest, NextResponse } from 'next/server'
import { search, addDoc, deleteDoc, listDocs, initSeedKnowledgeBase } from '@/lib/rag/knowledge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'list'

  try {
    if (view === 'list') {
      const category = url.searchParams.get('category') || undefined
      const docs = await listDocs(category)
      return NextResponse.json({ docs, count: docs.length })
    }
    if (view === 'search') {
      const q = url.searchParams.get('q') || ''
      const category = url.searchParams.get('category') || undefined
      const topK = parseInt(url.searchParams.get('topK') || '5')
      const results = await search(q, { topK, category })
      return NextResponse.json({ query: q, results, count: results.length })
    }
    if (view === 'stats') {
      const docs = await listDocs(undefined, 1000)
      const byCategory: Record<string, number> = {}
      for (const d of docs) byCategory[d.category] = (byCategory[d.category] || 0) + 1
      return NextResponse.json({
        total: docs.length,
        byCategory,
        totalHits: docs.reduce((s, d) => s + d.hitCount, 0),
      })
    }
    return NextResponse.json({ error: `未知 view: ${view}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body.action

  try {
    switch (action) {
      case 'search': {
        const results = await search(body.query, { topK: body.topK || 5, category: body.category, minScore: body.minScore })
        return NextResponse.json({ results, count: results.length })
      }
      case 'add': {
        const id = await addDoc({
          title: body.title,
          content: body.content,
          category: body.category,
          tags: body.tags,
          keywords: body.keywords,
          source: body.source,
          priority: body.priority,
        })
        return NextResponse.json({ success: true, id })
      }
      case 'delete': {
        await deleteDoc(body.id)
        return NextResponse.json({ success: true })
      }
      case 'init_seed': {
        const count = await initSeedKnowledgeBase()
        return NextResponse.json({ success: true, count, message: count > 0 ? `已导入 ${count} 条种子` : '已有数据，跳过' })
      }
      default:
        return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
