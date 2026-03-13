#!/bin/bash
set -euo pipefail

export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"

# Resolve script directory so the script works from any CWD
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/maw-js"

SESSION="ai-Nasri-oracle"

# Resolve Windows drive path — works in both Git Bash (/c/...) and WSL (/mnt/c/...)
BASE="$SCRIPT_DIR"

# Oracle env vars (convert to Windows path for bun/node compatibility)
if [[ "$BASE" == /mnt/c/* ]]; then
  export ORACLE_REPO_ROOT="C:${BASE#/mnt/c}"
else
  export ORACLE_REPO_ROOT="C:${BASE#/c}"
fi

# Preflight: bun must be available
command -v bun >/dev/null 2>&1 || { echo "ERROR: bun not found in PATH"; exit 1; }

# Bootstrap tmux session (idempotent — skipped if session already exists)
if ! tmux has-session -t "=$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION" -n nasri
  tmux new-window -t "$SESSION" -n pha
  tmux new-window -t "$SESSION" -n ra
  tmux new-window -t "$SESSION" -n ship
  tmux new-window -t "$SESSION" -n hai

  # Wait for all 5 windows to be ready
  for i in {1..10}; do
    count=$(tmux list-windows -t "$SESSION" 2>/dev/null | wc -l)
    [ "$count" -ge 5 ] && break
    sleep 0.5
  done

  tmux send-keys -t "$SESSION:nasri" "cd '$BASE' && claude --dangerously-skip-permissions" Enter
  tmux send-keys -t "$SESSION:pha"   "cd '$BASE' && claude --dangerously-skip-permissions" Enter
  tmux send-keys -t "$SESSION:ra"    "cd '$BASE' && claude --dangerously-skip-permissions" Enter
  tmux send-keys -t "$SESSION:ship"  "cd '$BASE' && claude --dangerously-skip-permissions" Enter
  tmux send-keys -t "$SESSION:hai"   "cd '$BASE' && claude --dangerously-skip-permissions" Enter

  echo "Session '$SESSION' created with 5 agent windows"
else
  echo "Session '$SESSION' already exists — skipping window creation"
fi

# Start maw server (idempotent — skip if port 3456 already in use)
if lsof -i :3456 >/dev/null 2>&1; then
  echo "maw server already running on :3456"
else
  nohup bun src/server.ts > /tmp/maw.log 2>&1 &
  echo $! > /tmp/maw.pid
  echo "maw server started (PID $(cat /tmp/maw.pid))"
fi

# Start oracle-v2 HTTP server (idempotent — skip if port 47778 already in use)
if lsof -i :47778 >/dev/null 2>&1; then
  echo "oracle-v2 server already running on :47778"
else
  cd "$BASE/oracle-v2"
  nohup bun src/server.ts > /tmp/oracle-v2.log 2>&1 &
  echo $! > /tmp/oracle-v2.pid
  echo "oracle-v2 server started (PID $(cat /tmp/oracle-v2.pid))"
  cd "$SCRIPT_DIR/maw-js"
fi

# Wait for server to be ready (retry up to 15s)
echo -n "Waiting for server..."
for i in {1..15}; do
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3456/office | grep -q "200"; then
    echo " ready"
    break
  fi
  echo -n "."
  sleep 1
done

echo "---"
tmux list-windows -t "$SESSION" 2>/dev/null || echo "(session not found)"
echo "---"
curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://127.0.0.1:3456/office
