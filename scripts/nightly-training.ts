#!/usr/bin/env tsx
/**
 * WAOS 夜间训练执行脚本
 * 调用 learning.ts 的 nightlyTraining 函数并输出结果
 */

import 'tsconfig-paths/register'
import { nightlyTraining } from '@/lib/waos/learning'

async function main() {
  console.log('[NightlyTraining] 开始执行夜间训练...')
  console.log('[NightlyTraining] 时间:', new Date().toISOString())
  console.log('')

  try {
    const result = await nightlyTraining()

    console.log('[NightlyTraining] ✓ 训练完成')
    console.log('')
    console.log('=== 训练结果摘要 ===')
    console.log(`新模板数: ${result.newTemplates.length}`)
    console.log(`新规则数: ${result.newRules.length}`)
    console.log(`人格更新建议: ${result.personaUpdates.length}`)
    console.log(`记忆压缩数: ${result.memoryCompressions}`)
    console.log(`错误数: ${result.errors.length}`)

    if (result.errors.length > 0) {
      console.log('')
      console.log('=== 错误详情 ===')
      result.errors.forEach((err, i) => {
        console.log(`${i + 1}. ${err}`)
      })
    }

    if (result.newTemplates.length > 0) {
      console.log('')
      console.log('=== 新模板预览 ===')
      result.newTemplates.slice(0, 3).forEach((t, i) => {
        console.log(`${i + 1}. [${t.intent}] ${t.content.slice(0, 80)}...`)
        console.log(`   预估效果: ${t.effectEstimate}/100 | ${t.reason}`)
      })
    }

    if (result.newRules.length > 0) {
      console.log('')
      console.log('=== Playbook优化建议 ===')
      result.newRules.slice(0, 3).forEach((r, i) => {
        console.log(`${i + 1}. ${r.playbookKey}`)
        console.log(`   当前转化率: ${(r.currentRate * 100).toFixed(1)}% → 建议: ${r.suggestedRate === 0 ? '降权/替换' : '提升优先级'}`)
        console.log(`   ${r.reason}`)
      })
    }

    if (result.personaUpdates.length > 0) {
      console.log('')
      console.log('=== 人格更新建议 ===')
      result.personaUpdates.forEach((p, i) => {
        console.log(`${i + 1}. ${p.trait}: 当前偏移 ${p.currentBias} → 建议 ${p.suggestedBias}`)
        console.log(`   ${p.reason}`)
      })
    }

    // 输出 JSON 供程序化处理
    console.log('')
    console.log('=== JSON 输出 ===')
    console.log(JSON.stringify(result, null, 2))

  } catch (error) {
    console.error('[NightlyTraining] ✗ 训练失败:')
    console.error(error)
    process.exit(1)
  }
}

main()
