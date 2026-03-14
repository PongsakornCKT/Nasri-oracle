#!/usr/bin/env python3
"""mcp-pricesolar — Solar product price lookup MCP server for Nasri.

Lets Nasri look up real-time prices from the Enervia Google Sheets catalog
to answer user questions accurately without guessing.

Google Sheet: https://docs.google.com/spreadsheets/d/1ubrfga3m0uiOf68MGQRApAdnhU8oby6nYKtfzirpn9Y
"""

import os
import sys
import json
import re
from datetime import datetime
from pathlib import Path

# Ensure local sheets.py is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    print("ERROR: mcp package not found. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

from sheets import fetch_sheet, fetch_all_sheets, search_catalog, SHEETS

# Oracle root for token logging
ORACLE_ROOT = os.environ.get("ORACLE_REPO_ROOT", "C:/Users/pO-Ch/Nasri-oracle")

mcp = FastMCP("pricesolar")


# ---------------------------------------------------------------------------
# Price extraction helpers
# ---------------------------------------------------------------------------

def _extract_price(row: dict) -> tuple[str, str]:
    """
    Extract the best price from a row dict.
    Returns (price_str, price_column_name).

    Priority:
    1. Column with ฿ + ราคาสั่งซื้อ  → purchase price
    2. Column with ราคาสั่งซื้อ (short name ≤ 30 chars) → purchase price
    3. Column with ราคา ≥50K or ราคา ≥50,000 → special tier price
    4. Any short ราคา column (≤ 20 chars)
    5. Any column containing ราคา
    """
    candidates: list[tuple[int, str, str]] = []  # (priority, col_name, value)

    for col, val in row.items():
        if not val or col.startswith("_"):
            continue
        col_lower = col.lower()

        if "ราคาสั่งซื้อ" in col:
            if "฿" in col:
                candidates.append((0, col, val))
            elif len(col) <= 30:
                candidates.append((1, col, val))
            else:
                candidates.append((2, col, val))
        elif re.search(r"ราคา.*≥\s*50", col):
            candidates.append((3, col, val))
        elif "ราคา" in col and len(col) <= 20:
            candidates.append((4, col, val))
        elif "ราคา" in col:
            candidates.append((5, col, val))
        elif "price" in col_lower and len(col) <= 20:
            candidates.append((6, col, val))

    if not candidates:
        return ("", "")

    # Sort by priority then pick first with a non-zero numeric value
    candidates.sort(key=lambda x: x[0])
    for _, col_name, val in candidates:
        # Clean numeric check
        numeric = re.sub(r"[^\d.]", "", val)
        if numeric and float(numeric) > 0:
            return (val, col_name)

    # Fallback: return first candidate even if zero
    return (candidates[0][2], candidates[0][1])


def _clean_row_for_output(row: dict, sheet_name: str) -> dict:
    """Produce a clean output dict with name, price, category, sheet."""
    price_val, price_col = _extract_price(row)

    # Find best name column
    name_val = ""
    for col in ("ชื่อสินค้า", "Model", "รุ่น", "ชื่อ", "Description", "name"):
        if col in row and row[col]:
            name_val = row[col]
            break
    if not name_val:
        # Pick first non-empty, non-price column
        for col, val in row.items():
            if val and "ราคา" not in col and "price" not in col.lower() and not col.startswith("_"):
                name_val = val
                break

    # Collect all price columns for transparency
    all_prices = {}
    for col, val in row.items():
        if "ราคา" in col or "price" in col.lower():
            if val:
                all_prices[col] = val

    result = {
        "name": name_val,
        "price": price_val,
        "price_column": price_col,
        "category": sheet_name,
        "sheet": sheet_name,
        "all_prices": all_prices,
    }

    # Attach a few extra useful columns
    for col in ("Brand", "แบรนด์", "Watt", "W", "kW", "kWh", "Model", "รุ่น", "Unit", "หน่วย"):
        if col in row and row[col]:
            result[col.lower()] = row[col]

    return result


