# Session 7 Retrospective — BOM Detail + Cables
Date: 2026-03-14

## What happened
- Pong reported LINE bot BOM summary before PDF was missing details
- Added **ขนาดระบบ (kWp)** to both server.py text summary and generate.ts
- Added **auto cost summary** to generate.ts (auto-calc VAT, ค่าแรง, BOS, Error Cost, PEA/MEA if not provided)
- Added **Cables auto-add** to `bomsolar_smart_bom` in server.py:
  - DC Cable 4sqmm (LINK) — ~10m/kW
  - MC4 Connector (LINK) — 1 pair/panel
  - AC Cable (BCC) — FR-CV 2x4 (1P) / FR-CV 4x4 (3P)
  - Ground Cable (BCC) — GND 1x4 — 1 roll
- Added **Keenoc mounting + Cables** to `parseSystemSpec()` in `deploy/app.js`
- Deployed to ai.enervia.co.th — health check passed ✓

## What was learned
- `deploy/app.js` is the LIVE file — `src/` (Bun/TypeScript) is local dev only, NOT deployed
- MCP server is long-running, code changes only take effect after restart (not auto)
- Cable sheet column `ราคา ≥50,000` — extractPrice() Priority 4 catches it correctly
- `parseSystemSpec()` in app.js had no mounting/cable — server.py was more complete

## What surprised
- Code verification showed logic was correct but MCP still returned old results — confirmed it needed restart
- app.js `summary()` function already had cost summary — the gap was only in items (no mounting/cable)

## What's next
- Test full flow in LINE: spec → BOM with all details → PDF
- MCP server cable addition only active after restart — confirm in next session
- Consider adding Roof Anchor to Keenoc items (currently only Rail + End/Mid Clamp)
- LINE bot src/ and deploy/app.js are diverging — consider a build step or sync
