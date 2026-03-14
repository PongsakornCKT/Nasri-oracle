#!/usr/bin/env python3
"""
mcp-qsolar — FastMCP server for generating professional solar quotation PDFs.
Supports: ATMOCE, Sigenergy, Huawei, Solis, Deye, Hoymiles
Called from LINE OA bot via subprocess or MCP protocol.
"""

import sys
import os

# Ensure local package is importable regardless of how this is invoked
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)

import re
import json
import datetime

from fastmcp import FastMCP

mcp = FastMCP('qsolar')

# ─── Lazy import PDF generator (always reload to pick up code changes) ───
def _get_generator():
    import importlib
    import generate_pdf as _genpdf
    importlib.reload(_genpdf)
    return _genpdf.QuotationGenerator, _genpdf.SELLING_PRICES, _genpdf.get_selling_price


# ─── Tool: qsolar_generate ───────────────────────────────────
@mcp.tool()
def qsolar_generate(
    brand: str,
    size_kw: float,
    phase: str,
    customer_name: str = 'เสนอราคา',
    project_name: str = '',
    has_battery: bool = False,
    has_backup: bool = False,
    grand_total: float = 0.0,
    discount: float = 0.0,
    panel_brand: str = '',
    panel_watt: int = 0,
    remarks: str = '',
    output_path: str = '',
    markup_pct: float = 0.0,
    battery_model: str = '',
) -> dict:
    """
    Generate a professional solar quotation PDF.

    Parameters
    ----------
    brand        : "ATMOCE", "Sigenergy", "Huawei", "Solis", "Deye", or "Hoymiles"
    size_kw      : System size in kW (e.g. 5.0, 10.0)
    phase        : "1P" or "3P"
    customer_name: Customer / recipient name (default: เสนอราคา)
    project_name : Project name shown in quotation
    has_battery  : Include ATMOCE MS-7K battery (ATMOCE only)
    has_backup   : Include backup system (requires has_battery, ATMOCE only)
    grand_total  : Override selling price (0 = auto from Google Sheet / price table)
    discount     : Discount amount in THB (e.g. 9000)
    panel_brand  : Override panel brand (e.g. "AIKO", default "JA Solar")
    panel_watt   : Override panel wattage (e.g. 650, default 625)
    remarks      : Extra remarks lines, separated by | (e.g. "*** promo ***|Free bird net")
    output_path  : Full path for output PDF; auto-generated if empty
    markup_pct   : Markup percentage to apply on top of the price before putting in PDF.
                   Use 15.0 when grand_total comes from bomsolar cost calculation or manual
                   input (cost price). Sheet ราคาขาย prices already include margin — leave at 0.

    Returns
    -------
    dict with keys: success, path, brand, size_kw, phase, base_price, grand_total, markup_pct, quote_number
    """
    try:
        QuotationGenerator, SELLING_PRICES, get_selling_price = _get_generator()
        gen = QuotationGenerator()

        import random
        today = datetime.date.today()
        seq = random.randint(1, 9999)
        quote_number = f'QT{today.strftime("%Y%m%d")}{seq:04d}'

        # grand_total: use override if provided, else auto-calc from live sheet / hardcoded table
        if grand_total <= 0:
            grand_total = float(gen._calc_grand_total(brand, phase, size_kw, has_battery, has_backup, battery_model))

        base_price = grand_total  # price before markup

        # Apply markup (e.g. 15% when price comes from bomsolar cost or manual cost input)
        if markup_pct > 0:
            grand_total = round(grand_total * (1 + markup_pct / 100))

        # If discount given, grand_total passed is the AFTER-discount price
        effective_total = grand_total - discount if discount > 0 else grand_total

        remarks_list = [r.strip() for r in remarks.split('|') if r.strip()] if remarks else []

        data = {
            'brand': brand,
            'size_kw': size_kw,
            'phase': phase,
            'customer_name': customer_name,
            'project_name': project_name or f'Solar Cell Rooftop {size_kw:.4g}kW {phase} {brand}',
            'has_battery': has_battery,
            'has_backup': has_backup,
            'output_path': output_path,
            'quote_number': quote_number,
            'date': today.strftime('%d/%m/%Y'),
            'salesperson': 'นาย นาฤกษ์ มะแอ',
            'grand_total': effective_total,
            'discount': discount,
            'remarks': remarks_list,
            'markup_pct': markup_pct,
            'base_price': base_price,
        }
        if panel_brand:
            data['panel_brand'] = panel_brand
        if panel_watt:
            data['panel_watt'] = panel_watt
        if battery_model:
            data['battery_model'] = battery_model

        pdf_path = gen.generate(data)

        return {
            'success': True,
            'path': pdf_path,
            'brand': brand,
            'size_kw': size_kw,
            'phase': phase,
            'base_price': base_price,
            'markup_pct': markup_pct,
            'grand_total': grand_total,
            'quote_number': quote_number,
            'has_battery': has_battery,
            'has_backup': has_backup,
        }

    except Exception as e:
        import traceback
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
        }


# ─── Tool: qsolar_get_prices ─────────────────────────────────
@mcp.tool()
def qsolar_get_prices(
    brand: str = '',
    phase: str = '',
) -> dict:
    """
    Get selling prices from the price table.

    Parameters
    ----------
    brand : Filter by brand ("ATMOCE", "Sigenergy", "Huawei", "Solis", "Deye", "Hoymiles") — empty = all
    phase : Filter by phase ("1P", "3P") — empty = all

    Returns
    -------
    dict with 'prices' key containing nested brand/phase/size→price mapping
    """
    _, SELLING_PRICES, _ = _get_generator()

    result = {}
    for b, phase_data in SELLING_PRICES.items():
        if brand and b.upper() != brand.upper():
            continue
        result[b] = {}
        for p, size_data in phase_data.items():
            if phase and p.upper() != phase.upper():
                continue
            result[b][p] = {}
            for size, price in size_data.items():
                key = f'{size}kW' if b != 'ATMOCE' else f'{size} panels'
                result[b][p][key] = price

    return {'prices': result}


