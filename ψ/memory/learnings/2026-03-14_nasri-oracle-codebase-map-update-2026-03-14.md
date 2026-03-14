---
title: # Nasri Oracle — Codebase Map Update (2026-03-14, Session 8)
tags: [skill-record, skill/learn, codebase-map, nasri-oracle, mcp-qsolar, mcp-pricesolar, quotation-pdf, reportlab, python, nodejs, line-bot, solar, google-sheets, fastmcp, claude-haiku]
created: 2026-03-14
source: skill/learn
---

# # Nasri Oracle — Codebase Map Update (2026-03-14, Session 8)

# Nasri Oracle — Codebase Map Update (2026-03-14, Session 8)

**Target**: C:/Users/pO-Ch/Nasri-oracle (monorepo) — updated map after session 8

## New Components Added This Session

### `mcp-qsolar/` — Solar Quotation PDF Generator (Python/FastMCP)
```
mcp-qsolar/
├── server.py        — FastMCP 4 tools: qsolar_generate, qsolar_from_spec, qsolar_get_prices, qsolar_list_options
├── generate_pdf.py  — QuotationGenerator class (reportlab, exact Enervia layout)
├── thai_baht.py     — float → Thai baht words (สี่แสนสี่หมื่นสี่พันบาทถ้วน)
└── test_qsolar.py   — 12 tests (10 required + 2 bonus), all pass
```
**PDF Layout**: orange triangle header, TH Sarabun New font, ORANGE #E8941A + DARK_BLUE #1B4D7A, logo, table, signature, BBL+SCB payment page, system diagram images
**Assets**: fonts + images from `tmppic/tempagent/quotation-solar/assets/`
**Output**: `nasri-line-bot/deploy/boms/`
**Supports**: ATMOCE, Sigenergy, Huawei, Solis — 1P/3P, battery, backup

### `mcp-pricesolar/` — Price Lookup MCP (Python/FastMCP)
```
mcp-pricesolar/
├── server.py   — 3 tools: pricesolar_search, pricesolar_get_sheet, pricesolar_summary
└── sheets.py   — copy of mcp-bomsolar/sheets.py
```

## Updated MCP Registry (.mcp.json) — 7 servers total
| Name | Runtime | Purpose |
|------|---------|---------|
| bomsolar | Python | BOM builder (smart_bom, get_catalog, etc.) |
| pricesolar | Python | Price lookup — 3 tools |
| qsolar | Python | Quotation PDF — 4 tools |
| oracle-v2 | Bun | Knowledge brain |
| engineer | Bun | Engineering agent dispatch |
| pdf-reader | npx | Read PDFs |
| pdf-generator | npx | Generate PDFs |

## Updated `nasri-line-bot/deploy/app.js` Flow

```
handleText(ev, text):
  lo = text.toLowerCase()
  
  1. isPdfRequest(lo)          → PDF flow (send last BOM as PDF)
  2. isNasriTrigger(lo) &&
     isQuotationRequest(lo)    → startQuotation() → generate PDF → send [NEW]
  3. bomMsg(ev)                → active BOM session handler
  4. !isNasriTrigger(lo)       → ignore
  5. help/เมนู                  → menuFlex
  6. isBomRequest/hasSystemSpec → startBom() → BOM flow
  7. ค้นหา/โหลด/ดู             → BOM search/load/view
  8. isPriceQuestion(lo):
       matches = priceSearch(text)  → direct catalog answer (ZERO token) [NEW]
  9. else → askClaude(text) → Claude Haiku reply [NEW]
```

**New functions in app.js**:
- `isPriceQuestion(text)` — detects ราคา/price/เท่าไหร่/กี่บาท
- `priceSearch(text)` — keyword extraction → getCatalog() → extractPrice() → format reply
- `PRICE_STOP_WORDS` — filter nasri/นัด/ราคา/etc before keyword search
- `isQuotationRequest(lo)` — detects ใบเสนอราคา/quotation/เสนอราคา/ขอใบเสนอ
- `parseQuotationSpec(text)` — extracts brand/kW/phase/battery/backup
- `generateQuotationPdf(spec, customer, project)` — spawns Python subprocess
- `startQuotation(ev, text, rt)` — orchestrates quotation flow
- `askClaude(question, catalogContext)` — Anthropic API, Haiku 4.5, 500 max_tokens
- `ANTHROPIC_API_KEY` — loaded from .env on server

## Key Patterns (updated)

- **Token economy**: price queries = 0 tokens (direct sheets), quotation = 0 tokens (Python subprocess), only open-ended questions use Claude API
- **Python subprocess pattern**: LINE bot spawns Python for PDF generation (both BOM and quotation) — no Python runtime in Node.js
- **MCP = stdio**: all Python MCPs use FastMCP, subprocess-invokable via CLI mode
- **qsolar CLI mode**: `python server.py '{"tool":"qsolar_from_spec","spec":"..."}'` returns JSON

## Selling Prices (hardcoded in qsolar)
- ATMOCE 1P: 8panels=169k, 16panels=279k, 20panels=329k
- ATMOCE 3P: 8panels=189k, 16panels=329k, 30panels=569k
- Sigenergy 1P: 5kW=191k, 10kW=367k
- Sigenergy 3P: 5kW=275k, 10kW=370k, 20kW=627k, 25kW=724k
- Huawei 1P: 5kW=148k, 10kW=258k; 3P: 5kW=159k, 10kW=266k, 15kW=375k
- Solis 1P: 5kW=146k, 6kW=156k, 8kW=208k; 3P: 5kW=140k, 10kW=255k

## Financial Rules (quotation)
- grand_total = selling price (VAT-inclusive)
- VAT 7% = grand_total × 7/107 (back-calculate)
- ราคาก่อน VAT = grand_total × 100/107
- มัดจำ 60% / งวด 2 = 40%
- Quote number: QT{YYYYMMDD}{seq:04d}


---
*Added via Oracle Learn*
