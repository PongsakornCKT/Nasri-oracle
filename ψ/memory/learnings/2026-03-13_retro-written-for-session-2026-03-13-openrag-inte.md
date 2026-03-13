---
title: Retro written for session 2026-03-13 (OpenRAG Integration).
tags: [retrospective, skill/rrr, skill-record, openrag, wsl, podman, mcp, docker-compose, crlf]
created: 2026-03-13
source: skill/rrr
---

# Retro written for session 2026-03-13 (OpenRAG Integration).

Retro written for session 2026-03-13 (OpenRAG Integration).

Key learnings:
- WSL shell scripts written via Windows tools always need CRLF stripping: `sed -i 's/\r//' file.sh` — apply immediately after writing any .sh or .env file for WSL
- Podman requires fully-qualified image names (prefix `docker.io/`) — unqualified names fail without registries.conf edit; fix in compose file, not system config
- OpenRAG docker-compose has `build:` directives for dev use; remove them when deploying with pre-built images to avoid local Dockerfile lookup failures

Threads open: OpenRAG server still needs first image pull (~2-3 GB), OpenAI key in .env, then test MCP tools (openrag_search, openrag_chat) and ingest ψ/ docs into OpenRAG.

---
*Added via Oracle Learn*
