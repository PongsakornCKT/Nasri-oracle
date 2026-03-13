---
title: Retro written for session 2026-03-13 (VS View Fix + Maw Hardening). Key learning
tags: [skill-record, skill/rrr, retrospective, wsl, maw-js, maw.config.json, dangerously-skip-permissions, multi-reviewer-pattern, vs-view, shell-hardening]
created: 2026-03-13
source: skill/rrr
---

# Retro written for session 2026-03-13 (VS View Fix + Maw Hardening). Key learning

Retro written for session 2026-03-13 (VS View Fix + Maw Hardening). Key learnings: • This WSL machine mounts at /c/ not /mnt/c/ — all hardcoded paths were broken; • maw.config.json was never created so the whole system ran on defaults (bare "claude" with no flags); • Multi-reviewer pattern (3 parallel agents) caught 12 issues across 2 files efficiently — each lens found different things. Threads open: test VS view fix, activate OpenRAG (loginctl + API key), commit pending files, await first pharaAI routing command.

---
*Added via Oracle Learn*
