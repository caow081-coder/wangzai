#!/usr/bin/env python3
# FIX-FE-PERF · AuditTimeline.tsx
# P1-3 深色模式：actor 徽章的 -300 浅色文字补 dark: 变体（浅色下用 -700 保证对比度）
import sys

PATH = "/tmp/my-project/src/components/waos/AuditTimeline.tsx"

with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()

def ra(old, new):
    global src
    cnt = src.count(old)
    if cnt == 0:
        print(f"  !! 0 处: {old!r}")
        sys.exit(1)
    src = src.replace(old, new)
    print(f"  ok x{cnt}: {old!r}")

# actor 徽章文字色（operator/ai/护盾）补 dark:
ra('text-sky-300', 'text-sky-700 dark:text-sky-300')
ra('text-purple-300', 'text-purple-700 dark:text-purple-300')
ra('text-amber-300', 'text-amber-700 dark:text-amber-300')
# text-muted-foreground 已自适应，无需改

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("AuditTimeline.tsx 写入完成")
