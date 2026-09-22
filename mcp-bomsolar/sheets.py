"""
mcp-bomsolar/sheets.py — SHIM MODULE (P3 refactor).

The real implementation now lives in
`solar_catalog.sheets_client` — the same advanced version that powers
mcp-qsolar.  Before P3, this file was a drifted older copy that
lacked the preloaded-catalog handoff, disk cache, and circuit breaker.

This is a net upgrade for mcp-bomsolar:
  • disk cache under %TEMP%/qsolar-sheet-cache (survives process restarts)
  • circuit breaker that protects against Google Sheets outages
  • provenance tracking (source / age_s fields)

No caller-visible API change.  bomsolar server.py imports
`fetch_sheet, fetch_all_sheets, search_catalog, get_catalog_summary, SHEETS`
— all of which are re-exported below unchanged.
"""

# Ensure `solar_catalog` is importable even when this file is loaded
# from a cwd that doesn't have Nasri-oracle/ on sys.path.
import os as _os
import sys as _sys

_PARENT_DIR = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), _os.pardir))
if _PARENT_DIR not in _sys.path:
    _sys.path.insert(0, _PARENT_DIR)

# Re-export the full public surface.
from solar_catalog.sheets_client import *  # noqa: F401,F403

# Explicit re-imports so attribute access keeps working and so the
# specific names bomsolar/server.py imports are guaranteed to be here.
from solar_catalog.sheets_client import (  # noqa: F401
    SPREADSHEET_ID,
    SHEETS,
    CACHE_TTL,
    _CACHE_TTL,
    DISK_CACHE_TTL,
    _PRELOADED_CATALOG,
    _cache,
    _last_source,
    _breaker,
    fetch_sheet,
    fetch_all_sheets,
    search_catalog,
    get_product_price,
    get_catalog_summary,
    get_last_source,
    get_breaker_state,
)
