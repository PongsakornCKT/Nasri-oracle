# Session Retrospective — 2026-03-13 (VS View Fix + Maw Hardening)

## What happened

Three threads this session:

**1. pharaAI Orchestrator identity**
Pong provided `nasri-prompt-v2-en.md` (Thai version) — the operating spec for Nasri as pharaAI Orchestrator, routing to Enervia (solar), Dana (marketing), SK Grand (real estate). Needed 4 attempts before Nasri understood "remember and DO it" means adopt the behavior, not just file it. Spec saved to `ψ/memory/resonance/nasri-prompt-v2.md`.

**2. VS view not responding (`#vs`)**
Pong reported Nasri not answering in the office VS view. Root cause: nasri agent was stuck at a permission approval dialog (`cd + git` requires approval). Fix requested: `--dangerously-skip-permissions` for all sessions permanently.

Implementation:
- Created `maw-js/maw.config.json` (missing, falling back to `commands.default = "claude"`)
- Updated `start-maw.sh` with correct paths + flag
- Restarted all 5 windows (nasri, pha, ra, ship, hai) via API send + /exit

**3. Engineering review → maw hardening**
Ran 3 parallel engineering reviewers (senior dev, backend architect, code reviewer). Found 12 issues. Fixed all:
- **Critical**: `/mnt/c/` paths don't exist → changed to `/c/`
- **Major**: `set -euo pipefail` missing, `$BASE` unquoted, no bun preflight, server not idempotent
- **Medium**: `sessions` map had only nasri (pha/ra/ship/hai unroutable), dead `*-oracle` glob, `sleep` fragility
- **Minor**: `start-maw.sh` untracked by git → removed from `.gitignore`

Also fixed `launch-agents.sh` (old `/mnt/d/` paths, old session name).

## What was learned

- **`/c/` not `/mnt/c/`**: This WSL setup mounts Windows drives at `/c/`, not the standard `/mnt/c/`. Always verify mount point before writing any WSL paths.
- **Multi-reviewer pattern works**: 3 parallel agent reviewers caught issues faster and more thoroughly than sequential review. Each lens (senior dev, architect, code reviewer) found different things.
- **maw.config.json was missing**: The server was running on defaults (`claude` without any flags) because no config file existed. `buildCommand()` silently falls back to DEFAULTS if no config file present.
- **Permission dialogs block VS view input**: When Claude Code shows an interactive approval dialog, all keystrokes from VS view go to the dialog. `--dangerously-skip-permissions` is the correct fix for automated/agent contexts.

## What surprised

- The `maw.config.json` had never been created — the whole system was running on defaults silently.
- `/mnt/c` is the standard WSL mount but this machine uses `/c/` (custom `wsl.conf` setting or different WSL version). Easy to miss.
- `start-maw.sh` was excluded from git tracking (under "Shell scripts — operational, not project code") — the operational reality was invisible in git history.
- The example config (`maw.config.example.json`) uses `--continue` but the live config intentionally omits it (fresh sessions preferred).

## What's next

- **Test the fix**: Pong should type in VS view `#vs` — Nasri should now respond without dialogs
- **Activate OpenRAG**: `sudo loginctl enable-linger po-ch` + OPENAI_API_KEY in `~/.openrag/tui/.env`
- **Commit pending files**: ψ/memory/ retrospectives + learnings + maw.config.json + start-maw.sh + launch-agents.sh
- **First pharaAI routing command**: Pong hasn't given a real Enervia/Dana/SK Grand task yet
- **Register pharaAI agents** in oracle-v2 when Enervia, Dana, SK Grand projects exist
