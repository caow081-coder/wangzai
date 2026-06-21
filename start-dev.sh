#!/bin/bash
# 强力启动 dev server - 三重守护
cd /home/z/my-project
nohup node node_modules/next/dist/bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1 &
DEVPID=$!
disown $DEVPID 2>/dev/null
echo "dev PID: $DEVPID"
sleep 10
if kill -0 $DEVPID 2>/dev/null; then
  echo "✓ dev server alive"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/
else
  echo "✗ dev server died"
fi
