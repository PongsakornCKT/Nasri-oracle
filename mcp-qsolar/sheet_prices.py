"""
Live price fetcher for mcp-qsolar.
Reads ราคาขาย (selling prices) from Google Sheets for Huawei, Solis, Sigenergy.
ATMOCE system prices stay hardcoded (no ราคาขาย column for packages).
ATMOCE battery selling price (MS-7K-U) is read from Batteries sheet.
"""

import re
import sys
import os
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)

from sheets import fetch_sheet

# ─── Cache ───────────────────────────────────────────────────
_cache: dict = {}
_CACHE_TTL = 60  # seconds


def _safe_int(s) -> int:
    try:
        v = float(str(s).replace(',', '').strip())
        return int(v) if v > 0 else 0
    except Exception:
        return 0


# ─── Per-brand parsers ────────────────────────────────────────

def _parse_sigenergy() -> dict:
    """Parse Sigenergy EC series selling prices → { '1P': {5: 191000, ...}, '3P': {...} }"""
    rows = fetch_sheet('Inverters - Sigenergy')
    p1, p3 = {}, {}
    cat_col = '⚡ Sigenergy — ราคาสั่งซื้อและราคาขาย หมวด'
    for row in rows:
        cat = row.get(cat_col, '').strip()
        if cat != 'Inverter (EC)':
            continue
        name = row.get('name', '')
        all_p = row.get('all_prices', {})
        sell = _safe_int(all_p.get('ราคาขาย (฿)', ''))
        if sell <= 0:
            continue
        # "SigenStor EC 5.0 SP" → size=5.0, phase=SP(1P)
        m = re.search(r'EC\s+([\d.]+)\s+(SP|TP)', name)
        if not m:
            continue
        size = float(m.group(1))
        if m.group(2) == 'SP':
            p1[size] = sell
        else:
            p3[size] = sell
    return {'1P': p1, '3P': p3}


def _parse_huawei() -> dict:
    """Parse Huawei selling prices → { '1P': {3: 108000, ...}, '3P': {...} }"""
    rows = fetch_sheet('Inverters - Huawei')
    size_col = '⚡ Huawei Inverter — ราคาสั่งซื้อและราคาขาย ขนาด (kW) 🏠 Residential'
    p1, p3 = {}, {}
    for row in rows:
        all_p = row.get('all_prices', {})
        sell = _safe_int(all_p.get('ราคาขาย (฿)', ''))
        if sell <= 0:
            continue
        size = _safe_int(all_p.get(size_col, ''))
        if size <= 0:
            continue
        name = row.get('name', '').upper()
        # 1P: KTL-L or KTL-LC series; 3P: KTL-M or KTL-MB series
        if 'KTL-L' in name:
            # Prefer the lower price (standard L1 model over MAP variant)
            if size not in p1 or sell < p1[size]:
                p1[size] = sell
        elif 'KTL-M' in name or 'KTL-MB' in name:
            if size not in p3 or sell < p3[size]:
                p3[size] = sell
    return {'1P': p1, '3P': p3}


def _parse_solis() -> dict:
    """Parse Solis selling prices → { '1P': {3: 102000, ...}, '3P': {...} }"""
    rows = fetch_sheet('Inverters - Solis')
    size_col = '⚡ Solis Inverter — ราคาสั่งซื้อและราคาขาย ขนาด (kW)'
    p1, p3 = {}, {}
    for row in rows:
        all_p = row.get('all_prices', {})
        sell = _safe_int(all_p.get('ราคาขาย (฿)', ''))
        if sell <= 0:
            continue
        size = _safe_int(all_p.get(size_col, ''))
        if size <= 0:
            continue
        name = row.get('name', '').upper()
        if 'GR1P' in name or 'EH1P' in name or '1P' in name:
            if size not in p1 or sell < p1[size]:
                p1[size] = sell
        elif 'GR3P' in name or 'EH3P' in name or '3P' in name:
            if size not in p3 or sell < p3[size]:
                p3[size] = sell
    return {'1P': p1, '3P': p3}


def _parse_deye() -> dict:
    """Parse Deye ราคาขาย Sun Siam from Inverters - Deye sheet → { '1P': {5: ..., ...}, '3P': {...} }"""
    rows = fetch_sheet('Inverters - Deye')
    size_col = '⚡ Deye Hybrid Inverter — ราคาสั่งซื้อและราคาขาย ขนาด (kW) 🔋 Low Voltage — 1 Phase'
    p1, p3 = {}, {}
    for row in rows:
        all_p = row.get('all_prices', {})
        sell = _safe_int(all_p.get('ราคาขาย Sun Siam (฿)', ''))
        if sell <= 0:
            continue
        size = _safe_int(all_p.get(size_col, ''))
        if size <= 0:
            continue
        name = row.get('name', '').upper()
        # 1P models: contain LP1 or 1P; 3P models contain LP3 or 3P
        if 'LP1' in name or 'SG01LP1' in name or 'SG04LP1' in name or 'SG05LP1' in name:
            if size not in p1 or sell < p1[size]:
                p1[size] = sell
        elif 'LP3' in name or 'HP3' in name:
            if size not in p3 or sell < p3[size]:
                p3[size] = sell
    return {'1P': p1, '3P': p3}


def _parse_atmoce_battery() -> dict:
    """
    Read MS-7K-U selling price from Batteries sheet.
    Returns { 'batt_only': int, 'batt_backup_1P': int, 'batt_backup_3P': int }
    Backup premium is fixed: +11,000 (1P) / +31,000 (3P).
    """
    rows = fetch_sheet('Batteries')
    for row in rows:
        name = row.get('name', '').strip()
        if name == 'MS-7K-U':
            all_p = row.get('all_prices', {})
            sell = _safe_int(all_p.get('ราคาขาย (฿)', ''))
            if sell > 0:
                return {
                    'batt_only': sell,
                    'batt_backup_1P': sell + 11000,
                    'batt_backup_3P': sell + 31000,
                }
    return {}


# ─── Public API ───────────────────────────────────────────────

def fetch_live_prices() -> dict:
    """
    Fetch selling prices for Huawei, Solis, Sigenergy from Google Sheets.
    Returns { brand: { phase: { size_kw: price } } }
    Cached for 60 seconds.
    """
    now = time.time()
    if 'prices' in _cache and now - _cache.get('prices_ts', 0) < _CACHE_TTL:
        return _cache['prices']

    prices = {}
    for brand, parser in [
        ('Sigenergy', _parse_sigenergy),
        ('Huawei', _parse_huawei),
        ('Solis', _parse_solis),
        ('Deye', _parse_deye),
    ]:
        try:
            result = parser()
            if any(result.get(p) for p in ('1P', '3P')):
                prices[brand] = result
        except Exception:
            pass  # fall back to hardcoded

    _cache['prices'] = prices
    _cache['prices_ts'] = now
    return prices


def fetch_live_battery_prices() -> dict:
    """
    Fetch ATMOCE battery selling prices from Batteries sheet.
    Returns { 'batt_only': int, 'batt_backup_1P': int, 'batt_backup_3P': int }
    Cached for 60 seconds.
    """
    now = time.time()
    if 'batt' in _cache and now - _cache.get('batt_ts', 0) < _CACHE_TTL:
        return _cache['batt']

    result = {}
    try:
        result = _parse_atmoce_battery()
    except Exception:
        pass

    _cache['batt'] = result
    _cache['batt_ts'] = now
    return result
