# MCP HTTP Bridge Pattern

When building an MCP server for an existing service:
- Don't import the engine directly — use HTTP calls to the running server
- Keeps MCP server stateless and thin (~100 lines)
- Name resolution (friendly name → tmux target) via `/api/sessions`
- Use `@modelcontextprotocol/sdk` with `StdioServerTransport` — works with Bun
- Register via `.mcp.json` at project root for Claude Code, or `~/.claude/settings.json` for global
- `maw mcp setup` regenerates all `.mcp.json` files from `agents.yaml`
