---
title: Retro written for session 2026-03-14 (engineering-agents + schema-fix). Key lear
tags: [skill-record, skill/rrr, retrospective, json-schema, mcp-tools, claude-agents, oracle-v2]
created: 2026-03-13
source: skill/rrr
---

# Retro written for session 2026-03-14 (engineering-agents + schema-fix). Key lear

Retro written for session 2026-03-14 (engineering-agents + schema-fix). Key learnings:
- JSON Schema draft 2020-12 strict mode: Anthropic API rejects `default` inside property definitions and empty `required: []` arrays — move defaults to description text and handler code only
- `.claude/agents/` format requires `name`, `description`, `tools`, `model` frontmatter — the `agency-agents/` format (color/emoji/vibe) is a different non-Claude-Code system
- Error index variation (tools.9 vs tools.77) is explained by different tool counts in normal vs subagent sessions — same root cause, different position
Threads open: restart Claude Code for schema fixes to take effect; test 5 engineering agents; consider schema validation in CI.

---
*Added via Oracle Learn*
