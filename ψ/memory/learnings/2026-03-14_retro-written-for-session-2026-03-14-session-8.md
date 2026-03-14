---
title: Retro written for session 2026-03-14 (Session 8). Key learnings:
tags: [skill-record, skill/rrr, retrospective, mcp-qsolar, mcp-pricesolar, line-bot, solar, nasri-oracle, python, nodejs]
created: 2026-03-14
source: skill/rrr
---

# Retro written for session 2026-03-14 (Session 8). Key learnings:

Retro written for session 2026-03-14 (Session 8). Key learnings:
- MCP restart must happen AFTER last code change — code added post-restart is not live until next restart
- CJS function name collision: declaring same function name twice silently shadows the first — grep before adding
- LINE bot all-sheets function is getCatalog() not fetchAllSheets(); price extraction uses existing extractPrice(row)

Threads open: test qsolar PDF in LINE end-to-end; verify ANTHROPIC_API_KEY live; add customer name prompt step to quotation flow; check Sigenergy presentation images at asset path; src/ vs deploy/app.js divergence still open.

---
*Added via Oracle Learn*
