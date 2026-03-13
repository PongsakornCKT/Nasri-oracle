# Session Retrospective — 2026-03-14 (Session 3) — OpenRAG Deep Pipeline Fix

## What happened
- Deep-dived into OpenRAG ingestion pipeline failure ("Unknown error" / OPENAI_API_KEY)
- Traced root cause through 4 layers: backend settings → Langflow API → flow JSON → component options
- **Fixed EmbeddingModel**: Langflow 1.8.0's EmbeddingModel component has NO Ollama option in dropdown. Backend's `change_langflow_model_value` silently fails finding `provider == "Ollama"`. Manually constructed Ollama entry and PATCH'd all 4 flows via Langflow API
- **Fixed show_progress error**: OllamaEmbeddings doesn't accept `show_progress` param — removed from param_mapping
- **Fixed DoclingRemote URL**: `DOCLING_SERVE_URL` global variable had null value. Set api_url directly to `http://host.containers.internal:5001`
- **Fixed httpx timeout**: DoclingRemote's httpx.Client had default 5s timeout, extended to 300s
- **Patched static flow files**: All 4 flow JSON files in `/app/flows/` updated with Ollama config for restart persistence
- Updated test suite to 5 tests — all passing
- Discovered docling-serve v1.14.3 task worker broken (all conversions fail silently)

## What was learned
- Langflow 1.8.0 EmbeddingModel only ships with OpenAI/Google/WatsonX providers — Ollama must be injected manually
- Backend's `_update_component_fields` has a silent failure: calls `enabled_models` API, gets the model options, but if provider not in options it returns `False` while `api_base` updates return `True` — misleading success
- `load_from_db: true` fields read from Langflow's `variable` table (encrypted). If variable doesn't exist, the component gets null/empty
- docling-serve v1.14.3 (docling-jobkit 1.13.0) has broken async task worker — tasks go pending→failure with no error. Direct docling library (v2.79.0) works fine
- Langflow API key auth: get via backend's `get_langflow_api_key()`, use `x-api-key` header

## What surprised
- The backend logs "Successfully updated flows for embedding provider ollama" even when the update silently fails
- docling-serve accepts tasks and responds 200, but the internal worker fails every conversion without logging any error
- The flow has 3 separate EmbeddingModel nodes (not 1) — all needed patching

## What's next
- Fix docling-serve: either downgrade to a working version, use Docker image, or switch to direct docling ingestion
- Verify end-to-end ingestion works once docling-serve is fixed
- Consider filing upstream issue for Langflow EmbeddingModel missing Ollama support
- Commit oracle-agent/ deletions + consolidate bomsolar duplicates
