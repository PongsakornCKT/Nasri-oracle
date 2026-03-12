#!/bin/bash
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
cd /mnt/c/Users/pO-Ch/Nasri-oracle/maw-js

# Kill existing server
pkill -f "bun src/server.ts" 2>/dev/null
sleep 1

# Start fresh
nohup bun src/server.ts > /tmp/maw-server.log 2>&1 &
sleep 2

cat /tmp/maw-server.log
echo ""
curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://127.0.0.1:3456/office
