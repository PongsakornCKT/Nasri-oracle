"""
Live price fetcher + brand-aware product lookup for the shared catalog.
Reads system selling prices from Google Sheets: Sigenergy/Huawei from
their brand tabs, Solis + ATMOCE packages from the 'Finalprice' tab
(08-2026 workbook rework).  Deye system prices stay hardcoded — its tab
only carries per-unit resale prices.  ATMOCE battery selling price
(MS-7K-U) is read from the Batteries sheet.

Previously lived at mcp-qsolar/sheet_prices.py — moved here so the logic
is shared by mcp-qsolar and mcp-bomsolar via solar_catalog.
"""

import re
import time

from .sheets_client import fetch_sheet, get_last_source

# ─── Cache ───────────────────────────────────────────────────
_cache: dict = {}
_CACHE_TTL = 60  # seconds

# Ranked best→worst — used when aggregating source across multiple sheets.
# If ANY sheet was stale, the whole result is "stale"; if all were live, the
# result is "live"; etc.
def sigenergy_snap_size(size_kw: float, phase: str, max_dc_ac: float = 1.3) -> float:
    """DC/AC-aware Sigenergy inverter size snap.

    Snaps DC array size to the nearest valid AC inverter size.
    Prefers snap-down when DC/AC ratio stays within max_dc_ac (default 1.3).
    Falls back to snap-up when ratio would be exceeded.

    Valid sizes — 1P: [5, 10] kW | 3P: [10, 20, 25] kW
    """
    valid_sizes = [5.0, 10.0] if phase == '1P' else [10.0, 20.0, 25.0]
    down_opts = [s for s in valid_sizes if s <= size_kw]
    down = max(down_opts) if down_opts else None
    if down and size_kw / down <= max_dc_ac:
        return down
    return next((s for s in valid_sizes if s >= size_kw), valid_sizes[-1])


_SOURCE_RANK = {
    'live': 0,
    'preloaded': 1,
    'cache-mem': 2,
    'cache-disk': 3,
    'stale': 4,
    'fallback': 5,
    'unknown': 6,
}


def _worst_source(*sheet_names: str) -> tuple[str, int]:
    """
    Return (worst_source, max_age_s) across the given sheet names.
    "Worst" means highest rank (most degraded).  Missing entries map to 'unknown'.
    """
    worst_name = 'live'
    worst_rank = -1
    max_age = 0
    for name in sheet_names:
        info = get_last_source(name)
        src = info.get('source', 'unknown')
        rank = _SOURCE_RANK.get(src, _SOURCE_RANK['unknown'])
        if rank > worst_rank:
            worst_rank = rank
            worst_name = src
        age = int(info.get('age_s', 0) or 0)
        if age > max_age:
            max_age = age
    if worst_rank < 0:
        return ('unknown', 0)
    return (worst_name, max_age)


def _safe_int(s) -> int:
    try:
        v = float(str(s).replace(',', '').strip())
        return int(v) if v > 0 else 0
    except Exception:
        return 0


def _norm_phase(value) -> str:
    """
    Normalize the เฟส column to '1P'/'3P'.
    The 08-2026 sheet rework uses 'Single phase (Low volt)' / 'Three phase'
    wording in some tabs while others kept 1P/3P — accept both.
    Unrecognized values are returned stripped/uppercased (e.g. Deye '1P→3P').
    """
    v = str(value or '').strip()
    lo = v.lower()
    if lo == '1p' or lo.startswith('single'):
        return '1P'
    if lo == '3p' or lo.startswith('three'):
        return '3P'
    return v.upper()


def _row_size_kw(row: dict) -> int:
    """
    Read the ขนาด (kW) value from a row without relying on the full merged
    header text — the sheet's merged title above the header row changes
    whenever the tab is reorganized (broke exact-match lookups 08-2026).
    """
    for k, v in row.items():
        if 'ขนาด(kw)' in _norm_header(k) and v:
            return _safe_int(v)
    return 0


# ─── Header-drift-proof column matching (#18) ──────────────────
# Sheet headers occasionally pick up stray emoji / inconsistent whitespace
# (e.g. "⚡ ราคาขาย (฿)" vs "ราคาขาย (฿)") when the workbook is reorganized.
# These helpers ONLY affect which column a value is read from — pricing
# math and the exact-match fast path are untouched.
_EMOJI_RE = re.compile(
    '['
    '\U0001F300-\U0001FAFF'
    '\U00002600-\U000027BF'
    '\U0001F1E6-\U0001F1FF'
    '\U0000FE00-\U0000FE0F'
    ']+'
)


