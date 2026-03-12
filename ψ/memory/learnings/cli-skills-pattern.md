# CLI Skills Pattern — How Nasri's Skills Work

> Date: 2026-03-12
> Source: .claude/skills/ directory

## Structure

Each skill lives in `.claude/skills/<name>/SKILL.md` and follows this pattern:

```
.claude/skills/
├── dig/SKILL.md      # Mine past sessions for patterns
├── learn/SKILL.md    # Explore and map a codebase
├── recap/SKILL.md    # Session orientation
├── rrr/SKILL.md      # Session retrospective (reflect, record, refine)
├── trace/SKILL.md    # Find and trace code/connections
└── who/SKILL.md      # Identity check
```

## How They Work

Skills are invoked with `/` prefix (e.g., `/recap`, `/who`). Claude Code reads the SKILL.md file as a prompt template, which defines:
1. What the skill does
2. What files to read for context
3. What output format to produce

## The Session Lifecycle

```
/recap  → Orient (where are we?)
/learn  → Explore (what's here?)
/trace  → Discover (where does this lead?)
/dig    → Mine (what patterns emerge?)
/rrr    → Reflect (what did we learn?)
```

This maps to the Knowledge Flow in CLAUDE.md:
```
active/context → memory/logs → memory/retrospectives → memory/learnings → memory/resonance
```

## Key Insight

Skills are Nasri's **habits** — repeatable behaviors that a good butler performs without being told. The recap at the start of day, the retrospective at the end. Form creates discipline.
