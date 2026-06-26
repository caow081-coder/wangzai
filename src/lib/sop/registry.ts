/**
 * WAOS SOP 引擎 — Skill Registry 注册中心
 *
 * 全局 Skill 注册 + 查找 + 自动注册到数据库
 */

import { ALL_SKILLS, SKILL_DEFINITIONS } from './skills'
import type { Skill, SkillDefinition } from './types'
import { db } from '@/lib/db'

class SkillRegistry {
  private skills = new Map<string, Skill>()

  constructor() {
    for (const skill of ALL_SKILLS) {
      this.register(skill)
    }
  }

  register(skill: Skill): void {
    this.skills.set(skill.definition.id, skill)
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id)
  }

  getByName(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values()).map(s => s.definition)
  }

  listByCategory(category: string): SkillDefinition[] {
    return this.list().filter(s => s.category === category)
  }

  async syncToDatabase(): Promise<void> {
    try {
      for (const def of SKILL_DEFINITIONS) {
        await db.skillRegistry.upsert({
          where: { id: def.id },
          create: {
            id: def.id,
            name: def.name,
            description: def.description,
            category: def.category,
            inputSchema: JSON.stringify(def.inputSchema),
            outputSchema: JSON.stringify(def.outputSchema),
            isActive: true,
          },
          update: {
            name: def.name,
            description: def.description,
            category: def.category,
            inputSchema: JSON.stringify(def.inputSchema),
            outputSchema: JSON.stringify(def.outputSchema),
          },
        })
      }
      console.log(`[SOP] SkillRegistry 已同步 ${SKILL_DEFINITIONS.length} 个 Skill 到数据库`)
    } catch (e) {
      console.error('[SOP] SkillRegistry 同步失败:', e)
    }
  }
}

let registryInstance: SkillRegistry | null = null
export function getSkillRegistry(): SkillRegistry {
  if (!registryInstance) registryInstance = new SkillRegistry()
  return registryInstance
}