def _norm_header(s) -> str:
    """Normalize a header cell for fuzzy matching: strip emoji, strip all
    whitespace, casefold. Never applied to values — only to header/key text
    used to locate a column."""
    s = _EMOJI_RE.sub('', str(s or ''))
    s = re.sub(r'\s+', '', s)
    return s.strip().lower()


def _fuzzy_get(row: dict, key: str, default=''):
    """dict.get() that tolerates header drift between `key` and whatever the
    sheet actually shipped. Exact match first (no behavior change for
    stable headers); falls back to a normalized-header match."""
    if key in row:
        return row[key]
    target = _norm_header(key)
    for k, v in row.items():
        if _norm_header(k) == target:
            return v
    return default


# ─── Per-brand parsers ────────────────────────────────────────

def _parse_sigenergy() -> dict:
    """Parse Sigenergy EC series selling prices → { '1P': {5: 191000, ...}, '3P': {...} }"""
    rows = fetch_sheet('Inverters - Sigenergy')
    p1, p3 = {}, {}
    cat_col = '⚡ Sigenergy — ราคาสั่งซื้อและราคาขาย หมวด'
    for row in rows:
        cat = _fuzzy_get(row, cat_col).strip()
        if cat != 'Inverter (EC)':
            continue
        model = _fuzzy_get(row, 'รุ่น (Model)')
        sell = _safe_int(_fuzzy_get(row, 'ราคาขาย (฿)'))
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
    """
    Parse Huawei selling prices → { '1P': {3: 108000, ...}, '3P': {...} }
    BUG-5 fix: previously used `min()` when multiple rows shared a size, which
    picked the cheapest SKU (often a stripped/legacy variant).  Now uses
    first-seen order — matches the Sheet authoring convention where the
    canonical SKU is listed first.
    """
    rows = fetch_sheet('Inverters - Huawei')
    p1, p3 = {}, {}
    for row in rows:
        sell = _safe_int(_fuzzy_get(row, 'ราคาขาย (฿)'))
        if sell <= 0:
            continue
        size = _row_size_kw(row)
        if size <= 0:
            continue
        phase = _norm_phase(_fuzzy_get(row, 'เฟส'))
        model = _fuzzy_get(row, 'รุ่น (Model)').upper()
        if phase == '1P' or 'KTL-L' in model:
            if size not in p1:  # first-seen wins
                p1[size] = sell
        elif phase == '3P' or 'KTL-M' in model:
            if size not in p3:  # first-seen wins
                p3[size] = sell
    return {'1P': p1, '3P': p3}


def _parse_solis() -> dict:
    """Parse Solis selling prices → { '1P': {3: 102000, ...}, '3P': {...} }"""
    rows = fetch_sheet('Inverters - Solis')
    p1, p3 = {}, {}
    for row in rows:
        sell = _safe_int(_fuzzy_get(row, 'ราคาขาย (฿)'))
        if sell <= 0:
            continue
        size = _row_size_kw(row)
        if size <= 0:
            continue
        phase = _norm_phase(_fuzzy_get(row, 'เฟส'))
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
    p1, p3 = {}, {}
    for row in rows:
        # Try ราคาขาย Sun Siam first, then ราคาขาย
        sell = _safe_int(_fuzzy_get(row, 'ราคาขาย Sun Siam (฿)'))
        if sell <= 0:
            sell = _safe_int(_fuzzy_get(row, 'ราคาขาย (฿)'))
        if sell <= 0:
            continue
        size = _row_size_kw(row)
        if size <= 0:
            continue
        phase = _norm_phase(_fuzzy_get(row, 'เฟส'))
        model = _fuzzy_get(row, 'รุ่น (Model)').upper()
        if phase == '1P' or 'LP1' in model:
            if size not in p1 or sell < p1[size]:
                p1[size] = sell
        elif phase == '3P' or 'LP3' in model or 'HP3' in model:
            if size not in p3 or sell < p3[size]:
                p3[size] = sell
    return {'1P': p1, '3P': p3}


