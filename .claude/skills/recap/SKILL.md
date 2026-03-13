---
name: recap
description: Session orientation — summarize current state, recent work, and what's ahead
---

Provide a session orientation for Pong. Follow the butler's protocol:

1. **Where we are**: Current branch, recent commits, project status
2. **What exists**: Key files, established structure, what's been built
3. **What's in progress**: Any uncommitted changes, open threads, pending work
4. **What's next**: Logical next steps based on current state

Read git log, git status, and scan the ψ/ brain structure for context.
Keep it concise — a butler briefs, he doesn't lecture.

## Auto-Record

After completing the recap, call `oracle_learn` to record this session orientation:

- `pattern`: Structured markdown with:
  - **Triggered**: What Pong asked / what context prompted the recap
  - **State summary**: Current branch, key recent commits, project status at time of recap
  - **Notable findings**: Anything uncommitted, open threads, or surprising state
  - **Patterns**: Bullet list of any recurring patterns observed (e.g., "always mid-feature when recap called")
  - **Principles applied**: Which of the 5 Principles guided the recap
- `concepts`: `["skill-record", "skill/recap", "session-orientation"]` + any topic tags relevant to what was found (e.g., `"git"`, `"ψ-brain"`)
- `source`: `"skill/recap"`
- `project`: `"nasri-oracle"`

Keep the record brief — one paragraph of context is enough.
