---
name: remember
description: Manually capture a learning mid-session — structure it and persist to Oracle
---

Capture and store a learning. Input: $ARGUMENTS

A butler never lets a good insight slip away. Do the following:

1. **Parse the input** — Read `$ARGUMENTS` as the raw learning to record. If empty, ask Pong what to remember.

2. **Structure it** — Format the learning as:
   - **What**: The core insight or fact (one clear sentence)
   - **Why it matters**: Context — what problem this solves or what pattern it reveals
   - **When to apply**: Conditions or triggers for this knowledge
   - **Example** (if any): Concrete code, command, or scenario from the current session

3. **Infer concepts** — Identify 3–6 relevant tags from the content. Always include `"skill-record"` and `"skill/remember"`. Add topic tags based on the subject (e.g., `"git"`, `"python"`, `"oracle"`, `"architecture"`).

4. **Call `oracle_learn`**:
   - `pattern`: The structured markdown from step 2
   - `concepts`: The tags from step 3
   - `source`: `"skill/remember"`
   - `project`: `"nasri-oracle"`

5. **Confirm** — Report back to Pong in one line: "Noted: [one-sentence summary of what was stored]."

Keep it fast. The point is to capture the thought before it's lost — not to write an essay.
