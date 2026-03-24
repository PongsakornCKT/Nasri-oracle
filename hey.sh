#!/usr/bin/env bash
# hey.sh — Nasri Oracle universal agent messenger
# Usage: bash hey.sh <agent> "message"
# Works across all tmux sessions: secretary, engi, research

AGENT="$1"
shift
MESSAGE="$*"

if [ -z "$AGENT" ] || [ -z "$MESSAGE" ]; then
  echo "Usage: hey.sh <agent> <message>"
  echo ""
  echo "Agents:"
  echo "  secretary: pa-oracle, nasri-oracle"
  echo "  engi:      horus, imhotep, ptah, seshat, ra, thoth, anubis, bastet, isis, khnum, maat, nile, sekhmet, sobek"
  echo "  research:  zeus, athena, hermes"
  exit 1
fi

BUN="/home/po-ch/.bun/bin/bun"
MAW_DIR="/tmp/maw-js-server"
MAW_URL="http://localhost:4000"

# Try maw-js first if available
if curl -sf --max-time 1 "$MAW_URL/api/sessions" > /dev/null 2>&1; then
  export PATH="/home/po-ch/.bun/bin:$PATH"
  cd "$MAW_DIR" && $BUN src/cli.ts hey "$AGENT" "$MESSAGE" 2>&1
  exit $?
fi

# Fallback: direct tmux send-keys with session routing
declare -A SESSION_MAP=(
  ["pa-oracle"]="secretary"
  ["nasri-oracle"]="secretary"
  ["horus"]="engi"
  ["imhotep"]="engi"
  ["ptah"]="engi"
  ["seshat"]="engi"
  ["ra"]="engi"
  ["thoth"]="engi"
  ["anubis"]="engi"
  ["bastet"]="engi"
  ["isis"]="engi"
  ["khnum"]="engi"
  ["maat"]="engi"
  ["nile"]="engi"
  ["sekhmet"]="engi"
  ["sobek"]="engi"
  ["zeus"]="research"
  ["athena"]="research"
  ["hermes"]="research"
)

SESSION="${SESSION_MAP[$AGENT]}"
if [ -z "$SESSION" ]; then
  # Try searching all sessions
  TARGET=$(tmux list-windows -a 2>/dev/null | grep ": $AGENT" | head -1 | cut -d: -f1-2)
  if [ -z "$TARGET" ]; then
    echo "[ERR] Agent '$AGENT' not found in any tmux session"
    exit 1
  fi
  echo "[found] $TARGET"
  tmux send-keys -t "$TARGET" "$MESSAGE" Enter
else
  tmux send-keys -t "${SESSION}:${AGENT}" "$MESSAGE" Enter
  echo "[sent] → ${SESSION}:${AGENT}"
fi
