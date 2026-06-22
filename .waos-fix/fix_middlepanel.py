#!/usr/bin/env python3
# FIX-FE-PERF · MiddlePanel.tsx
# P1-3 深色模式：
#   - 快捷动作 tone 文字色（emerald/rose/orange-300）补 dark: 浅色下用 -700
#   - kbd 键帽硬编码 bg-black/border-white → 设计 token
import sys

PATH = "/tmp/my-project/src/components/waos/MiddlePanel.tsx"

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

def repl_all(old, new):
    global src
    cnt = src.count(old)
    if cnt == 0:
        print(f"  !! repl_all 0 处: {old!r}")
        sys.exit(1)
    src = src.replace(old, new)
    print(f"  ok x{cnt}: {old!r}")

# 1) tone 文字色补 dark: 变体（浅色下 -700，深色下 -300）
repl("'text-emerald-300'", "'text-emerald-700 dark:text-emerald-300'")
repl("'text-rose-300'", "'text-rose-700 dark:text-rose-300'")
repl("'text-orange-300'", "'text-orange-700 dark:text-orange-300'")

# 2) EmptyMiddle kbd 键帽 × 3（bg-black/40 border-white/10）
repl_all('bg-black/40 border border-white/10', 'bg-muted border border-border')

# 3) QuickAction kbd 键帽 × 1（bg-black/30 border-white/10）
repl('bg-black/30 border border-white/10', 'bg-background/60 border border-border')

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("MiddlePanel.tsx 写入完成")
