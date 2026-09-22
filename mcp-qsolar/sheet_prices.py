"""
mcp-qsolar/sheet_prices.py — SHIM MODULE (P3 refactor).

The real implementation now lives in
`solar_catalog.product_lookup`.  This file stays in place so existing
callers that do `from sheet_prices import find_panel` etc. keep
working without any edits to server.py, generate_pdf.py, or the test
suite.

Behavior is identical to the pre-P3 module — same parsers, same
brand whitelist + token normalization, same Sigenergy size snap.
"""

# Ensure `solar_catalog` is importable even when this file is loaded
# from a cwd that doesn't have Nasri-oracle/ on sys.path.
import os as _os
import sys as _sys

_PARENT_DIR = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), _os.pardir))
if _PARENT_DIR not in _sys.path:
    _sys.path.insert(0, _PARENT_DIR)

# Re-export every public (and semi-public) name from the new location.
from solar_catalog.product_lookup import *  # noqa: F401,F403

# Explicit re-imports for names callers reach via attribute access or
# names star-import skips (leading underscore).  Kept minimal — only
# the ones that existing callers actually touch.
from solar_catalog.product_lookup import (  # noqa: F401
    fetch_live_prices,
    fetch_solar_panels,
    fetch_live_battery_prices,
    find_panel,
    find_inverter,
    find_optimizer,
    list_panel_brands,
    BRAND_SET,
    BRAND_ALIASES,
)
