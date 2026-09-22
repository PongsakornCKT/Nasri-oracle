"""
solar_catalog — shared catalog + product-lookup logic for mcp-qsolar and
mcp-bomsolar.

Extracted from the previously duplicated `sheets.py` / `sheet_prices.py`
modules to remove drift between the two MCP servers.  No new dependencies —
pure stdlib plus whatever was already imported by the originals.

Public surface (re-exported below) matches the old module-level API of
`mcp-qsolar/sheets.py` + `mcp-qsolar/sheet_prices.py` exactly, so existing
shim modules in mcp-qsolar/ and mcp-bomsolar/ can `from solar_catalog.X
import *` and keep all historical imports working.

Import cost is deliberately kept tiny: pulling the package does NOT
trigger any network calls, any Google Sheets fetches, or any disk IO.
All of that still happens lazily on the first `fetch_sheet()` call.
"""

from .sheets_client import (
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

from .product_lookup import (
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

__all__ = [
    # sheets_client
    "SPREADSHEET_ID",
    "SHEETS",
    "CACHE_TTL",
    "_CACHE_TTL",
    "DISK_CACHE_TTL",
    "_PRELOADED_CATALOG",
    "_cache",
    "_last_source",
    "_breaker",
    "fetch_sheet",
    "fetch_all_sheets",
    "search_catalog",
    "get_product_price",
    "get_catalog_summary",
    "get_last_source",
    "get_breaker_state",
    # product_lookup
    "fetch_live_prices",
    "fetch_solar_panels",
    "fetch_live_battery_prices",
    "find_panel",
    "find_inverter",
    "find_optimizer",
    "list_panel_brands",
    "BRAND_SET",
    "BRAND_ALIASES",
]
