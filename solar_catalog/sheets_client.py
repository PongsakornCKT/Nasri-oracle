"""
Google Sheets integration for the shared Price Solar catalog.
Fetches product/pricing data from Enervia's master spreadsheet.
All sheets are read via the public CSV export (no API key needed for
published sheets).

This is the canonical implementation that previously lived in
mcp-qsolar/sheets.py.  The module is now re-exported from solar_catalog
so both mcp-qsolar and mcp-bomsolar share a single source of truth.

Cache layers (unchanged from the qsolar P2 release):
  L0 — preloaded (Node → Python catalog handoff via stdin).  Populated by
       server._load_stdin_catalog() mutating _PRELOADED_CATALOG.  Fastest —
       zero IO.  Lives for the life of the process.
  L1 — in-memory dict cache (_cache).  Lasts for the life of the Python
       process.
  L2 — on-disk JSON cache in %TEMP%/qsolar-sheet-cache.  Survives process
       restarts; since cp.execFile spawns a fresh Python every request on
       the LINE bot, this is what actually saves Google Sheets calls
       across requests.
  L3 — network (Google Sheets CSV).  Last resort, gated by circuit breaker.
"""

import csv
import hashlib
import io
import json
import os
import sys
import tempfile
import time
import urllib.request
from typing import Optional

SPREADSHEET_ID = "1ubrfga3m0uiOf68MGQRApAdnhU8oby6nYKtfzirpn9Y"

# Sheet name → GID mapping (discovered from HTML)
SHEETS = {
    "Finalprice":            1639151553,
    "Solar Panels":          1094845924,
    "Inverters - Huawei":    1605263729,
    "Inverters - Solis":     984571681,
    "Inverters - Deye":      1499264869,
    "Inverters - ATMOCE":    1829589831,
    "Inverters - Sigenergy": 524887216,
    "Inverters - Hoymiles":  447913208,
    "Inverters - Enphase":   1146681998,
    "Batteries":             1623780871,
    "Cables":                1682681584,
    "Mounting - Keenoc":     1345585929,
    "Optimizers":            1835933691,
    "Combiner Box & Others": 113577748,
    "Labor & Fees":          1264003568,
}

# ─── Cache layers ─────────────────────────────────────────────
# L0 — preloaded (Node → Python catalog handoff via stdin).  Populated by
#      server._load_stdin_catalog().  Fastest — zero IO.  Lives for the life
#      of the process.
# L1 — in-memory dict cache.  Lasts for the life of the Python process.
# L2 — on-disk JSON cache in %TEMP%/qsolar-sheet-cache.  Survives process
#      restarts.
#
# NOTE: _PRELOADED_CATALOG is mutated in-place from outside this module
# (server.py does `_sheets._PRELOADED_CATALOG[k] = v`).  The shim re-exports
# this exact dict object by reference, so mutations on the shim attribute
# still land on the real dict that fetch_sheet() reads from.  Never
# reassign this to a new dict — always mutate in place.
_PRELOADED_CATALOG: dict = {}
_cache: dict = {}
CACHE_TTL = 30  # 30 seconds — keeps data near-real-time with Google Sheet
_CACHE_TTL = CACHE_TTL  # alias kept for parity with sheet_prices module naming
DISK_CACHE_TTL = 60  # seconds — must match the 60-second spec
_DISK_CACHE_DIR = os.path.join(tempfile.gettempdir(), 'qsolar-sheet-cache')

# Tracks where the MOST RECENT fetch_sheet() call got its data from — used by
# product_lookup.py to annotate its return dicts with a `source` field.
# Shape: {sheet_name: {'source': str, 'ts': float, 'age_s': int}}
_last_source: dict = {}


