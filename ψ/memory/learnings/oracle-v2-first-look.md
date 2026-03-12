# oracle-v2 — First Look

> Learned: 2026-03-12

## What It Is
MCP Memory Layer with semantic search, philosophy, and knowledge management. The brain behind Oracle. v0.4.0-nightly.

## Tech Stack
Bun >=1.2.0, Hono (HTTP), Drizzle (ORM), SQLite + sqlite-vec, LanceDB + Qdrant (vector), MCP SDK, Playwright (e2e), Vitest (unit)

## Source Layout (top-level)
```
src/
  index.ts        # MCP entry point
  server.ts       # HTTP server
  indexer.ts       # Content indexer
  config.ts       # Configuration
  tools/          # MCP tools exposed to AI agents
  server/         # Server modules
  vector/         # Vector DB integration
  vault/          # Secure storage?
  forum/          # Discussion/thread system?
  trace/          # Tracing/debugging
  db/             # Drizzle schema + migrations
  cli/            # CLI interface
  process-manager/# Background process management
  verify/         # Verification utilities
  integration/    # Integration tests
  scripts/        # Build/utility scripts
```

## Key Notes
- DB has been migrated to `$HOME` (see oracle.db.MIGRATED-TO-HOME.md)
- Has its own CLAUDE.md — read before working in it
- 181 npm packages, all installed successfully
- Located at `/workspaces/Nasri-oracle/oracle-v2/`
