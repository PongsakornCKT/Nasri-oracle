"""Dual embedding engine: Gemini (primary) + Ollama (fallback)."""

import os

from dotenv import load_dotenv

from config import (
    ENV_PATH, GEMINI_MODEL, GEMINI_DIMS,
    OLLAMA_MODEL,
)

load_dotenv(ENV_PATH)


class GeminiEmbedder:
    """Google Gemini embedding via google-genai SDK."""

    def __init__(self):
        from google import genai
        from google.genai import types
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set in .env")
        self.client = genai.Client(api_key=api_key)
        self.types = types
        self.model = GEMINI_MODEL
        self.dims = GEMINI_DIMS

    def _embed(self, contents, task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
        """Core embed call."""
        response = self.client.models.embed_content(
            model=self.model,
            contents=contents,
            config=self.types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=self.dims,
            ),
        )
        return [e.values for e in response.embeddings]

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts."""
        results = []
        # Batch in groups of 100
        for i in range(0, len(texts), 100):
            batch = texts[i:i + 100]
            results.extend(self._embed(batch, "RETRIEVAL_DOCUMENT"))
        return results

    def embed_query(self, query: str) -> list[float]:
        """Embed a single query text."""
        return self._embed([query], "RETRIEVAL_QUERY")[0]


class OllamaEmbedder:
    """Ollama with nomic-embed-text (local)."""

    def __init__(self):
        import ollama as _ollama
        self.client = _ollama
        self.model = OLLAMA_MODEL

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts."""
        results = []
        for text in texts:
            response = self.client.embeddings(model=self.model, prompt=text)
            results.append(response["embedding"])
        return results

    def embed_query(self, query: str) -> list[float]:
        """Embed a single query text."""
        response = self.client.embeddings(model=self.model, prompt=query)
        return response["embedding"]


class DualEmbedder:
    """Tries Gemini first, falls back to Ollama."""

    def __init__(self):
        self._gemini = None
        self._ollama = None

    @property
    def gemini(self) -> GeminiEmbedder:
        if self._gemini is None:
            self._gemini = GeminiEmbedder()
        return self._gemini

    @property
    def ollama(self) -> OllamaEmbedder:
        if self._ollama is None:
            self._ollama = OllamaEmbedder()
        return self._ollama

    def embed(self, texts: list[str]) -> tuple[list[list[float]], str]:
        """Embed texts, returning (embeddings, engine_used)."""
        try:
            return self.gemini.embed(texts), "gemini"
        except Exception as e:
            print(f"  Gemini unavailable ({e}), falling back to Ollama...")
            try:
                return self.ollama.embed(texts), "ollama"
            except Exception as e2:
                raise RuntimeError(f"Both engines failed. Gemini: {e}, Ollama: {e2}")

    def embed_query(self, query: str) -> tuple[list[float], str]:
        """Embed a query, returning (embedding, engine_used)."""
        try:
            return self.gemini.embed_query(query), "gemini"
        except Exception:
            try:
                return self.ollama.embed_query(query), "ollama"
            except Exception as e2:
                raise RuntimeError(f"Both engines failed for query: {e2}")

    def embed_with(self, engine: str, texts: list[str]) -> list[list[float]]:
        """Embed with a specific engine."""
        if engine == "gemini":
            return self.gemini.embed(texts)
        elif engine == "ollama":
            return self.ollama.embed(texts)
        else:
            raise ValueError(f"Unknown engine: {engine}")

    def query_with(self, engine: str, query: str) -> list[float]:
        """Embed a query with a specific engine."""
        if engine == "gemini":
            return self.gemini.embed_query(query)
        elif engine == "ollama":
            return self.ollama.embed_query(query)
        else:
            raise ValueError(f"Unknown engine: {engine}")
