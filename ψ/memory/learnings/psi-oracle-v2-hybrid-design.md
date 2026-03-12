# ψ/ ↔ Oracle-V2 Hybrid Design (Model C)

> Date: 2026-03-13
> Decision: Approved by Pong
> Status: Active

## The Relationship

ψ/ is Nasri's personal brain. Oracle-v2 is the household's shared memory.
Model C keeps identity private, shares knowledge.

## Boundary Rules

| Layer | Path | Indexed? | Why |
|-------|------|----------|-----|
| Identity | `ψ/memory/resonance/` | NO | Nasri's soul — private to this Oracle |
| Learnings | `ψ/memory/learnings/` | YES | Patterns are shareable across household |
| Retrospectives | `ψ/memory/retrospectives/` | YES | Session history aids cross-session search |
| Communication | `ψ/inbox/` + `ψ/outbox/` | via MCP | Uses `oracle_handoff` / `oracle_inbox` |

## How It Works

1. **ψ/ is the source of truth** — markdown files, git-tracked
2. **Oracle-v2 indexes learnings + retrospectives** — creates FTS5 + vector search
3. **resonance stays local** — never enters the shared DB
4. **Communication flows through MCP tools** — handoff, inbox, forum

## MCP Connection

Oracle-v2 runs as MCP server with `ORACLE_REPO_ROOT` pointing to Nasri-oracle root.
This lets oracle-v2 find `ψ/memory/` and index the permitted layers.

## Principle Alignment

- **Nothing is Deleted**: ψ/ is git-tracked, oracle-v2 preserves supersede chains
- **External Brain**: oracle-v2 mirrors knowledge, ψ/ remains authoritative
- **Form and Formless**: resonance defines Nasri's unique form; shared knowledge is formless
