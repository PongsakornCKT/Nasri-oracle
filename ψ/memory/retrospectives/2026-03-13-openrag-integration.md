# Retrospective — 2026-03-13 (OpenRAG Integration)

## What happened

Installed and integrated OpenRAG (https://github.com/langflow-ai/openrag) into the Nasri Oracle project. Full stack deployment via Podman in WSL, wired into both the agent layer (MCP) and the office UI.

**Work completed:**
- `openrag-sdk` Python client installed on Windows
- `uv` + `openrag` CLI installed in WSL Ubuntu
- `~/.openrag/tui/.env` + `docker-compose.yml` configured (port 3001, Podman runtime)
- `maw-js/start-openrag.sh` — start/stop/status script
- `maw-js/openrag-mcp.py` — MCP stdio server (4 tools: search, chat, ingest, list_documents)
- `.mcp.json` updated — `openrag` server added
- `MemoryView.tsx` updated — OpenRAG tab added (purple, after `|` separator)
- Office UI rebuilt to `dist-office/`
- Systemd user service `openrag.service` created and enabled — auto-starts on WSL boot

## What was learned

- **CRLF problem**: Files written by Windows tools (via Claude Code Bash) into WSL-accessible paths inherit Windows line endings. All shell scripts that run in WSL need `sed -i 's/\r//' file` before use. Fix upstream: write WSL files with explicit LF.
- **Podman short-name resolution**: Podman (unlike Docker) refuses unqualified image names unless `/etc/containers/registries.conf` has search registries. Fix without sudo: prefix all images with `docker.io/` in compose file.
- **compose build: directives**: Backend-generated docker-compose.yml had `build:` blocks referencing non-existent local Dockerfiles. OpenRAG ships pre-built images — remove `build:` blocks so it just pulls.
- **`~` in shell variable**: `COMPOSE_CMD="~/.local/bin/uvx ..."` does NOT expand `~`. Must use `$HOME/.local/bin/uvx`.
- **Systemd in WSL2**: `systemd=true` was already set in `/etc/wsl.conf`. User systemd services work; `loginctl enable-linger` activates them at boot without login.
- **OpenRAG architecture**: Full stack = OpenSearch + Langflow + openrag-backend + openrag-frontend. Requires container runtime. SDK (`openrag-sdk`) is only the HTTP client — useless without the server running.

## What surprised

- The backend-architect agent wrote the `.env` and `docker-compose.yml` with Windows line endings even though target is WSL — took 4 fix iterations.
- OpenRAG's compose file template includes `build:` directives (presumably for dev/contributors) alongside pre-built image names. The image-name takes precedence if build context doesn't exist, but podman-compose still tries to build first.
- Podman was already installed in WSL (from a prior `sudo apt-get install podman` the user had run) — `check_podman()` passed silently.

## What's next

- **Activate OpenRAG**: User still needs to run `sudo loginctl enable-linger po-ch` + trigger first pull (images ~2-3 GB)
- **Add OpenAI API key**: `~/.openrag/tui/.env` → `OPENAI_API_KEY=sk-...`
- **Verify UI tab**: After OpenRAG is running, test the purple OpenRAG tab in `#memory`
- **Test MCP tools**: With OpenRAG live, test `openrag_search` and `openrag_chat` from Claude Code
- **Ingest oracle ψ/ docs**: Use `openrag_ingest_text` to feed key learnings/retrospectives into OpenRAG for cross-RAG search
