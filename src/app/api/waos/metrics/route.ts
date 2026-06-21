/**
 * WAOS metrics endpoint — observability snapshot
 * GET /api/waos/metrics
 *
 * Returns the latest metrics from the WebSocket stream's in-memory state
 * (proxied via the frontend's last-known state). Since the stream service
 * pushes metrics via socket.io, this HTTP endpoint returns a static
 * descriptor for health-checking tools.
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    service: 'waos-ops-console',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    metrics: {
      // These are placeholders; live values come via socket.io
      // See /api/waos/metrics/live for SSE-streamed values
      waos_lead_created_total: { description: 'Total leads created', labels: ['source'] },
      waos_dispatch_latency_seconds: { description: 'Dispatch latency P99', labels: ['queue_type'] },
      waos_llm_call_duration_seconds: { description: 'LLM call latency', labels: ['persona_id'] },
      waos_queue_depth: { description: 'Current queue depth', labels: ['queue_type'] },
      waos_active_leads_total: { description: 'Active leads in system' },
      waos_llm_fallback_rate: { description: 'LLM fallback (circuit open) rate %' },
      waos_safety_block_rate: { description: 'Safety shield block rate %' },
      waos_cvr: { description: 'Overall conversion rate %' },
    },
    slo: {
      event_p99: '< 5s',
      ai_success_rate: '> 99%',
      availability: '> 99.9%',
      delivery_rate: '> 99%',
    },
    health: 'ok',
  })
}
