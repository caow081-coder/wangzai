#!/usr/bin/env python3
# FIX-FE-PERF · CommandPalette.tsx  (重跑：修正替换顺序)
# P1-3 深色模式：Spotlight 硬编码 oklch/zinc → 设计 token
import sys

PATH = "/tmp/my-project/src/components/waos/CommandPalette.tsx"

with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()

def repl_all(old, new):
    global src
    cnt = src.count(old)
    if cnt == 0:
        print(f"  !! repl_all 0 处: {old!r}")
        sys.exit(1)
    src = src.replace(old, new)
    print(f"  ok x{cnt}: {old!r}")

def repl(old, new):
    global src
    cnt = src.count(old)
    if cnt != 1:
        print(f"  !! repl 期望1 实际{cnt}: {old[:70]!r}")
        sys.exit(1)
    src = src.replace(old, new)
    print(f"  ok: {old[:50]!r}")

# —— 先做"整行唯一"替换（含即将被批量改的 token，趁现在还是原样）——

# DialogContent 容器
repl(
'className="max-w-xl p-0 bg-[oklch(0.165_0_0)] border-[oklch(1_0_0/12%)] text-zinc-100 overflow-hidden"',
'className="max-w-xl p-0 bg-popover text-popover-foreground border border-border overflow-hidden"')

# esc kbd（整行）
repl(
'<kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-zinc-500">esc</kbd>',
'<kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">esc</kbd>')

# 命令 kbd（整行）
repl(
'<kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-zinc-500 group-hover:text-zinc-300">{c.hint}</kbd>',
'<kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground group-hover:text-foreground">{c.hint}</kbd>')

# 搜索图标
repl('<Search className="w-4 h-4 text-zinc-500" />', '<Search className="w-4 h-4 text-muted-foreground" />')

# 输入框
repl(
'className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"',
'className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"')

# —— 再做批量 token 替换（此时唯一行已改完，剩余都是可批量处理的）——

# 结果区 hover 背景
repl_all('hover:bg-[oklch(1_0_0/6%)]', 'hover:bg-muted')
# 文字色
repl_all('text-zinc-200', 'text-foreground')
repl_all('text-zinc-500', 'text-muted-foreground')
repl_all('text-zinc-600', 'text-muted-foreground')
repl_all('text-zinc-400', 'text-muted-foreground')
# 边框
repl_all('border-[oklch(1_0_0/8%)]', 'border-border')

# footer 分隔点（text-zinc-600 已批量替换为 text-muted-foreground，无需再处理）

# SectionHeader（text-zinc-500 已批量替换为 text-muted-foreground）

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("CommandPalette.tsx 写入完成")
