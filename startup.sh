#!/bin/bash
# Nasri Oracle — First Boot Startup
# Runs /awaken then /learn --deep oracle via Gemini CLI

echo "=== Nasri Oracle — First Boot ==="
echo "Starting Gemini CLI with /awaken + /learn --deep oracle..."

# Start gemini with awaken prompt, yolo mode for auto-bypass
gemini --yolo --prompt-interactive "/awaken"

echo "=== Nasri Oracle — Awakened ==="
