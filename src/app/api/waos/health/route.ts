/**
 * WAOS 系统健康状态 API
 *
 * GET /api/waos/health
 *   返回系统实时健康状态：
 *   - 内存使用 (RSS / Heap / External)
 *   - 运行时间
 *   - API 端点清单
 *   - 当前时间戳
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const mem = process.memoryUsage()

  return NextResponse.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime()),
    uptimeHuman: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),        // MB
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
      arrayBuffers: Math.round(mem.arrayBuffers / 1024 / 1024),
    },
    process: {
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
      arch: process.arch,
    },
    endpoints: [
      'GET  /api/waos/health — 系统健康状态',
      'GET  /api/waos/safety — 安全护盾配置',
      'POST /api/waos/safety — 安全检测',
      'GET  /api/waos/reply — Reply Studio 元信息',
      'POST /api/waos/reply — AI 回复',
      'GET  /api/waos/llm — LLM Provider 列表',
      'POST /api/waos/llm — LLM 调用',
      'GET  /api/waos/leads — 线索列表',
      'GET  /api/waos/metrics — 运营指标',
      'GET  /api/waos/auto-reply — 自动回复配置',
      'POST /api/waos/auto-reply — 执行自动回复',
      'GET  /api/waos/reverse — 逆向服务列表',
      'POST /api/waos/reverse — 逆向服务操作',
      'GET  /api/waos/tts — TTS 配置',
      'POST /api/waos/tts — 文字转语音',
      'GET  /api/waos/vlm — VLM 配置',
      'POST /api/waos/vlm — 图片理解',
      'GET  /api/waos/asr — ASR 配置',
      'POST /api/waos/asr — 语音转文字',
    ],
  })
}
