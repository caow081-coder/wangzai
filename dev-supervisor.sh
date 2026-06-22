#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date +%H:%M:%S)] starting dev..."
  node node_modules/next/dist/bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[$(date +%H:%M:%S)] dev exited, restart in 3s..."
  sleep 3
done
