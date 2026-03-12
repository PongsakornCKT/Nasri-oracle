#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  Nasri Oracle — WSL One-Liner Bootstrap
#  Paste this into WSL terminal:
#    curl -fsSL https://raw.githubusercontent.com/PongsakornCKT/Nasri-oracle/main/wsl-bootstrap.sh | bash
#  Or run directly:
#    bash wsl-bootstrap.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

TARGET="/mnt/d/Project-Nasri"
REPO="$TARGET/Nasri-oracle"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   Nasri Oracle — WSL Bootstrap        ║"
echo "  ║   Target: D:\\Project-Nasri            ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Ensure D:\Project-Nasri exists ──
if [ ! -d "$TARGET" ]; then
  echo -e "${YELLOW}  Creating $TARGET ...${NC}"
  mkdir -p "$TARGET"
fi

# ── 2. Clone main repo ──
if [ -d "$REPO/.git" ]; then
  echo -e "${GREEN}  ✓ Nasri-oracle already cloned${NC}"
  cd "$REPO"
  git pull --ff-only 2>/dev/null || true
else
  echo -e "${YELLOW}  Cloning Nasri-oracle...${NC}"
  git clone https://github.com/PongsakornCKT/Nasri-oracle.git "$REPO"
  cd "$REPO"
fi

# ── 3. Run full setup ──
echo ""
echo -e "${CYAN}  Running setup-local.sh ...${NC}"
echo ""
bash setup-local.sh

# ── 4. Start office ──
echo ""
echo -e "${CYAN}  Starting Office...${NC}"
cd "$REPO/maw-js"
export PATH="$HOME/.bun/bin:$PATH"
bash start-office.sh
