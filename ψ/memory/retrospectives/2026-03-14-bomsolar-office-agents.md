# Session Retrospective — 2026-03-14 — BOM Solar & Office Agents

## What happened
- Explored office UI agent setup, confirmed 5-oracle roster matches across agents.yaml, maw.config.json, AGENT_ORDER
- Discovered mcp-engineer MCP server serving 22 engineering agents from agency-agents/engineering/
- Explained engineer tool usage (eng_list, eng_get, eng_search, eng_dispatch, eng_team)
- Generated example BOM solar PDFs via mcp-bomsolar
- Fixed branding: "รายการวัสดุของ OpenSolar" → "รายการวัสดุของ Enervia Group" (4 files)
- Fixed logo path: assets/enervia_logo.png → assets/logo/enervia.jpg

## What was learned
- MCP servers run from memory — file edits need `/mcp` reconnect to take effect
- bomsolar has duplicate code: mcp-bomsolar/scripts/ and tmppic/tempagent/solar-bom-pdf-generator/scripts/
- Old oracle-agent/ (4 files) is dead code, superseded by agency-agents/engineering/ (22 agents)

## What surprised
- Logo default path was wrong (enervia_logo.png vs actual logo/enervia.jpg) — auto-detection never worked

## What's next
- Verify PDF output with logo + Enervia Group title
- Commit oracle-agent/ deletions
- Consolidate duplicate bomsolar scripts
- Update office AGENT_ORDER if new oracles join
