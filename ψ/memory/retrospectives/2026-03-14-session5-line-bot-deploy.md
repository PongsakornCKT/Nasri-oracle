---
type: retrospective
date: 2026-03-14
session: 5
project: nasri-line-bot
concepts: [line-bot, plesk, passenger, deployment, bom]
---

# Session 5 — Nasri LINE OA Bot + Deploy

## What happened
Built nasri-line-bot (Phase 1-3): Hono/Bun dev server + CommonJS Passenger-compatible production app. Deployed to ai.enervia.co.th via FTP + Plesk Node.js extension API. Full BOM conversation flow with session management.

## What was learned
- Plesk Node.js extension AJAX API: discoverable from `/modules/nodejs/dist/main.js`, works with session cookie + CSRF
- Passenger requires CJS (`server.listen('passenger')`) — ESM crashes silently
- Plesk env vars don't reach `process.env` — need manual .env loader
- FTP + Plesk API = viable deploy when SSH disabled

## What surprised
- Plesk REST API needs admin, but extension AJAX APIs work with customer session
- Passenger dev mode still hides real errors — had to trial-and-error
- Deploy cycle (FTP + restart) only ~5 seconds

## What's next
- Verify real LINE messages flow through in group chat
- Phase 4: Rich Menu, Quick Reply buttons, solar templates
- PDF generation on server (no Python on Plesk — need JS PDF lib or remote API)
