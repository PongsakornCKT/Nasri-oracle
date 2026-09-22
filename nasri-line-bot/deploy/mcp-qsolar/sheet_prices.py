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
        model = row.get('รุ่น (Model)', '')
        sell = _safe_int(row.get('ราคาขาย (฿)', ''))
        if sell <= 0:
            continue
        # "SigenStor EC 5.0 SP" → size=5.0, phase=SP(1P)
        m = re.search(r'EC\s+([\d.]+)\s+(SP|TP)', model)
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
        sell = _safe_int(row.get('ราคาขาย (฿)', ''))
        if sell <= 0:
            continue
        size = _safe_int(row.get(size_col, ''))
        if size <= 0:
            continue
        phase = row.get('เฟส', '').strip()
        model = row.get('รุ่น (Model)', '').upper()
        if phase == '1P' or 'KTL-L' in model:
            if size not in p1 or sell < p1[size]:
                p1[size] = sell
        elif phase == '3P' or 'KTL-M' in model:
            if size not in p3 or sell < p3[size]:
                p3[size] = sell
    return {'1P': p1, '3P': p3}


def _parse_solis() -> dict:
    """Parse Solis selling prices → { '1P': {3: 102000, ...}, '3P': {...} }"""
    rows = fetch_sheet('Inverters - Solis')
    size_col = '⚡ Solis Inverter — ราคาสั่งซื้อและราคาขาย ขนาด (kW)'
    p1, p3 = {}, {}
    for row in rows:
        sell = _safe_int(row.get('ราคาขาย (฿)', ''))
        if sell <= 0:
            continue
        size = _safe_int(row.get(size_col, ''))
        if size <= 0:
            continue
        phase = row.get('เฟส', '').strip()
        if phase == '1P':
            if size not in p1 or sell < p1[size]:
                p1[size] = sell
        elif phase == '3P':
            if size not in p3 or sell < p3[size]:
                p3[size] = sell
    return {'1P': p1, '3P': p3}


def _parse_deye() -> dict:
    """Parse Deye selling prices from Inverters - Deye sheet → { '1P': {5: ..., ...}, '3P': {...} }"""
    rows = fetch_sheet('Inverters - Deye')
    size_col = '⚡ Deye Hybrid Inverter — ราคาสั่งซื้อและราคาขาย ขนาด (kW) 🔋 Low Voltage — 1 Phase'
    p1, p3 = {}, {}
    for row in rows:
        # Try ราคาขาย Sun Siam first, then ราคาขาย
        sell = _safe_int(row.get('ราคาขาย Sun Siam (฿)', ''))
        if sell <= 0:
            sell = _safe_int(row.get('ราคาขาย (฿)', ''))
        if sell <= 0:
            continue
        size = _safe_int(row.get(size_col, ''))
        if size <= 0:
            continue
        phase = row.get('เฟส', '').strip()
        model = row.get('รุ่น (Model)', '').upper()
        if phase == '1P' or 'LP1' in model:
            if size not in p1 or sell < p1[size]:
                p1[size] = sell
        elif phase == '3P' or 'LP3' in model or 'HP3' in model:
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
        model = row.get('รุ่น (Model)', '').strip()
        if model == 'MS-7K-U':
            sell = _safe_int(row.get('ราคาขาย (฿)', ''))
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


def fetch_solar_panels() -> list[dict]:
    """
    Fetch all solar panels from the catalog sheet.
    Returns list of dicts with keys: brand, model, watt, type, warranty, cost_price, sell_price, vendor
    Cached for 60 seconds.
    """
    now = time.time()
    if 'panels' in _cache and now - _cache.get('panels_ts', 0) < _CACHE_TTL:
        return _cache['panels']

    rows = fetch_sheet('Solar Panels')
    brand_col = '☀️ Solar Panels — ราคาแผงโซลาร์เซลล์ทุกแบรนด์ แบรนด์'
    panels = []
    for row in rows:
        brand = row.get(brand_col, '').strip()
        if not brand:
            continue
        watt = _safe_int(row.get('กำลังไฟ (W)', ''))
        if watt <= 0:
            continue
        sell_raw = str(row.get('ราคาขาย (฿/แผง)', '')).replace(',', '').strip()
        cost_raw = str(row.get('ราคาสั่งซื้อ (฿)', '')).replace(',', '').strip()
        try:
            sell_price = float(sell_raw) if sell_raw else 0
        except ValueError:
            sell_price = 0
        try:
            cost_price = float(cost_raw) if cost_raw else 0
        except ValueError:
            cost_price = 0
        panels.append({
            'brand': brand,
            'model': row.get('รุ่น (Model)', '').strip(),
            'watt': watt,
            'type': row.get('ประเภท', '').strip(),
            'warranty': row.get('ประกัน (ปี)', '').strip(),
            'cost_price': cost_price,
            'sell_price': sell_price,
            'vendor': row.get('Vendor/แหล่ง', '').strip(),
        })

    _cache['panels'] = panels
    _cache['panels_ts'] = now
    return panels


