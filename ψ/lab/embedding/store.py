"""ChromaDB vector store management."""

import chromadb

from config import CHROMA_PATH, GEMINI_COLLECTION, OLLAMA_COLLECTION


def get_client() -> chromadb.PersistentClient:
    """Get or create persistent ChromaDB client."""
    return chromadb.PersistentClient(path=str(CHROMA_PATH))


def get_collection(client: chromadb.PersistentClient, name: str) -> chromadb.Collection:
    """Get or create a collection."""
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )


def add_documents(
    collection: chromadb.Collection,
    ids: list[str],
    embeddings: list[list[float]],
    documents: list[str],
    metadatas: list[dict],
) -> None:
    """Add or update documents in a collection."""
    batch_size = 500
    for i in range(0, len(ids), batch_size):
        end = i + batch_size
        collection.upsert(
            ids=ids[i:end],
            embeddings=embeddings[i:end],
            documents=documents[i:end],
            metadatas=metadatas[i:end],
        )


def query_collection(
    collection: chromadb.Collection,
    query_embedding: list[float],
    top_k: int = 5,
    where: dict | None = None,
) -> dict:
    """Query a collection for similar documents."""
    count = collection.count()
    if count == 0:
        return {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}

    kwargs = {
        "query_embeddings": [query_embedding],
        "n_results": min(top_k, count),
        "include": ["documents", "metadatas", "distances"],
    }
    if where:
        kwargs["where"] = where
    return collection.query(**kwargs)


def delete_by_source(collection: chromadb.Collection, source_files: list[str]) -> int:
    """Delete all chunks belonging to specific source files. Returns count deleted."""
    deleted = 0
    for sf in source_files:
        try:
            results = collection.get(where={"source_file": sf})
            if results["ids"]:
                collection.delete(ids=results["ids"])
                deleted += len(results["ids"])
        except Exception:
            pass
    return deleted


def delete_collection(client: chromadb.PersistentClient, name: str) -> None:
    """Delete a collection entirely."""
    try:
        client.delete_collection(name)
    except Exception:
        pass


def collection_stats(client: chromadb.PersistentClient) -> dict:
    """Get stats for all collections."""
    stats = {}
    for name in [GEMINI_COLLECTION, OLLAMA_COLLECTION]:
        try:
            coll = client.get_collection(name)
            stats[name] = {"count": coll.count()}
        except Exception:
            stats[name] = {"count": 0, "status": "not created"}
    return stats
