#!/usr/bin/env python3
# FIX-FE-PERF · DashboardFullscreen.tsx
# P1-3 深色模式：事件 ticker 的 bg-zinc-950 + text-zinc-* 硬编码 → 设计 token
import sys

PATH = "/tmp/my-project/src/components/waos/DashboardFullscreen.tsx"

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

# 事件 ticker 容器：深色硬编码 → 自适应 muted 底
repl(
'<div className="bg-zinc-950 border border-border rounded-xl p-4 flex flex-col">',
'<div className="bg-muted/40 border border-border rounded-xl p-4 flex flex-col">')

# ticker 标题文字
repl(
'<h3 className="text-sm font-semibold tracking-wide text-zinc-300">实时事件流</h3>',
'<h3 className="text-sm font-semibold tracking-wide text-foreground">实时事件流</h3>')
repl(
'<span className="ml-auto text-[10px] font-mono text-zinc-500">{logs.length} lines</span>',
'<span className="ml-auto text-[10px] font-mono text-muted-foreground">{logs.length} lines</span>')

# 默认日志色 + 时间色（出现多次，批量）
repl_all("'text-zinc-400'", "'text-muted-foreground'")
repl_all('text-zinc-600', 'text-muted-foreground')

# TOP leads 优先级低分色（text-zinc-400 已被上面批量替换覆盖；这里再保险处理 text-zinc-400 出现在三元里的情况已处理）

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("DashboardFullscreen.tsx 写入完成")
