"""
solar_catalog.pricing — reserved for pricing helpers currently still
embedded in mcp-qsolar/generate_pdf.py (system markups, VAT, discount
normalization, etc.).

Left intentionally empty for now.  The P3 refactor is a pure
extraction — touching generate_pdf.py is explicitly out of scope for
this session (it's ~1800 lines and fanning into this file would make
the diff too risky to review).

Future work (tracked separately):
  • lift the system_price / credit / discount math out of generate_pdf
  • lift BATTERY_BRAND_COMPAT and the battery-match fallback path
  • lift the labor/installation pricing tiers
  • expose a small `compute_system_price()` that both mcp-qsolar and
    mcp-bomsolar can call instead of duplicating the formula

Do NOT import anything from generate_pdf here — that would create a
circular dep once generate_pdf eventually imports from solar_catalog.
"""
