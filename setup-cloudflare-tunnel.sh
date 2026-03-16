#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  Nasri Oracle — Cloudflare Tunnel Setup
#  เชื่อม pa.enervia.co.th → localhost:3456
#
#  Pre-requisite: ต้องมี Cloudflare Tunnel token ก่อน
#  (สร้างที่ dash.cloudflare.com → Zero Trust → Networks → Tunnels)
#
#  Usage:
#    bash setup-cloudflare-tunnel.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

step() { echo -e "\n${CYAN}═══ $1 ═══${NC}"; }
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ! $1${NC}"; }
err()  { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║  Nasri Oracle — Cloudflare Tunnel Setup      ║"
echo "  ║  pa.enervia.co.th → localhost:3456           ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. ขอ Cloudflare Tunnel Token ──
step "Cloudflare Tunnel Token"
echo ""
echo -e "  ${BOLD}ทำตามขั้นตอนนี้ก่อน:${NC}"
echo ""
echo "  1. เปิด https://dash.cloudflare.com"
echo "  2. เลือก Account → Zero Trust"
echo "  3. Networks → Tunnels → Create a tunnel"
echo "  4. ตั้งชื่อ: nasri-oracle-pa"
echo "  5. เลือก Cloudflared → Copy token (ขึ้นต้น eyJ...)"
echo "  6. Public Hostname:"
echo "     - Subdomain: pa"
echo "     - Domain: enervia.co.th"
echo "     - Service: HTTP → http://localhost:3456"
echo "  7. Save tunnel"
echo ""

# ── 2. รับ token จาก user ──
if [ -f /etc/cloudflared/tunnel-token ]; then
  EXISTING_TOKEN=$(cat /etc/cloudflared/tunnel-token)
  echo -e "  ${YELLOW}Token ที่บันทึกไว้:${NC} ${EXISTING_TOKEN:0:20}..."
  read -p "  ใช้ token เดิม? [Y/n] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    CF_TOKEN="$EXISTING_TOKEN"
  else
    read -p "  วาง Cloudflare Tunnel Token: " CF_TOKEN
  fi
else
  echo -ne "  วาง Cloudflare Tunnel Token: "
  read CF_TOKEN
fi

if [ -z "$CF_TOKEN" ]; then
  err "Token ว่าง — กรุณาสร้าง tunnel ใน Cloudflare ก่อน"
fi

# ── 3. ติดตั้ง cloudflared ──
step "Installing cloudflared"

if command -v cloudflared &>/dev/null; then
  ok "cloudflared $(cloudflared --version 2>&1 | head -1) already installed"
else
  warn "Installing cloudflared..."

  # Add Cloudflare GPG key and repo
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | \
    sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null

  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared focal main' | \
    sudo tee /etc/apt/sources.list.d/cloudflared.list

  sudo apt-get update -qq
  sudo apt-get install -y cloudflared

  ok "cloudflared $(cloudflared --version 2>&1 | head -1) installed"
fi

# ── 4. บันทึก token ──
step "Saving tunnel token"

sudo mkdir -p /etc/cloudflared
echo "$CF_TOKEN" | sudo tee /etc/cloudflared/tunnel-token > /dev/null
sudo chmod 600 /etc/cloudflared/tunnel-token
ok "Token saved to /etc/cloudflared/tunnel-token"

# ── 5. สร้าง cloudflared config ──
step "Creating cloudflared config"

sudo tee /etc/cloudflared/config.yml > /dev/null << 'EOF'
# Cloudflare Tunnel config — Nasri Oracle
# pa.enervia.co.th → localhost:3456
tunnel: auto
credentials-file: /etc/cloudflared/.credentials.json

ingress:
  - hostname: pa.enervia.co.th
    service: http://localhost:3456
  - service: http_status:404
EOF
ok "Config saved to /etc/cloudflared/config.yml"

# ── 6. สร้าง systemd service สำหรับ cloudflared ──
step "Creating cloudflared systemd service"

sudo tee /etc/systemd/system/cloudflared.service > /dev/null << EOF
[Unit]
Description=Cloudflare Tunnel — pa.enervia.co.th
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate run --token $(cat /etc/cloudflared/tunnel-token)
Restart=always
RestartSec=10
StandardOutput=append:/tmp/cloudflared.log
StandardError=append:/tmp/cloudflared.log

[Install]
WantedBy=multi-user.target
EOF
ok "cloudflared.service created"

# ── 7. Enable & start ──
step "Enabling cloudflared service"

if systemctl is-system-running &>/dev/null; then
  sudo systemctl daemon-reload
  sudo systemctl enable cloudflared.service

  echo ""
  read -p "  Start cloudflared now? [Y/n] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    sudo systemctl start cloudflared.service
    sleep 3

    if systemctl is-active cloudflared.service &>/dev/null; then
      ok "cloudflared running"
    else
      warn "cloudflared failed to start — check logs:"
      echo "    sudo journalctl -u cloudflared -n 30"
      echo "    cat /tmp/cloudflared.log"
    fi
  fi
else
  warn "systemd not running yet — enable systemd first:"
  warn "  bash setup-autostart.sh"
fi

# ── 8. Test tunnel ──
step "Testing tunnel"
echo ""
sleep 2

if curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/office | grep -q "200"; then
  ok "MAW server responding on localhost:3456"
else
  warn "MAW server not responding on :3456"
  warn "Run: bash start-maw.sh"
fi

echo ""
echo -e "  ${YELLOW}Checking pa.enervia.co.th (allow 30s for tunnel to stabilize)...${NC}"
sleep 10
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://pa.enervia.co.th 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  ok "pa.enervia.co.th is LIVE!"
else
  warn "pa.enervia.co.th returned HTTP $HTTP_CODE"
  warn "Tunnel may need 1-2 min to stabilize — check Cloudflare dashboard"
fi

# ── Summary ──
step "Complete!"
echo ""
echo -e "  ${GREEN}${BOLD}Oracle ออนไลน์:${NC}"
echo ""
echo -e "  ${CYAN}https://pa.enervia.co.th${NC}  ← Office UI (ใช้จากทุกที่)"
echo -e "  ${CYAN}http://localhost:3456/office/${NC}  ← Local access"
echo ""
echo -e "  ${GREEN}Commands:${NC}"
echo "    nasri-status              # ดู status ทุก service"
echo "    sudo systemctl status cloudflared"
echo "    cat /tmp/cloudflared.log  # logs tunnel"
echo ""
echo -e "  ${GREEN}Auto-start:${NC}"
echo "    cloudflared เปิดทุกครั้งที่ WSL2 boot"
echo ""
