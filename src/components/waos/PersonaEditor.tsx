'use client'

/**
 * WAOS 人设编辑器 — 5 Tabs 深度配置面板
 *
 * 设计目标：
 *  - 把人设从「死字符串」升级为「业务可配置 + 风格可延伸 + 技能可启停」的活体对象
 *  - 业务能力（卖什么车/价格区间）+ 联系方式（电话/门店/微信）可发给客户
 *  - 技能系统引用 Skill registry（src/lib/sop/skills.ts 的 9 个原子能力）
 *  - SOP 模板可一键启用推荐配置（参考 src/lib/sop/templates.ts 的 7 个预设）
 *  - 话术风格（开场/逼单/安抚/禁用词/emoji）支持多条模板，AI 智能选取
 *
 * 5 个 Tab：
 *   1. 基本信息  — 名称/头像/角色/描述/成交率/容量
 *   2. 业务能力  — 车型多选/类型/价格 Slider/主推车型
 *   3. 联系方式  — 电话/微信/门店/营业时间/城市
 *   4. 技能与SOP — 技能 Checkbox/SOP 推荐+启用
 *   5. 话术风格  — 开场/逼单/安抚 Textarea/禁用词/emoji
 */

import { useOpsStore, type Persona } from '@/store/useOpsStore'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  User, Car, Phone, Cpu, MessageSquare, Plus, Copy, Trash2, Check, Sparkles, X, Store,
} from 'lucide-react'
import { toast } from 'sonner'
import { useState, useMemo } from 'react'

// ─── 静态字典（车型池 / 类型池 / Skill 列表 / SOP 列表）──────────────
// 这些是 UI 选择用的字典，对应 Persona.business / skillConfig 字段。
// 车型 / 类型可扩展，未来可改成从后端拉取。

const CAR_MODEL_OPTIONS = [
  'C级', 'GLC', 'GLE', 'E级', 'S级', 'GLC Coupe', 'EQE', '迈巴赫', 'AMG', 'V级', 'EQS', 'G级',
]

const CAR_TYPE_OPTIONS = [
  '轿车', 'SUV', '新能源', '性能车', '旗舰', 'MPV', 'Coupe',
]

// 9 个 Skill（对应 src/lib/sop/skills.ts 的 SKILL_DEFINITIONS）
const SKILL_REGISTRY = [
  { id: 'intent_recognition',  name: '意图识别',       desc: '识别客户消息的意图类型 + 置信度 + 紧迫度' },
  { id: 'value_evaluation',    name: '商业价值评估',   desc: '基于身份向量计算动态乘数 + 综合价值分' },
  { id: 'strategy_select',     name: '策略选择',       desc: '选择 4 策略：逼单/软恢复/唤醒钩子/标准' },
  { id: 'reply_generate',      name: 'AI 话术生成',   desc: '调 AI 大脑生成话术（模板优先，LLM 兜底）' },
  { id: 'crm_update',          name: 'CRM 更新',       desc: '乐观锁更新线索状态/标签/阶段' },
  { id: 'send_message',        name: '发送消息',       desc: '调用微信 API 发送消息给客户' },
  { id: 'schedule_followup',   name: '定时跟进',       desc: '内存定时器，N 小时/天后自动跟进' },
  { id: 'human_handoff',       name: '转人工',         desc: '客户情绪激动/复杂问题 → 通知人工接管' },
  { id: 'knowledge_search',    name: '知识库检索',     desc: '关键词匹配产品/FAQ/案例/异议/话术' },
]

