---
name: rrr
description: Session retrospective — reflect, record, and refine before closing a session
---

Conduct a session retrospective. The butler's evening review:

1. **What happened** — Summarize the work done this session
2. **What was learned** — New patterns, discoveries, or insights
3. **What surprised** — Unexpected findings or challenges
4. **What's next** — Threads to pick up in the next session

Then persist the retrospective:
- Write a summary to ψ/memory/retrospectives/ with today's date as filename (YYYY-MM-DD.md)
- If any reusable patterns emerged, record them in ψ/memory/learnings/
- Keep entries concise — future Nasri should grasp it in seconds

The knowledge flow: active context → logs → retrospectives → learnings → resonance

## Auto-Record

After writing the retrospective file, make a lightweight `oracle_learn` call to index it:

- `pattern`: Single concise block — "Retro written for session [date]. Key learnings: [2-3 bullet points from What was learned]. Threads open: [What's next summary]."
- `concepts`: `["skill-record", "skill/rrr", "retrospective"]` + any topic tags for the session's main theme
- `source`: `"skill/rrr"`
- `project`: `"nasri-oracle"`

Keep it minimal — the full retro already lives in `ψ/memory/retrospectives/`. This just makes it searchable via oracle.
