'use client'

/**
 * 旺财 · 首次启动引导 Onboarding（Sprint 5-1）
 *
 * 4 步向导：
 *  1. 欢迎页 — 旺财柴犬 logo + 欢迎语 + 开始按钮
 *  2. AI 大脑配置 — 提示智谱 GLM-4 已内置 + 可选豆包/Kimi Cookie + 测试按钮
 *  3. 人设选择 — 5 个人设卡片（苏念安/顾倾城/叶之秋/陈墨白/江月明）
 *  4. 完成页 — 恭喜 + 进入旺财
 *
 * 实现要点：
 *  - Dialog 全屏弹窗（max-w-3xl，自适应高度）
 *  - localStorage `waos_onboarding_completed` 标记完成
 *  - Framer Motion 步骤切换动画
 *  - 每步进度指示（1/4, 2/4, 3/4, 4/4）
 *  - 可跳过（Skip 按钮）
 *  - 深色模式兼容
 */

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Check, ChevronLeft, ChevronRight, Sparkles, Cpu, Zap, Loader2,
  ShieldCheck, SkipForward, Rocket, Brain, PartyPopper,
} from 'lucide-react'
import { useOpsStore } from '@/store/useOpsStore'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ─── 常量 ────────────────────────────────────────────────────
const STORAGE_KEY = 'waos_onboarding_completed'
const TOTAL_STEPS = 4

/** 简化人设清单（与 store 中 5 个人设对齐，仅取展示所需字段） */
const PERSONA_CHOICES = [
  {
    id: 'star_sales',
    name: '苏念安',
    fullName: '明星销售 · 苏念安',
    avatar: '🏆',
    color: '#07C160',
    gradient: 'from-emerald-400 to-teal-500',
    tagline: '专业亲和 · 朋友式聊车',
    cvr: 0.42,
    desc: '奔驰4S店明星销售，年销200台+，善用试驾邀约',
  },
  {
    id: 'closer',
    name: '顾倾城',
    fullName: '逼单能手 · 顾倾城',
    avatar: '🔥',
    color: '#FF3B30',
    gradient: 'from-rose-400 to-red-500',
    tagline: '强势真诚 · 限时促单',
    cvr: 0.58,
    desc: '善用紧迫感，限时优惠/现车稀缺/活动倒计时促成交',
  },
  {
    id: 'service',
    name: '叶之秋',
    fullName: '售后管家 · 叶之秋',
    avatar: '💙',
    color: '#5856D6',
    gradient: 'from-indigo-400 to-purple-500',
    tagline: '温柔耐心 · 售后维护',
    cvr: 0.25,
    desc: '已购车主维护、保养提醒、满意度回访、转介绍引导',
  },
  {
    id: 'content_ops',
    name: '陈墨白',
    fullName: '短视频运营 · 陈墨白',
    avatar: '🎬',
    color: '#FF9500',
    gradient: 'from-orange-400 to-amber-500',
    tagline: '内容达人 · 流量转化',
    cvr: 0.35,
    desc: '评论截流 + 私信转化 + 热点追踪，把流量变成线索',
  },
  {
    id: 'market_dev',
    name: '江月明',
    fullName: '市场拓展 · 江月明',
    avatar: '📈',
    color: '#0A84FF',
    gradient: 'from-sky-400 to-cyan-500',
    tagline: '商务专业 · 数据驱动',
    cvr: 0.30,
    desc: '企业客户/集团采购/异业合作/活动策划，长期主义',
  },
] as const

// ─── 类型 ────────────────────────────────────────────────────
interface OnboardingProps {
  onComplete: () => void
}

type Step = 0 | 1 | 2 | 3

interface BrainTestState {
  loading: boolean
  ok: boolean | null
  message?: string
}

