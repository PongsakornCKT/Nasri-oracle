---
title: # Codebase Map — Nasri Oracle (C:/Users/pO-Ch/Nasri-oracle)
tags: [skill-record, skill/learn, codebase-map, typescript, bun, react, python, hono, mcp, sqlite, drizzle-orm, solar-bom, line-bot, tmux, multi-agent, websocket, three.js, oracle-v2, maw-js, monorepo, wsl, thai]
created: 2026-03-14
source: skill/learn
---

# # Codebase Map — Nasri Oracle (C:/Users/pO-Ch/Nasri-oracle)

# Codebase Map — Nasri Oracle (C:/Users/pO-Ch/Nasri-oracle)

**Target**: `C:/Users/pO-Ch/Nasri-oracle` — full monorepo, last mapped 2026-03-14

---

## Structure

```
Nasri-oracle/
├── maw-js/              # Multi-Agent Workflow server (port 3456, Bun+Hono)
│   ├── src/             #   server.ts, engine.ts, tmux.ts, ssh.ts, config.ts
│   ├── office/          #   React SPA (Vite) — the main web UI
│   │   └── src/components/  35 components incl. MemoryView, RoomGrid, ChatView
│   ├── dist-office/     #   Built SPA served at /office
│   └── maw.config.json  #   host, port, oracleUrl, sessions, ghqRoot
│
├── oracle-v2/           # Oracle HTTP server + MCP server (port 47778, Bun+Hono+SQLite)
│   ├── src/
│   │   ├── server.ts    #   HTTP API + static frontend serving (SPA catch-all added 2026-03-14)
│   │   ├── tools/       #   MCP tools: search, learn, list, read, ask, trace, verify…
│   │   ├── db/          #   Drizzle ORM schema (SQLite at ~/.oracle/oracle.db)
│   │   ├── vector/      #   Vector adapters: LanceDB, Qdrant, sqlite-vec, ChromaMCP
│   │   └── server/      #   handlers.ts, dashboard.ts, context.ts
│   └── frontend/        #   React SPA (Vite, port 3000 dev / served via 47778 prod)
│       └── src/pages/   #   16 pages: Overview, Feed, Memory, Graph, Map, Forum…
│
├── mcp-bomsolar/        # BOM Solar MCP (Python, FastMCP)
│   ├── server.py        #   8 tools: smart_bom, lookup_price, generate_pdf, record_to_oracle…
│   ├── sheets.py        #   Google Sheets catalog (14 sheets, 243+ products)
│   └── scripts/generate_bom_pdf.py  # ReportLab PDF generator
│
├── mcp-engineer/        # Engineer Room MCP (Bun, 22 specialist agents)
│   └── src/             #   index.ts, agents.ts
│
├── nasri-line-bot/      # LINE OA Bot deployed on ai.enervia.co.th (Bun+Hono)
│   └── src/
│       ├── server.ts    #   POST /webhook, GET /health, GET /api/bom/download/:filename
│       ├── line/        #   webhook.ts (HMAC-SHA256), reply.ts, types.ts
│       └── bom/         #   flow.ts, generate.ts, session.ts, types.ts
│
├── ψ/                   # Oracle brain (Markdown knowledge base)
│   ├── memory/
│   │   ├── learnings/   #   Distilled patterns (source for oracle-v2 indexer)
│   │   ├── retrospectives/ # Session reflections
│   │   ├── resonance/   #   Soul & identity
│   │   └── logs/        #   token-usage.jsonl (per-tool token tracking)
│   ├── inbox/outbox/writing/lab/learn/archive/
│   └── …
│
├── .mcp.json            # Active MCP servers: oracle-v2, bomsolar, engineer, pricesolar, pdf-reader, pdf-generator
├── .claude/skills/      # Skills: dig, learn, recap, remember, rrr, trace, who
├── .envrc               # Repo env — MAW_REPO_ROOT, CODEX_HOME, PATH setup
├── start-maw.sh         # Startup: tmux session + maw-js (3456) + oracle-v2 (47778)
├── CLAUDE.md            # Butler identity, 5 principles, golden rules
└── agents/ .agents/     # MAW agent configs and scripts
```

---

## Patterns

