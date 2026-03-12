#!/bin/bash
# Start the Oracle household tmux session — auto-launches AI in each window
# Reads agent config from .agents/agents.yaml
export PATH="$HOME/.local/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

ROOT="/mnt/c/Users/pO-Ch/Nasri-oracle"
YAML="$ROOT/.agents/agents.yaml"
SESSION="ai-Nasri-oracle"

# Kill existing session
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Read agent names into array
mapfile -t AGENTS < <(yq '.agents | keys | .[]' "$YAML")

# Create session with first agent
first="${AGENTS[0]}"
first_wt=$(yq ".agents.${first}.worktree_path" "$YAML")
tmux new-session -d -s "$SESSION" -x 200 -y 50 -c "$ROOT/$first_wt"

# Create remaining windows
for agent in "${AGENTS[@]:1}"; do
    wt=$(yq ".agents.${agent}.worktree_path" "$YAML")
    tmux new-window -t "$SESSION" -c "$ROOT/$wt"
done

# Let shells start
sleep 1

# Get actual window indices
mapfile -t WIN_INDICES < <(tmux list-windows -t "$SESSION" -F "#{window_index}")

# Rename windows and launch AI — match by position
for i in "${!AGENTS[@]}"; do
    agent="${AGENTS[$i]}"
    widx="${WIN_INDICES[$i]}"
    ai_cmd=$(yq ".agents.${agent}.ai_cmd // \"\"" "$YAML")

    # Disable auto-rename and set name
    tmux set-window-option -t "$SESSION:${widx}" automatic-rename off
    tmux rename-window -t "$SESSION:${widx}" "$agent"

    # Launch AI
    if [ -n "$ai_cmd" ]; then
        tmux send-keys -t "$SESSION:${widx}" "$ai_cmd" Enter
    fi
done

echo "--- Oracle Household ---"
tmux list-windows -t "$SESSION"
echo ""
echo "Attach with: tmux attach -t $SESSION"
