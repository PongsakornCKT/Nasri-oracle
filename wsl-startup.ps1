# ═══════════════════════════════════════════════════════════
#  Nasri Oracle — Windows Task Scheduler Setup
#  รัน PowerShell (Admin) แล้ว:
#    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
#    & 'D:\Project-Nasri\Nasri-oracle\wsl-startup.ps1'
# ═══════════════════════════════════════════════════════════

$taskName = "NasriOracle-WSL-Autostart"
$wslDistro = "Ubuntu"
$repoPath  = "/mnt/d/Project-Nasri/Nasri-oracle"

Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║  Nasri Oracle — Windows Autostart Setup  ║" -ForegroundColor Cyan
Write-Host "  ╚═══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Create startup script in WSL ──
$startScript = @"
#!/bin/bash
# Nasri Oracle — Windows Task Scheduler entry point
export HOME=/home/\$(whoami)
export PATH=\$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin
sleep 5  # Wait for WSL network to be ready
cd $repoPath
bash start-maw.sh >> /tmp/nasri-boot.log 2>&1
"@

# Write to WSL filesystem via wsl.exe
$startScript | wsl -d $wslDistro -- bash -c "cat > /usr/local/bin/nasri-wsl-boot && chmod +x /usr/local/bin/nasri-wsl-boot"
Write-Host "  ✓ WSL boot script created" -ForegroundColor Green

# ── 2. Set Windows power plan — never sleep ──
Write-Host ""
Write-Host "  Setting power plan to prevent sleep..." -ForegroundColor Yellow
try {
    # High Performance plan
    powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null
    # Prevent sleep on AC power (0 = never)
    powercfg /change standby-timeout-ac 0
    powercfg /change monitor-timeout-ac 60
    Write-Host "  ✓ Power plan: High Performance (never sleep on AC)" -ForegroundColor Green
} catch {
    Write-Host "  ! Power plan change failed — set manually in Control Panel" -ForegroundColor Yellow
}

# ── 3. Create Task Scheduler task ──
Write-Host ""
Write-Host "  Creating Task Scheduler task: $taskName" -ForegroundColor Yellow

# Remove existing task if present
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
    -Execute "wsl.exe" `
    -Argument "-d $wslDistro -- bash /usr/local/bin/nasri-wsl-boot"

# Trigger: At system startup (runs as SYSTEM, starts WSL early)
$triggerBoot = New-ScheduledTaskTrigger -AtStartup

# Also trigger at user logon (backup)
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false

# Run as current user (WSL needs user context)
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U `
    -RunLevel Highest

$task = New-ScheduledTask `
    -Action $action `
    -Trigger $triggerBoot `
    -Settings $settings `
    -Principal $principal `
    -Description "Auto-start Nasri Oracle agents in WSL2 on Windows boot"

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null

Write-Host "  ✓ Task Scheduler task created: $taskName" -ForegroundColor Green

# ── 4. Start WSL now (test run) ──
Write-Host ""
$answer = Read-Host "  Start Oracle now? [Y/n]"
if ($answer -eq "" -or $answer -eq "Y" -or $answer -eq "y") {
    Write-Host "  Starting WSL Oracle..." -ForegroundColor Cyan
    Start-Process "wsl.exe" -ArgumentList "-d $wslDistro -- bash /usr/local/bin/nasri-wsl-boot" -WindowStyle Hidden
    Start-Sleep -Seconds 8
    Write-Host "  ✓ Started in background" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Open browser: http://localhost:3456/office/" -ForegroundColor Cyan
    Write-Host "  Attach agents: wsl -d $wslDistro -- tmux attach -t ai-Nasri-oracle" -ForegroundColor Cyan
}

# ── Summary ──
Write-Host ""
Write-Host "  ═══ Setup Complete ═══" -ForegroundColor Green
Write-Host ""
Write-Host "  Task Scheduler: '$taskName'"
Write-Host "    → Runs automatically on every Windows startup"
Write-Host ""
Write-Host "  Power Plan: Never sleep on AC power"
Write-Host ""
Write-Host "  To check status:" -ForegroundColor Cyan
Write-Host "    wsl -d $wslDistro -- nasri-status"
Write-Host ""
Write-Host "  To view agents:" -ForegroundColor Cyan
Write-Host "    wsl -d $wslDistro -- tmux attach -t ai-Nasri-oracle"
Write-Host ""