def get_last_source(sheet_name: str) -> dict:
    """
    Return provenance info for the most recent fetch_sheet(sheet_name) call.
    Shape: {'source': 'live'|'cache-disk'|'cache-mem'|'preloaded'|'stale'|'fallback'|'unknown',
            'age_s': int, 'ts': float}
    Safe to call even if the sheet was never fetched (returns 'unknown').
    """
    entry = _last_source.get(sheet_name)
    if not entry:
        return {'source': 'unknown', 'age_s': 0, 'ts': 0.0}
    ts = entry.get('ts', 0.0)
    age = int(max(0, time.time() - ts)) if ts else 0
    return {
        'source': entry.get('source', 'unknown'),
        'age_s': age,
        'ts': ts,
    }


def _mark_source(sheet_name: str, source: str, data_ts: float) -> None:
    """Record where the data served for this sheet came from."""
    _last_source[sheet_name] = {'source': source, 'ts': data_ts}

# ─── Circuit breaker ──────────────────────────────────────────
# Protects Google Sheets fetch from cascading failures.  After
# _BREAKER_THRESHOLD consecutive network errors the circuit opens,
# blocking further network calls for _BREAKER_OPEN_SECONDS and forcing
# fallback to (stale) disk and in-memory caches.
_BREAKER_THRESHOLD = 3
_BREAKER_OPEN_SECONDS = 300  # 5 minutes
_breaker: dict = {'failures': 0, 'opened_at': 0.0}


def _breaker_is_open() -> bool:
    """True when the circuit is currently open (network fetch blocked)."""
    if _breaker['failures'] < _BREAKER_THRESHOLD:
        return False
    # failures reached threshold — check if cooldown has elapsed
    if _breaker['opened_at'] <= 0:
        return False
    elapsed = time.time() - _breaker['opened_at']
    if elapsed >= _BREAKER_OPEN_SECONDS:
        # Cooldown elapsed — half-open: allow one probe attempt
        return False
    return True


def _breaker_record_success() -> None:
    _breaker['failures'] = 0
    _breaker['opened_at'] = 0.0


def _breaker_record_failure() -> None:
    _breaker['failures'] += 1
    if _breaker['failures'] >= _BREAKER_THRESHOLD and _breaker['opened_at'] <= 0:
        _breaker['opened_at'] = time.time()


def get_breaker_state() -> dict:
    """Public helper for the health endpoint."""
    is_open = _breaker_is_open()
    remaining = 0
    if is_open and _breaker['opened_at'] > 0:
        remaining = max(0, int(_BREAKER_OPEN_SECONDS - (time.time() - _breaker['opened_at'])))
    return {
        'open': is_open,
        'failures': int(_breaker['failures']),
        'open_seconds_remaining': remaining,
    }


def _disk_cache_path(sheet_name: str) -> str:
    # sha1 hex digest keeps filenames ASCII-safe for Thai/emoji sheet names.
    digest = hashlib.sha1(sheet_name.encode('utf-8')).hexdigest()
    return os.path.join(_DISK_CACHE_DIR, f'{digest}.json')


def _read_disk_cache(sheet_name: str, allow_stale: bool = False) -> Optional[dict]:
    """
    Return the parsed cache envelope {'ts', 'sheet_name', 'rows'} if the disk
    cache exists and is fresh (or if allow_stale=True).  Returns None on miss,
    stale (when not allowed), or corruption.  Corrupt files are deleted so the
    next fetch starts clean.
    """
    path = _disk_cache_path(sheet_name)
    if not os.path.exists(path):
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            envelope = json.load(f)
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as e:
        # Corrupt or unreadable — remove so next fetch rebuilds cleanly.
        try:
            os.remove(path)
        except OSError:
            pass
        print(f"[sheets] disk cache corrupt for {sheet_name}, removed: {e}", file=sys.stderr)
        return None

    if not isinstance(envelope, dict) or 'rows' not in envelope or 'ts' not in envelope:
        try:
            os.remove(path)
        except OSError:
            pass
        return None

    try:
        ts = float(envelope.get('ts', 0))
    except (TypeError, ValueError):
        ts = 0.0

    age = time.time() - ts
    if not allow_stale and age > DISK_CACHE_TTL:
        return None

    if not isinstance(envelope.get('rows'), list):
        return None

    envelope['_age_s'] = int(max(0, age))
    return envelope


