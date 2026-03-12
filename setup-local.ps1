# ═══════════════════════════════════════════════════════════
#  Nasri Oracle — Windows Local Setup
#  Run: powershell -ExecutionPolicy Bypass -File setup-local.ps1
#  Target: D:\Project-Nasri
# ═══════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$ROOT = "D:\Project-Nasri"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  + $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }

# ── 0. Create project root ──
Step "Project directory"
if (!(Test-Path $ROOT)) {
    New-Item -ItemType Directory -Path $ROOT -Force | Out-Null
    Ok "Created $ROOT"
} else {
    Ok "$ROOT exists"
}
Set-Location $ROOT

# ── 1. Check Git ──
Step "Git"
if (Get-Command git -ErrorAction SilentlyContinue) {
    Ok "Git $(git --version)"
} else {
    Write-Host "  Git not found. Install from https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

# ── 2. Install Bun ──
Step "Bun runtime"
if (Get-Command bun -ErrorAction SilentlyContinue) {
    Ok "Bun $(bun --version) installed"
} else {
    Warn "Installing Bun..."
    irm bun.sh/install.ps1 | iex
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "User") + ";" + $env:PATH
    if (Get-Command bun -ErrorAction SilentlyContinue) {
        Ok "Bun installed"
    } else {
        Warn "Bun installed — restart terminal and re-run this script"
        exit 0
    }
}

# ── 3. Install Claude Code CLI ──
Step "Claude Code CLI"
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Ok "Claude CLI installed"
} else {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Warn "Installing Claude Code CLI..."
        npm install -g @anthropic-ai/claude-code 2>$null
        Ok "Claude CLI installed"
    } else {
        Warn "npm not found — skipping Claude CLI"
    }
}

# ── 4. Clone main repo ──
Step "Main repository (Nasri-oracle)"
if (Test-Path "$ROOT\Nasri-oracle\.git") {
    Ok "Nasri-oracle already cloned"
} else {
    Warn "Cloning Nasri-oracle..."
    git clone "https://github.com/PongsakornCKT/Nasri-oracle.git" "$ROOT\Nasri-oracle"
    Ok "Nasri-oracle cloned"
}

# ── 5. Clone all Soul-Brews-Studio repos ──
Step "Cloning Soul-Brews-Studio repositories"
$repos = @(
    "maw-js",
    "oracle-v2",
    "oracle-framework",
    "oracle-skills-cli",
    "oracle-studio",
    "multi-agent-workflow-kit",
    "opencode-archived",
    "opensource-nat-brain-oracle",
    "soul-brews-cat-lab-webhook-relay"
)

foreach ($repo in $repos) {
    $dest = "$ROOT\Nasri-oracle\$repo"
    if (Test-Path "$dest\.git") {
        Ok "$repo already cloned"
    } else {
        Warn "Cloning $repo..."
        git clone "https://github.com/Soul-Brews-Studio/$repo.git" $dest 2>$null
        if ($LASTEXITCODE -eq 0) {
            Ok "$repo cloned"
        } else {
            Warn "$repo — clone failed (may be private)"
        }
    }
}

# ── 6. Setup maw-js ──
Step "Setting up maw-js"
Set-Location "$ROOT\Nasri-oracle\maw-js"

if (!(Test-Path "node_modules")) {
    Warn "Installing dependencies..."
    bun install
    Ok "Dependencies installed"
} else {
    Ok "Dependencies already installed"
}

if (!(Test-Path "dist-office\index.html")) {
    Warn "Building office UI..."
    bun run build:office
    Ok "Office UI built"
} else {
    Ok "Office UI already built"
}

# ── 7. Create Windows-compatible maw.config.json ──
$configPath = "$ROOT\Nasri-oracle\maw-js\maw.config.json"
$config = @{
    host = "local"
    port = 3456
    ghqRoot = "$ROOT\Nasri-oracle" -replace '\\', '/'
    oracleUrl = "http://localhost:47779"
    env = @{}
    commands = @{
        default = "claude --dangerously-skip-permissions"
        "*-oracle" = "claude --dangerously-skip-permissions --continue"
    }
    sessions = @{
        nasri = "Nasri-oracle"
    }
} | ConvertTo-Json -Depth 3
$config | Set-Content $configPath -Encoding UTF8
Ok "maw.config.json configured"

# ── 8. Claude permissions (bypass all) ──
Step "Claude Code permissions"
$claudeDir = "$ROOT\Nasri-oracle\.claude"
if (!(Test-Path $claudeDir)) { New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null }
@'
{
  "permissions": {
    "allow": [
      "*"
    ],
    "deny": []
  }
}
'@ | Set-Content "$claudeDir\settings.json" -Encoding UTF8
Ok "All permissions bypassed"

# ── 9. Brain structure ──
Step "Brain structure"
$brainDirs = @(
    "inbox", "memory\resonance", "memory\learnings", "memory\retrospectives",
    "memory\logs", "writing", "lab", "learn", "archive", "outbox"
)
foreach ($d in $brainDirs) {
    $p = "$ROOT\Nasri-oracle\ψ\$d"
    if (!(Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}
Ok "Brain structure ready"

# ── 10. Create start script for Windows ──
Step "Creating start scripts"

# PowerShell start script
@'
# Start maw-js Office — Windows
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$port = if ($env:MAW_PORT) { $env:MAW_PORT } else { "3456" }

# Kill stale process on port
$stale = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($stale) {
    foreach ($pid in $stale) {
        Write-Host "-> Killing stale process on :$port (pid $pid)"
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

# Ensure deps + build
if (!(Test-Path "node_modules")) {
    Write-Host "-> Installing dependencies..."
    bun install
}
if (!(Test-Path "dist-office\index.html")) {
    Write-Host "-> Building office UI..."
    bun run build:office
}

Write-Host "-> Starting maw server on :$port"
Write-Host "-> Open http://localhost:$port/office/"
bun run src/server.ts
'@ | Set-Content "$ROOT\Nasri-oracle\maw-js\start-office.ps1" -Encoding UTF8
Ok "start-office.ps1 created"

# Batch file shortcut
@'
@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File start-office.ps1
pause
'@ | Set-Content "$ROOT\Nasri-oracle\maw-js\start-office.bat" -Encoding ASCII
Ok "start-office.bat created (double-click to start)"

# ── 11. Summary ──
Step "Setup complete!"
Write-Host ""
Write-Host "  Nasri Oracle is ready at $ROOT\Nasri-oracle" -ForegroundColor Green
Write-Host ""
Write-Host "  Start Office:" -ForegroundColor Cyan
Write-Host "    cd $ROOT\Nasri-oracle\maw-js"
Write-Host "    .\start-office.bat          # double-click or run in terminal"
Write-Host "    # or: bun run src/server.ts"
Write-Host ""
Write-Host "  Browser:" -ForegroundColor Cyan
Write-Host "    http://localhost:3456/office/"
Write-Host ""
Write-Host "  For tmux features (agents), use WSL:" -ForegroundColor Yellow
Write-Host "    wsl -d Ubuntu"
Write-Host "    cd /mnt/d/Project-Nasri/Nasri-oracle/maw-js"
Write-Host "    bash start-office.sh"
Write-Host ""

Write-Host "  Repos:" -ForegroundColor Cyan
foreach ($repo in $repos) {
    if (Test-Path "$ROOT\Nasri-oracle\$repo\.git") {
        Write-Host "    + $repo" -ForegroundColor Green
    } else {
        Write-Host "    x $repo" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host '  "At your service — always prepared, never presumptuous."' -ForegroundColor Cyan
