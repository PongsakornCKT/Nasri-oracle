#!/usr/bin/env bash
# test_openrag_pipeline.sh
# Validates the OpenRAG document ingestion pipeline: connectivity, models, config.
# Usage: bash test_openrag_pipeline.sh

set -euo pipefail

PASS=0
FAIL=0

pass() { echo "[PASS] $1"; PASS=$((PASS + 1)); }
fail() { echo "[FAIL] $1 — $2"; FAIL=$((FAIL + 1)); }

separator() { echo "----------------------------------------------"; }

# ---------------------------------------------------------------------------
# TEST 1: Docling health
# ---------------------------------------------------------------------------
separator
echo "TEST 1: Docling health"

DOCLING_RESPONSE=$(curl -sf --max-time 5 http://localhost:5001/health 2>/dev/null || true)

if echo "$DOCLING_RESPONSE" | grep -q '"status"' && echo "$DOCLING_RESPONSE" | grep -q '"ok"'; then
  pass "Docling /health returned {\"status\":\"ok\"}"
else
  fail "Docling /health" "got: '${DOCLING_RESPONSE:-<no response>}' — expected {\"status\":\"ok\"}"
fi

# ---------------------------------------------------------------------------
# TEST 2: Ollama models
# ---------------------------------------------------------------------------
separator
echo "TEST 2: Ollama models"

OLLAMA_RESPONSE=$(curl -sf --max-time 5 http://172.31.32.1:11434/api/tags 2>/dev/null || true)

NOMIC_OK=false
QWEN_OK=false

if echo "$OLLAMA_RESPONSE" | grep -q "nomic-embed-text"; then
  NOMIC_OK=true
fi
if echo "$OLLAMA_RESPONSE" | grep -q "qwen2.5:3b"; then
  QWEN_OK=true
fi

if $NOMIC_OK && $QWEN_OK; then
  pass "Ollama has nomic-embed-text and qwen2.5:3b"
elif ! $NOMIC_OK && ! $QWEN_OK; then
  fail "Ollama models" "neither nomic-embed-text nor qwen2.5:3b found — got: '${OLLAMA_RESPONSE:-<no response>}'"
elif ! $NOMIC_OK; then
  fail "Ollama models" "nomic-embed-text missing (qwen2.5:3b present)"
else
  fail "Ollama models" "qwen2.5:3b missing (nomic-embed-text present)"
fi

# ---------------------------------------------------------------------------
# TEST 3: OpenRAG settings
# ---------------------------------------------------------------------------
separator
echo "TEST 3: OpenRAG settings"

SETTINGS_RESPONSE=$(curl -sf --max-time 5 http://localhost:3001/api/settings 2>/dev/null || true)

EMBED_PROVIDER_OK=false
EMBED_MODEL_OK=false
EDITED_OK=false

if echo "$SETTINGS_RESPONSE" | grep -q '"embedding_provider"' && echo "$SETTINGS_RESPONSE" | grep -q '"ollama"'; then
  EMBED_PROVIDER_OK=true
fi
if echo "$SETTINGS_RESPONSE" | grep -q '"embedding_model"' && echo "$SETTINGS_RESPONSE" | grep -q '"nomic-embed-text"'; then
  EMBED_MODEL_OK=true
fi
if echo "$SETTINGS_RESPONSE" | grep -q '"edited"' && echo "$SETTINGS_RESPONSE" | grep -q 'true'; then
  EDITED_OK=true
fi

SETTINGS_ERRORS=""
$EMBED_PROVIDER_OK || SETTINGS_ERRORS="${SETTINGS_ERRORS} embedding_provider!=ollama;"
$EMBED_MODEL_OK    || SETTINGS_ERRORS="${SETTINGS_ERRORS} embedding_model!=nomic-embed-text;"
$EDITED_OK         || SETTINGS_ERRORS="${SETTINGS_ERRORS} edited!=true;"

if $EMBED_PROVIDER_OK && $EMBED_MODEL_OK && $EDITED_OK; then
  pass "OpenRAG settings: embedding_provider=ollama, embedding_model=nomic-embed-text, edited=true"
else
  fail "OpenRAG settings" "${SETTINGS_ERRORS} — raw: '${SETTINGS_RESPONSE:-<no response>}'"
fi

# ---------------------------------------------------------------------------
# TEST 4: Langflow health
# ---------------------------------------------------------------------------
separator
echo "TEST 4: Langflow health"

LANGFLOW_RESPONSE=$(curl -sf --max-time 5 http://localhost:7860/health 2>/dev/null || true)

if echo "$LANGFLOW_RESPONSE" | grep -q '"status"' && echo "$LANGFLOW_RESPONSE" | grep -q '"ok"'; then
  pass "Langflow /health returned {\"status\":\"ok\"}"
else
  fail "Langflow /health" "got: '${LANGFLOW_RESPONSE:-<no response>}' — expected {\"status\":\"ok\"}"
fi

# ---------------------------------------------------------------------------
# TEST 5: Langflow EmbeddingModel uses Ollama (not OpenAI)
# ---------------------------------------------------------------------------
separator
echo "TEST 5: Langflow EmbeddingModel configuration"

EMBED_CHECK=$(podman exec langflow python3 -c "
import json
with open('/app/flows/ingestion_flow.json') as f:
    flow = json.load(f)
nodes = flow.get('data',{}).get('nodes',[])
ollama_count = 0
for n in nodes:
    if n['data']['type'] == 'EmbeddingModel':
        val = n['data']['node']['template'].get('model',{}).get('value',[])
        if val and val[0].get('provider') == 'Ollama':
            ollama_count += 1
print(ollama_count)
" 2>/dev/null || echo "0")

if [ "$EMBED_CHECK" = "3" ]; then
  pass "All 3 EmbeddingModel nodes configured for Ollama/nomic-embed-text"
elif [ "$EMBED_CHECK" -gt "0" ] 2>/dev/null; then
  fail "Langflow EmbeddingModel" "Only $EMBED_CHECK/3 nodes use Ollama"
else
  fail "Langflow EmbeddingModel" "Could not verify embedding config (got: $EMBED_CHECK)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
separator
TOTAL=$((PASS + FAIL))
echo "Results: ${PASS}/${TOTAL} passed"
separator

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
