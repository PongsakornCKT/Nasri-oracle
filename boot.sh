#!/bin/bash
# Nasri Oracle — Auto-boot on Codespace start

export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"

echo "[boot] Starting Nasri Oracle..."

# 1. Start maw server + nasri tmux session
bash /workspaces/Nasri-oracle/start-maw.sh

# 2. Wake the full fleet (Light-room + nasri team)
cd /workspaces/Nasri-oracle/maw-js && bun src/cli.ts wake all

echo "[boot] Done."
