/**
 * WAOS SOP 引擎 — 预设 SOP 模板
 *
 * 3 个开箱即用的奔驰销售 SOP：
 *  1. 高意向客户成交流程（PRICE + value>=80）
 *  2. 沉睡客户唤醒流程（SILENCE_BREAK）
 *  3. 投诉客户安抚流程（REJECTION + emotion<30）
 */

import type { SopNode, SopEdge, SopDefinition } from './types'
import { createSopDefinition } from './runtime'
import { db } from '@/lib/db'

// ─── 模板 1：高意向客户成交 SOP ─────────────────────────────────────────────
const highIntentCloseNodes: SopNode[] = [
  { id: 'n1', type: 'trigger', name: '开始', position: { x: 250, y: 50 } },
  { id: 'n2', type: 'skill', name: '意图识别', skillName: 'intent_recognition', position: { x: 250, y: 140 } },
  { id: 'n3', type: 'skill', name: '价值评估', skillName: 'value_evaluation', position: { x: 250, y: 230 } },
  { id: 'n4', type: 'condition', name: '价值≥80?', condition: { field: 'valueScore', operator: '>=', value: 80 }, position: { x: 250, y: 320 } },
  { id: 'n5', type: 'skill', name: '策略选择', skillName: 'strategy_select', skillParams: { strategy: 'CLOSE_NOW' }, position: { x: 100, y: 410 } },
  { id: 'n6', type: 'skill', name: '生成话术', skillName: 'reply_generate', position: { x: 100, y: 500 } },
  { id: 'n7', type: 'skill', name: '发送消息', skillName: 'send_message', position: { x: 100, y: 590 } },
  { id: 'n8', type: 'skill', name: '更新CRM', skillName: 'crm_update', skillParams: { updates: { status: 'high_intent', stage: 'hot' } }, position: { x: 100, y: 680 } },
  { id: 'n9', type: 'notify', name: '通知人工', notifyMessage: '高意向客户已自动跟进，请关注转化', notifyLevel: 'info', position: { x: 100, y: 770 } },
  { id: 'n10', type: 'wait', name: '等待30分钟', waitMs: 1800000, position: { x: 100, y: 860 } },
  { id: 'n11', type: 'condition', name: '客户回复了?', condition: { field: 'reply', operator: '!=', value: null }, position: { x: 100, y: 950 } },
  { id: 'n12', type: 'skill', name: '跟进回复', skillName: 'reply_generate', position: { x: -50, y: 1040 } },
  { id: 'n13', type: 'skill', name: '24h后跟进', skillName: 'schedule_followup', skillParams: { delayMs: 86400000, reason: '高意向客户未回复，24小时后跟进' }, position: { x: 250, y: 1040 } },
  { id: 'n14', type: 'end', name: '结束-跟进中', endStatus: 'success', position: { x: 100, y: 1130 } },
  { id: 'n15', type: 'skill', name: '标准回复', skillName: 'reply_generate', skillParams: { strategy: 'STANDARD_REPLY' }, position: { x: 450, y: 410 } },
  { id: 'n16', type: 'end', name: '结束-标准', endStatus: 'success', position: { x: 450, y: 500 } },
]

const highIntentCloseEdges: SopEdge[] = [
  { id: 'e1', from: 'n1', to: 'n2' },
  { id: 'e2', from: 'n2', to: 'n3' },
  { id: 'e3', from: 'n3', to: 'n4' },
  { id: 'e4', from: 'n4', to: 'n5', label: 'YES', condition: 'yes' },
  { id: 'e5', from: 'n4', to: 'n15', label: 'NO', condition: 'no' },
  { id: 'e6', from: 'n5', to: 'n6' },
  { id: 'e7', from: 'n6', to: 'n7' },
  { id: 'e8', from: 'n7', to: 'n8' },
  { id: 'e9', from: 'n8', to: 'n9' },
  { id: 'e10', from: 'n9', to: 'n10' },
  { id: 'e11', from: 'n10', to: 'n11' },
  { id: 'e12', from: 'n11', to: 'n12', label: 'YES', condition: 'yes' },
  { id: 'e13', from: 'n11', to: 'n13', label: 'NO', condition: 'no' },
  { id: 'e14', from: 'n12', to: 'n14' },
  { id: 'e15', from: 'n13', to: 'n14' },
  { id: 'e16', from: 'n15', to: 'n16' },
]

