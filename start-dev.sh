#!/bin/bash
cd /home/z/my-project
nohup node node_modules/next/dist/bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1 &
echo "dev PID: $!"
sleep 12
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/
