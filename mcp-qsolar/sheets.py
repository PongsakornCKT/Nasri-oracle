"""
mcp-qsolar/sheets.py — SHIM MODULE (P3 refactor).

The real implementation now lives in
`solar_catalog.sheets_client`.  This file stays in place so existing
callers that do `from sheets import fetch_sheet` (or `import sheets as
_sheets`) keep working without any edits to server.py, generate_pdf.py,
sheet_prices.py, or the test suite.

Behavior is identical to the pre-P3 module — same cache layers, same
circuit breaker, same `_PRELOADED_CATALOG` object (re-exported by
reference so `_sheets._PRELOADED_CATALOG[k] = v` still mutates the
dict that fetch_sheet() reads from).
"""

# Ensure `solar_catalog` is importable even when this file is loaded
# from a cwd that doesn't have Nasri-oracle/ on sys.path (the Plesk
# subprocess spawn sets cwd to mcp-qsolar/, not the parent).
import os as _os
import sys as _sys

_PARENT_DIR = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), _os.pardir))
if _PARENT_DIR not in _sys.path:
    _sys.path.insert(0, _PARENT_DIR)

# Re-export the full public surface.  Star import is deliberate — it
# picks up every name the old sheets.py exposed, so nothing upstream
# needs to know the implementation moved.
from solar_catalog.sheets_client import *  # noqa: F401,F403

# Explicitly re-import the module attributes that historical callers
# reach via attribute access (not `from X import Y`).  These MUST be
# the same object-by-reference as in solar_catalog.sheets_client so
# in-place mutations propagate.  In particular:
#   • server.py: `_sheets._PRELOADED_CATALOG[k] = v`
#   • health endpoint: `sheets.get_breaker_state()`
#   • sheet_prices shim: `from sheets import get_last_source`
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
