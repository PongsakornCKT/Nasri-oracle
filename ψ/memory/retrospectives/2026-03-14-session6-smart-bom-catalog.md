---
type: retrospective
date: 2026-03-14
session: 6
project: nasri-line-bot, mcp-bomsolar
concepts: [google-sheets, catalog, smart-bom, natural-language, line-bot, mcp]
---

# Session 6 — Smart BOM Builder + Google Sheets Catalog

## What happened
- Connected mcp-bomsolar and nasri-line-bot to Enervia's Google Sheets product catalog (14 sheets, 243+ products)
- Built smart natural-language parser: "atmoce 5kw 1phase แผง JA625 + batt + backup" → auto-builds complete BOM from catalog with real prices
- Added new MCP tool `bomsolar_smart_bom` — same smart parsing available as MCP tool
- Added `bomsolar_get_catalog` and `bomsolar_lookup_price` MCP tools for catalog access
- Expanded trigger words: "นัด" / "nasri" / "ไอ่นัด" wake Nasri up
- Expanded PDF triggers: "pdf" / "ขอpdf" / "สร้างpdf" / "file pdf" — no Nasri trigger needed
- Added `/api/catalog` REST endpoint on ai.enervia.co.th
- 30-second cache TTL = near-real-time sync with Google Sheet updates
- Deployed 3 times during session, all successful

## What was learned
- Google Sheets CSV export via `/gviz/tq?tqx=out:csv&gid=XXX` works without API key for published sheets — no OAuth needed
- GIDs discoverable from `/htmlview` HTML source (`items.push({name: "...", gid: "..."})`)
- Price extraction gotcha: some sheets embed "ราคา" in the FIRST column header (which is actually kW size). Fix: prioritize short headers with "฿" symbol, skip long title headers
- ATMOCE uses micro inverters (MI-1250 = 1.25kW each) so quantity = systemKw / 1.25, unlike string inverters which are 1:1
- Natural language parsing for solar specs is feasible with keyword detection + catalog lookup — doesn't need LLM

## What surprised
- The first column header in Huawei/Solis sheets contained "ราคาสั่งซื้อ" as part of the sheet title, causing price extraction to return the kW rating (10) instead of the actual price (38,900). Needed multi-priority price extraction logic
- Google Sheets CSV export doesn't support sheet name lookup — must use GID. Sheet names only discoverable from HTML parsing
- 14 sheets with 243 products fetched in parallel in ~2 seconds — fast enough for real-time LINE bot use

## What's next
- Test smart BOM in real LINE group chat with Pong
- PDF generation still placeholder — need JS PDF lib on Plesk (no Python/reportlab available)
- Add more inverter brands to smart parser (currently handles: ATMOCE, Huawei, Solis, Deye, Sigenergy, Hoymiles, Enphase)
- Consider adding mounting/cables auto-calculation based on system size
- Rich Menu for LINE bot (Phase 4)