// ─── 模板 2：沉睡客户唤醒 SOP ─────────────────────────────────────────────
const dormantWakeNodes: SopNode[] = [
  { id: 'n1', type: 'trigger', name: '开始', position: { x: 250, y: 50 } },
  { id: 'n2', type: 'skill', name: '知识库检索', skillName: 'knowledge_search', skillParams: { query: '新款优惠' }, position: { x: 250, y: 140 } },
  { id: 'n3', type: 'skill', name: '策略选择', skillName: 'strategy_select', skillParams: { strategy: 'RECONNECT_HOOK' }, position: { x: 250, y: 230 } },
  { id: 'n4', type: 'skill', name: '生成唤醒话术', skillName: 'reply_generate', position: { x: 250, y: 320 } },
  { id: 'n5', type: 'skill', name: '发送消息', skillName: 'send_message', position: { x: 250, y: 410 } },
  { id: 'n6', type: 'skill', name: '更新CRM', skillName: 'crm_update', skillParams: { updates: { status: 'following', tags: '["dormant_woke"]' } }, position: { x: 250, y: 500 } },
  { id: 'n7', type: 'notify', name: '通知运营', notifyMessage: '沉睡客户已唤醒，请关注回复', notifyLevel: 'info', position: { x: 250, y: 590 } },
  { id: 'n8', type: 'wait', name: '等待3天', waitMs: 3 * 86400000, position: { x: 250, y: 680 } },
  { id: 'n9', type: 'condition', name: '客户回复了?', condition: { field: 'reply', operator: '!=', value: null }, position: { x: 250, y: 770 } },
  { id: 'n10', type: 'skill', name: '跟进回复', skillName: 'reply_generate', position: { x: 150, y: 860 } },
  { id: 'n11', type: 'skill', name: '转人工', skillName: 'human_handoff', skillParams: { reason: '沉睡客户3天未回复，转人工电话回访' }, position: { x: 400, y: 860 } },
  { id: 'n12', type: 'end', name: '结束', endStatus: 'success', position: { x: 250, y: 950 } },
]

const dormantWakeEdges: SopEdge[] = [
  { id: 'e1', from: 'n1', to: 'n2' },
  { id: 'e2', from: 'n2', to: 'n3' },
  { id: 'e3', from: 'n3', to: 'n4' },
  { id: 'e4', from: 'n4', to: 'n5' },
  { id: 'e5', from: 'n5', to: 'n6' },
  { id: 'e6', from: 'n6', to: 'n7' },
  { id: 'e7', from: 'n7', to: 'n8' },
  { id: 'e8', from: 'n8', to: 'n9' },
  { id: 'e9', from: 'n9', to: 'n10', label: 'YES', condition: 'yes' },
  { id: 'e10', from: 'n9', to: 'n11', label: 'NO', condition: 'no' },
  { id: 'e11', from: 'n10', to: 'n12' },
  { id: 'e12', from: 'n11', to: 'n12' },
]

// ─── 模板 3：投诉客户安抚 SOP ─────────────────────────────────────────────
const complaintHandleNodes: SopNode[] = [
  { id: 'n1', type: 'trigger', name: '开始', position: { x: 250, y: 50 } },
  { id: 'n2', type: 'skill', name: '意图识别', skillName: 'intent_recognition', position: { x: 250, y: 140 } },
  { id: 'n3', type: 'condition', name: '情绪<30?', condition: { field: 'identity.emotion', operator: '<', value: 30 }, position: { x: 250, y: 230 } },
  { id: 'n4', type: 'skill', name: '安抚策略', skillName: 'strategy_select', skillParams: { strategy: 'SOFT_RECOVERY' }, position: { x: 100, y: 320 } },
  { id: 'n5', type: 'skill', name: '安抚话术', skillName: 'reply_generate', position: { x: 100, y: 410 } },
  { id: 'n6', type: 'skill', name: '发送消息', skillName: 'send_message', position: { x: 100, y: 500 } },
  { id: 'n7', type: 'notify', name: '紧急通知主管', notifyMessage: '⚠️ 投诉客户需立即处理！请主管亲自跟进', notifyLevel: 'error', position: { x: 100, y: 590 } },
  { id: 'n8', type: 'skill', name: '转人工', skillName: 'human_handoff', skillParams: { reason: '投诉客户情绪激动，转人工安抚' }, position: { x: 100, y: 680 } },
  { id: 'n9', type: 'skill', name: '更新CRM', skillName: 'crm_update', skillParams: { updates: { status: 'following', tags: '["complaint"]' } }, position: { x: 100, y: 770 } },
  { id: 'n10', type: 'end', name: '结束-已转人工', endStatus: 'human_handoff', position: { x: 100, y: 860 } },
  { id: 'n11', type: 'skill', name: '标准回复', skillName: 'reply_generate', skillParams: { strategy: 'STANDARD_REPLY' }, position: { x: 450, y: 320 } },
  { id: 'n12', type: 'end', name: '结束-标准', endStatus: 'success', position: { x: 450, y: 410 } },
]

