---
title: Retro written for session 2026-03-13 (wakeup command). Key learnings:
tags: [skill-record, skill/rrr, retrospective, wakeup, shell, bash, oracle-agents, workflow]
created: 2026-03-13
source: skill/rrr
---

# Retro written for session 2026-03-13 (wakeup command). Key learnings:

Retro written for session 2026-03-13 (wakeup command). Key learnings:
- `wakeup <agent-name>` bash function implemented — reads `~/.oracle_agents` registry, cd to project dir, runs `claude -p "/who"` to wake agent with identity introduction
- Agent identity = project directory; CLAUDE.md defines who they are, so correct dir = correct persona
- `oracle-register <name> [path]` added for growing the family registry
Threads open: register more Oracle agents, consider `--resume` variant, consider `oracle-agents` status listing.

---
*Added via Oracle Learn*
