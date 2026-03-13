---
date: 2026-03-13
session: bomsolar-mcp-agent
participants: [Nasri, นัด]
---

# Retro: BOM Solar MCP Agent

## What happened
- New user introduced: **นัด (Nad)** — first interaction
- Requested creation of an MCP agent for "bomsolar" from existing skill at `tmppic/tempagent/solar-bom-pdf-generator`
- Explored the tempagent: Python PDF generator using `reportlab`, Enervia Group branding, A4 Landscape BOM format
- Created `mcp-bomsolar/` as a proper MCP server:
  - Copied `generate_bom_pdf.py` from tempagent
  - Wrapped it with `FastMCP` (Python mcp package)
  - 3 tools: `bomsolar_generate_pdf`, `bomsolar_record_to_oracle`, `bomsolar_example_data`
  - Oracle integration: writes BOM records to `ψ/memory/learnings/`
- Registered `bomsolar` in `.mcp.json`
- Installed `mcp`, `reportlab`, `pillow` via `pip install --user`

## What was learned
- **tempagent pattern**: `tmppic/tempagent/` is used as a staging area for skills before they become proper MCP agents
- **FastMCP** is the right Python wrapper for MCP servers — simple decorator pattern `@mcp.tool()`
- **pip --user** needed on this Windows machine (no admin rights for system-level install)
- Oracle integration in external MCP agents: write markdown directly to `ψ/memory/learnings/` rather than calling oracle-v2 over MCP (cleaner, no circular dependency)

## What surprised
- `mcp` package wasn't installed yet despite being a key infra component — first time a Python MCP server was created in this project
- The tempagent already had complete Thai font support and Enervia branding — very production-ready code sitting in a temp folder

## What's next
- นัด may request actual BOM generation — test the full PDF flow
- May need to add a `bomsolar_list_boms` tool to retrieve past records from oracle
- Consider moving other tempagent skills to proper MCP servers using same pattern
- Confirm Claude Code restart loads `bomsolar` correctly
