# ψ/ ↔ oracle-v2 Relationship Design

> Discovered: 13 March 2026
> Agent: Pha (Nasri)
> Source: Deep exploration of oracle-v2 source code + ψ/ brain mapping

## Summary

ψ/ is the **Source of Truth** (files, git-tracked). oracle-v2 is the **Search Engine + Intelligence Layer** (database-backed, MCP tools). The relationship is one-way sync: ψ/ → indexer → oracle-v2 DB.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  HUMAN (Pong)                    │
│              ตัดสินใจ · เลือก · สั่ง               │
└────────────────────┬────────────────────────────┘
                     │
         ┌───────────▼───────────┐
         │      Nasri (Butler)    │
         │   Claude Code + Skills │
         └───┬───────────────┬───┘
             │               │
     ┌───────▼──────┐  ┌────▼──────────────┐
     │    ψ/ (Files) │  │  oracle-v2 (MCP)   │
     │  Source of    │──│  Search Engine      │
     │  Truth        │  │  + Intelligence     │
     │               │  │                     │
     │  resonance/   │→ │  FTS5 + Vectors     │
     │  learnings/   │→ │  Hybrid Search      │
     │  retrospectives│→│  Graph + Dashboard  │
     │  inbox/       │← │  Handoff System     │
     │  outbox/      │→ │  Vault Sync         │
     └──────────────┘  └─────────────────────┘
         ✍️ WRITE           🔍 READ + INDEX
       (git-tracked)      (database-backed)
```

## 3 Core Principles

### 1. ψ/ = Write, oracle-v2 = Read

- ψ/ is where Nasri **writes** knowledge (markdown, git-tracked)
- oracle-v2 **reads** from ψ/ → indexes → makes it searchable (hybrid search)
- Nothing exists in oracle-v2 DB without a source file in ψ/

### 2. One-Way Sync

```
ψ/ files  ──indexer──▶  oracle-v2 DB
(write)                  (read/search)
```

- Nasri writes to ψ/ → commit
- oracle-v2 indexer scans ψ/ → splits sections → FTS5 + vector embeddings
- Search via `oracle_search` → results point back to ψ/ files

### 3. oracle-v2 Adds What ψ/ Cannot Do Alone

| ψ/ can do | oracle-v2 adds |
|-----------|---------------|
| Store files | Semantic search (search by meaning) |
| git history | Trace system (dig points + chains) |
| Read files directly | Forum threads (Q&A with knowledge base) |
| Local only | Vault sync (backup to GitHub) |
| Single agent | Handoff/Inbox (pass context between agents) |
| Flat files | Graph visualization + Dashboard |
| Manual browse | Schedule (shared across 76+ Oracles) |

## oracle-v2 Key Facts

- **22+ MCP tools**: search, learn, trace, forum, handoff, schedule, verify, supersede, reflect, read, list, stats, concepts, thread...
- **Hybrid search**: FTS5 (keyword) + Vector (semantic) with 50/50 scoring + 10% boost for dual matches
- **5 vector backends**: ChromaDB, LanceDB, sqlite-vec, Qdrant, Cloudflare Vectorize
- **3 embedding models**: bge-m3 (Thai/EN multilingual), nomic (fast), qwen3 (high-quality cross-language)
- **20 database tables**: documents, FTS, search logs, learn logs, traces, forum threads/messages, schedule, settings, activity logs, supersede audit trail
- **Indexer flow**: Walk ψ/ → parse markdown by headers → extract concepts → create granular docs → FTS5 + vectors
- **Supersede pattern**: Nothing is Deleted — old docs marked `superseded_by`, never hard-deleted
- **Vault**: Project-first GitHub backup (local ψ/ → `{project}/ψ/` in vault repo)
- **Frontend**: React dashboard with 16 pages (search, graph, 3D graph, traces, forum, activity, evolution...)
- **Port**: 47778 (HTTP API via Hono.js on Bun)

## Indexer Details

oracle-v2 indexer reads these ψ/ paths:
```
ψ/memory/resonance/*.md      → type: principle (split by ### headers)
ψ/memory/learnings/*.md      → type: learning (split by ## headers)
ψ/memory/retrospectives/*/   → type: retro (split by ## headers)
```

Each section becomes a separate vector document — enabling concept-level search rather than file-level search.

## Trace System

Traces capture discovery sessions as structured data:
- **traceId** → unique identifier
- **foundFiles, foundCommits, foundIssues** → dig points
- **depth** → 0=initial, 1+=deeper investigation
- **parentTraceId / childTraceIds** → hierarchical exploration
- **prevTraceId / nextTraceId** → linked chain of related traces
- **status**: raw → reviewed → distilling → distilled (promoted to learning)

## Knowledge Flow (Complete)

```
active/context → ψ/memory/logs → ψ/memory/retrospectives → ψ/memory/learnings → ψ/memory/resonance
                  (ephemeral)      (raw narrative)           (distilled pattern)    (core identity)
                                         ↓                         ↓                      ↓
                                   oracle-v2 indexer ────────────────────────────────────────
                                         ↓
                                   FTS5 + Vectors → Hybrid Search → Forum → Trace → Dashboard
```

Raw observations distill into lasting wisdom, layer by layer. oracle-v2 makes every layer searchable and connected.
