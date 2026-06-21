'use client'

import { useOpsStore, type Settings as SettingsType } from '@/store/useOpsStore'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Settings as SettingsIcon, Sliders, Bell, Eye, RefreshCw, Zap,
  Flame, Bot, Radio, Clock, TrendingUp, Lock,
} from 'lucide-react'
import { toast } from 'sonner'

// UI-COMPACT: 原顶栏的 6 大模块快捷键全部收进设置 Dialog，作为顶部入口
const MODULE_TABS = [
  { id: 'scheduler',   label: '定时任务', icon: <Flame className="w-3.5 h-3.5" />, desc: '线索排队与优先级' },
  { id: 'ai',          label: 'AI设置',  icon: <Bot className="w-3.5 h-3.5" />,   desc: '回复生成与安全' },
  { id: 'channel',     label: '全渠道',  icon: <Radio className="w-3.5 h-3.5" />, desc: '微信/抖音/视频号' },
  { id: 'lifecycle',   label: '客户跟进', icon: <Clock className="w-3.5 h-3.5" />, desc: '唤醒/群发/客诉' },
  { id: 'attribution', label: '效果分析', icon: <TrendingUp className="w-3.5 h-3.5" />, desc: 'AB测试/漏斗' },
  { id: 'infra',       label: '系统设置', icon: <Lock className="w-3.5 h-3.5" />,   desc: '事件总线/锁/监控' },
] as const

