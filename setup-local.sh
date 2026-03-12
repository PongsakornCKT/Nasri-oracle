#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  Nasri Oracle — Local Setup
#  Works on: Linux, macOS, WSL (Windows D:\Project-Nasri)
#
#  Fresh install:
#    mkdir -p /mnt/d/Project-Nasri && cd /mnt/d/Project-Nasri
#    git clone https://github.com/PongsakornCKT/Nasri-oracle.git
#    cd Nasri-oracle && bash setup-local.sh
#
#  Or from existing clone:
#    bash setup-local.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_ROOT"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${CYAN}═══ $1 ═══${NC}"; }
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ! $1${NC}"; }

# ── 0. Platform detection ──
step "Detecting platform"
OS="$(uname -s)"
ARCH="$(uname -m)"
IS_WSL=false
if grep -qi microsoft /proc/version 2>/dev/null; then
  IS_WSL=true
fi
echo "  OS: $OS | Arch: $ARCH | WSL: $IS_WSL"
echo "  Root: $REPO_ROOT"

# ── 1. Install system dependencies ──
step "System dependencies"

install_if_missing() {
  local cmd="$1" pkg="${2:-$1}"
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd already installed"
  else
    warn "Installing $pkg..."
    if [ "$OS" = "Linux" ]; then
      if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y -qq "$pkg"
      elif command -v dnf &>/dev/null; then
        sudo dnf install -y "$pkg"
      elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm "$pkg"
      fi
    elif [ "$OS" = "Darwin" ]; then
      if command -v brew &>/dev/null; then
        brew install "$pkg"
      else
        echo "  Please install Homebrew first: https://brew.sh"
        exit 1
      fi
    fi
    ok "$cmd installed"
  fi
}

install_if_missing git git
install_if_missing tmux tmux
install_if_missing curl curl
install_if_missing jq jq
install_if_missing lsof lsof

# ── 2. Install Bun ──
step "Bun runtime"
export PATH="$HOME/.bun/bin:$PATH"
if command -v bun &>/dev/null; then
  ok "Bun $(bun --version) already installed"
else
  warn "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  ok "Bun $(bun --version) installed"
fi

# ── 3. Install Node.js + Claude Code CLI (optional) ──
step "Claude Code CLI"
if command -v claude &>/dev/null; then
  ok "Claude CLI already installed"
else
  # Ensure Node.js is available
  if ! command -v node &>/dev/null; then
    warn "Installing Node.js via nvm..."
    if ! command -v nvm &>/dev/null; then
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    fi
    nvm install --lts 2>/dev/null || warn "nvm install failed — skip"
  fi
  if command -v npm &>/dev/null; then
    warn "Installing Claude Code CLI..."
    npm install -g @anthropic-ai/claude-code 2>/dev/null || warn "Claude CLI install failed (optional — skip)"
  else
    warn "npm not found — skipping Claude CLI"
  fi
fi

# ── 4. Clone all Soul-Brews-Studio repos ──
step "Cloning repositories"

REPOS=(
  "maw-js"
  "oracle-v2"
  "oracle-framework"
  "oracle-skills-cli"
  "oracle-studio"
  "multi-agent-workflow-kit"
  "opencode-archived"
  "opensource-nat-brain-oracle"
  "soul-brews-cat-lab-webhook-relay"
)

for repo in "${REPOS[@]}"; do
  if [ -d "$REPO_ROOT/$repo/.git" ]; then
    ok "$repo already cloned"
  else
    warn "Cloning $repo..."
    git clone "https://github.com/Soul-Brews-Studio/$repo.git" "$REPO_ROOT/$repo" 2>/dev/null || {
      warn "$repo — clone failed (may be private or removed)"
      continue
    }
    ok "$repo cloned"
  fi
done

# ── 5. Install maw-js dependencies + build office ──
step "Setting up maw-js"
cd "$REPO_ROOT/maw-js"

if [ ! -d node_modules ]; then
  echo "  Installing dependencies..."
  bun install
  ok "Dependencies installed"
else
  ok "Dependencies already installed"
fi

if [ ! -f dist-office/index.html ]; then
  echo "  Building office UI..."
  bun run build:office
  ok "Office UI built"
else
  ok "Office UI already built"
fi

# ── 6. Create local maw.config.json ──
PARENT="$(dirname "$REPO_ROOT")"
cat > maw.config.json << CONF
{
  "host": "local",
  "port": 3456,
  "ghqRoot": "$PARENT",
  "oracleUrl": "http://localhost:47779",
  "env": {},
  "commands": {
    "default": "claude --dangerously-skip-permissions",
    "*-oracle": "claude --dangerously-skip-permissions --continue"
  },
  "sessions": {
    "nasri": "Nasri-oracle"
  }
}
CONF
ok "maw.config.json configured (ghqRoot: $PARENT)"

cd "$REPO_ROOT"

# ── 7. Setup Claude permissions (bypass all) ──
step "Claude Code permissions"
mkdir -p "$REPO_ROOT/.claude"
cat > "$REPO_ROOT/.claude/settings.json" << 'PERM'
{
  "permissions": {
    "allow": [
      "*"
    ],
    "deny": []
  }
}
PERM
ok "All permissions bypassed"

# ── 8. Ensure ψ/ brain structure exists ──
step "Brain structure (ψ/)"
DIRS=(inbox memory/resonance memory/learnings memory/retrospectives memory/logs writing lab learn archive outbox)
for d in "${DIRS[@]}"; do
  mkdir -p "$REPO_ROOT/ψ/$d"
done
ok "ψ/ structure ready"

# ── 9. Summary ──
step "Setup complete!"
echo ""
echo -e "  ${GREEN}Nasri Oracle is ready to serve locally.${NC}"
echo ""
echo "  Quick commands:"
echo "    cd $REPO_ROOT/maw-js"
echo "    bash start-office.sh        # Start office on :3456"
echo ""
echo "  Open in browser:"
echo "    http://localhost:3456/office/"
echo ""
if $IS_WSL; then
  echo -e "  ${CYAN}WSL detected — browser on Windows can access http://localhost:3456/office/${NC}"
  echo ""
fi
echo "  Repos cloned:"
for repo in "${REPOS[@]}"; do
  if [ -d "$REPO_ROOT/$repo/.git" ]; then
    echo -e "    ${GREEN}✓${NC} $repo"
  else
    echo -e "    ${YELLOW}✗${NC} $repo (not available)"
  fi
done
echo ""
echo -e "  ${CYAN}\"At your service — always prepared, never presumptuous.\"${NC}"