def find_panel(brand_query: str = '', watt_query: int = 0) -> dict | None:
    """
    Find a panel from the catalog matching brand and/or wattage.
    brand_query: fuzzy brand name (e.g. 'aiko', 'longi', 'trina', 'ja')
    watt_query: target wattage (e.g. 650, 715). 0 = any.
    Returns best matching panel dict or None.
    """
    panels = fetch_solar_panels()
    if not panels:
        return None

    q = brand_query.lower().strip()
    # Normalize common aliases
    aliases = {
        'ja': 'ja solar', 'ja solar': 'ja solar', 'jasolar': 'ja solar',
        'trina': 'trina solar', 'trinasolar': 'trina solar',
        'longi': 'longi', 'long': 'longi',
        'aiko': 'aiko',
        'jinko': 'jinko',
        'vols': 'vols',
    }
    norm_q = aliases.get(q, q)

    candidates = []
    for p in panels:
        pb = p['brand'].lower()
        # Brand match: either exact or substring
        if norm_q and norm_q not in pb and pb not in norm_q:
            continue
        # Watt match: exact if specified
        if watt_query > 0 and p['watt'] != watt_query:
            continue
        candidates.append(p)

    if not candidates:
        # Relax: try watt-only match if brand didn't match
        if watt_query > 0:
            candidates = [p for p in panels if p['watt'] == watt_query]
        if not candidates:
            return None

    # Prefer panels with a sell_price > 0
    priced = [c for c in candidates if c['sell_price'] > 0]
    if priced:
        return priced[0]
    return candidates[0]


def list_panel_brands() -> list[str]:
    """Return unique panel brand names from the catalog."""
    panels = fetch_solar_panels()
    seen = set()
    brands = []
    for p in panels:
        b = p['brand']
        bl = b.lower()
        if bl not in seen:
            seen.add(bl)
            brands.append(b)
    return brands


def find_inverter(brand: str, size_kw: float, phase: str = '1P') -> dict | None:
    """
    Look up inverter details (model name, sell_price) from the brand-specific sheet.
    Returns dict with keys: brand, model, size_kw, phase, sell_price
    Returns None if not found.
    """
    sheet_map = {
        'Huawei':     'Inverters - Huawei',
        'Solis':      'Inverters - Solis',
        'Deye':       'Inverters - Deye',
        'Sigenergy':  'Inverters - Sigenergy',
        'ATMOCE':     'Inverters - ATMOCE',
        'Hoymiles':   'Inverters - Hoymiles',
    }
    sheet_name = sheet_map.get(brand)
    if not sheet_name:
        return None

    try:
        rows = fetch_sheet(sheet_name)
    except Exception:
        return None

    target_size = int(size_kw)
    best = None

    for row in rows:
        # Find size column — look for any column key containing 'kW' or 'ขนาด'
        row_size = 0
        for k, v in row.items():
            if ('kw' in k.lower() or 'ขนาด' in k.lower()) and v:
                try:
                    row_size = int(float(str(v).replace(',', '').strip()))
                    break
                except Exception:
                    pass

        if row_size != target_size:
            continue

        # Phase check
        row_phase = row.get('เฟส', '').strip()
        model_str = row.get('รุ่น (Model)', '').upper()

        if brand == 'Sigenergy':
            # Sigenergy uses SP/TP in model name
            if phase == '1P' and 'SP' not in model_str:
                continue
            if phase == '3P' and 'TP' not in model_str:
                continue
        elif brand == 'Deye':
            if phase == '1P' and row_phase != '1P' and 'LP1' not in model_str:
                continue
            if phase == '3P' and row_phase != '3P' and 'LP3' not in model_str and 'HP3' not in model_str:
                continue
        elif brand == 'Huawei':
            if phase == '1P' and row_phase != '1P' and 'KTL-L' not in model_str:
                continue
            if phase == '3P' and row_phase != '3P' and 'KTL-M' not in model_str:
                continue
        else:
            if row_phase and row_phase != phase:
                continue

        # Sell price
        sell_raw = row.get('ราคาขาย (฿)', '') or row.get('ราคาขาย Sun Siam (฿)', '')
        sell = _safe_int(sell_raw)
        if sell <= 0:
            continue

        model = row.get('รุ่น (Model)', '').strip()
        best = {
            'brand': brand,
            'model': model,
            'size_kw': size_kw,
            'phase': phase,
            'sell_price': sell,
        }
        break  # take first valid match

    return best


def find_optimizer(brand: str = 'Sigenergy', panels: int = 0) -> dict | None:
    """
    Look up optimizer details from Optimizers sheet.
    Returns dict: model, brand, unit_price, quantity, total_price
    or None if not found.
    quantity = max(1, panels // 2) for 2:1 ratio (Sigenergy default).
    """
    try:
        rows = fetch_sheet('Optimizers')
    except Exception:
        return None

    if not rows:
        return None

    brand_lower = brand.lower()

    for row in rows:
        # Match brand in any column value
        row_text = ' '.join(str(v) for v in row.values()).lower()
        if brand_lower not in row_text:
            continue

        model = ''
        sell = 0
        for k, v in row.items():
            k_lower = k.lower()
            if ('รุ่น' in k_lower or 'model' in k_lower) and not model:
                model = str(v).strip()
            if 'ราคาขาย' in k_lower and '฿' in k and not sell:
                sell = _safe_int(v)

        # Fallback: try ราคาสั่งซื้อ if no sell price
        if sell <= 0:
            for k, v in row.items():
                if 'ราคา' in k.lower() and v:
                    sell = _safe_int(v)
                    if sell > 0:
                        break

        if sell <= 0 or not model:
            continue

        qty = max(1, panels // 2) if panels > 0 else 1
        return {
            'brand': brand,
            'model': model,
            'unit_price': sell,
            'quantity': qty,
            'total_price': sell * qty,
        }

    return None


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
