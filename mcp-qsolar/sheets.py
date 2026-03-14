"""
Google Sheets integration for Price Solar catalog.
Fetches product/pricing data from Enervia's master spreadsheet.
All sheets are read via the public CSV export (no API key needed for published sheets).
"""

import csv
import io
import time
import urllib.request
from typing import Optional

SPREADSHEET_ID = "1ubrfga3m0uiOf68MGQRApAdnhU8oby6nYKtfzirpn9Y"

# Sheet name → GID mapping (discovered from HTML)
SHEETS = {
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

# In-memory cache: {sheet_name: {"data": [...], "ts": float}}
_cache: dict = {}
CACHE_TTL = 30  # 30 seconds — keeps data near-real-time with Google Sheet


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
    """Fetch a single sheet by name, with caching."""
    if not force and sheet_name in _cache:
        entry = _cache[sheet_name]
        if time.time() - entry["ts"] < CACHE_TTL:
            return entry["data"]
    gid = SHEETS.get(sheet_name)
    if gid is None:
        return []
    try:
        data = _fetch_csv(gid)
        _cache[sheet_name] = {"data": data, "ts": time.time()}
        return data
    except Exception as e:
        # Return stale cache if available
        if sheet_name in _cache:
            return _cache[sheet_name]["data"]
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
