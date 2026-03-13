---
name: dig
description: Mine past sessions for patterns, decisions, and context
---

Mine past sessions and knowledge for insights. Search target: $ARGUMENTS

A good butler remembers everything. Dig through:

1. **ψ/memory/retrospectives/** — Past session reflections
2. **ψ/memory/learnings/** — Recorded patterns
3. **ψ/memory/logs/** — Quick snapshots
4. **Git history** — Commit messages and changes over time

Present findings organized by relevance. Surface connections Pong might not see.
If $ARGUMENTS is empty, provide a summary of all recorded knowledge.

## Auto-Record

After completing the dig, call `oracle_learn` to record what was found:

- `pattern`: Structured markdown with:
  - **Query**: What was searched for (`$ARGUMENTS` or "full knowledge scan")
  - **Sources consulted**: Which memory layers were searched (retrospectives, learnings, logs, git)
  - **Key findings**: The most relevant results surfaced
  - **Connections found**: Any non-obvious links between past sessions or patterns
  - **Gaps noted**: Topics searched but not found (useful for future reference)
- `concepts`: `["skill-record", "skill/dig", "knowledge-mining"]` + tags matching the search topic
- `source`: `"skill/dig"`
- `project`: `"nasri-oracle"`

Skip recording if the dig returned nothing meaningful.
