# Retrospective — 2026-03-14 (oracle_ask RAG tool)

**Date**: 2026-03-14
**Session theme**: Local RAG generation — wiring qwen2.5:3b into Oracle search

---

## What happened

1. Pulled `qwen2.5:3b` from Ollama (1.9 GB) — first local generation model alongside `nomic-embed-text`
2. Built `oracle_ask` MCP tool (`src/tools/ask.ts`):
   - Hybrid search retrieves context docs
   - qwen2.5:3b generates a grounded answer via Ollama `/api/chat`
   - Returns answer + source citations as JSON
3. Wired into full stack: `types.ts` → `index.ts` (barrel) → `src/index.ts` (MCP server)
4. Type-checked clean (only pre-existing `server-legacy.ts` errors)
5. MCP restart required — tool not yet live (user needs to relaunch Claude Code)
6. Explored `oracle_list` — 8 documents indexed, all learnings from 2026-03-13
7. Discussed storing principles for bomsolar — chose option B (manual `.md` in `ψ/memory/resonance/`, re-run indexer)
8. Bomsolar principles content pending — user was about to share when session ended

---

## What was learned

- **Ollama `/api/chat` is non-streaming-friendly for MCP** — `stream: false` is the right call; streaming would require chunked MCP responses
- **`oracle_learn` hardcodes `type: 'learning'`** — principles must go through the indexer via `ψ/memory/resonance/`, not through the learn tool
- **MCP stdio servers don't hot-reload** — changes only take effect on full Claude Code restart, not `/mcp` reload

---

## What surprised

- `oracle_list` returned only 8 docs — all from yesterday. No principles or retros indexed yet despite the indexer supporting them. The resonance/retro dirs likely exist but were never re-indexed after the vault migration.

---

## What's next

- Relaunch Claude Code → verify `oracle_ask` appears in MCP tools
- Write bomsolar principles to `ψ/memory/resonance/bomsolar-principles.md`
- Re-run indexer to pick up the principles file
- Test `oracle_ask` end-to-end with a real bomsolar question
