"""RAG query interface for ψ/memory."""

from dataclasses import dataclass

from config import GEMINI_COLLECTION, OLLAMA_COLLECTION, DEFAULT_TOP_K
from embed import DualEmbedder
from store import get_client, get_collection, query_collection


@dataclass
class SearchResult:
    text: str
    source: str
    layer: str
    section: str
    distance: float
    engine: str

    def __str__(self) -> str:
        score = 1 - self.distance  # cosine distance → similarity
        return (
            f"[{score:.2f}] {self.source} ({self.layer}/{self.section})\n"
            f"  {self.text[:200]}{'...' if len(self.text) > 200 else ''}"
        )


def query(
    question: str,
    engine: str | None = None,
    top_k: int = DEFAULT_TOP_K,
    include_private: bool = False,
) -> list[SearchResult]:
    """Query ψ/memory with a natural language question."""
    client = get_client()
    embedder = DualEmbedder()

    # Determine which engine and collection to use
    if engine == "ollama":
        collection_name = OLLAMA_COLLECTION
        embedding = embedder.query_with("ollama", question)
        used_engine = "ollama"
    elif engine == "gemini":
        collection_name = GEMINI_COLLECTION
        embedding = embedder.query_with("gemini", question)
        used_engine = "gemini"
    else:
        # Auto: use DualEmbedder (Gemini first, Ollama fallback)
        embedding, used_engine = embedder.embed_query(question)
        collection_name = GEMINI_COLLECTION if used_engine == "gemini" else OLLAMA_COLLECTION

    collection = get_collection(client, collection_name)
    if collection.count() == 0:
        # P1: warn about engine mismatch when collection is empty
        other = OLLAMA_COLLECTION if collection_name == GEMINI_COLLECTION else GEMINI_COLLECTION
        try:
            other_coll = get_collection(client, other)
            if other_coll.count() > 0:
                print(f"  Note: '{collection_name}' is empty but '{other}' has data.")
                print(f"  Run 'python run.py sync' or query with --engine explicitly.")
        except Exception:
            pass
        return []

    # Build filter
    where = None
    if not include_private:
        where = {"private": False}

    raw = query_collection(collection, embedding, top_k=top_k, where=where)

    # Parse results
    results = []
    for i in range(len(raw["ids"][0])):
        meta = raw["metadatas"][0][i]
        results.append(SearchResult(
            text=raw["documents"][0][i],
            source=meta.get("source_file", "unknown"),
            layer=meta.get("layer", "unknown"),
            section=meta.get("section", "unknown"),
            distance=raw["distances"][0][i],
            engine=used_engine,
        ))

    return results


def query_both(
    question: str,
    top_k: int = DEFAULT_TOP_K,
    include_private: bool = False,
) -> dict[str, list[SearchResult]]:
    """Query both engines and return separate results."""
    results = {}
    for eng in ["gemini", "ollama"]:
        try:
            results[eng] = query(question, engine=eng, top_k=top_k, include_private=include_private)
        except Exception as e:
            results[eng] = []
            print(f"  Warning: {eng} query failed: {e}")
    return results
