/**
 * WAOS SOP 引擎 API
 *
 * GET  /api/waos/sop          — 列出 SOP 定义 / Skill / 实例 / 日志
 * POST /api/waos/sop          — 创建/更新/删除/运行 SOP
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  createSopDefinition, updateSopDefinition, deleteSopDefinition,
  getSopDefinition, listSopDefinitions,
  createInstance, runInstance, pauseInstance, resumeInstance, abortInstance,
  listInstances, getInstanceLogs, findMatchingSop,
} from '@/lib/sop/runtime'
import { getSkillRegistry } from '@/lib/sop/registry'
import { initPresetTemplates } from '@/lib/sop/templates'
import type { SopNode, SopEdge } from '@/lib/sop/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'definitions'

  try {
    if (view === 'definitions') {
      const category = url.searchParams.get('category') || undefined
      const defs = await listSopDefinitions(category)
      return NextResponse.json({ definitions: defs, count: defs.length })
    }
    if (view === 'definition') {
      const id = url.searchParams.get('id')
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const def = await getSopDefinition(id)
      if (!def) return NextResponse.json({ error: '未找到' }, { status: 404 })
      return NextResponse.json({ definition: def })
    }
    if (view === 'skills') {
      const registry = getSkillRegistry()
      const skills = registry.list()
      const grouped: Record<string, typeof skills> = {}
      for (const s of skills) {
        if (!grouped[s.category]) grouped[s.category] = []
        grouped[s.category].push(s)
      }
      return NextResponse.json({ skills, grouped, count: skills.length })
    }
    if (view === 'instances') {
      const status = url.searchParams.get('status') as any
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const instances = await listInstances(limit, status)
      return NextResponse.json({ instances, count: instances.length })
    }
    if (view === 'instance_logs') {
      const id = url.searchParams.get('id')
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const logs = await getInstanceLogs(id)
      return NextResponse.json({ logs, count: logs.length })
    }
    if (view === 'followups') {
      const { listFollowups } = await import('@/lib/sop/skills')
      return NextResponse.json({ followups: listFollowups() })
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
      case 'create': {
        const def = await createSopDefinition({
          name: body.name,
          description: body.description,
          triggerType: body.triggerType || 'manual',
          triggerCondition: body.triggerCondition,
          nodes: body.nodes as SopNode[],
          edges: body.edges as SopEdge[],
          category: body.category || '默认流程',
        })
        return NextResponse.json({ success: true, definition: def })
      }

      case 'update': {
        const def = await updateSopDefinition(body.id, {
          name: body.name,
          description: body.description,
          triggerType: body.triggerType,
          triggerCondition: body.triggerCondition,
          nodes: body.nodes as SopNode[],
          edges: body.edges as SopEdge[],
          category: body.category,
          isActive: body.isActive,
        })
        return NextResponse.json({ success: true, definition: def })
      }

      case 'delete': {
        await deleteSopDefinition(body.id)
        return NextResponse.json({ success: true })
      }

      case 'activate': {
        await updateSopDefinition(body.id, { isActive: body.isActive ?? true })
        return NextResponse.json({ success: true })
      }

      case 'run': {
        const instance = await createInstance(
          body.sopDefinitionId,
          body.customerId,
          body.customerName,
          body.initialContext,
        )
        runInstance(instance.id).catch(e => console.error('[SOP] 运行失败:', e))
        return NextResponse.json({ success: true, instance, message: 'SOP 已启动' })
      }

      case 'run_sync': {
        const instance = await createInstance(
          body.sopDefinitionId,
          body.customerId,
          body.customerName,
          body.initialContext,
        )
        const result = await runInstance(instance.id)
        const logs = await getInstanceLogs(instance.id)
        return NextResponse.json({ success: true, instance: result, logs })
      }

      case 'pause': {
        await pauseInstance(body.instanceId)
        return NextResponse.json({ success: true })
      }

      case 'resume': {
        const result = await resumeInstance(body.instanceId)
        return NextResponse.json({ success: true, instance: result })
      }

      case 'abort': {
        await abortInstance(body.instanceId)
        return NextResponse.json({ success: true })
      }

      case 'init_presets': {
        await initPresetTemplates()
        return NextResponse.json({ success: true, message: '预设模板已初始化' })
      }

      case 'sync_skills': {
        const registry = getSkillRegistry()
        await registry.syncToDatabase()
        return NextResponse.json({ success: true, count: registry.list().length })
      }

      case 'match_sop': {
        const sop = await findMatchingSop({
          intent: body.intent,
          valueScore: body.valueScore,
          message: body.message,
        })
        return NextResponse.json({ matched: !!sop, sop })
      }

      case 'test_skill': {
        const registry = getSkillRegistry()
        const skill = registry.getByName(body.skillName)
        if (!skill) return NextResponse.json({ error: `Skill 不存在: ${body.skillName}` }, { status: 404 })
        const result = await skill.execute(body.context || { customerId: 'test' })
        return NextResponse.json({ result })
      }

      default:
        return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
