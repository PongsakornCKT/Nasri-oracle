# Claude Code Spinner / Thinking Animation Patterns

Claude Code uses random food/drink words for its thinking spinner:
- Sautéing, Symbioting, Percolating, Brewing, Steeping, Simmering
- Infusing, Distilling, Composting, Fermenting, Marinating, Reducing

Format: `<spinner_char> <Word>…` (e.g. `✶ Percolating…`)

Spinner chars: ✻ ✢ ✽ ✶ · ★ ☆ ✦ ✧ ⚡ ● *

Key lesson: Don't hardcode words — use generic pattern:
```regex
/^[✻✢✽✶·★☆✦✧⚡●*]\s+\S+[…\.]{1,3}$/
```

Also: Unicode star variants look alike but are different codepoints.
Always use broad charsets in regex patterns.
