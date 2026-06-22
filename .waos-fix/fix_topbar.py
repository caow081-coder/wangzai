#!/usr/bin/env python3
# FIX-FE-PERF · TopBar.tsx
# P2-1 aria-label：人设切换 / 全局熔断 / 微信号切换 三个图标按钮补无障碍标签
import sys

PATH = "/tmp/my-project/src/components/waos/TopBar.tsx"

with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()

def repl(old, new):
    global src
    cnt = src.count(old)
    if cnt != 1:
        print(f"  !! repl 期望1 实际{cnt}: {old[:70]!r}")
        sys.exit(1)
    src = src.replace(old, new)
    print(f"  ok: {old[:50]!r}")

# 1) 人设切换按钮
repl(
'''        <button
          onClick={() => setPersonaMenuOpen(o => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors apple-btn"
        >
          <span className="text-base">{activePersona?.avatar}</span>''',
'''        <button
          onClick={() => setPersonaMenuOpen(o => !o)}
          aria-label="切换人设"
          aria-haspopup="menu"
          aria-expanded={personaMenuOpen}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors apple-btn"
        >
          <span className="text-base">{activePersona?.avatar}</span>''')

# 2) 全局熔断按钮
repl(
'''        className={`w-8 h-8 rounded-lg transition-colors apple-btn shrink-0 flex items-center justify-center ${
          killSwitchActive ? 'bg-rose-500/20 text-rose-600 animate-pulse' : 'hover:bg-muted text-muted-foreground'
        }`}
        title={killSwitchActive ? '🔴 熔断中 — 点击恢复' : '全局熔断（一键停止所有自动化）'}
      >
        <Power className="w-4 h-4" />
      </button>''',
'''        className={`w-8 h-8 rounded-lg transition-colors apple-btn shrink-0 flex items-center justify-center ${
          killSwitchActive ? 'bg-rose-500/20 text-rose-600 animate-pulse' : 'hover:bg-muted text-muted-foreground'
        }`}
        title={killSwitchActive ? '🔴 熔断中 — 点击恢复' : '全局熔断（一键停止所有自动化）'}
        aria-label={killSwitchActive ? '恢复自动化' : '全局熔断（一键停止所有自动化）'}
        aria-pressed={killSwitchActive}
      >
        <Power className="w-4 h-4" />
      </button>''')

# 3) 微信号切换按钮
repl(
'''      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg hover:bg-muted transition-colors apple-btn"
      >
        <span className="text-[14px]">{active?.avatar}</span>''',
'''      <button
        onClick={() => setOpen(o => !o)}
        aria-label="切换微信号"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg hover:bg-muted transition-colors apple-btn"
      >
        <span className="text-[14px]">{active?.avatar}</span>''')

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("TopBar.tsx 写入完成")
