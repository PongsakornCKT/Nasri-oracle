---
name: langflow-ollama-embedding-manual-patch
description: Langflow 1.8.0 EmbeddingModel has no Ollama option — must manually inject via API PATCH
type: learning
---

# Langflow 1.8.0 EmbeddingModel — Ollama Not Available

## Problem
Langflow 1.8.0's `EmbeddingModel` component only has OpenAI, Google, and IBM WatsonX in its options dropdown.
The OpenRAG backend's `change_langflow_model_value` calls `enabled_models` API then searches for `provider == "Ollama"` in options — finds nothing, silently fails.

## Solution
Manually construct the Ollama entry and PATCH all flows via Langflow API:

```python
ollama_entry = {
    "category": "Ollama",
    "icon": "Ollama",
    "metadata": {
        "embedding_class": "OllamaEmbeddings",
        "model_type": "embeddings",
        "param_mapping": {
            "api_base": "base_url",
            "model": "model"
            # Do NOT include show_progress_bar — OllamaEmbeddings rejects it
        }
    },
    "name": "nomic-embed-text",
    "provider": "Ollama"
}
```

Key fields to update in each EmbeddingModel node template:
- `model.value = [ollama_entry]`
- `model.options` — append ollama_entry
- `api_base.value = "OLLAMA_BASE_URL"`, `api_base.load_from_db = True`
- `api_key.value = ""`, `api_key.required = False`

Also patch static flow files in `/app/flows/*.json` for restart persistence.

## Auth
- Get API key: `get_langflow_api_key(force_regenerate=True)` from backend
- Use header: `x-api-key: <key>`
- PATCH endpoint: `/api/v1/flows/{flow_id}`
