/**
 * WAOS Core Engines — 统一导出
 *
 * 方案文档 10 层架构的 TypeScript 实现
 *
 * 引擎清单：
 *   - truth           真理层（优先级+时间门控+否决权）
 *   - memory          记忆压缩引擎（遗忘曲线+重要性评分）
 *   - persona-anchor  人格锚点（70%原始+30%学习）
 *   - ethics          行为边界层（夸大宣传/违规承诺拦截）
 *   - relation-graph  关系图谱（动态影响力+转介绍检测）
 *   - decision-replay 决策回放引擎（成交路径分析+反事实评估）
 *   - learning        学习引擎（夜间训练+模板挖掘+审核队列）
 *   - knowledge-aging 知识衰减（180天降权/365天审核/730天归档）
 */

export * from './truth'
export * from './memory'
export * from './persona-anchor'
export * from './ethics'
export * from './relation-graph'
export * from './decision-replay'
export * from './learning'
export * from './knowledge-aging'
