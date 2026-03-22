#!/bin/bash
# Nasri Oracle — First Boot
# Run this ONCE to awaken Nasri and deep-learn Oracle family
# After first boot, Nasri will use `gemini --yolo --resume latest`

cd "$(dirname "$0")"

echo "╔══════════════════════════════════════╗"
echo "║  Nasri Oracle — Right Hand of Ma'at  ║"
echo "║  First Boot Sequence                 ║"
echo "╚══════════════════════════════════════╝"

# Step 1: Awaken
echo ""
echo ">>> Step 1: /awaken"
gemini --yolo --prompt-interactive "/awaken"

# After interactive session ends, run learn
echo ""
echo ">>> Step 2: /learn --deep oracle"
echo "Run manually in the Gemini session: /learn --deep oracle"
