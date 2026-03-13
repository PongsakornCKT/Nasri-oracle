"""Sync embeddings from Gemini collection → re-embed with Ollama → store."""

import json
from datetime import datetime, timezone

from config import GEMINI_COLLECTION, OLLAMA_COLLECTION, CHROMA_PATH
from embed import DualEmbedder
from store import get_client, get_collection, add_documents


SYNC_STATE_FILE = CHROMA_PATH / "sync_state.json"


def load_sync_state() -> dict:
    if SYNC_STATE_FILE.exists():
        return json.loads(SYNC_STATE_FILE.read_text(encoding="utf-8"))
    return {}


def save_sync_state(state: dict) -> None:
    SYNC_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    SYNC_STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def sync_gemini_to_ollama() -> dict:
    """Re-embed all Gemini collection documents using Ollama and store them."""
    client = get_client()
    embedder = DualEmbedder()

    # Read everything from Gemini collection
    gemini_coll = get_collection(client, GEMINI_COLLECTION)
    count = gemini_coll.count()
    if count == 0:
        print("  Nothing to sync — Gemini collection is empty.")
        return {"synced": 0}

    # Fetch all documents
    all_data = gemini_coll.get(include=["documents", "metadatas"])
    ids = all_data["ids"]
    documents = all_data["documents"]
    metadatas = all_data["metadatas"]

    print(f"  Re-embedding {len(ids)} chunks with Ollama...")

    # Re-embed with Ollama
    try:
        ollama_embeddings = embedder.embed_with("ollama", documents)
    except Exception as e:
        print(f"  ✗ Ollama embedding failed: {e}")
        print("  Make sure Ollama is running: ollama serve")
        print("  And model is pulled: ollama pull nomic-embed-text")
        return {"synced": 0, "error": str(e)}

    # Store in Ollama collection
    ollama_coll = get_collection(client, OLLAMA_COLLECTION)
    add_documents(ollama_coll, ids, ollama_embeddings, documents, metadatas)

    # Save sync state
    state = {
        "last_synced": datetime.now(timezone.utc).isoformat(),
        "documents_synced": len(ids),
    }
    save_sync_state(state)

    print(f"  ✓ Synced {len(ids)} chunks to Ollama collection")
    return {"synced": len(ids)}


if __name__ == "__main__":
    sync_gemini_to_ollama()
