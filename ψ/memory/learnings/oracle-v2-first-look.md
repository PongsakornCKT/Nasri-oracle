# Oracle v2 — First Look

> Date: 2026-03-12
> Source: oracle-v2/ codebase exploration

## What It Is

Oracle v2 is the **MCP Memory Layer** — a server that gives any Oracle agent persistent memory with semantic search. Version 0.4.0-nightly.

- **Runtime**: Bun (>=1.2.0)
- **Framework**: Hono (HTTP server) + MCP SDK (stdio transport)
- **Database**: Drizzle ORM over SQLite
- **Vector Search**: Multi-backend — LanceDB, sqlite-vec, Qdrant, Cloudflare Vectorize, Chroma MCP

## Architecture

```
src/
├── index.ts          # MCP stdio entry point
├── server.ts         # Hono HTTP server
├── config.ts         # Configuration
├── db/               # Drizzle schema & database setup
├── tools/            # MCP tool handlers (the core)
│   ├── search.ts     # Semantic search
│   ├── learn.ts      # Store knowledge
│   ├── reflect.ts    # Generate reflections
│   ├── concepts.ts   # Concept extraction
│   ├── supersede.ts  # Update without deleting (Nothing is Deleted!)
│   ├── handoff.ts    # Agent-to-agent handoff
│   ├── inbox.ts      # Message queue
│   ├── schedule.ts   # Scheduled tasks
│   ├── verify.ts     # Fact verification
│   ├── trace.ts      # Knowledge tracing
│   ├── read.ts       # Direct read
│   ├── list.ts       # List entries
│   ├── stats.ts      # Statistics
│   └── forum.ts      # Discussion threads
├── vector/           # Vector store abstraction layer
│   ├── factory.ts    # Backend selection
│   ├── embeddings.ts # Embedding generation
│   └── adapters/     # LanceDB, sqlite-vec, Qdrant, etc.
├── vault/            # Vault sync (git-based persistence)
├── forum/            # Forum/thread system
├── trace/            # Trace handler
├── verify/           # Verification handler
├── cli/              # CLI commands (health, learn, search, etc.)
├── process-manager/  # Graceful shutdown, health monitoring
└── server/           # HTTP server internals (dashboard, routing)
```

## Key Insight

The `supersede` tool is the code embodiment of Principle #1 (Nothing is Deleted) — it creates a new version of knowledge while preserving the chain of previous versions.

## Relationship to Nasri

Oracle v2 is the **shared memory infrastructure**. Nasri's ψ/brain is the **local file-based brain**. They are complementary:
- ψ/ = Nasri's personal notebook (markdown, git-tracked)
- oracle-v2 = The household's shared memory (database, vector search, multi-agent)