// 7 个 SOP 模板（对应 src/lib/sop/templates.ts 的 idHint）
const SOP_REGISTRY = [
  { id: 'high_intent_close',    name: '高意向客户成交 SOP', desc: '询价+高价值客户的自动成交流程' },
  { id: 'dormant_wake',         name: '沉睡客户唤醒 SOP',   desc: '沉睡客户的自动唤醒流程' },
  { id: 'complaint_handle',     name: '投诉客户安抚 SOP',   desc: '投诉客户的安抚+转人工流程' },
  { id: 'referral_fission',     name: '裂变引流 SOP',       desc: '推荐/转发客户的裂变引流流程' },
  { id: 'campaign_notify',      name: '活动通知 SOP',       desc: '定时活动通知+48 小时二次触达' },
  { id: 'after_sales_follow',   name: '售后跟进 SOP',       desc: '保养/维修咨询的售后跟进+转人工' },
  { id: 'new_customer_welcome', name: '新客欢迎 SOP',       desc: '新线索自动欢迎+24 小时跟进' },
]

const ROLE_OPTIONS: { value: Persona['role']; label: string }[] = [
  { value: 'sales',      label: '销售（sales）' },
  { value: 'service',    label: '售后（service）' },
  { value: 'expert',     label: '专家（expert）' },
  { value: 'lifestyle',  label: '生活方式（lifestyle）' },
  { value: 'marketing',  label: '营销运营（marketing）' },
  { value: 'bd',         label: '商务拓展（bd）' },
  { value: 'custom',     label: '自定义（custom）' },
]

// 头像 emoji 候选
const AVATAR_OPTIONS = ['🏆', '🔥', '💙', '🎬', '📈', '🎯', '👑', '💎', '🚗', '⭐', '🌟', '🦄']

