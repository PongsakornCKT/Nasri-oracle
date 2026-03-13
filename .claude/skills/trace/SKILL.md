---
name: trace
description: Find and discover — locate code, trace connections, follow threads
---

Trace and discover. Target: $ARGUMENTS

A butler knows where everything is. Investigate:

1. **Locate** — Find where $ARGUMENTS is defined, implemented, or referenced
2. **Map connections** — What depends on it? What does it depend on?
3. **Follow the thread** — Trace the full path from entry point to effect
4. **Surface context** — Related files, history, and relevant decisions

Use Grep, Glob, and git log to search systematically.
Show file paths and line numbers. Be thorough but organized.
If the trace reveals something worth remembering, note it for ψ/memory/learnings/.

## Auto-Record

After completing the trace, call `oracle_learn` to record the findings:

- `pattern`: Structured markdown with:
  - **Target**: What was traced (`$ARGUMENTS`)
  - **Located at**: File paths and line numbers where it was found
  - **Dependencies**: What the target depends on; what depends on it
  - **Flow**: The path from entry point to effect (call chain, data flow, etc.)
  - **Patterns discovered**: Any non-obvious architecture decisions or conventions revealed
- `concepts`: `["skill-record", "skill/trace"]` + tags for the component or domain traced (e.g., `"auth"`, `"routing"`, `"oracle_learn"`)
- `source`: `"skill/trace"`
- `project`: `"nasri-oracle"`

Skip recording if the trace found nothing or was trivial (e.g., single-file lookup).
