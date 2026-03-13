"""Ingest pipeline: read ψ/memory markdown files → chunk → attach metadata."""

import hashlib
import json
from pathlib import Path
from dataclasses import dataclass, field

from config import MEMORY_DIRS, SECTION_MAX_CHARS, PRIVATE_LAYERS, MANIFEST_PATH


@dataclass
class Chunk:
    id: str
    text: str
    metadata: dict = field(default_factory=dict)


# ── File scanning ──────────────────────────────────────

def scan_files() -> list[Path]:
    """Find all .md files in ψ/memory subdirectories (recursive)."""
    files = []
    for layer, dirpath in MEMORY_DIRS.items():
        if dirpath.exists():
            files.extend(dirpath.rglob("*.md"))
    return sorted(files)


def scan_jsonl_files() -> list[Path]:
    """Find all .jsonl files in ψ/memory/logs (non-recursive)."""
    logs_dir = MEMORY_DIRS.get("logs")
    if not logs_dir or not logs_dir.exists():
        return []
    return sorted(logs_dir.glob("*.jsonl"))


def detect_layer(filepath: Path) -> str:
    """Determine which memory layer a file belongs to."""
    for layer, dirpath in MEMORY_DIRS.items():
        try:
            filepath.relative_to(dirpath)
            return layer
        except ValueError:
            continue
    return "unknown"


# ── Manifest (P2: change detection) ───────────────────

def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {}


def save_manifest(manifest: dict) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def file_hash(filepath: Path) -> str:
    return hashlib.sha256(filepath.read_bytes()).hexdigest()[:16]


# ── Section-level chunking (P3) ───────────────────────

def parse_sections(text: str) -> list[tuple[str, str]]:
    """Split markdown into (heading, body) sections."""
    sections = []
    current_heading = "preamble"
    current_lines = []

    for line in text.split("\n"):
        if line.startswith("#"):
            if current_lines:
                sections.append((current_heading, "\n".join(current_lines).strip()))
            current_heading = line.lstrip("#").strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        sections.append((current_heading, "\n".join(current_lines).strip()))

    return [(h, b) for h, b in sections if b]


