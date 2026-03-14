# Session 8 Retrospective — qsolar + LINE AI + Price Lookup
Date: 2026-03-14

## What happened
- Fixed Sigenergy EC inverter not appearing in BOM (MCP restart timing issue — code was correct, server was stale)
- Added **general Q&A** to LINE OA: Nasri now answers any question via Claude Haiku 4.5
- Added **direct price lookup** (zero token): price questions → Google Sheets → formatted reply, no Claude API call
- Fixed `priceSearch()` bug: was calling `fetchAllSheets()` (wrong name) → fixed to `getCatalog()`, renamed to avoid conflict with existing `searchCatalog(catalog, query)`
- Created **`mcp-pricesolar`**: 3-tool MCP for price search/sheet/summary
- Created **`mcp-qsolar`**: 4-tool MCP for quotation PDF generation
  - `QuotationGenerator` class matching exact Enervia reference layout
  - Supports ATMOCE, Sigenergy, Huawei, Solis — 1P/3P, battery, backup
  - TH Sarabun New font, orange triangle, BBL+SCB payment page, system images
  - 12/12 tests pass
- Wired qsolar into LINE OA (`ใบเสนอราคา / quotation / เสนอราคา`)
- Deployed all changes to ai.enervia.co.th
- Added ANTHROPIC_API_KEY to server .env via FTP

## What was learned
- **MCP restart timing is critical**: adding code AFTER a restart means the new code won't be live until the next restart. Always restart MCP after code changes, not before.
- **Function name collision in CJS**: declaring `function foo()` twice in the same file — the later declaration wins. Caused `searchCatalog(query)` to shadow `searchCatalog(catalog, query)`.
- **`getCatalog()` not `fetchAllSheets()`**: the LINE bot's all-sheets function is `getCatalog()`. `fetchAllSheets()` doesn't exist there — only in mcp-bomsolar's Python `sheets.py`.
- **Zero-token price path**: detecting price keywords before calling Claude and answering directly from catalog is both faster and free.
- **Python subprocess pattern for PDF**: LINE bot (Node.js CJS) spawns Python for both BOM and quotation PDF — clean separation, no Python runtime coupling.
- **Sigenergy EC inverter structure**: first column = "Inverter (EC)" string (not kW), kW lives in `รายละเอียด` column. Generic kW-from-first-column search fails for this brand.

## What surprised
- Sigenergy mounting/cables were working (from earlier restart) but EC inverter wasn't — because the EC fix was added AFTER that restart. Easy to miss without timestamp tracking.
- The LINE bot already had `searchCatalog(catalog, query)` and `extractPrice()` — just needed to wire them correctly, not rewrite.
- `thai_baht.py` number-to-words conversion is non-trivial in Thai (place values differ from English).

## What's next
- Test quotation PDF in LINE OA end-to-end (trigger → parse → generate → send PDF link)
- Verify ANTHROPIC_API_KEY active on server (test `nasri สวัสดี` in LINE)
- Connect `qsolar` + `pricesolar` MCP servers via `/mcp` dialog
- Consider: quotation flow needs customer name — add a "ชื่อลูกค้า" prompt step like BOM's "ชื่อ xxx" pattern
- Consider: Sigenergy quotation needs 4 presentation image pages (verify images exist at asset path)
- LINE bot src/ and deploy/app.js still diverging — no build sync yet
