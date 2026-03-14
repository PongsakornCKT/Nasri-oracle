---
title: Retro written for session 2026-03-14 (Session 7). Key learnings:
tags: [retrospective, nasri-line-bot, deploy, bomsolar, cables, mounting, skill/rrr]
created: 2026-03-14
source: skill/rrr
---

# Retro written for session 2026-03-14 (Session 7). Key learnings:

Retro written for session 2026-03-14 (Session 7). Key learnings:
- deploy/app.js is the LIVE LINE bot — src/ (Bun/TypeScript) is NOT deployed; always edit app.js for production changes
- MCP server requires restart to pick up code changes — not hot-reload
- Cable sheet uses `ราคา ≥50,000` column; extractPrice() Priority 4 catches it; parseSystemSpec() in app.js had no mounting/cable (now fixed)
Threads open: Test full LINE flow with all details; consider build step to sync src/ → app.js; add Roof Anchor to Keenoc items.

---
*Added via Oracle Learn*