export function SettingsDialog() {
  const open = useOpsStore(s => s.settingsOpen)
  const close = useOpsStore(s => s.closeSettings)
  const settings = useOpsStore(s => s.settings)
  const update = useOpsStore(s => s.updateSettings)
  const openProDrawer = useOpsStore(s => s.openProDrawer)

  // 打开 ProDrawer 并切换到对应 tab，同时关闭设置 Dialog
  const openModule = (tab: string) => {
    close()
    openProDrawer()
    // 用微任务延后派发，确保 ProDrawer 已挂载并监听事件
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('waos:proTab', { detail: tab }))
    }, 50)
    toast.info(`已切换到「${MODULE_TABS.find(m => m.id === tab)?.label}」模块`)
  }

  const reset = () => {
    update({
      agingRate: 2,
      businessHoursStart: 9,
      businessHoursEnd: 22,
      workerCapacity: 20,
      cooldownMinutes: 30,
      hotThreshold: 80,
      warmThreshold: 50,
      density: 'compact',
      showSafetyShield: true,
      showAuditTimeline: true,
      showMetricsCharts: true,
      notifyOnHot: true,
      notifyOnFallback: true,
      notifyOnSafety: true,
      notifyOnHuman: true,
      soundEnabled: false,
    })
    toast.success('设置已重置为默认值')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl bg-[oklch(0.165_0_0)] border-[oklch(1_0_0/12%)] text-zinc-100 p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="px-5 py-4 border-b border-[oklch(1_0_0/8%)] bg-[oklch(0.18_0_0)]">
          <DialogTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-emerald-400" />
            WAOS 控制台设置
            <span className="text-[10px] font-mono text-zinc-500 ml-2">v3.0</span>
          </DialogTitle>
          <DialogDescription className="text-[11px] text-zinc-400 mt-0.5">
            调整调度器参数、显示偏好、通知规则。修改会实时生效。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto waos-scrollbar px-5 py-4 space-y-5">
          {/* ─── 6 大模块快捷入口（UI-COMPACT: 从顶栏迁入）─── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <h3 className="text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">模块快捷入口</h3>
              <span className="text-[9px] text-zinc-500 ml-auto">点击进入对应模块</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MODULE_TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => openModule(t.id)}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-md text-[11px] font-medium bg-[oklch(0.13_0_0)] border border-[oklch(1_0_0/10%)] text-zinc-300 hover:bg-[oklch(1_0_0/5%)] hover:border-emerald-500/40 hover:text-emerald-300 transition-colors"
                  title={t.desc}
                >
                  {t.icon}
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ─── Scheduler Parameters ─── */}
          <Section icon={<Sliders className="w-3.5 h-3.5 text-emerald-400" />} title="调度器参数">
            <SliderRow
              label="老化补偿速率"
              hint={`COLD 队列每 tick +${settings.agingRate} 分`}
              value={settings.agingRate}
              min={0} max={10} step={1}
              onChange={v => update({ agingRate: v })}
            />
            <SliderRow
              label="Worker 容量上限"
              hint={`每个 Worker 最大并发 ${settings.workerCapacity} 任务`}
              value={settings.workerCapacity}
              min={5} max={50} step={5}
              onChange={v => update({ workerCapacity: v })}
            />
            <SliderRow
              label="单用户冷却时间"
              hint={`${settings.cooldownMinutes} 分钟内不重复触发同一用户`}
              value={settings.cooldownMinutes}
              min={5} max={120} step={5}
              onChange={v => update({ cooldownMinutes: v })}
            />
            <SliderRow
              label="HOT 队列阈值"
              hint={`优先级 ≥ ${settings.hotThreshold} 进入 HOT 队列`}
              value={settings.hotThreshold}
              min={60} max={95} step={5}
              onChange={v => update({ hotThreshold: v })}
            />
            <SliderRow
              label="WARM 队列阈值"
              hint={`优先级 ≥ ${settings.warmThreshold} 进入 WARM 队列`}
              value={settings.warmThreshold}
              min={20} max={70} step={5}
              onChange={v => update({ warmThreshold: v })}
            />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">业务时间窗 - 开始</label>
                <select
                  value={settings.businessHoursStart}
                  onChange={e => update({ businessHoursStart: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 text-[11px] font-mono bg-[oklch(0.13_0_0)] border border-[oklch(1_0_0/10%)] rounded-md text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">业务时间窗 - 结束</label>
                <select
                  value={settings.businessHoursEnd}
                  onChange={e => update({ businessHoursEnd: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 text-[11px] font-mono bg-[oklch(0.13_0_0)] border border-[oklch(1_0_0/10%)] rounded-md text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          {/* ─── Display ─── */}
          <Section icon={<Eye className="w-3.5 h-3.5 text-sky-400" />} title="显示偏好">
            <ToggleRow
              label="SafetyShield 状态显示"
              hint="在 WHY THIS DECISION 中显示安全护盾状态"
              checked={settings.showSafetyShield}
              onChange={v => update({ showSafetyShield: v })}
            />
            <ToggleRow
              label="审计时间线"
              hint="在中间面板显示线索操作留痕"
              checked={settings.showAuditTimeline}
              onChange={v => update({ showAuditTimeline: v })}
            />
            <ToggleRow
              label="指标图表"
              hint="在右侧面板显示 recharts 可视化"
              checked={settings.showMetricsCharts}
              onChange={v => update({ showMetricsCharts: v })}
            />
            <div className="pt-2">
              <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">界面密度</label>
              <div className="grid grid-cols-2 gap-2">
                {(['compact', 'comfortable'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => update({ density: d })}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-mono border transition-colors
                      ${settings.density === d
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                        : 'bg-[oklch(0.13_0_0)] text-zinc-400 border-[oklch(1_0_0/10%)] hover:bg-[oklch(1_0_0/5%)]'}`}
                  >
                    {d === 'compact' ? '紧凑' : '舒适'}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* ─── Notifications ─── */}
          <Section icon={<Bell className="w-3.5 h-3.5 text-amber-400" />} title="通知规则">
            <ToggleRow
              label="HOT 线索接入"
              hint="高意向用户进入时弹出通知"
              checked={settings.notifyOnHot}
              onChange={v => update({ notifyOnHot: v })}
            />
            <ToggleRow
              label="AI 熔断降级"
              hint="LLM 失败触发 fallback 时通知"
              checked={settings.notifyOnFallback}
              onChange={v => update({ notifyOnFallback: v })}
            />
            <ToggleRow
              label="安全护盾拦截"
              hint="AI 输出被 SafetyShield 拦截时通知"
              checked={settings.notifyOnSafety}
              onChange={v => update({ notifyOnSafety: v })}
            />
            <ToggleRow
              label="转人工接管"
              hint="线索转入 blocked 状态时通知"
              checked={settings.notifyOnHuman}
              onChange={v => update({ notifyOnHuman: v })}
            />
            <ToggleRow
              label="声音提醒"
              hint="关键事件触发时播放提示音"
              checked={settings.soundEnabled}
              onChange={v => update({ soundEnabled: v })}
            />
          </Section>

          {/* ─── Reset ─── */}
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              className="w-full border-[oklch(1_0_0/10%)] bg-[oklch(0.13_0_0)] text-zinc-300 hover:text-white hover:bg-[oklch(1_0_0/8%)]"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              重置为默认值
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[oklch(1_0_0/8%)] bg-[oklch(0.18_0_0)] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
            <Zap className="w-3 h-3 text-emerald-400" />
            <span>修改实时生效 · 持久化到 localStorage</span>
          </div>
          <Button
            size="sm"
            onClick={close}
            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40"
          >
            完成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">{title}</h3>
      </div>
      <div className="space-y-3 pl-1">{children}</div>
    </section>
  )
}

function SliderRow({
  label, hint, value, min, max, step, onChange,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[11px] text-zinc-300">{label}</label>
        <span className="text-[11px] font-mono font-semibold text-emerald-400 tabular-nums">{value}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="[&_[role=slider]]:bg-emerald-500 [&_[role=slider]]:border-emerald-400 [&_[role=slider]]:w-3.5 [&_[role=slider]]:h-3.5"
      />
      <p className="text-[9px] font-mono text-zinc-600 mt-1">{hint}</p>
    </div>
  )
}

function ToggleRow({
  label, hint, checked, onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex-1 min-w-0 pr-3">
        <div className="text-[11px] text-zinc-300">{label}</div>
        <div className="text-[9px] font-mono text-zinc-600 mt-0.5">{hint}</div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  )
}