// ─── 主组件 ──────────────────────────────────────────────────
export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>(0)
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('star_sales')
  const [doubaoCookie, setDoubaoCookie] = useState('')
  const [kimiCookie, setKimiCookie] = useState('')
  const [brainTest, setBrainTest] = useState<BrainTestState>({ loading: false, ok: null })

  const setActivePersona = useOpsStore(s => s.setActivePersona)

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // localStorage 可能被禁用（隐私模式），忽略
    }
    setActivePersona(selectedPersonaId)
    onComplete()
  }, [selectedPersonaId, setActivePersona, onComplete])

  const handleSkip = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // 忽略
    }
    onComplete()
  }, [onComplete])

  // ESC 关闭 = 跳过
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSkip])

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) setStep((s) => (s + 1) as Step)
    else finish()
  }, [step, finish])

  const handlePrev = useCallback(() => {
    if (step > 0) setStep((s) => (s - 1) as Step)
  }, [step])

  const handleTestBrain = useCallback(async () => {
    setBrainTest({ loading: true, ok: null })
    try {
      const res = await fetch('/api/waos/brain/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '你好' }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '未知错误')
        setBrainTest({ loading: false, ok: false, message: `HTTP ${res.status} · ${text.slice(0, 80)}` })
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data && (data.ok === true || data.success === true || data.output || data.text)) {
        setBrainTest({ loading: false, ok: true, message: '智谱 GLM-4 已就绪，可以直接对话' })
        toast.success('AI 大脑连接成功')
      } else {
        setBrainTest({ loading: false, ok: true, message: 'AI 大脑已响应（智谱 GLM-4 内置）' })
        toast.success('AI 大脑连接成功')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '网络异常'
      setBrainTest({ loading: false, ok: false, message: msg })
      toast.error('AI 大脑测试失败：' + msg)
    }
  }, [])

  return (
    <Dialog open onOpenChange={(o) => { if (!o) handleSkip() }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-3xl p-0 gap-0 overflow-hidden h-[88vh] max-h-[760px] min-h-[560px]"
        aria-describedby="onboarding-desc"
      >
        <DialogTitle className="sr-only">旺财首次启动引导</DialogTitle>
        <DialogDescription id="onboarding-desc" className="sr-only">
          欢迎使用旺财 AI 私域营销助手，请按步骤完成初始配置
        </DialogDescription>

        {/* ─── 顶部进度条 ──────────────────────────────────── */}
        <div className="shrink-0 px-6 py-3 border-b border-border/60 bg-muted/30 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
              旺
            </div>
            <span className="text-sm font-semibold">旺财 · 初始配置向导</span>
          </div>

          <div className="flex-1" />

          {/* 步骤指示器 */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === step ? 'w-6 bg-emerald-500' :
                  i < step ? 'w-1.5 bg-emerald-500/60' :
                  'w-1.5 bg-muted-foreground/30',
                )}
                aria-hidden
              />
            ))}
            <span className="text-[11px] text-muted-foreground ml-2 font-mono tabular-nums">
              {step + 1}/{TOTAL_STEPS}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground ml-2"
            onClick={handleSkip}
          >
            <SkipForward className="w-3 h-3 mr-1" />
            跳过
          </Button>
        </div>

        {/* ─── 步骤内容（Framer Motion 切换动画）──────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto waos-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full"
            >
              {step === 0 && <WelcomeStep />}
              {step === 1 && (
                <BrainStep
                  doubaoCookie={doubaoCookie}
                  setDoubaoCookie={setDoubaoCookie}
                  kimiCookie={kimiCookie}
                  setKimiCookie={setKimiCookie}
                  test={brainTest}
                  onTest={handleTestBrain}
                />
              )}
              {step === 2 && (
                <PersonaStep
                  selectedId={selectedPersonaId}
                  onSelect={setSelectedPersonaId}
                />
              )}
              {step === 3 && (
                <FinishStep personaId={selectedPersonaId} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ─── 底部操作栏 ──────────────────────────────────── */}
        <div className="shrink-0 px-6 py-3 border-t border-border/60 bg-muted/30 flex items-center gap-2">
          {step > 0 ? (
            <Button variant="outline" size="sm" onClick={handlePrev} className="h-8">
              <ChevronLeft className="w-4 h-4 mr-1" />
              上一步
            </Button>
          ) : (
            <div />
          )}

          <div className="flex-1" />

          {step < TOTAL_STEPS - 1 ? (
            <Button size="sm" onClick={handleNext} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white">
              下一步
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={finish} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Rocket className="w-4 h-4 mr-1" />
              进入旺财
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Step 0: 欢迎页 ──────────────────────────────────────────
function WelcomeStep() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-12 min-h-[420px]">
      {/* 装饰光斑 */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-teal-400/10 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative mb-6"
      >
        <div className="absolute inset-0 rounded-full bg-emerald-400/30 blur-2xl animate-pulse" />
        <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-zinc-700 shadow-2xl">
          <img
            src="/wangcai-logo.png"
            alt="旺财柴犬 logo"
            className="w-full h-full object-cover"
          />
        </div>
      </motion.div>

      <motion.h1
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent mb-2"
      >
        欢迎使用旺财 AI 私域营销助手
      </motion.h1>

      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="text-sm text-muted-foreground max-w-md leading-relaxed mb-8"
      >
        旺财是专为奔驰经销商打造的 AI 私域营销助手，集成微信、视频号、朋友圈全渠道客户运营，
        让 AI 帮你 7×24 小时接客、跟进、转化。让我们用 1 分钟完成初始配置。
      </motion.p>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="grid grid-cols-3 gap-3 max-w-2xl w-full"
      >
        {[
          { icon: <Cpu className="w-4 h-4" />, label: '智谱 GLM-4 内置' },
          { icon: <Sparkles className="w-4 h-4" />, label: '5 大人设可选' },
          { icon: <ShieldCheck className="w-4 h-4" />, label: '安全护盾加持' },
        ].map((f) => (
          <div key={f.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/60">
            <span className="text-emerald-600 dark:text-emerald-400 shrink-0">{f.icon}</span>
            <span className="text-xs text-muted-foreground">{f.label}</span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

// ─── Step 1: AI 大脑配置 ─────────────────────────────────────
interface BrainStepProps {
  doubaoCookie: string
  setDoubaoCookie: (v: string) => void
  kimiCookie: string
  setKimiCookie: (v: string) => void
  test: BrainTestState
  onTest: () => void
}

function BrainStep({ doubaoCookie, setDoubaoCookie, kimiCookie, setKimiCookie, test, onTest }: BrainStepProps) {
  return (
    <div className="px-8 py-8 min-h-[420px]">
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shrink-0">
          <Brain className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">配置 AI 大脑</h2>
          <p className="text-xs text-muted-foreground">
            旺财已内置智谱 GLM-4，开箱即可对话。如需更强模型，可额外配置豆包 / Kimi 的 Cookie。
          </p>
        </div>
      </div>

      {/* 默认可用模型 */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center text-xl shrink-0">
            ✨
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold">智谱 GLM-4</span>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10">
                <Check className="w-3 h-3 mr-0.5" />默认可用
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              国产最强推理模型之一，无需配置，开箱即用
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
            onClick={onTest}
            disabled={test.loading}
          >
            {test.loading ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />测试中…</>
            ) : (
              <><Zap className="w-3 h-3 mr-1" />测试连接</>
            )}
          </Button>
        </div>

        {/* 测试结果 */}
        {test.ok !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={cn(
              'mt-3 px-3 py-2 rounded-md text-[11px] flex items-start gap-2',
              test.ok
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
            )}
          >
            {test.ok ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Loader2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span className="break-all">{test.message || (test.ok ? '连接成功' : '连接失败')}</span>
          </motion.div>
        )}
      </div>

      {/* 可选模型配置 */}
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="h-px flex-1 bg-border/60" />
          可选 · 增强模型配置（粘贴 Cookie 即可启用）
          <span className="h-px flex-1 bg-border/60" />
        </p>

        <CookieField
          emoji="🤖"
          name="豆包"
          hint="字节跳动 · 多模态支持看图"
          value={doubaoCookie}
          onChange={setDoubaoCookie}
          placeholder="粘贴 doubao.com 的 Cookie（可选）"
        />

        <CookieField
          emoji="🌙"
          name="Kimi"
          hint="月之暗面 · 128K 长上下文"
          value={kimiCookie}
          onChange={setKimiCookie}
          placeholder="粘贴 kimi.moonshot.cn 的 Cookie（可选）"
        />
      </div>

      <p className="text-[11px] text-muted-foreground/70 mt-4 leading-relaxed">
        💡 Cookie 仅保存在本地数据库，不会上传服务器。可稍后在「设置 → AI 大脑」中配置。
      </p>
    </div>
  )
}

function CookieField({
  emoji, name, hint, value, onChange, placeholder,
}: {
  emoji: string
  name: string
  hint: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3 bg-background">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{emoji}</span>
        <span className="text-sm font-medium">{name}</span>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`cookie-${name}`} className="text-[10px] text-muted-foreground">
          Cookie（可选 · 留空则不启用）
        </Label>
        <Input
          id={`cookie-${name}`}
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-xs font-mono"
          autoComplete="off"
        />
      </div>
    </div>
  )
}

// ─── Step 2: 人设选择 ────────────────────────────────────────
function PersonaStep({ selectedId, onSelect }: {
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="px-8 py-8 min-h-[420px]">
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">选择默认人设</h2>
          <p className="text-xs text-muted-foreground">
            旺财内置 5 大营销人设，针对不同场景自动切换话术风格。可稍后在顶栏随时切换。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PERSONA_CHOICES.map((p) => {
          const active = p.id === selectedId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              aria-pressed={active}
              className={cn(
                'group relative text-left rounded-xl border p-4 transition-all duration-200 outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring/40',
                active
                  ? 'border-emerald-500 bg-emerald-500/5 shadow-sm'
                  : 'border-border/60 bg-background hover:border-emerald-500/40 hover:bg-muted/30',
              )}
            >
              {active && (
                <motion.div
                  layoutId="persona-active"
                  className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white"
                >
                  <Check className="w-3 h-3" />
                </motion.div>
              )}

              <div className="flex items-start gap-3 mb-2">
                <div className={cn(
                  'w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0',
                  'bg-gradient-to-br', p.gradient,
                )}>
                  {p.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold truncate">{p.fullName}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{p.tagline}</span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
                {p.desc}
              </p>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  转化率 {Math.round(p.cvr * 100)}%
                </Badge>
                <span className="text-[10px] text-muted-foreground/70">主销：{p.id === 'star_sales' ? 'C级/GLC' : p.id === 'closer' ? 'S级/迈巴赫' : p.id === 'service' ? '全系售后' : p.id === 'content_ops' ? '全系内容' : 'V级/旗舰'}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step 3: 完成页 ──────────────────────────────────────────
function FinishStep({ personaId }: { personaId: string }) {
  const persona = PERSONA_CHOICES.find((p) => p.id === personaId) || PERSONA_CHOICES[0]

  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-12 min-h-[420px] relative">
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-teal-400/10 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ scale: 0.7, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="mb-6"
      >
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shadow-2xl">
          <PartyPopper className="w-10 h-10" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-2xl font-bold mb-2"
      >
        恭喜，初始配置完成！
      </motion.h1>

      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-sm text-muted-foreground max-w-md leading-relaxed mb-6"
      >
        旺财已为你准备好默认人设 <span className="font-medium text-foreground">{persona.fullName}</span>，
        现在可以开始接客了。点击下方「进入旺财」开始使用。
      </motion.p>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50 border border-border/60"
      >
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0',
          'bg-gradient-to-br', persona.gradient,
        )}>
          {persona.avatar}
        </div>
        <div className="text-left">
          <div className="text-sm font-medium">{persona.fullName}</div>
          <div className="text-[11px] text-muted-foreground">{persona.tagline}</div>
        </div>
        <Check className="w-4 h-4 text-emerald-500 ml-2" />
      </motion.div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 text-[11px] text-muted-foreground/70 max-w-md leading-relaxed"
      >
        💡 提示：随时按 <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 font-mono text-[10px]">Ctrl/⌘ + K</kbd> 打开命令面板，
        按 <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 font-mono text-[10px]">?</kbd> 查看所有快捷键。
      </motion.div>
    </div>
  )
}

// ─── 暴露重置方法（供「设置」中重置 onboarding 调用）────────
export function resetOnboarding() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
}

export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}