# ─── Tool: qsolar_list_options ───────────────────────────────
@mcp.tool()
def qsolar_list_options() -> dict:
    """
    List all available brands, sizes, phases, and configurations.

    Returns
    -------
    dict with brands/phases/sizes/battery_options
    """
    _, SELLING_PRICES, _ = _get_generator()

    options = {}
    for brand, phase_data in SELLING_PRICES.items():
        options[brand] = {}
        for phase, size_data in phase_data.items():
            sizes = []
            for k in sorted(size_data.keys()):
                if brand == 'ATMOCE':
                    kw = round(k * 0.625, 3)
                    sizes.append({'panels': k, 'kw_approx': kw, 'price': size_data[k]})
                else:
                    sizes.append({'kw': k, 'price': size_data[k]})
            options[brand][phase] = sizes

    battery_options = {
        'ATMOCE_MS-7K_only': 99000,
        'ATMOCE_MS-7K_backup_1P': 110000,
        'ATMOCE_MS-7K_backup_3P': 130000,
    }

    return {
        'brands': list(SELLING_PRICES.keys()),
        'phases': ['1P', '3P'],
        'configurations': options,
        'battery_add_ons': battery_options,
        'note': 'Prices include VAT. ATMOCE size = panels × 625W.',
    }


# ─── Tool: qsolar_from_spec ──────────────────────────────────
@mcp.tool()
def qsolar_from_spec(
    spec: str,
    customer_name: str = 'เสนอราคา',
    project_name: str = '',
    output_path: str = '',
    markup_pct: float = 0.0,
    grand_total: float = 0.0,
    battery_model: str = '',
) -> dict:
    """
    Parse a natural language solar spec and generate a quotation PDF.

    Examples
    --------
    "atmoce 5kw 1phase batt backup"
    "Sigenergy 10kw 3phase"
    "huawei 15kw 3p"
    "solis 5kw 1phase"

    Parameters
    ----------
    spec         : Natural language spec string
    customer_name: Customer name
    project_name : Project name
    output_path  : Output PDF path (auto if empty)
    markup_pct   : Apply markup % on top of price (e.g. 15.0 for +15%).
                   Use when grand_total is a cost price from bomsolar or manual input.
    grand_total  : Manual price override (cost price) — markup_pct will be applied on top.
    battery_model: Dyness battery model for Deye/Solis combos (e.g. "DL5.0C", "Powerbox Pro")

    Returns
    -------
    Same as qsolar_generate
    """
    lo = spec.lower()

    # Brand detection
    brand = 'ATMOCE'
    if re.search(r'sig(?:energy)?', lo):
        brand = 'Sigenergy'
    elif re.search(r'huawei', lo):
        brand = 'Huawei'
    elif re.search(r'deye', lo):
        brand = 'Deye'
    elif re.search(r'hoymiles|hoy', lo):
        brand = 'Hoymiles'
    elif re.search(r'sol[io]s', lo):
        brand = 'Solis'
    elif re.search(r'atmoce', lo):
        brand = 'ATMOCE'

    # kW detection
    m = re.search(r'([\d.]+)\s*kw', lo)
    size_kw = float(m.group(1)) if m else 5.0

    # Phase detection
    phase = '3P' if re.search(r'3\s*(?:phase|เฟส|p\b)', lo) else '1P'

    # Battery / backup
    has_battery = bool(re.search(r'batt|แบต', lo))
    has_backup = bool(re.search(r'backup|สำรอง', lo))

    # Backup implies battery
    if has_backup:
        has_battery = True

    return qsolar_generate(
        brand=brand,
        size_kw=size_kw,
        phase=phase,
        customer_name=customer_name,
        project_name=project_name,
        has_battery=has_battery,
        has_backup=has_backup,
        output_path=output_path,
        markup_pct=markup_pct,
        grand_total=grand_total,
        battery_model=battery_model,
    )


# ─── CLI: direct invocation for LINE bot subprocess ──────────
def _cli_main():
    """
    Called directly: python server.py '{"tool":"qsolar_from_spec","spec":"atmoce 5kw 1phase"}'
    Prints JSON result to stdout.
    """
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No arguments provided'}))
        sys.exit(1)

    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        # Try treating the argument as a raw spec string
        payload = {'tool': 'qsolar_from_spec', 'spec': sys.argv[1]}

    tool = payload.pop('tool', 'qsolar_from_spec')

    if tool == 'qsolar_generate':
        result = qsolar_generate(**payload)
    elif tool == 'qsolar_get_prices':
        result = qsolar_get_prices(**payload)
    elif tool == 'qsolar_list_options':
        result = qsolar_list_options()
    elif tool == 'qsolar_from_spec':
        result = qsolar_from_spec(**payload)
    else:
        result = qsolar_from_spec(**payload)

    print(json.dumps(result, ensure_ascii=False, indent=2))


# ─── Entrypoint ──────────────────────────────────────────────
if __name__ == '__main__':
    # If called with arguments → CLI mode (for LINE bot subprocess)
    if len(sys.argv) > 1:
        _cli_main()
    else:
        # MCP stdio mode
        mcp.run()
