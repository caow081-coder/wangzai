#!/bin/bash
# WAOS dev server supervisor - 守护 dev server 不被杀
cd /home/z/my-project
while true; do
  echo "[$(date +%H:%M:%S)] starting dev server..."
  node node_modules/next/dist/bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[$(date +%H:%M:%S)] dev server exited with code $?, restarting in 3s..."
  sleep 3
done
