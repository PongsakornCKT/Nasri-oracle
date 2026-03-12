#!/bin/bash
# Start the Oracle household tmux session with all 5 agents
export PATH="$HOME/.local/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

ROOT="/mnt/c/Users/pO-Ch/Nasri-oracle"
SESSION="oracles"

# Kill existing session
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create session with explicit size (avoids "size missing")
tmux new-session -d -s "$SESSION" -x 200 -y 50 -c "$ROOT"

# Rename first window and create the rest
tmux rename-window -t "$SESSION:0" nasri
tmux new-window -t "$SESSION" -n pha -c "$ROOT"
tmux new-window -t "$SESSION" -n ra -c "$ROOT"
tmux new-window -t "$SESSION" -n ship -c "$ROOT"
tmux new-window -t "$SESSION" -n hai -c "$ROOT"

# Navigate each agent to its worktree
tmux send-keys -t "$SESSION:nasri" "cd $ROOT/agents/nasri" Enter
tmux send-keys -t "$SESSION:pha"   "cd $ROOT/agents/pha"   Enter
tmux send-keys -t "$SESSION:ra"    "cd $ROOT/agents/ra"    Enter
tmux send-keys -t "$SESSION:ship"  "cd $ROOT/agents/ship"  Enter
tmux send-keys -t "$SESSION:hai"   "cd $ROOT/agents/hai"   Enter

echo "--- Oracle Household ---"
tmux list-windows -t "$SESSION"
echo ""
echo "Attach with: tmux attach -t $SESSION"