export function PersonaEditor() {
  // ─── Store 状态 ───
  const open = useOpsStore(s => s.personaEditorOpen)
  const editingId = useOpsStore(s => s.editingPersonaId)
  const close = useOpsStore(s => s.closePersonaEditor)
  const personas = useOpsStore(s => s.personas)

  // CRUD 方法
  const updateBusiness = useOpsStore(s => s.updatePersonaBusiness)
  const updateContact = useOpsStore(s => s.updatePersonaContact)
  const toggleSkill = useOpsStore(s => s.togglePersonaSkill)
  const toggleSop = useOpsStore(s => s.togglePersonaSop)
  const applyRecommended = useOpsStore(s => s.applyRecommendedSops)
  const updateStyle = useOpsStore(s => s.updatePersonaStyle)
  const savePersona = useOpsStore(s => s.savePersona)
  const createPersona = useOpsStore(s => s.createPersona)
  const duplicatePersona = useOpsStore(s => s.duplicatePersona)
  const deletePersona = useOpsStore(s => s.deletePersona)
  // 模板市场入口
  const openPersonaMarket = useOpsStore(s => s.openPersonaMarket)

  // 当前编辑的人设（如果是 null，则视为新建模式）
  const persona = useMemo(
    () => personas.find(p => p.id === editingId) ?? null,
    [personas, editingId]
  )

  // 本地 tab 控制
  const [activeTab, setActiveTab] = useState('basic')

  // ─── 新建人设（在对话框内点击"新建"） ───
  const handleCreate = () => {
    const newId = createPersona()
    toast.success('已创建新人设，请填写配置')
    // 立即切换编辑器指向新人设
    useOpsStore.getState().openPersonaEditor(newId)
  }

  const handleDuplicate = () => {
    if (!persona) return
    duplicatePersona(persona.id)
    toast.success(`已复制人设：${persona.name}`)
  }

  const handleDelete = () => {
    if (!persona) return
    if (personas.length <= 1) {
      toast.error('至少保留一个人设，无法删除')
      return
    }
    if (confirm(`确认删除人设「${persona.name}」？此操作不可撤销。`)) {
      deletePersona(persona.id)
      toast.success('人设已删除')
      close()
    }
  }

  // ─── 渲染 ───
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* ─── Header ─── */}
        <DialogHeader className="px-5 py-4 border-b border-border/60 bg-card/60">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            人设编辑器
            {persona && (
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {persona.avatar} {persona.shortName}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            配置人设的业务能力、联系方式、技能、SOP 流程和话术风格。所有改动实时保存到本地。
          </DialogDescription>
        </DialogHeader>

        {!persona ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            尚未选择人设。点击下方按钮创建新人设。
            <div className="mt-4">
              <Button size="sm" onClick={handleCreate}>
                <Plus className="w-4 h-4 mr-1" /> 创建新人设
              </Button>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            {/* ─── Tabs List ─── */}
            <div className="px-5 pt-3 pb-2 border-b border-border/40">
              <TabsList className="grid grid-cols-5 w-full h-9">
                <TabsTrigger value="basic"   className="text-[11px] gap-1"><User className="w-3.5 h-3.5" />基本信息</TabsTrigger>
                <TabsTrigger value="business" className="text-[11px] gap-1"><Car className="w-3.5 h-3.5" />业务能力</TabsTrigger>
                <TabsTrigger value="contact" className="text-[11px] gap-1"><Phone className="w-3.5 h-3.5" />联系方式</TabsTrigger>
                <TabsTrigger value="skills"  className="text-[11px] gap-1"><Cpu className="w-3.5 h-3.5" />技能与SOP</TabsTrigger>
                <TabsTrigger value="style"   className="text-[11px] gap-1"><MessageSquare className="w-3.5 h-3.5" />话术风格</TabsTrigger>
              </TabsList>
            </div>

            {/* ─── Tabs Content（可滚动） ─── */}
            <div className="flex-1 overflow-y-auto waos-scrollbar px-5 py-4">
              {/* ─── Tab 1: 基本信息 ─── */}
              <TabsContent value="basic" className="space-y-4 mt-0">
                <BasicInfoTab persona={persona} onSave={savePersona} />
              </TabsContent>

              {/* ─── Tab 2: 业务能力 ─── */}
              <TabsContent value="business" className="space-y-4 mt-0">
                <BusinessTab persona={persona} onUpdate={updateBusiness} />
              </TabsContent>

              {/* ─── Tab 3: 联系方式 ─── */}
              <TabsContent value="contact" className="space-y-4 mt-0">
                <ContactTab persona={persona} onUpdate={updateContact} />
              </TabsContent>

              {/* ─── Tab 4: 技能与 SOP ─── */}
              <TabsContent value="skills" className="space-y-4 mt-0">
                <SkillsTab
                  persona={persona}
                  onToggleSkill={toggleSkill}
                  onToggleSop={toggleSop}
                  onApplyRecommended={applyRecommended}
                />
              </TabsContent>

              {/* ─── Tab 5: 话术风格 ─── */}
              <TabsContent value="style" className="space-y-4 mt-0">
                <StyleTab persona={persona} onUpdate={updateStyle} />
              </TabsContent>
            </div>
          </Tabs>
        )}

        {/* ─── Footer 操作 ─── */}
        <DialogFooter className="px-5 py-3 border-t border-border/60 bg-card/60 flex-row justify-between items-center">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCreate}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 新建
            </Button>
            <Button size="sm" variant="outline" onClick={handleDuplicate} disabled={!persona}>
              <Copy className="w-3.5 h-3.5 mr-1" /> 复制
            </Button>
            <Button size="sm" variant="outline" onClick={handleDelete} disabled={!persona || personas.length <= 1}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> 删除
            </Button>
            <Button size="sm" variant="outline" onClick={() => { openPersonaMarket() }} className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10">
              <Store className="w-3.5 h-3.5 mr-1" /> 模板市场
            </Button>
          </div>
          <Button size="sm" onClick={() => { toast.success('配置已保存'); close() }}>
            <Check className="w-3.5 h-3.5 mr-1" /> 完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 1: 基本信息