- **Runtime**: Bun everywhere for JS/TS; Python for MCP tools that need reportlab/sheets
- **HTTP framework**: Hono.js (used in maw-js, oracle-v2, nasri-line-bot — consistent)
- **MCP pattern**: Each service exposes tools via stdio JSON-RPC; Claude Code consumes via .mcp.json
- **Thai/English bilingual**: Code comments + user-facing strings mix Thai (LINE bot especially)
- **"Nothing is Deleted"**: Supersede pattern in oracle-v2 DB (supersededBy/supersededAt columns) — docs replaced, never deleted
- **ψ/ as source of truth**: All MCP services write learnings to `ψ/memory/learnings/` for cross-session recall
- **Token logging**: `mcp-bomsolar/server.py` logs every tool call to `ψ/memory/logs/token-usage.jsonl`
- **Trigger words (LINE)**: นัด/nasri/ไอ่นัด start BOM session; ขอpdf/สร้างpdf trigger PDF generation
- **WSL+Windows hybrid**: maw-js runs in WSL; Windows port proxy (svchost) forwards 127.0.0.1:3456 → WSL IP:3456
- **SPA serving**: Both oracle-v2 (47778) and maw-js (3456) serve React SPAs; oracle-v2 added SPA catch-all 2026-03-14

---

## Dependencies

### maw-js
- hono, zustand, react 19, three.js, @xterm/xterm, yaml
- Bun built-in: WebSocket, Bun.serve, Bun.file

### oracle-v2
- hono, drizzle-orm, @lancedb/lancedb, @qdrant/js-client-rest, sqlite-vec, @modelcontextprotocol/sdk
- DB: SQLite at `~/.oracle/oracle.db`

### mcp-bomsolar (Python)
- mcp>=1.0.0 (FastMCP), reportlab>=4.0.0, pillow>=10.0.0
- External: Google Sheets CSV export (no API key needed)

### nasri-line-bot
- hono, @line/bot-sdk (indirect), bun crypto.subtle for HMAC

### mcp-engineer
- @modelcontextprotocol/sdk — routes to 22 specialist sub-agents

---

## Key Concepts

### 1. Oracle (oracle-v2)
Knowledge base with SQLite FTS5 full-text search + optional vector search (LanceDB/Qdrant). MCP server exposes `oracle_learn`, `oracle_search`, `oracle_ask`, `oracle_trace`, etc. HTTP server at 47778 also serves the React dashboard.

### 2. MAW (maw-js)
Multi-Agent Workflow engine. Controls tmux sessions via SSH. WebSocket real-time sync to browser. `MawEngine` polls tmux captures, detects idle/sleeping states, auto-triggers `/rrr`. Office SPA at `/office` is the mission control.

### 3. MemoryView
The `#memory` tab in Office SPA — renders all oracle-v2 pages as iframes pointing to `localhost:47778`. Tab list: Overview, Feed, Search, Memory Lab, Graph, Map, Handoff, Activity, Forum, Evolution, Traces, Superseded, Playground, Settings.

### 4. BOM Solar Pipeline
`mcp-bomsolar` → fetches Google Sheets catalog → smart_bom parses natural language spec → generates ReportLab PDF → records to oracle ψ/memory. Mirrors to `nasri-line-bot` which serves the same flow over LINE messaging. Engineering rules: Labor 4.5฿/Wp, BOS 0.7฿/Wp, VAT 7% on equipment only, Sigenergy 1P gateway rule.

### 5. Five Principles
Nothing is Deleted · Patterns Over Intentions · External Brain Not Command · Curiosity Creates Existence · Form and Formless (รูป/สุญญตา)

---

## Entry Points

| Service | How to start | Where to read |
|---------|-------------|---------------|
| maw-js (3456) | `cd maw-js && bun src/server.ts` in WSL | `maw-js/src/server.ts:428` `startServer()` |
| oracle-v2 (47778) | `cd oracle-v2 && bun src/server.ts` | `oracle-v2/src/server.ts:1` |
| oracle-v2 MCP | auto via .mcp.json `bun run dev` | `oracle-v2/src/index.ts` |
| bomsolar MCP | auto via .mcp.json `python server.py` | `mcp-bomsolar/server.py` |
| engineer MCP | auto via .mcp.json `bun run dev` | `mcp-engineer/src/index.ts` |
| LINE bot | deployed Plesk+Passenger ai.enervia.co.th | `nasri-line-bot/src/server.ts` |
| Full startup | `bash start-maw.sh` | `start-maw.sh` |

---
*Added via Oracle Learn*
