# oracle-skills-cli — Codebase Map

> Learned: 2026-03-12

## What It Is
Cross-platform skill installer for 18 AI coding agents. Packages 30 markdown-based skills as interactive commands. Built with Bun + TypeScript + commander.js.

## Key Numbers
- **30 skills**, **18 agents**, **4 profiles** (seed/minimal/standard/full)
- v2.0.10, ~5,843 lines source, ~930 lines tests (8 test files)

## Entry Point
`src/cli/index.ts` — commander.js CLI with commands: install, uninstall, agents, list, profiles

## Architecture

```
src/cli/
  index.ts          # CLI program (commander.js + @clack/prompts)
  agents.ts         # 18 agent configs (paths, detection)
  installer.ts      # Install/uninstall engine (~500 lines, core logic)
  skill-source.ts   # VFS abstraction (dev filesystem vs compiled binary)
  fs-utils.ts       # Cross-platform file ops (Bun.$ vs Node.js fs)
  types.ts          # TypeScript interfaces
  generated/
    skills-vfs.ts   # Auto-generated VFS for compiled binary

src/skills/{name}/
  SKILL.md          # Contract with AI agent (frontmatter + instructions)
  scripts/          # Optional TypeScript/bash logic

src/commands/{name}.md  # Generated stubs pointing to full skills
src/profiles.ts         # seed(6), minimal(6), standard(13), full(30)
```

## Key Patterns
1. **VFS**: Dev reads from disk, compiled binary reads from embedded Map
2. **Dual Install (OpenCode)**: skills/ + commands/ directories
3. **Version Injection**: `v2.0.10 G-SKLL` marker in SKILL.md description
4. **Orphan Cleanup**: Detects `installer: oracle-skills-cli` marker, moves orphans to tmpdir
5. **Shell Mode**: auto/shell/no-shell for cross-platform file ops
6. **Agent Detection**: Each agent has `detectInstalled()` checking marker dirs

## Build Flow
```
scripts/generate-vfs.ts → src/cli/generated/skills-vfs.ts (embed skills)
scripts/compile.ts      → src/commands/{name}.md (stubs)
scripts/build-native.ts → dist/oracle-skills-{platform} (4 binaries)
```

## Test Framework
- Bun test (`bun test __tests__/`)
- 8 test files: index, installer, integration, smoke, compile, fs-utils, utils, permissions

## Agents Supported
claude-code, opencode, cursor, codex, windsurf, cline, gemini, continue, aider, copilot, amp, kilo, roo, goose, antigravity, openclaw, droid, zed

## Dependencies
- commander (CLI), @clack/prompts (interactive UI), mqtt (Gemini skill)