def _write_disk_cache(sheet_name: str, rows: list) -> None:
    """Atomic write via .tmp + os.replace.  Never raises — logs and continues."""
    try:
        os.makedirs(_DISK_CACHE_DIR, mode=0o755, exist_ok=True)
    except OSError as e:
        print(f"[sheets] disk cache mkdir failed: {e}", file=sys.stderr)
        return
    path = _disk_cache_path(sheet_name)
    tmp_path = path + '.tmp'
    envelope = {
        'ts': time.time(),
        'sheet_name': sheet_name,
        'rows': rows,
    }
    try:
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(envelope, f, ensure_ascii=False)
        os.replace(tmp_path, path)
    except (OSError, TypeError, ValueError) as e:
        print(f"[sheets] disk cache write failed for {sheet_name}: {e}", file=sys.stderr)
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except OSError:
            pass


def _csv_url(gid: int) -> str:
    return f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid={gid}"


def _fetch_csv(gid: int) -> list[dict]:
    """Fetch a single sheet as list of dicts (header row → keys)."""
    url = _csv_url(gid)
    req = urllib.request.Request(url, headers={"User-Agent": "NasriBot/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        text = resp.read().decode("utf-8")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []
    headers = [h.strip() for h in rows[0]]
    result = []
    for row in rows[1:]:
        if not any(cell.strip() for cell in row):
            continue  # skip empty rows
        d = {}
        for i, h in enumerate(headers):
            d[h] = row[i].strip() if i < len(row) else ""
        result.append(d)
    return result


def fetch_sheet(sheet_name: str, force: bool = False) -> list[dict]:
    """
    Fetch a single sheet by name.  Cache hierarchy:
      L0 preloaded (stdin handoff)   → always served (unless force=True)
      L1 in-memory (_cache)          → served if fresh within CACHE_TTL
      L2 disk (%TEMP%/qsolar-sheet-cache) → served if fresh within DISK_CACHE_TTL
      L3 network (Google Sheets CSV) → last resort, gated by circuit breaker

    When the circuit breaker is open, the network step is skipped entirely
    and we fall back to stale disk cache, then stale in-memory cache, then [].

    When force=True every cache layer is bypassed EXCEPT the breaker-open
    stale fallback (which still kicks in if the network call fails).
    """
    # L0 — preloaded catalog (Node → Python handoff).  Highest priority,
    # never expires — populated once at process start by server.py.
    if not force and sheet_name in _PRELOADED_CATALOG:
        _mark_source(sheet_name, 'preloaded', time.time())
        return _PRELOADED_CATALOG[sheet_name]

    # L1 — in-memory
    if not force and sheet_name in _cache:
        entry = _cache[sheet_name]
        if time.time() - entry["ts"] < CACHE_TTL:
            _mark_source(sheet_name, 'cache-mem', entry["ts"])
            return entry["data"]

    # L2 — disk (fresh only)
    if not force:
        envelope = _read_disk_cache(sheet_name, allow_stale=False)
        if envelope is not None:
            rows = envelope['rows']
            disk_ts = float(envelope.get('ts', time.time()))
            _cache[sheet_name] = {
                "data": rows,
                "ts": time.time(),
                "source": "cache-disk",
                "disk_ts": disk_ts,
            }
            _mark_source(sheet_name, 'cache-disk', disk_ts)
            return rows

    # L3 — network (only if circuit breaker is closed)
    gid = SHEETS.get(sheet_name)
    if gid is None:
        _mark_source(sheet_name, 'unknown', 0.0)
        return []

    if _breaker_is_open():
        # Circuit is open — skip network, fall back to stale caches.
        stale_envelope = _read_disk_cache(sheet_name, allow_stale=True)
        if stale_envelope is not None:
            rows = stale_envelope['rows']
            disk_ts = float(stale_envelope.get('ts', 0))
            _cache[sheet_name] = {
                "data": rows,
                "ts": time.time(),
                "source": "stale",
                "disk_ts": disk_ts,
            }
            _mark_source(sheet_name, 'stale', disk_ts)
            return rows
        if sheet_name in _cache:
            entry = _cache[sheet_name]
            _mark_source(sheet_name, 'stale', entry.get('ts', 0.0))
            return entry.get("data", [])
        _mark_source(sheet_name, 'fallback', 0.0)
        return []

    try:
        data = _fetch_csv(gid)
        _breaker_record_success()
        now = time.time()
        _cache[sheet_name] = {
            "data": data,
            "ts": now,
            "source": "live",
            "disk_ts": now,
        }
        _mark_source(sheet_name, 'live', now)
        _write_disk_cache(sheet_name, data)
        return data
    except Exception as e:
        _breaker_record_failure()
        print(
            f"[sheets] network fetch failed for {sheet_name} "
            f"(breaker failures={_breaker['failures']}): {e}",
            file=sys.stderr,
        )
        # Fall back to stale disk cache, then stale in-memory cache, then raise.
        stale_envelope = _read_disk_cache(sheet_name, allow_stale=True)
        if stale_envelope is not None:
            rows = stale_envelope['rows']
            disk_ts = float(stale_envelope.get('ts', 0))
            _cache[sheet_name] = {
                "data": rows,
                "ts": time.time(),
                "source": "stale",
                "disk_ts": disk_ts,
            }
            _mark_source(sheet_name, 'stale', disk_ts)
            return rows
        if sheet_name in _cache:
            entry = _cache[sheet_name]
            _mark_source(sheet_name, 'stale', entry.get('ts', 0.0))
            return entry["data"]
        _mark_source(sheet_name, 'fallback', 0.0)
        raise RuntimeError(f"Failed to fetch sheet '{sheet_name}': {e}")


def fetch_all_sheets(force: bool = False) -> dict[str, list[dict]]:
    """Fetch all sheets, return {sheet_name: [rows]}."""
    result = {}
    errors = []
    for name in SHEETS:
        try:
            result[name] = fetch_sheet(name, force=force)
        except Exception as e:
            errors.append(f"{name}: {e}")
            result[name] = []
    if errors:
        result["_errors"] = errors
    return result


def search_catalog(query: str, category: Optional[str] = None) -> list[dict]:
    """
    Search across all sheets for products matching a query string.
    Returns matching rows with sheet_name attached.
    """
    query_lower = query.lower()
    results = []
    target_sheets = list(SHEETS.keys())

    # Filter to specific category if provided
    if category:
        cat_lower = category.lower()
        target_sheets = [s for s in target_sheets if cat_lower in s.lower()]
        if not target_sheets:
            target_sheets = list(SHEETS.keys())  # fallback to all

    for sheet_name in target_sheets:
        rows = fetch_sheet(sheet_name)
        for row in rows:
            # Search all cell values
            row_text = " ".join(str(v).lower() for v in row.values())
            if query_lower in row_text:
                match = dict(row)
                match["_sheet"] = sheet_name
                results.append(match)
    return results


def get_product_price(product_name: str) -> Optional[dict]:
    """Find the best matching product and return its pricing info."""
    matches = search_catalog(product_name)
    if not matches:
        return None
    # Return first match (closest)
    return matches[0]


def get_catalog_summary() -> dict:
    """Return a compact summary of all available products (counts per sheet)."""
    all_data = fetch_all_sheets()
    summary = {}
    for name, rows in all_data.items():
        if name.startswith("_"):
            continue
        summary[name] = {
            "count": len(rows),
            "sample": rows[0] if rows else {},
        }
    return summary