def _parse_finalprice() -> dict:
    """
    Parse the 'Finalprice' tab — the all-brand SYSTEM selling-price list
    (added to the workbook 08-2026; this is where Solis/ATMOCE package
    prices live now that the per-brand tabs carry cost data only).

    Layout (verified 2026-08-11, positional because the merged header text
    is unstable):
      col0 = phase (1P/3P; 'Sigenergy...' rows are a separate block),
      col1 = ขนาด (W), col2 = จำนวนแผง, col3 = ต้นทุนรวม, col4 = ราคาขาย,
      col5 = กำไร (numeric) for ATMOCE rows / brand name for brand rows,
      col6 = THB/W for ATMOCE rows / inverter model for brand rows.

    Key convention matches get_selling_price():
      • ATMOCE → key = panel count = round(ขนาด(W) / 625).  The จำนวนแผง
        column is NOT used — it is inconsistent (10000W row says 14 แผง),
        while the quote flow computes panels as size_kw*1000/625.
      • other brands → key = kW = round(จำนวนแผง × 625 / 1000).  Verified
        against the previous hardcoded table: all 16 Huawei/Solis data
        points match exactly.
      • Sigenergy rows are skipped — its own tab is authoritative and the
        snap logic (5/10 SP, 10/20/25 TP) doesn't cover these rows.
    First-seen wins on duplicate keys (sheet convention: canonical row first).
    """
    rows = fetch_sheet('Finalprice')
    atmoce = {'1P': {}, '3P': {}}
    brands: dict = {}
    for row in rows:
        vals = [str(v).strip() for v in row.values()]
        if len(vals) < 7:
            continue
        phase = _norm_phase(vals[0])
        if phase not in ('1P', '3P'):
            continue
        sell = _safe_int(vals[4])
        if sell <= 0:
            continue
        watts = _safe_int(vals[1])
        panels = _safe_int(vals[2])
        brand_cell = vals[5].replace(' ', '')
        if brand_cell and brand_cell.isalpha():
            # Brand block row (Huawei / Solis / ...)
            brand = brand_cell.title()
            if panels <= 0:
                continue
            kw = int(round(panels * 625 / 1000))
            if kw <= 0:
                continue
            tgt = brands.setdefault(brand, {'1P': {}, '3P': {}})
            tgt[phase].setdefault(kw, sell)
        elif watts > 0:
            # ATMOCE system-package row
            key = int(round(watts / 625))
            if key > 0:
                atmoce[phase].setdefault(key, sell)
    if atmoce['1P'] or atmoce['3P']:
        brands['ATMOCE'] = atmoce
    return brands


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
    Fetch selling prices for Huawei, Solis, Sigenergy, Deye from Google Sheets.
    Returns { brand: { phase: { size_kw: price } }, '_source': str, '_age_s': int }
    The '_source' / '_age_s' keys are additive metadata — existing callers
    that read per-brand keys are unaffected.
    Cached for 60 seconds.
    """
    now = time.time()
    if 'prices' in _cache and now - _cache.get('prices_ts', 0) < _CACHE_TTL:
        cached = dict(_cache['prices'])
        cached['_source'] = 'cache-mem'
        cached['_age_s'] = int(now - _cache.get('prices_ts', now))
        return cached

    prices: dict = {}
    # Deye is intentionally NOT here: its tab's 'ราคาขาย Sun Siam' column is
    # the per-unit inverter resale price (e.g. 24,500 for 5 kW), NOT a system
    # package price — feeding it here would quote a whole system at inverter
    # price.  Deye system prices stay on the hardcoded fallback until the
    # Finalprice tab carries Deye rows.
    for brand, parser in [
        ('Sigenergy', _parse_sigenergy),
        ('Huawei', _parse_huawei),
        ('Solis', _parse_solis),
    ]:
        try:
            result = parser()
            if any(result.get(p) for p in ('1P', '3P')):
                prices[brand] = result
        except Exception:
            pass  # fall back to hardcoded

    # Finalprice tab fills the gaps the per-brand tabs don't carry
    # (Solis lost its ราคาขาย column 08-2026, ATMOCE packages were never
    # in a brand tab).  Per-brand tab values win on conflict.
    try:
        for brand, phases in _parse_finalprice().items():
            tgt = prices.setdefault(brand, {'1P': {}, '3P': {}})
            for ph in ('1P', '3P'):
                for k, v in phases.get(ph, {}).items():
                    tgt.setdefault(ph, {}).setdefault(k, v)
    except Exception:
        pass  # fall back to hardcoded

    src, age_s = _worst_source(
        'Inverters - Sigenergy',
        'Inverters - Huawei',
        'Inverters - Solis',
        'Finalprice',
    )
    prices['_source'] = src
    prices['_age_s'] = age_s

    _cache['prices'] = prices
    _cache['prices_ts'] = now
    return prices


def fetch_solar_panels() -> list[dict]:
    """
    Fetch all solar panels from the catalog sheet.
    Returns list of dicts with keys: brand, model, watt, type, warranty,
    cost_price, sell_price, vendor, source, age_s.
    The `source` / `age_s` keys are additive metadata — existing callers
    that only read brand/watt/sell_price are unaffected.
    Cached for 60 seconds.
    """
    now = time.time()
    if 'panels' in _cache and now - _cache.get('panels_ts', 0) < _CACHE_TTL:
        cached_age = int(now - _cache.get('panels_ts', now))
        # Return shallow copies with refreshed source metadata.
        return [dict(p, source='cache-mem', age_s=cached_age) for p in _cache['panels']]

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

    src, age_s = _worst_source('Solar Panels')
    for p in panels:
        p['source'] = src
        p['age_s'] = age_s

    _cache['panels'] = panels
    _cache['panels_ts'] = now
    return panels


# ─── Brand whitelist + tokenization (BUG-2 fix) ──────────────
# Canonical brand tokens used by the catalog.  Queries that do not map to
# one of these via BRAND_ALIASES return None instead of falling back to a
# bidirectional substring match (which caused the VOLS→other + AIKO→JA
# confusion by matching 'ja' ⊂ 'ja solar' ⊂ 'vols-ja' type catalog rows).
BRAND_SET = {
    'aiko', 'vols', 'jinko', 'longi', 'ja solar', 'trina', 'canadian',
}

BRAND_ALIASES = {
    'aiko': 'aiko',
    'vols': 'vols',
    'jinko': 'jinko',
    'jinkosolar': 'jinko',
    'jinko solar': 'jinko',
    'longi': 'longi',
    'long': 'longi',
    'ja': 'ja solar',
    'ja solar': 'ja solar',
    'jasolar': 'ja solar',
    'trina': 'trina',
    'trinasolar': 'trina',
    'trina solar': 'trina',
    'canadian': 'canadian',
    'canadiansolar': 'canadian',
    'canadian solar': 'canadian',
}


def _normalize_brand(raw: str) -> str:
    """
    Lowercase, strip, split on whitespace/hyphens, rejoin tokens.
    Returns the canonical BRAND_SET member if known, else ''.
    """
    if not raw:
        return ''
    s = raw.lower().strip()
    # Replace hyphens/underscores with space, collapse whitespace
    s = re.sub(r'[-_]+', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    if not s:
        return ''
    # Direct alias hit
    if s in BRAND_ALIASES:
        return BRAND_ALIASES[s]
    # Single-token alias hit (e.g. "ja solar 625w" → first token "ja")
    first = s.split(' ')[0]
    if first in BRAND_ALIASES:
        return BRAND_ALIASES[first]
    # Direct BRAND_SET membership (already canonical)
    if s in BRAND_SET:
        return s
    if first in BRAND_SET:
        return first
    return ''


def find_panel(brand_query: str = '', watt_query: int = 0) -> dict | None:
    """
    Find a panel from the catalog matching brand and/or wattage.
    brand_query: fuzzy brand name (e.g. 'aiko', 'longi', 'trina', 'ja')
    watt_query: target wattage (e.g. 650, 715). 0 = any.
    Returns best matching panel dict or None.

    BUG-2 fix: previously used bidirectional substring matching
    (`norm_q not in pb and pb not in norm_q`) which caused false matches
    between VOLS and other brands, and between AIKO and JA Solar catalog
    rows.  Now: canonicalize both query AND catalog brand via
    _normalize_brand(), then require TOKEN EQUALITY.  Unknown brands
    return None instead of guessing.
    """
    panels = fetch_solar_panels()
    if not panels:
        return None

    norm_q = _normalize_brand(brand_query)
    src, age_s = _worst_source('Solar Panels')

    # If a brand was supplied but it doesn't match any known brand in the
    # whitelist, we refuse to guess — return None.  Callers can fall back
    # to watt-only search by passing brand_query=''.
    if brand_query and not norm_q:
        # Try watt-only relaxation before giving up
        if watt_query > 0:
            watt_hits = [p for p in panels if p['watt'] == watt_query]
            if watt_hits:
                priced = [c for c in watt_hits if c['sell_price'] > 0]
                pick = priced[0] if priced else watt_hits[0]
                return dict(pick, source=src, age_s=age_s)
        return None

    candidates = []
    for p in panels:
        pb_norm = _normalize_brand(p['brand'])
        # Token-equality brand match (after normalization on BOTH sides)
        if norm_q:
            if pb_norm != norm_q:
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
    pick = priced[0] if priced else candidates[0]
    return dict(pick, source=src, age_s=age_s)


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

    # BUG-4 fix: int(7.5)==7 truncated rows that used rounded sizes (e.g.
    # a 7.5 kW request would miss an 8 kW catalog row).  For non-Sigenergy
    # brands: use round() and accept ±0.5 kW tolerance.
    if brand == 'Sigenergy':
        # Sigenergy: snap to valid inverter sizes (round up to next available)
        # 1P: 5, 10 kW | 3P: 10, 20, 25 kW
        target_size = sigenergy_snap_size(size_kw, phase)
        size_tolerance = 0  # exact after snap
    else:
        target_size = int(round(size_kw))
        size_tolerance = 0.5  # match ±0.5 kW for non-Sigenergy
    best = None

    for row in rows:
        # Find size column — look for any column key containing 'kW' or 'ขนาด'
        row_size_f: float = 0.0
        for k, v in row.items():
            if ('kw' in k.lower() or 'ขนาด' in k.lower()) and v:
                try:
                    row_size_f = float(str(v).replace(',', '').strip())
                    break
                except Exception:
                    pass

        if size_tolerance > 0:
            if abs(row_size_f - float(target_size)) > size_tolerance and \
               abs(row_size_f - float(size_kw)) > size_tolerance:
                continue
        else:
            if int(round(row_size_f)) != int(target_size):
                continue

        # Phase check
        row_phase = _norm_phase(row.get('เฟส', ''))
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

        # Sell price — rows without one (e.g. the 08-2026 Solis cost list)
        # are still valid MODEL matches; callers treat sell_price=0 as
        # "no sheet price" and keep their own price fallback.
        sell_raw = row.get('ราคาขาย (฿)', '') or row.get('ราคาขาย Sun Siam (฿)', '')
        sell = _safe_int(sell_raw)

        model = row.get('รุ่น (Model)', '').strip()
        src, age_s = _worst_source(sheet_name)
        candidate = {
            'brand': brand,
            'model': model,
            'size_kw': size_kw,
            'phase': phase,
            'sell_price': sell,
            'source': src,
            'age_s': age_s,
        }
        if sell > 0:
            best = candidate
            break  # first priced match wins
        if best is None:
            best = candidate  # model-only match, keep looking for a priced one

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
        src, age_s = _worst_source('Optimizers')
        return {
            'brand': brand,
            'model': model,
            'unit_price': sell,
            'quantity': qty,
            'total_price': sell * qty,
            'source': src,
            'age_s': age_s,
        }

    return None


def fetch_live_battery_prices() -> dict:
    """
    Fetch ATMOCE battery selling prices from Batteries sheet.
    Returns { 'batt_only': int, 'batt_backup_1P': int, 'batt_backup_3P': int,
              'source': str, 'age_s': int }
    The `source` / `age_s` keys are additive metadata — existing callers
    that only read batt_* keys are unaffected.
    Cached for 60 seconds.
    """
    now = time.time()
    if 'batt' in _cache and now - _cache.get('batt_ts', 0) < _CACHE_TTL:
        cached = dict(_cache['batt'])
        cached['source'] = 'cache-mem'
        cached['age_s'] = int(now - _cache.get('batt_ts', now))
        return cached

    result: dict = {}
    try:
        result = _parse_atmoce_battery()
    except Exception:
        pass

    src, age_s = _worst_source('Batteries')
    result['source'] = src
    result['age_s'] = age_s

    _cache['batt'] = result
    _cache['batt_ts'] = now
    return result
