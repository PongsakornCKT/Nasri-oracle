---
title: # Nasri Oracle — Codebase Map (2026-03-14)
tags: [skill-record, skill/learn, codebase-map, nasri-oracle, monorepo, python, typescript, bun, nodejs, mcp, line-bot, solar, google-sheets, fastmcp]
created: 2026-03-14
source: skill/learn
---

# # Nasri Oracle — Codebase Map (2026-03-14)

# Nasri Oracle — Codebase Map (2026-03-14)

**Target**: C:/Users/pO-Ch/Nasri-oracle (monorepo)

## Structure

```
Nasri-oracle/
├── CLAUDE.md                    # Butler identity, 5 principles, golden rules
├── .mcp.json                    # MCP server registry (6 servers)
├── .claude/skills/              # Slash commands: dig, learn, recap, rrr, trace, who, remember, FD
├── ψ/memory/                    # Brain: learnings/, logs/, resonance/, retrospectives/
│
├── mcp-bomsolar/                # MCP: Solar BOM builder (Python/FastMCP)
│   ├── server.py                # 8 tools: smart_bom, get_catalog, lookup_price, generate_pdf, etc.
│   ├── sheets.py                # Google Sheets CSV fetcher (no API key, gviz/tq)
│   └── scripts/generate_bom_pdf.py  # PDF generation via reportlab
│
├── mcp-pricesolar/              # MCP: Price lookup (Python/FastMCP) — NEW 2026-03-14
│   ├── server.py                # 3 tools: search, get_sheet, summary
│   └── sheets.py                # Copy of mcp-bomsolar/sheets.py
│
├── mcp-engineer/                # MCP: Engineering agent dispatch (Bun/TypeScript)
│   └── src/                     # eng_dispatch, eng_get, eng_list, eng_search, eng_team
│
├── oracle-v2/                   # MCP: Oracle knowledge brain (Bun/TypeScript)
│   └── src/                     # oracle_learn, oracle_ask, oracle_search, oracle_read, etc.
│                                # Uses Chroma vector DB + SQLite + Drizzle ORM
│
├── nasri-line-bot/              # LINE OA Bot — Nasri in production
│   ├── deploy/app.js            # LIVE production file (CJS, Phusion Passenger)
│   ├── deploy.sh                # FTP upload + Plesk restart script
│   └── src/                     # Local dev only (Bun/TypeScript/Hono) — NOT deployed
│
├── agents/                      # MAW multi-agent tmux profiles (nasri, pha, ra, hai, ship)
├── agency-agents/               # Agent role definitions (engineering, marketing, etc.)
├── oracle-framework/            # Oracle framework concepts
└── oracle-v2/                   # Knowledge brain with vector search
```

## MCP Servers (registered in .mcp.json)

| Name | Runtime | Purpose |
|------|---------|---------|
| bomsolar | Python | Solar BOM builder — 8 tools, Google Sheets catalog |
| pricesolar | Python | Price lookup — 3 tools, direct catalog search |
| oracle-v2 | Bun | Knowledge brain — learn/ask/search/trace |
| engineer | Bun | Engineering agent dispatch |
| pdf-reader | npx | Read PDFs |
| pdf-generator | npx | Generate PDFs |

## Key Patterns

- **Google Sheets as database**: No API key — uses gviz/tq CSV export URL with 30s cache
- **deploy/app.js is LIVE**: src/ (TypeScript) is local dev only, never deployed
- **CJS only in production**: Plesk Passenger requires CommonJS — no ES modules in app.js
- **MCP = stdio JSON-RPC**: All Python MCPs use FastMCP, Bun MCPs use TypeScript SDK
- **Price lookup bypasses Claude API**: Direct Google Sheets → format reply (zero tokens)
- **Claude API = haiku only for LINE**: claude-haiku-4-5-20251001 for cost efficiency
- **Memory flow**: active context → logs → retrospectives → learnings → resonance

## Dependencies

### nasri-line-bot/deploy/app.js
- Zero npm packages — pure Node.js built-ins (http, crypto, fs, https)
- External: LINE Messaging API, Anthropic API, Google Sheets (gviz/tq)

### mcp-bomsolar + mcp-pricesolar
- Python: FastMCP, reportlab (PDF), requests/urllib

### oracle-v2
- Bun + TypeScript, Drizzle ORM, SQLite, Chroma vector DB

## Key Concepts

- **Nasri**: Digital Butler persona. Pong = master. Thai-first responses.
- **bomsolar_smart_bom**: Natural language → full BOM with real prices from catalog
- **Sigenergy special handling**: EC inverters (SP/TP), AIKO 650W panels, 6sqmm DC cable, VCT AC cable, Keenoc mounting, Cable Tray + Adhesive Kit
- **priceSearch flow**: keyword extraction → getCatalog() → extractPrice() → direct reply (no token)
- **BOM priority**: PDF keywords → BOM keywords → price question → Claude API fallback
- **ψ/memory**: Butler's brain — resonance (soul), learnings (patterns), retrospectives (sessions)

## Entry Points

- LINE bot traffic: `deploy/app.js` → webhook → `handleText()`
- BOM build: `mcp-bomsolar/server.py` → `bomsolar_smart_bom()`
- Price query: `deploy/app.js` → `priceSearch()` → direct answer
- Knowledge: `oracle-v2/src/server.ts` → `oracle_ask()`


---
*Added via Oracle Learn*
