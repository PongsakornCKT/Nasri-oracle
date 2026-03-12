# multi-agent-workflow-kit — Codebase Map

> Learned: 2026-03-12

## What It Is
Python/Bash orchestration system for parallel AI agent coordination. Uses git worktrees (isolation) + tmux (supervision) + shell scripts (orchestration). Version 0.5.1, Python 3.9+.

## Key Numbers
- **3 Python files** (578 lines), **14 shell scripts** (~2,409 lines), **2 test files** (140 lines)
- 6 tmux layout profiles, 5 Claude slash commands

## Entry Point
`src/multi_agent_kit/cli.py` → `main()` via `uvx multi-agent-kit init`

## Architecture

```
src/multi_agent_kit/
  cli.py              ← Bootstrap CLI (commander, git init, asset install, tmux launch)
  install.py          ← Smart asset copy with .envrc/.gitignore merge
  assets/             ← Bundled toolkit (installed into target repos)
    .agents/
      agents.yaml     ← Agent registry (name → branch + worktree)
      scripts/        ← 14 shell scripts (setup, start, hey, sync, kill...)
      profiles/       ← 6 tmux layouts
      maw.env.sh      ← Environment + maw() function
    .claude/commands/  ← maw.sync, maw.hey, maw.zoom, maw.issue, maw.codex
    .codex/prompts/    ← Codex CLI integration
    MAW-AGENTS.md      ← User guide
```

## Core Concepts

### Git Worktree Model
```
repo/
├── .git/              ← shared object database
├── agents/
│   ├── 1/             ← worktree on branch agents/1
│   ├── 2/             ← worktree on branch agents/2
│   └── 3/             ← worktree on branch agents/3
└── (main branch)      ← root directory
```

### Tmux Session
- Session named `ai-<repo>` (or `<prefix>-ai-<repo>`)
- Each agent gets a pane in one visible window
- `maw hey <agent> <msg>` → sends to specific pane
- `maw send "<cmd>"` → broadcasts to all panes

### Sync Protocol
- Main: `git pull --ff-only origin main` then broadcast to agents
- Agent: `git merge main` (local)
- Direction: remote → main → agents

## Key Patterns
1. **Idempotent install**: Running init twice is safe, smart .envrc merge with markers
2. **Safety first**: No force push, no destructive git ops, interactive confirmations
3. **VFS-like asset bundling**: Python importlib.resources ships assets in package
4. **Shell mode dual**: Python bootstrap → shell scripts for actual orchestration
5. **Orphan backup**: Uninstall backs up to timestamped directory

## CLI Commands (maw)
`start`, `attach`, `hey`, `send`, `sync`, `zoom`, `kill`, `setup`, `agents create/list/remove`, `catlab`, `version`, `issue`, `uninstall`

## Dependencies
Runtime: git ≥2.5, tmux ≥3.2, yq, python 3.9+, direnv (optional)
Build: UV, pytest, setuptools

## Tests
- `test_install.py` — asset creation, idempotency, force mode, gitignore opt-in
- `test_catlab.py` — CLAUDE.md download from custom URL
- CI: pytest on Python 3.12 & 3.14 + smoke test
