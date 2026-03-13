"""Configuration for the ψ/memory embedding engine."""

from pathlib import Path

# ── Paths ──────────────────────────────────────────────
PSI_ROOT = Path(__file__).resolve().parent.parent.parent  # ψ/
MEMORY_ROOT = PSI_ROOT / "memory"

MEMORY_DIRS = {
    "learnings": MEMORY_ROOT / "learnings",
    "retrospectives": MEMORY_ROOT / "retrospectives",
    "resonance": MEMORY_ROOT / "resonance",
    "logs": MEMORY_ROOT / "logs",
}

CHROMA_PATH = Path(__file__).resolve().parent / "chroma_data"
ENV_PATH = Path(__file__).resolve().parent / ".env"
MANIFEST_PATH = CHROMA_PATH / "manifest.json"

# ── Embedding Models ───────────────────────────────────
GEMINI_MODEL = "gemini-embedding-001"
GEMINI_DIMS = 768

OLLAMA_MODEL = "nomic-embed-text"
OLLAMA_DIMS = 768

# ── Chunking ───────────────────────────────────────────
SECTION_MAX_CHARS = 1500  # split sections larger than this

# ── Collections ────────────────────────────────────────
GEMINI_COLLECTION = "memory_gemini"
OLLAMA_COLLECTION = "memory_ollama"

# ── Query ──────────────────────────────────────────────
DEFAULT_TOP_K = 5

# ── Privacy ────────────────────────────────────────────
PRIVATE_LAYERS = {"resonance"}