// ═══════════════════════════════════════════════════════════════════
function BasicInfoTab({
  persona, onSave,
}: {
  persona: Persona
  onSave: (p: Persona) => void
}) {
  // 本地草稿，失焦时统一保存
  const [draft, setDraft] = useState({
    name: persona.name,
    shortName: persona.shortName,
    avatar: persona.avatar,
    description: persona.description,
    role: persona.role,
    cvr: persona.cvr,
    capacity: persona.capacity,
    systemPrompt: persona.systemPrompt,
  })

  const commit = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    onSave({ ...persona, ...next })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="人设名称">
          <Input
            value={draft.name}
            onChange={e => commit({ name: e.target.value })}
            placeholder="如：明星销售 · 苏念安"
          />
        </Field>
        <Field label="简称">
          <Input
            value={draft.shortName}
            onChange={e => commit({ shortName: e.target.value })}
            placeholder="如：销冠"
          />
        </Field>
      </div>

      <Field label="头像 emoji">
        <div className="flex flex-wrap gap-1.5">
          {AVATAR_OPTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => commit({ avatar: emoji })}
              className={`w-9 h-9 rounded-lg text-lg transition-all ${
                draft.avatar === emoji
                  ? 'bg-emerald-500/20 ring-2 ring-emerald-500'
                  : 'bg-muted hover:bg-muted/70'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </Field>

      <Field label="角色类型">
        <Select value={draft.role} onValueChange={(v) => commit({ role: v as Persona['role'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="一句话描述">
        <Input
          value={draft.description}
          onChange={e => commit({ description: e.target.value })}
          placeholder="如：专业亲和 · 朋友式聊车"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={`成交率：${(draft.cvr * 100).toFixed(0)}%`}>
          <Slider
            value={[draft.cvr * 100]}
            min={0} max={100} step={1}
            onValueChange={([v]) => commit({ cvr: v / 100 })}
          />
        </Field>
        <Field label={`容量上限：${draft.capacity}`}>
          <Slider
            value={[draft.capacity]}
            min={5} max={300} step={5}
            onValueChange={([v]) => commit({ capacity: v })}
          />
        </Field>
      </div>

      <Field label="System Prompt（系统提示词）">
        <Textarea
          value={draft.systemPrompt}
          onChange={e => commit({ systemPrompt: e.target.value })}
          rows={6}
          className="font-mono text-[11px]"
          placeholder="你是奔驰4S店明星销售苏念安。5年高端汽车销售经验..."
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          这是人设的核心提示词，决定 AI 的基本行为模式。新增的业务/联系/风格字段会自动注入到 system 消息前缀。
        </p>
      </Field>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2: 业务能力
// ═══════════════════════════════════════════════════════════════════
function BusinessTab({
  persona, onUpdate,
}: {
  persona: Persona
  onUpdate: (id: string, business: Partial<Persona['business']>) => void
}) {
  const b = persona.business

  const toggleCarModel = (model: string) => {
    const has = b.carModels.includes(model)
    const next = has ? b.carModels.filter(m => m !== model) : [...b.carModels, model]
    // 如果删除的是当前主推车型，则自动清空主推
    const primary = has && b.primaryModel === model ? '' : b.primaryModel
    onUpdate(persona.id, { carModels: next, primaryModel: primary })
  }

  const toggleCarType = (type: string) => {
    const has = b.carTypes.includes(type)
    const next = has ? b.carTypes.filter(t => t !== type) : [...b.carTypes, type]
    onUpdate(persona.id, { carTypes: next })
  }

  return (
    <div className="space-y-5">
      <Field label="销售车型（多选）">
        <div className="flex flex-wrap gap-2">
          {CAR_MODEL_OPTIONS.map(model => {
            const checked = b.carModels.includes(model)
            return (
              <label
                key={model}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer text-[12px] transition-all border ${
                  checked
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                    : 'bg-muted/40 border-transparent hover:bg-muted'
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleCarModel(model)}
                />
                {model}
              </label>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          当客户问"你卖什么车"时，AI 会直接引用这里选择的车型列表。
        </p>
      </Field>

      <Field label="车型类型专长（多选）">
        <div className="flex flex-wrap gap-2">
          {CAR_TYPE_OPTIONS.map(type => {
            const checked = b.carTypes.includes(type)
            return (
              <label
                key={type}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer text-[12px] transition-all border ${
                  checked
                    ? 'bg-sky-500/10 border-sky-500/50 text-sky-700 dark:text-sky-300'
                    : 'bg-muted/40 border-transparent hover:bg-muted'
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleCarType(type)}
                />
                {type}
              </label>
            )
          })}
        </div>
      </Field>

      <Field label={`价格区间：${b.priceRange.min} - ${b.priceRange.max} 万元`}>
        <Slider
          value={[b.priceRange.min, b.priceRange.max]}
          min={0} max={300} step={5}
          onValueChange={([min, max]) => onUpdate(persona.id, { priceRange: { min, max } })}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>0 万</span>
          <span>300 万</span>
        </div>
      </Field>

      <Field label="主推车型（展示用）">
        <Select
          value={b.primaryModel || '__none__'}
          onValueChange={(v) => onUpdate(persona.id, { primaryModel: v === '__none__' ? '' : v })}
        >
          <SelectTrigger><SelectValue placeholder="选择主推车型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— 不指定 —</SelectItem>
            {b.carModels.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground mt-1">
          主推车型会替换话术模板中的 {'{primaryModel}'} 占位符。
        </p>
      </Field>

      {/* ─── 业务配置预览 ─── */}
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5">
        <div className="text-[11px] font-semibold text-muted-foreground">业务上下文预览（注入到 AI system prompt）</div>
        <div className="text-[11px] font-mono leading-relaxed text-foreground/80">
          <div>销售车型：<span className="text-emerald-600 dark:text-emerald-400">{b.carModels.join('、') || '—'}</span></div>
          <div>主推车型：<span className="text-emerald-600 dark:text-emerald-400">{b.primaryModel || '—'}</span></div>
          <div>类型专长：<span className="text-sky-600 dark:text-sky-400">{b.carTypes.join('、') || '—'}</span></div>
          <div>价格区间：<span className="text-amber-600 dark:text-amber-400">{b.priceRange.min}-{b.priceRange.max} 万</span></div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 3: 联系方式
// ═══════════════════════════════════════════════════════════════════
function ContactTab({
  persona, onUpdate,
}: {
  persona: Persona
  onUpdate: (id: string, contact: Partial<Persona['contact']>) => void
}) {
  const c = persona.contact

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="电话">
          <Input
            value={c.phone || ''}
            onChange={e => onUpdate(persona.id, { phone: e.target.value })}
            placeholder="138-8888-8888"
          />
        </Field>
        <Field label="微信号">
          <Input
            value={c.wechat || ''}
            onChange={e => onUpdate(persona.id, { wechat: e.target.value })}
            placeholder="suan8888"
          />
        </Field>
      </div>

      <Field label="门店名称">
        <Input
          value={c.storeName || ''}
          onChange={e => onUpdate(persona.id, { storeName: e.target.value })}
          placeholder="北京奔驰 · 朝阳旗舰4S中心"
        />
      </Field>

      <Field label="门店地址">
        <Input
          value={c.storeAddress || ''}
          onChange={e => onUpdate(persona.id, { storeAddress: e.target.value })}
          placeholder="北京市朝阳区东四环中路18号奔驰4S中心"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="营业时间">
          <Input
            value={c.businessHours || ''}
            onChange={e => onUpdate(persona.id, { businessHours: e.target.value })}
            placeholder="9:00-21:00（全年无休）"
          />
        </Field>
        <Field label="所在城市/区域">
          <Input
            value={c.location || ''}
            onChange={e => onUpdate(persona.id, { location: e.target.value })}
            placeholder="北京 · 朝阳"
          />
        </Field>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
        <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">联系方式预览（可一键发送给客户）</div>
        <div className="text-[11px] font-mono text-foreground/80 space-y-0.5">
          {c.phone && <div>📞 电话：{c.phone}</div>}
          {c.wechat && <div>💬 微信：{c.wechat}</div>}
          {c.storeName && <div>🏪 门店：{c.storeName}</div>}
          {c.storeAddress && <div>📍 地址：{c.storeAddress}</div>}
          {c.businessHours && <div>🕒 时间：{c.businessHours}</div>}
          {c.location && <div>🗺️ 位置：{c.location}</div>}
          {!c.phone && !c.wechat && !c.storeName && !c.storeAddress && (
            <div className="text-muted-foreground">尚未填写任何联系方式</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 4: 技能与 SOP
// ═══════════════════════════════════════════════════════════════════
function SkillsTab({
  persona, onToggleSkill, onToggleSop, onApplyRecommended,
}: {
  persona: Persona
  onToggleSkill: (id: string, skillId: string) => void
  onToggleSop: (id: string, sopId: string) => void
  onApplyRecommended: (id: string) => void
}) {
  const sc = persona.skillConfig

  return (
    <div className="space-y-5">
      {/* ─── 技能列表 ─── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[12px] font-semibold">技能（9 个原子能力）</div>
            <div className="text-[10px] text-muted-foreground">勾选启用的技能，运行时只跑启用的技能</div>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {sc.enabledSkills.length}/{SKILL_REGISTRY.length} 已启用
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-1.5 max-h-72 overflow-y-auto waos-scrollbar pr-1">
          {SKILL_REGISTRY.map(skill => {
            const enabled = sc.enabledSkills.includes(skill.id)
            return (
              <label
                key={skill.id}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all border ${
                  enabled
                    ? 'bg-emerald-500/5 border-emerald-500/40'
                    : 'bg-muted/30 border-transparent hover:bg-muted/60'
                }`}
              >
                <Checkbox
                  checked={enabled}
                  onCheckedChange={() => onToggleSkill(persona.id, skill.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium">{skill.name}</div>
                  <div className="text-[10px] text-muted-foreground">{skill.desc}</div>
                  <div className="text-[9px] font-mono text-muted-foreground/70 mt-0.5">{skill.id}</div>
                </div>
              </label>
            )
          })}
        </div>
      </div>

      {/* ─── 推荐 SOP ─── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[12px] font-semibold">推荐 SOP 模板</div>
            <div className="text-[10px] text-muted-foreground">基于人设角色推荐的 SOP 流程</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onApplyRecommended(persona.id)
              toast.success('已一键启用所有推荐 SOP')
            }}
            disabled={sc.recommendedSops.length === 0}
          >
            <Check className="w-3.5 h-3.5 mr-1" /> 一键启用推荐
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {sc.recommendedSops.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic p-2">该人设暂无推荐 SOP</div>
          ) : (
            sc.recommendedSops.map(sopId => {
              const sop = SOP_REGISTRY.find(s => s.id === sopId)
              if (!sop) return null
              const enabled = sc.enabledSops.includes(sopId)
              return (
                <div
                  key={sopId}
                  className={`flex items-center justify-between p-2 rounded-lg border ${
                    enabled ? 'bg-emerald-500/5 border-emerald-500/40' : 'bg-muted/30 border-transparent'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      {sop.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{sop.desc}</div>
                  </div>
                  {enabled ? (
                    <Badge variant="default" className="text-[10px] bg-emerald-600">已启用</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-2"
                      onClick={() => onToggleSop(persona.id, sopId)}
                    >
                      启用
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ─── 已启用 SOP 列表（可关闭） ─── */}
      <div>
        <div className="text-[12px] font-semibold mb-2">已启用的 SOP（{sc.enabledSops.length}）</div>
        <div className="flex flex-wrap gap-1.5 min-h-[2.5rem] p-2 rounded-lg bg-muted/30 border border-border/40">
          {sc.enabledSops.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">尚未启用任何 SOP</div>
          ) : (
            sc.enabledSops.map(sopId => {
              const sop = SOP_REGISTRY.find(s => s.id === sopId)
              return (
                <Badge
                  key={sopId}
                  variant="secondary"
                  className="text-[10px] gap-1 pr-1.5 py-1"
                >
                  {sop?.name || sopId}
                  <button
                    onClick={() => onToggleSop(persona.id, sopId)}
                    className="hover:bg-muted-foreground/20 rounded p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )
            })
          )}
        </div>
      </div>

      {/* ─── 全部 SOP 列表（手动启用/禁用） ─── */}
      <div>
        <div className="text-[12px] font-semibold mb-2">全部 SOP 模板（手动配置）</div>
        <div className="grid grid-cols-1 gap-1.5">
          {SOP_REGISTRY.map(sop => {
            const enabled = sc.enabledSops.includes(sop.id)
            const isRecommended = sc.recommendedSops.includes(sop.id)
            return (
              <label
                key={sop.id}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all border ${
                  enabled
                    ? 'bg-emerald-500/5 border-emerald-500/40'
                    : 'bg-muted/30 border-transparent hover:bg-muted/60'
                }`}
              >
                <Checkbox
                  checked={enabled}
                  onCheckedChange={() => onToggleSop(persona.id, sop.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium flex items-center gap-1.5">
                    {sop.name}
                    {isRecommended && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-500/50 text-amber-600 dark:text-amber-400">
                        推荐
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{sop.desc}</div>
                  <div className="text-[9px] font-mono text-muted-foreground/70 mt-0.5">{sop.id}</div>
                </div>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 5: 话术风格
// ═══════════════════════════════════════════════════════════════════
function StyleTab({
  persona, onUpdate,
}: {
  persona: Persona
  onUpdate: (id: string, style: Partial<Persona['styleExtends']>) => void
}) {
  const s = persona.styleExtends

  // 把多条模板（数组）展示成 Textarea，每行一条
  const arrayToText = (arr: string[]) => arr.join('\n')
  const textToArray = (text: string) =>
    text.split('\n').map(l => l.trim()).filter(Boolean)

  return (
    <div className="space-y-4">
      <Field label={`开场白模板（每行一条，{'{primaryModel}'} 自动替换为主推车型）`}>
        <Textarea
          value={arrayToText(s.greetingTemplates)}
          onChange={e => onUpdate(persona.id, { greetingTemplates: textToArray(e.target.value) })}
          rows={4}
          placeholder={'您好呀～我是奔驰苏念安，您在看{primaryModel}，方便聊聊您的需求吗？\n哈喽～欢迎咨询奔驰！{primaryModel}这车性价比挺高的'}
          className="text-[12px]"
        />
      </Field>

      <Field label="逼单话术模板（每行一条）">
        <Textarea
          value={arrayToText(s.closingTemplates)}
          onChange={e => onUpdate(persona.id, { closingTemplates: textToArray(e.target.value) })}
          rows={4}
          placeholder={'这个价格我帮您去找经理申请一下，您看今天方便过来定吗？\n这周末有空吗？我帮您安排一次试驾'}
          className="text-[12px]"
        />
      </Field>

      <Field label="安抚话术模板（每行一条）">
        <Textarea
          value={arrayToText(s.comfortTemplates)}
          onChange={e => onUpdate(persona.id, { comfortTemplates: textToArray(e.target.value) })}
          rows={4}
          placeholder={'理解您的顾虑，买车确实要慎重。我们慢慢聊。\n没关系，您多对比是应该的。'}
          className="text-[12px]"
        />
      </Field>

      <Field label="禁用词（每行一条，AI 绝对不会说的话）">
        <Textarea
          value={arrayToText(s.bannedPhrases)}
          onChange={e => onUpdate(persona.id, { bannedPhrases: textToArray(e.target.value) })}
          rows={3}
          placeholder={'便宜\n打折\n清仓\n最低价'}
          className="text-[12px]"
        />
      </Field>

      <Field label="常用 emoji（直接输入 emoji，无需分隔）">
        <Input
          value={s.frequentEmojis.join('')}
          onChange={e => {
            // 把输入字符串拆成单个 emoji 字符（粗粒度按 Unicode 字形拆分）
            const emojis = Array.from(e.target.value).filter(ch => ch.trim() !== '')
            onUpdate(persona.id, { frequentEmojis: emojis })
          }}
          placeholder="🙂 🚗 ✨ 💪"
          className="text-xl"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          直接输入 emoji 字符即可，AI 会在合适场合自然使用这些表情。
        </p>
      </Field>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 通用 Field 组件（Label + 内容）
// ═══════════════════════════════════════════════════════════════════
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
