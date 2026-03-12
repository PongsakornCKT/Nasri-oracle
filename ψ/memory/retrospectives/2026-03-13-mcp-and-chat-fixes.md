# Retrospective — 13 March 2026
## MCP Server & Chat Fixes

### Done
- Fixed group chat @mention: only poll mentioned agent, not all 5
- Fixed thinking animation leak ("Percolating…" etc.) appearing as chat responses
- Built MCP server: 9 tools, 7 resources, stdio transport via `@modelcontextprotocol/sdk`
- Generated `.mcp.json` for all 5 agent worktrees — agents can now use `maw_*` tools
- Killed stale `maw-pty-2` tmux session (caused duplicate rooms in UI)
- Fixed pm2 interpreter path, tagged v1.3

### Learned
- Claude Code spinners use random words (Percolating, Brewing, Steeping…) — need generic `spinner + word…` regex, not hardcoded list
- MCP HTTP bridge pattern (MCP stdio → REST API) is cleaner than direct engine import
- Duplicate tmux sessions silently double all agents in UI
- Unicode star variants (✶ vs ✻ vs ✽) fool pattern matching — always use broad charsets

### Next
- Test MCP inter-agent communication live
- Add per-agent MCP servers (GitHub, SQLite)
- Verify @mention fix end-to-end in office UI
- Consider MCP prompts for common workflows
