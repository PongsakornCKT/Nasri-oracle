#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  Nasri Oracle — WSL2 24/7 Autostart Setup
#  รัน script นี้ใน WSL Ubuntu ครั้งเดียว
#
#  Usage:
#    bash /mnt/d/Project-Nasri/Nasri-oracle/setup-autostart.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

REPO="/mnt/d/Project-Nasri/Nasri-oracle"
USER_NAME="$(whoami)"
BUN_PATH="$HOME/.bun/bin/bun"

step() { echo -e "\n${CYAN}═══ $1 ═══${NC}"; }
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ! $1${NC}"; }
err()  { echo -e "${RED}  ✗ $1${NC}"; }

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║   Nasri Oracle — 24/7 Autostart Setup    ║"
echo "  ╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# ── 0. Preflight checks ──
step "Preflight checks"

if [ ! -d "$REPO" ]; then
  err "Repo not found at $REPO"
  echo "  Please run wsl-bootstrap.sh first:"
  echo "    bash wsl-bootstrap.sh"
  exit 1
fi
ok "Repo found: $REPO"

if [ ! -f "$BUN_PATH" ]; then
  err "bun not found at $BUN_PATH"
  echo "  Please run setup-local.sh first"
  exit 1
fi
ok "bun found: $BUN_PATH"

# ── 1. Enable systemd in WSL2 ──
step "Enable systemd in WSL2"

WSL_CONF="/etc/wsl.conf"
if grep -q "systemd=true" "$WSL_CONF" 2>/dev/null; then
  ok "systemd already enabled in $WSL_CONF"
else
  warn "Enabling systemd in $WSL_CONF (requires sudo)..."
  sudo tee -a "$WSL_CONF" > /dev/null << 'EOF'

[boot]
systemd=true
EOF
  ok "systemd enabled — WSL2 will use systemd on next restart"
  echo ""
  echo -e "  ${YELLOW}NOTE: You need to restart WSL2 after this script for systemd to activate:${NC}"
  echo -e "  ${YELLOW}  In PowerShell (admin): wsl --shutdown${NC}"
  echo -e "  ${YELLOW}  Then reopen Ubuntu terminal${NC}"
fi

# ── 2. Create systemd service — maw server ──
step "Creating nasri-maw.service"

sudo tee /etc/systemd/system/nasri-maw.service > /dev/null << EOF
[Unit]
Description=Nasri MAW Server (port 3456)
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$REPO/maw-js
ExecStart=$BUN_PATH src/server.ts
Restart=always
RestartSec=5
StandardOutput=append:/tmp/maw.log
StandardError=append:/tmp/maw.log
Environment=PATH=$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=$HOME

[Install]
WantedBy=multi-user.target
EOF
ok "nasri-maw.service created"

# ── 3. Create systemd service — oracle-v2 ──
step "Creating nasri-oracle-v2.service"

sudo tee /etc/systemd/system/nasri-oracle-v2.service > /dev/null << EOF
[Unit]
Description=Nasri Oracle-V2 Server (port 47778)
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$REPO/oracle-v2
ExecStart=$BUN_PATH src/server.ts
Restart=always
RestartSec=5
StandardOutput=append:/tmp/oracle-v2.log
StandardError=append:/tmp/oracle-v2.log
Environment=PATH=$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=$HOME

[Install]
WantedBy=multi-user.target
EOF
ok "nasri-oracle-v2.service created"

# ── 4. Create systemd service — agents tmux session ──
step "Creating nasri-agents.service"

sudo tee /etc/systemd/system/nasri-agents.service > /dev/null << EOF
[Unit]
Description=Nasri Agent tmux Session (5 agents)
After=nasri-maw.service nasri-oracle-v2.service
Requires=nasri-maw.service

[Service]
Type=forking
User=$USER_NAME
ExecStart=/bin/bash -c 'tmux new-session -d -s ai-Nasri-oracle -n nasri 2>/dev/null || true'
ExecStartPost=/bin/bash -c 'sleep 2 && bash $REPO/start-maw.sh'
RemainAfterExit=yes
StandardOutput=append:/tmp/nasri-agents.log
StandardError=append:/tmp/nasri-agents.log
Environment=HOME=$HOME
Environment=PATH=$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF
ok "nasri-agents.service created"

# ── 5. Create wsl-boot command (runs on WSL startup without systemd dependency) ──
step "Creating /usr/local/bin/nasri-start"

sudo tee /usr/local/bin/nasri-start > /dev/null << EOF
#!/bin/bash
# Quick command to start Nasri Oracle manually
cd $REPO
bash start-maw.sh
echo ""
echo "Oracle household started. Attach with:"
echo "  tmux attach -t ai-Nasri-oracle"
EOF
sudo chmod +x /usr/local/bin/nasri-start
ok "nasri-start command created"

sudo tee /usr/local/bin/nasri-status > /dev/null << EOF
#!/bin/bash
echo "=== Nasri Oracle Status ==="
echo ""
echo "Services:"
systemctl is-active nasri-maw.service 2>/dev/null && echo "  ✓ maw server (3456)" || echo "  ✗ maw server (3456)"
systemctl is-active nasri-oracle-v2.service 2>/dev/null && echo "  ✓ oracle-v2 (47778)" || echo "  ✗ oracle-v2 (47778)"
echo ""
echo "Ports:"
lsof -i :3456 2>/dev/null | grep LISTEN && echo "" || echo "  3456 — not listening"
lsof -i :47778 2>/dev/null | grep LISTEN && echo "" || echo "  47778 — not listening"
echo ""
echo "tmux sessions:"
tmux list-sessions 2>/dev/null || echo "  (none)"
echo ""
echo "Agent windows:"
tmux list-windows -t ai-Nasri-oracle 2>/dev/null || echo "  (session not found)"
EOF
sudo chmod +x /usr/local/bin/nasri-status
ok "nasri-status command created"

# ── 6. Enable & start services ──
step "Enabling services"

# Check if systemd is actually running (might need restart first)
if systemctl is-system-running &>/dev/null; then
  sudo systemctl daemon-reload
  sudo systemctl enable nasri-maw.service
  sudo systemctl enable nasri-oracle-v2.service
  sudo systemctl enable nasri-agents.service
  ok "Services enabled (will auto-start on next WSL boot)"

  echo ""
  read -p "  Start services now? [Y/n] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    sudo systemctl start nasri-maw.service
    sudo systemctl start nasri-oracle-v2.service
    sleep 3
    sudo systemctl start nasri-agents.service
    ok "All services started"
  fi
else
  warn "systemd not yet running — services registered but not started"
  warn "Restart WSL2 first: In PowerShell → wsl --shutdown"
  warn "Then services will auto-start on next WSL boot"
fi

# ── 7. Summary ──
step "Setup Complete!"
echo ""
echo -e "  ${GREEN}Commands available:${NC}"
echo "    nasri-start     # Start Oracle manually"
echo "    nasri-status    # Check status of all services"
echo ""
echo -e "  ${GREEN}Office UI:${NC}"
echo "    http://localhost:3456/office/"
echo ""
echo -e "  ${GREEN}Attach to agents:${NC}"
echo "    tmux attach -t ai-Nasri-oracle"
echo ""
echo -e "  ${CYAN}Next step 1 → Cloudflare Tunnel (pa.enervia.co.th):${NC}"
echo "    bash $REPO/setup-cloudflare-tunnel.sh"
echo ""
echo -e "  ${CYAN}Next step 2 → Windows autostart:${NC}"
echo "    Run in PowerShell (as Admin):"
echo "    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser"
echo "    & '$REPO/wsl-startup.ps1'"
echo ""