def split_large_section(text: str, max_chars: int = SECTION_MAX_CHARS) -> list[str]:
    """Split oversized section at word boundaries with overlap."""
    if len(text) <= max_chars:
        return [text] if text.strip() else []

    chunks = []
    words = text.split()
    current = []
    current_len = 0

    for word in words:
        word_len = len(word) + 1  # +1 for space
        if current_len + word_len > max_chars and current:
            chunks.append(" ".join(current))
            # Keep last ~20% of words as overlap
            overlap_count = max(1, len(current) // 5)
            current = current[-overlap_count:]
            current_len = sum(len(w) + 1 for w in current)
        current.append(word)
        current_len += word_len

    if current:
        chunks.append(" ".join(current))

    return chunks


# ── JSONL ingest ───────────────────────────────────────

def ingest_jsonl_file(filepath: Path) -> list[Chunk]:
    """Ingest a .jsonl token-usage file. One Chunk per tool + one summary Chunk."""
    from collections import defaultdict

    stem = filepath.stem
    tool_entries: dict[str, list[dict]] = defaultdict(list)

    for raw_line in filepath.read_text(encoding="utf-8").splitlines():
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            entry = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        tool = entry.get("tool", "unknown")
        tool_entries[tool].append(entry)

    chunks = []
    grand_total_calls = 0
    grand_total_tokens = 0

    for tool_name, entries in sorted(tool_entries.items()):
        calls = len(entries)
        total_tokens = sum(e.get("total_tokens", 0) for e in entries)
        avg_tokens = round(total_tokens / calls) if calls else 0
        last_ts = max(e.get("ts", "") for e in entries)

        text = (
            f"tool: {tool_name} | calls: {calls} | "
            f"total_tokens: {total_tokens} | avg: {avg_tokens} | last: {last_ts}"
        )
        chunk_id = f"logs::{stem}::{tool_name}::0"
        chunks.append(Chunk(
            id=chunk_id,
            text=text,
            metadata={
                "source_file": filepath.name,
                "layer": "logs",
                "section": tool_name,
                "private": False,
                "chunk_index": 0,
                "type": "token-usage",
            },
        ))
        grand_total_calls += calls
        grand_total_tokens += total_tokens

    # Summary chunk for the whole file
    n_tools = len(tool_entries)
    summary_text = (
        f"Token usage summary | tools: {n_tools} | "
        f"total_calls: {grand_total_calls} | "
        f"grand_total_tokens: {grand_total_tokens} | "
        f"file: {filepath.name}"
    )
    chunks.append(Chunk(
        id=f"logs::{stem}::summary::0",
        text=summary_text,
        metadata={
            "source_file": filepath.name,
            "layer": "logs",
            "section": "summary",
            "private": False,
            "chunk_index": 0,
            "type": "token-usage",
        },
    ))

    return chunks


# ── Ingest ─────────────────────────────────────────────

def ingest_file(filepath: Path) -> list[Chunk]:
    """Ingest a single markdown file into chunks with metadata."""
    text = filepath.read_text(encoding="utf-8")
    layer = detect_layer(filepath)
    filename = filepath.stem
    sections = parse_sections(text)

    chunks = []
    for section_heading, section_body in sections:
        # P3: section-level chunking — only split if section is too large
        text_chunks = split_large_section(section_body)
        safe_heading = section_heading.replace("/", "|")  # avoid ambiguous IDs
        for i, chunk_text_str in enumerate(text_chunks):
            chunk_id = f"{layer}::{filename}::{safe_heading}::{i}"
            chunks.append(Chunk(
                id=chunk_id,
                text=chunk_text_str,
                metadata={
                    "source_file": str(filepath.name),
                    "layer": layer,
                    "section": section_heading,
                    "private": layer in PRIVATE_LAYERS,
                    "chunk_index": i,
                },
            ))

    return chunks


def ingest_all(force: bool = False) -> tuple[list[Chunk], list[str]]:
    """Ingest ψ/memory markdown and .jsonl files. Returns (chunks, stale_ids).

    P2: Skips unchanged files unless force=True.
    P1: Returns stale chunk IDs from deleted/renamed files.
    """
    md_files = scan_files()
    jsonl_files = scan_jsonl_files()
    manifest = load_manifest()
    new_manifest = {}
    all_chunks = []
    skipped = 0

    def _process_file(f: Path, ingest_fn) -> None:
        nonlocal skipped
        layer = detect_layer(f)
        layer_root = MEMORY_DIRS.get(layer)
        fkey = f"{layer}/{f.relative_to(layer_root)}" if layer_root else str(f.name)
        fhash = file_hash(f)
        new_manifest[fkey] = fhash

        if not force and manifest.get(fkey) == fhash:
            skipped += 1
            return

        try:
            file_chunks = ingest_fn(f)
            all_chunks.extend(file_chunks)
            print(f"  + {fkey} -> {len(file_chunks)} chunks")
        except Exception as e:
            print(f"  ! {fkey} FAILED: {e}")

    for f in md_files:
        _process_file(f, ingest_file)

    for f in jsonl_files:
        _process_file(f, ingest_jsonl_file)

    if skipped:
        print(f"  = {skipped} unchanged files skipped")

    # P1: detect stale files (in old manifest but not in current scan)
    all_files = md_files + jsonl_files
    current_files = {
        f"{detect_layer(f)}/{f.relative_to(MEMORY_DIRS[detect_layer(f)])}"
        if detect_layer(f) in MEMORY_DIRS else str(f.name)
        for f in all_files
    }
    stale_files = set(manifest.keys()) - current_files
    stale_ids = []
    if stale_files:
        for sf in stale_files:
            print(f"  - {sf} removed (will clean stale chunks)")
        stale_ids = list(stale_files)

    save_manifest(new_manifest)

    total = len(all_files)
    changed = total - skipped
    print(f"\n  Total: {total} files, {changed} changed, {len(all_chunks)} chunks")
    return all_chunks, stale_ids


if __name__ == "__main__":
    chunks, stale = ingest_all()
