"""CLI entry point for the ψ/memory embedding engine."""

import argparse
import sys

from config import GEMINI_COLLECTION, OLLAMA_COLLECTION


def cmd_ingest(force: bool = False):
    """Ingest ψ/memory files into embedding collection."""
    from ingest import ingest_all
    from embed import DualEmbedder
    from store import get_client, get_collection, add_documents, delete_by_source

    print("Scanning psi/memory...\n")
    chunks, stale_files = ingest_all(force=force)

    client = get_client()

    # P1: clean stale chunks from deleted files
    if stale_files:
        for coll_name in [GEMINI_COLLECTION, OLLAMA_COLLECTION]:
            try:
                coll = get_collection(client, coll_name)
                deleted = delete_by_source(coll, stale_files)
                if deleted:
                    print(f"  Cleaned {deleted} stale chunks from '{coll_name}'")
            except Exception:
                pass

    if not chunks:
        print("\n  No new chunks to embed.")
        return

    print(f"\nEmbedding {len(chunks)} chunks...")
    embedder = DualEmbedder()
    texts = [c.text for c in chunks]
    embeddings, engine = embedder.embed(texts)
    print(f"  Engine used: {engine}")

    collection_name = GEMINI_COLLECTION if engine == "gemini" else OLLAMA_COLLECTION
    collection = get_collection(client, collection_name)
    add_documents(
        collection,
        ids=[c.id for c in chunks],
        embeddings=embeddings,
        documents=texts,
        metadatas=[c.metadata for c in chunks],
    )

    print(f"\nDone: {len(chunks)} chunks stored in '{collection_name}'")


def cmd_query(question: str, engine: str | None = None, top_k: int = 5, as_json: bool = False):
    """RAG query against psi/memory."""
    import json as _json
    from rag import query

    results = query(question, engine=engine, top_k=top_k)

    if as_json:
        output = {
            "query": question,
            "engine": results[0].engine if results else engine or "auto",
            "results": [
                {
                    "text": r.text,
                    "source": r.source,
                    "layer": r.layer,
                    "section": r.section,
                    "score": round(1 - r.distance, 4),
                    "engine": r.engine,
                }
                for r in results
            ],
            "total": len(results),
        }
        print(_json.dumps(output))
        return

    print(f"Query: {question}\n")

    if not results:
        print("  No results found.")
        return

    for i, r in enumerate(results, 1):
        print(f"\n  {i}. {r}")


def cmd_sync():
    """Sync Gemini -> Ollama embeddings."""
    from sync import sync_gemini_to_ollama

    print("Syncing Gemini -> Ollama...\n")
    sync_gemini_to_ollama()


def cmd_status(as_json: bool = False):
    """Show collection stats."""
    import json as _json
    from store import get_client, collection_stats, get_collection
    from sync import load_sync_state
    from ingest import load_manifest
    from config import GEMINI_MODEL, OLLAMA_MODEL, GEMINI_DIMS, OLLAMA_DIMS

    client = get_client()
    stats = collection_stats(client)

    manifest = load_manifest()
    state = load_sync_state()

    if as_json:
        # Build chunks_by_layer by querying ChromaDB metadata
        chunks_by_layer = {"learnings": 0, "retrospectives": 0, "resonance": 0, "logs": 0}
        for coll_name in stats:
            try:
                coll = get_collection(client, coll_name)
                if coll.count() > 0:
                    all_meta = coll.get(include=["metadatas"])
                    for meta in all_meta.get("metadatas", []):
                        layer = meta.get("layer", "unknown")
                        if layer in chunks_by_layer:
                            chunks_by_layer[layer] += 1
                    break  # Only count from one collection to avoid double-counting
            except Exception:
                pass

        # Determine engine status
        gemini_status = "active" if stats.get("memory_gemini", {}).get("count", 0) > 0 else "empty"
        ollama_status = "active" if stats.get("memory_ollama", {}).get("count", 0) > 0 else "empty"

        output = {
            "collections": {name: {"count": info.get("count", 0)} for name, info in stats.items()},
            "indexed_files": len(manifest) if manifest else 0,
            "last_sync": state.get("last_synced", None) if state else None,
            "engines": {
                "gemini": {"model": GEMINI_MODEL, "dims": GEMINI_DIMS, "status": gemini_status},
                "ollama": {"model": OLLAMA_MODEL, "dims": OLLAMA_DIMS, "status": ollama_status},
            },
            "chunks_by_layer": chunks_by_layer,
        }
        print(_json.dumps(output))
        return

    print("psi/memory Embedding Status\n")
    for name, info in stats.items():
        print(f"  {name}: {info.get('count', 0)} documents")

    if manifest:
        print(f"\n  Indexed files: {len(manifest)}")

    if state:
        print(f"  Last sync: {state.get('last_synced', 'never')}")
        print(f"  Documents synced: {state.get('documents_synced', 0)}")
    else:
        print("\n  No sync history.")


def main():
    parser = argparse.ArgumentParser(description="psi/memory embedding engine")
    sub = parser.add_subparsers(dest="command")

    # ingest
    p_ingest = sub.add_parser("ingest", help="Ingest psi/memory files")
    p_ingest.add_argument("--force", action="store_true", help="Re-embed all files, ignore cache")

    # query
    p_query = sub.add_parser("query", help="RAG query")
    p_query.add_argument("question", nargs="+", help="Natural language question")
    p_query.add_argument("--engine", choices=["gemini", "ollama"], help="Force specific engine")
    p_query.add_argument("--top_k", type=int, default=5, help="Number of results")
    p_query.add_argument("--json", action="store_true", help="Output as JSON")

    # sync
    sub.add_parser("sync", help="Sync Gemini -> Ollama embeddings")

    # status
    p_status = sub.add_parser("status", help="Show embedding stats")
    p_status.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    if args.command == "ingest":
        cmd_ingest(force=args.force)
    elif args.command == "query":
        cmd_query(" ".join(args.question), engine=args.engine, top_k=args.top_k, as_json=args.json)
    elif args.command == "sync":
        cmd_sync()
    elif args.command == "status":
        cmd_status(as_json=args.json)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