def _log_usage(tool_name: str, result_count: int):
    """Append a lightweight usage record to ψ/memory/logs/pricesolar-usage.jsonl."""
    try:
        log_dir = Path(ORACLE_ROOT) / "ψ" / "memory" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        record = {
            "ts": datetime.now().isoformat(),
            "tool": tool_name,
            "results": result_count,
        }
        with open(log_dir / "pricesolar-usage.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# MCP Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def pricesolar_search(query: str) -> str:
    """Search for any solar product by keyword and return price + details.

    Args:
        query: Product keyword e.g. "AIKO 650W", "Huawei 10kW", "Sigenergy battery", "cable 6mm"

    Returns:
        JSON list of matching products with name, price, category, sheet, and all_prices.
        Returns up to 20 results. Empty list if nothing found.
    """
    if not query or not query.strip():
        return json.dumps({"error": "query must not be empty"}, ensure_ascii=False)

    try:
        raw_matches = search_catalog(query.strip())
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)

    results = [_clean_row_for_output(row, row.get("_sheet", "")) for row in raw_matches[:20]]
    _log_usage("pricesolar_search", len(results))
    return json.dumps(results, ensure_ascii=False, indent=2)


@mcp.tool()
def pricesolar_get_sheet(sheet_name: str) -> str:
    """Get all products from a specific catalog sheet.

    Args:
        sheet_name: Exact sheet name or partial match.
                    Valid sheets: Solar Panels, Inverters - Huawei, Inverters - Solis,
                    Inverters - Deye, Inverters - ATMOCE, Inverters - Sigenergy,
                    Inverters - Hoymiles, Inverters - Enphase, Batteries, Cables,
                    Mounting - Keenoc, Optimizers, Combiner Box & Others, Labor & Fees

    Returns:
        JSON list of all rows with prices from that sheet.
    """
    if not sheet_name or not sheet_name.strip():
        return json.dumps(
            {"error": "sheet_name must not be empty", "available_sheets": list(SHEETS.keys())},
            ensure_ascii=False,
        )

    # Exact match first, then partial
    target = sheet_name.strip()
    if target not in SHEETS:
        matches = [s for s in SHEETS if target.lower() in s.lower()]
        if not matches:
            return json.dumps(
                {
                    "error": f"Sheet '{target}' not found",
                    "available_sheets": list(SHEETS.keys()),
                },
                ensure_ascii=False,
            )
        target = matches[0]

    try:
        rows = fetch_sheet(target)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)

    results = [_clean_row_for_output(row, target) for row in rows]
    _log_usage("pricesolar_get_sheet", len(results))
    return json.dumps(
        {"sheet": target, "count": len(results), "products": results},
        ensure_ascii=False,
        indent=2,
    )


@mcp.tool()
def pricesolar_summary() -> str:
    """Get a price summary across all catalog categories.

    Returns an overview of each category with product count and sample prices.
    Useful for quickly understanding what's available and rough price ranges
    before doing a detailed search.

    Returns:
        JSON dict of categories with count, cheapest_price, most_expensive_price, and samples.
    """
    try:
        all_data = fetch_all_sheets()
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)

    summary = {}
    for sheet_name, rows in all_data.items():
        if sheet_name.startswith("_") or not rows:
            continue

        prices_numeric: list[float] = []
        samples: list[dict] = []

        for row in rows:
            price_val, price_col = _extract_price(row)
            if price_val:
                numeric = re.sub(r"[^\d.]", "", price_val)
                try:
                    prices_numeric.append(float(numeric))
                except ValueError:
                    pass
            if len(samples) < 3:
                cleaned = _clean_row_for_output(row, sheet_name)
                if cleaned["price"]:
                    samples.append({"name": cleaned["name"], "price": cleaned["price"]})

        entry: dict = {"count": len(rows), "samples": samples}
        if prices_numeric:
            entry["cheapest"] = f"{min(prices_numeric):,.0f} ฿"
            entry["most_expensive"] = f"{max(prices_numeric):,.0f} ฿"

        summary[sheet_name] = entry

    _log_usage("pricesolar_summary", len(summary))
    return json.dumps(summary, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