const complaintHandleEdges: SopEdge[] = [
  { id: 'e1', from: 'n1', to: 'n2' },
  { id: 'e2', from: 'n2', to: 'n3' },
  { id: 'e3', from: 'n3', to: 'n4', label: 'YES', condition: 'yes' },
  { id: 'e4', from: 'n3', to: 'n11', label: 'NO', condition: 'no' },
  { id: 'e5', from: 'n4', to: 'n5' },
  { id: 'e6', from: 'n5', to: 'n6' },
  { id: 'e7', from: 'n6', to: 'n7' },
  { id: 'e8', from: 'n7', to: 'n8' },
  { id: 'e9', from: 'n8', to: 'n9' },
  { id: 'e10', from: 'n9', to: 'n10' },
  { id: 'e11', from: 'n11', to: 'n12' },
]

// ─── 初始化预设模板（幂等）─────────────────────────────────────────────
export async function initPresetTemplates(): Promise<void> {
  const presets = [
    {
      name: '高意向客户成交 SOP',
      description: '针对询价+高价值客户（intent=PRICE & value≥80）的自动成交流程：识别→评估→逼单→发送→更新CRM→通知→等待→跟进/转人工',
      triggerType: 'auto_event',
      triggerCondition: { intent: 'PRICE', minValue: 80 },
      nodes: highIntentCloseNodes,
      edges: highIntentCloseEdges,
      category: '默认流程',
      idHint: 'high_intent_close',
    },
    {
      name: '沉睡客户唤醒 SOP',
      description: '针对沉睡客户（30天未联系）的自动唤醒流程：知识检索→唤醒话术→发送→等待3天→跟进/转人工',
      triggerType: 'auto_event',
      triggerCondition: { intent: 'SILENCE_BREAK' },
      nodes: dormantWakeNodes,
      edges: dormantWakeEdges,
      category: '默认流程',
      idHint: 'dormant_wake',
    },
    {
      name: '投诉客户安抚 SOP',
      description: '针对情绪低落（emotion<30）投诉客户的安抚流程：识别→情绪判断→安抚话术→紧急通知主管→转人工',
      triggerType: 'auto_event',
      triggerCondition: { intent: 'REJECTION', maxEmotion: 30 },
      nodes: complaintHandleNodes,
      edges: complaintHandleEdges,
      category: '售后流程',
      idHint: 'complaint_handle',
    },
  ]

  for (const preset of presets) {
    // 检查是否已存在（按 name 查）
    const existing = await db.sopDefinition.findFirst({ where: { name: preset.name } })
    if (existing) {
      console.log(`[SOP] 预设模板已存在: ${preset.name}`)
      continue
    }
    await createSopDefinition({
      name: preset.name,
      description: preset.description,
      triggerType: preset.triggerType,
      triggerCondition: preset.triggerCondition,
      nodes: preset.nodes,
      edges: preset.edges,
      category: preset.category,
    })
    console.log(`[SOP] 预设模板已创建: ${preset.name}`)
  }
}

// 导出模板定义（供 UI 预览）
export const PRESET_TEMPLATES = [
  { name: '高意向客户成交 SOP', description: '询价+高价值客户的自动成交流程', nodes: highIntentCloseNodes, edges: highIntentCloseEdges },
  { name: '沉睡客户唤醒 SOP', description: '沉睡客户的自动唤醒流程', nodes: dormantWakeNodes, edges: dormantWakeEdges },
  { name: '投诉客户安抚 SOP', description: '投诉客户的安抚+转人工流程', nodes: complaintHandleNodes, edges: complaintHandleEdges },
]
