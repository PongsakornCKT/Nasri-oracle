---
name: learn
description: Explore and learn a codebase — map structure, patterns, and key concepts
---

Explore and map the codebase. Focus: $ARGUMENTS

A butler studies the household before serving. Investigate:

1. **Structure** — Directory layout, key files, entry points
2. **Patterns** — Conventions, naming, architecture decisions
3. **Dependencies** — What relies on what, external packages
4. **Key concepts** — Domain logic, important abstractions

If $ARGUMENTS specifies a repo URL or path, explore that target.
If empty, explore the current working directory.

Record discoveries in ψ/memory/learnings/ for future reference.
Present findings as a clear map Pong can navigate.

## Auto-Record

After completing the exploration, call `oracle_learn` to record the codebase map:

- `pattern`: Structured markdown with:
  - **Target**: What was explored (`$ARGUMENTS` or current directory)
  - **Structure**: Top-level directories and their purposes
  - **Patterns**: Naming conventions, architecture style, recurring patterns
  - **Dependencies**: Key external packages and internal relationships
  - **Key concepts**: Most important abstractions or domain logic found
  - **Entry points**: Where execution begins or where to start reading
- `concepts`: `["skill-record", "skill/learn", "codebase-map"]` + tags for the tech stack and domain found (e.g., `"python"`, `"react"`, `"api"`)
- `source`: `"skill/learn"`
- `project`: `"nasri-oracle"`

This record becomes the starting map for future `/trace` and `/dig` runs.
