# Session Retrospective — 2026-03-14 (Session 2) — OpenRAG + BOM Solar

## What happened
- Mapped office agent architecture: 5 oracles + 22 engineering agents via mcp-engineer
- BOM Solar branding: "OpenSolar" → "Enervia Group" (4 files), fixed logo path
- Added MCP auto-allow permissions in .claude/settings.local.json
- OpenRAG: fixed embedding from openai→ollama/nomic-embed-text via onboarding API
- Restarted langflow + openrag-backend containers (podman in WSL)
- Remaining: Langflow 1.8.0 DoclingRemote component bug blocks document ingestion

## What was learned
- OpenRAG runs 5 podman containers + native docling-serve in WSL
- Settings API guarded by `edited` flag — only settable via `/api/onboarding` endpoint
- Backend overwrites config.yaml on startup — direct file edits don't persist
- Langflow caches flows; need restart of both langflow AND backend for changes

## What surprised
- `edited` flag has no manual toggle — onboarding is the only gate
- DoclingRemote upstream bug unrelated to our config fix

## What's next
- Newer OpenRAG/Langflow image for DoclingRemote fix
- Commit oracle-agent/ deletions
- Consolidate duplicate bomsolar scripts
- Verify BOM PDF logo
