#!/usr/bin/env python3
"""
Enervia Group — Professional Solar Quotation PDF Generator
Supports: ATMOCE, Sigenergy, Huawei, Solis
Layout mirrors QT202601230001 exactly (orange triangle, logo, company info,
quote box, table with # / รายละเอียด / จำนวน / ราคาต่อหน่วย / ยอดรวม)
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import datetime
import os
import random
import math

# ─── Paths ────────────────────────────────────────────────────
REPO_ROOT  = os.environ.get('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')
_pa_oracle_asset = os.path.join(os.path.dirname(__file__), '..', 'assets')
_default_asset = os.path.join(REPO_ROOT, 'tmppic', 'tempagent', 'quotation-solar', 'assets')
# Prefer pa-Oracle repo assets if present, fallback to Nasri-oracle
_pa_asset_resolved = os.path.realpath(_pa_oracle_asset)
_fallback_asset = _pa_asset_resolved if os.path.isdir(_pa_asset_resolved) else _default_asset
ASSET_DIR  = os.environ.get('QSOLAR_ASSET_DIR', _fallback_asset)
FONT_DIR   = os.path.join(ASSET_DIR, 'font')
PIC_DIR    = os.path.join(ASSET_DIR, 'picture ref use')
_default_out = os.path.join(REPO_ROOT, 'nasri-line-bot', 'deploy', 'boms')
OUTPUT_DIR = os.environ.get('QSOLAR_OUTPUT_DIR', _default_out)

# ─── Font Registration ────────────────────────────────────────
_fonts_registered = False

def _register_fonts():
    global _fonts_registered
    if _fonts_registered:
        return
    reg_path = os.path.join(FONT_DIR, 'TH-Sarabun-New-Regular.ttf')
    bold_path = os.path.join(FONT_DIR, 'TH-Sarabun-New-Bold.ttf')
    pdfmetrics.registerFont(TTFont('THSarabunNew', reg_path))
    pdfmetrics.registerFont(TTFont('THSarabunNew-Bold', bold_path))
    _fonts_registered = True

# ─── LN-LOCALE: Template labels per locale ───────────────────
# locale: 'th' (Thai-only) | 'en' (English-only) | 'th-en' (bilingual)
LOCALE_LABELS = {
    'th': {
        'doc_title':    'ใบเสนอราคา',
        'qt_no':        'เลขที่',
        'date':         'วันที่',
        'credit':       'เครดิต',
        'salesperson':  'ผู้ขาย',
        'project':      'ชื่องาน',
        'customer':     'ลูกค้า',
        'col_num':      '#',
        'col_desc':     'รายละเอียด',
        'col_qty':      'จำนวน',
        'col_unit_price': 'ราคาต่อหน่วย',
        'col_total':    'ยอดรวม',
        'subtotal':     'ราคาไม่รวมภาษีมูลค่าเพิ่ม',
        'vat':          'ภาษีมูลค่าเพิ่ม 7%',
        'grand_total':  'จำนวนเงินรวมทั้งสิ้น',
        'buyer':        'ในนาม ลูกค้า',
        'seller':       'ในนาม เอเนอเวีย กรุ๊ป',
    },
    'en': {
        'doc_title':    'QUOTATION',
        'qt_no':        'No.',
        'date':         'Date',
        'credit':       'Credit',
        'salesperson':  'Sales',
        'project':      'Project',
        'customer':     'Customer',
        'col_num':      '#',
        'col_desc':     'Description',
        'col_qty':      'Qty',
        'col_unit_price': 'Unit Price',
        'col_total':    'Amount',
        'subtotal':     'Subtotal (excl. VAT)',
        'vat':          'VAT 7%',
        'grand_total':  'Total Amount',
        'buyer':        'Customer',
        'seller':       'Enervia Group',
    },
    'th-en': {
        'doc_title':    'ใบเสนอราคา / Quotation',
        'qt_no':        'เลขที่ / No.',
        'date':         'วันที่ / Date',
        'credit':       'เครดิต / Credit',
        'salesperson':  'ผู้ขาย / Sales',
        'project':      'ชื่องาน / Project',
        'customer':     'ลูกค้า / Customer',
        'col_num':      '#',
        'col_desc':     'รายละเอียด / Description',
        'col_qty':      'จำนวน / Qty',
        'col_unit_price': 'ราคาต่อหน่วย / Unit Price',
        'col_total':    'ยอดรวม / Amount',
        'subtotal':     'ราคาไม่รวมภาษี / Subtotal',
        'vat':          'ภาษีมูลค่าเพิ่ม 7% / VAT 7%',
        'grand_total':  'รวมทั้งสิ้น / Grand Total',
        'buyer':        'ในนาม ลูกค้า / Customer',
        'seller':       'ในนาม เอเนอเวีย กรุ๊ป / Enervia Group',
    },
}

def get_labels(locale: str) -> dict:
    """Return label dict for the given locale. Falls back to 'th'."""
    return LOCALE_LABELS.get(locale, LOCALE_LABELS['th'])

# ─── Colors ───────────────────────────────────────────────────
ORANGE    = HexColor('#E8941A')
DARK_BLUE = HexColor('#1B4D7A')
LIGHT_BLUE = HexColor('#3B8BD4')

# ─── Page Layout ──────────────────────────────────────────────
PAGE_W, PAGE_H = A4
ML = 40
MR = 40
MT = 40
MB = 40
CONTENT_W = PAGE_W - ML - MR

# ─── Column positions (fixed, no overlap) ─────────────────────
COL_NUM_X  = ML
COL_NUM_W  = 25
COL_DESC_X = ML + COL_NUM_W
COL_QTY_X  = ML + CONTENT_W - 155
COL_QTY_W  = 35
COL_PRICE_X = COL_QTY_X + COL_QTY_W
COL_PRICE_W = 60
COL_TOTAL_X = COL_PRICE_X + COL_PRICE_W
COL_TOTAL_W = 60
COL_DESC_W  = COL_QTY_X - COL_DESC_X - 5
COL_DESC_FULL_W = ML + CONTENT_W - COL_DESC_X - 5  # full-width when no price cols

# ─── Fonts ────────────────────────────────────────────────────
F  = 'THSarabunNew'
FB = 'THSarabunNew-Bold'

# ─── Selling Prices ───────────────────────────────────────────
# Key: panels count (ATMOCE) or kW size (others)
SELLING_PRICES = {
    'ATMOCE': {
        '1P': {
            2: 89000, 3: 100000, 4: 101000, 5: 129000, 6: 139000,
            7: 159000, 8: 169000, 9: 179000, 10: 199000, 11: 219000,
            12: 225000, 13: 249000, 14: 259000, 15: 269000, 16: 279000,
            17: 289000, 18: 299000, 19: 319000, 20: 329000, 24: 419000,
        },
        '3P': {
            8: 189000, 9: 199000, 10: 219000, 11: 229000, 12: 249000,
            13: 269000, 14: 279000, 15: 319000, 16: 329000, 17: 339000,
            18: 350000, 19: 379000, 20: 399000, 24: 479000, 30: 569000,
            32: 569000, 36: 629000, 40: 759000, 42: 759000, 50: 890000,
            60: 980000,
        },
    },
    'Huawei': {
        '1P': {3: 108000, 5: 148000, 10: 258000},
        '3P': {5: 159000, 10: 266000, 15: 375000, 20: 480000},
    },
    'Sigenergy': {
        '1P': {5: 191000, 10: 367000},
        '3P': {5: 275000, 10: 370000, 20: 627000, 25: 724000},
    },
    'Solis': {
        '1P': {3: 102000, 5: 146000, 6: 156000, 8: 208000, 10: 229000},
        '3P': {5: 140000, 10: 255000, 15: 352500},
    },
    'Deye': {
        '1P': {5: 150000, 6: 165000, 8: 215000, 10: 250000, 16: 360000},
        '3P': {5: 155000, 10: 265000, 12: 305000, 15: 380000, 20: 490000, 30: 650000, 40: 780000, 50: 890000},
    },
    'Hoymiles': {
        '1P': {2: 65000, 4: 110000, 6: 155000, 8: 195000, 10: 235000},
        '3P': {2: 75000, 4: 120000, 6: 165000, 10: 265000},
    },
}

# ─── Battery Pricing (ATMOCE) ────────────────────────────────
BATTERY_PRICES = {
    'batt_unit': 99000,       # MS-7K-U per unit
    'backup_1P': 11000,       # MU100S
    'backup_3P': 31000,       # MU100T
    # Legacy composite keys (for live sheet fallback)
    'batt_only': 99000,
    'batt_backup_1P': 110000,
    'batt_backup_3P': 130000,
}

# ─── Dyness Battery Pricing (for Deye / Solis combos) ────────
DYNESS_BATTERY_PRICES = {
    'DL5.0C': 36500,         # 5.12 kWh LV 48V
    'Powerbox Pro': 64000,   # 10.24 kWh LV 48V IP65
    'PowerBrick': 56000,     # 14.3 kWh LV IP20 (ex VAT)
    'PowerBrick PRO': 62000, # 14.3 kWh LV IP65 (ex VAT)
    'Power Brick SC': 75000, # 16 kWh LV IP20
}
DYNESS_BATTERY_KWH = {
    'DL5.0C': 5.12,
    'Powerbox Pro': 10.24,
    'PowerBrick': 14.3,
    'PowerBrick PRO': 14.3,
    'Power Brick SC': 16.0,
}
DYNESS_DEFAULT_MODEL = 'DL5.0C'


def _dyness_best_combo(requested_kwh: float, preferred_model: str = '') -> dict:
    """Pick the best Dyness battery model × qty to reach requested kWh.

    Strategy: prefer fewest units that reach >= requested kWh.
    If no exact/over match, pick closest under.
    Uses hardcoded DYNESS_BATTERY_PRICES/KWH as fallback catalog.
    """
    # Build candidate list sorted by kWh descending (prefer larger)
    candidates = []
    for model, price in DYNESS_BATTERY_PRICES.items():
        kwh = DYNESS_BATTERY_KWH.get(model, 0)
        if kwh <= 0 or price <= 0:
            continue
        candidates.append({'model': model, 'kwh': kwh, 'price': price})
    candidates.sort(key=lambda c: c['kwh'], reverse=True)

    if not candidates:
        up = DYNESS_BATTERY_PRICES[DYNESS_DEFAULT_MODEL]
        return {
            'model': DYNESS_DEFAULT_MODEL, 'brand': 'Dyness',
            'kwh_per_unit': 5.1, 'quantity': 1,
            'unit_price': up, 'total_price': up,
            'total_kwh': 5.1, 'accessories': [],
        }

    # If preferred model is specified and valid, use it with proper qty
    if preferred_model and preferred_model in DYNESS_BATTERY_PRICES:
        kwh = DYNESS_BATTERY_KWH[preferred_model]
        up = float(DYNESS_BATTERY_PRICES[preferred_model])
        import math
        qty = max(1, math.ceil(requested_kwh / kwh))
        return {
            'model': preferred_model, 'brand': 'Dyness',
            'kwh_per_unit': kwh, 'quantity': qty,
            'unit_price': up, 'total_price': up * qty,
            'total_kwh': kwh * qty, 'accessories': [],
        }

    # Pick combo with smallest |diff| to requested, prefer larger kwh_per_unit
    import math
    combos = []
    for c in candidates:
        kwh = c['kwh']
        qty_floor = max(1, int(requested_kwh / kwh))
        qty_ceil = max(1, math.ceil(requested_kwh / kwh))
        for qty in set([qty_floor, qty_ceil]):
            total_kwh = kwh * qty
            diff = abs(total_kwh - requested_kwh)
            combos.append({
                'model': c['model'], 'brand': 'Dyness',
                'kwh_per_unit': kwh, 'quantity': qty,
                'unit_price': float(c['price']),
                'total_price': float(c['price']) * qty,
                'total_kwh': total_kwh, 'accessories': [],
                '_diff': diff,
            })

    if combos:
        combos.sort(key=lambda cb: (cb['_diff'], -cb['kwh_per_unit']))
        best = combos[0]
    else:
        best = None

    if best:
        best.pop('_diff', None)
        return best

    # Absolute fallback
    up = float(DYNESS_BATTERY_PRICES[DYNESS_DEFAULT_MODEL])
    qty = max(1, math.ceil(requested_kwh / 5.1))
    return {
        'model': DYNESS_DEFAULT_MODEL, 'brand': 'Dyness',
        'kwh_per_unit': 5.1, 'quantity': qty,
        'unit_price': up, 'total_price': up * qty,
        'total_kwh': 5.1 * qty, 'accessories': [],
    }


# ─── Battery Brand Compatibility ──────────────────────────────
BATTERY_BRAND_COMPAT = {
    "ATMOCE": ["ATMOCE"],
    "Sigenergy": ["Sigenergy"],
    "Huawei": ["Huawei"],
    "Deye": ["Deye", "Dyness"],
    "Solis": ["Dyness", "Solis"],
    "Hoymiles": [],
}


def _find_best_battery_from_sheet(brand: str, battery_kwh: float, phase: str = "1P") -> dict | None:
    """
    Fetch batteries from Google Sheet and find best model x quantity match.
    Returns dict: model, brand, kwh_per_unit, quantity, unit_price, total_price, total_kwh, accessories
    """
    try:
        import sheets as sheet_mod
        all_data = sheet_mod.fetch_all_sheets()
        batt_rows = all_data.get("Batteries", [])
    except Exception:
        return None

    if not batt_rows:
        return None

    compatible_brands = BATTERY_BRAND_COMPAT.get(brand, [])
    if not compatible_brands:
        return None

    def _batt_price(row):
        # Prefer ราคาขาย (sell price) first, then fall back to ราคาสั่งซื้อ (cost)
        for k, v in row.items():
            if "ราคาขาย" in k.lower():
                try:
                    val = float(str(v).replace(",", "").replace("฿", "").strip())
                    if val > 0:
                        return val
                except Exception:
                    pass
        for k, v in row.items():
            if "฿" in k and "ราคาสั่งซื้อ" in k.lower():
                try:
                    return float(str(v).replace(",", "").replace("฿", "").strip())
                except Exception:
                    pass
        for k, v in row.items():
            if len(k) < 30 and "ราคาสั่งซื้อ" in k.lower():
                try:
                    return float(str(v).replace(",", "").replace("฿", "").strip())
                except Exception:
                    pass
        for k, v in row.items():
            if "฿" in k and "ราคา" in k.lower():
                try:
                    return float(str(v).replace(",", "").replace("฿", "").strip())
                except Exception:
                    pass
        for k, v in row.items():
            if len(k) < 30 and "ราคา" in k.lower():
                try:
                    return float(str(v).replace(",", "").replace("฿", "").strip())
                except Exception:
                    pass
        return 0

    def _batt_field(row, keys):
        for k in keys:
            for col, val in row.items():
                if k.lower() in col.lower() and str(val).strip():
                    return str(val).strip()
        return ""

    candidates = []
    for r in batt_rows:
        price = _batt_price(r)
        if price <= 0:
            continue
        brand_col = str(list(r.values())[0]).strip() if r else ""
        if not any(cb.lower() in brand_col.lower() for cb in compatible_brands):
            continue
        kwh_val = None
        for k, v in r.items():
            if "kwh" in k.lower() or "ขนาด" in k.lower():
                try:
                    kwh_val = float(v)
                    break
                except Exception:
                    pass
        if not kwh_val or kwh_val <= 0:
            continue
        # Skip controller/accessory rows
        vals_str = " ".join(str(v) for v in r.values()).lower()
        if "controller" in vals_str:
            continue
        model = _batt_field(r, ["รุ่น", "model"]) or "Battery"
        candidates.append({"model": model, "brand": brand_col, "kwh_per_unit": kwh_val, "unit_price": price})

    if not candidates:
        return None

    if not battery_kwh or battery_kwh <= 0:
        best = min(candidates, key=lambda c: c["kwh_per_unit"])
        return {**best, "quantity": 1, "total_price": best["unit_price"], "total_kwh": best["kwh_per_unit"], "accessories": []}

    # Pick combo with smallest |diff| to requested kWh.
    # On tie, prefer larger kwh_per_unit (fewer units, simpler install).
    import math
    combos = []
    for c in candidates:
        kwh = c["kwh_per_unit"]
        qty_floor = max(1, int(battery_kwh / kwh))
        qty_ceil = max(1, math.ceil(battery_kwh / kwh))
        for qty in set([qty_floor, qty_ceil]):
            total_kwh = kwh * qty
            diff = abs(total_kwh - battery_kwh)
            combos.append({**c, "quantity": qty, "total_price": c["unit_price"] * qty,
                           "total_kwh": total_kwh, "_diff": diff})

    if not combos:
        return None

    # Sort: smallest diff first, then prefer larger kwh_per_unit (fewer units)
    combos.sort(key=lambda cb: (cb["_diff"], -cb["kwh_per_unit"]))
    winner = combos[0]
    del winner["_diff"]

    # ── Brand-specific post-processing ──

    # Huawei: mandatory Controller accessory
    if brand == "Huawei":
        controller = None
        for r in batt_rows:
            vals = " ".join(str(v) for v in r.values()).lower()
            if "controller" in vals and "huawei" in vals:
                controller = r
                break
        if controller:
            cp = _batt_price(controller)
            cm = _batt_field(controller, ["รุ่น", "model"]) or "LUNA2000-10kW-C1"
            winner["accessories"] = [{
                "model": cm, "brand": "Huawei", "unit_price": cp,
                "quantity": 1, "total_price": cp, "notes": "Mandatory Controller"
            }]

    # ATMOCE: cap at 3 units for 1P
    if brand == "ATMOCE" and phase == "1P" and winner.get("quantity", 0) > 3:
        winner["quantity"] = 3
        winner["total_kwh"] = winner["kwh_per_unit"] * 3
        winner["total_price"] = winner["unit_price"] * 3

    if "accessories" not in winner:
        winner["accessories"] = []

    return winner


# ─── Huawei/Solis inverter model lookup ──────────────────────
HUAWEI_MODELS = {
    '1P': {3: 'SUN2000-3KTL-L1', 5: 'SUN2000-5KTL-L1(10Y)', 10: 'SUN2000-10K-LCO'},
    '3P': {5: 'SUN2000-5KTL-M1(10Y)', 10: 'SUN2000-10KTL-M1', 15: 'SUN2000-15K-MBO', 20: 'SUN2000-20KTL-M5'},
}
SOLIS_MODELS = {
    '1P': {3: 'S6-GR1P5K', 5: 'S6-GR1P5K', 6: 'S6-EH1P6K-L-PLUS NEW', 8: 'S6-EH1P8K-L-PLUS NEW', 10: 'S5-GR1P10K'},
    '3P': {5: 'S5-GR3P5K', 10: 'S6-EH3P10K2-NV-YD-L', 15: 'S6-EH3P15K02-NV-YD-L'},
}
DEYE_MODELS = {
    '1P': {3: 'SUN-3K-OG01LP1-EU-AM2', 5: 'SUN-5K-SG04LP1-EU-SM2', 6: 'SUN-6K-SG04LP1-EU-SM2',
           8: 'SUN-8K-SG05LP1-EU-SM2-P', 10: 'SUN-10K-SG05LP1-EU', 16: 'SUN-16K-SG01LP1-EU'},
    '3P': {5: 'SUN-5K-SG05LP3-EU-SM2', 10: 'SUN-10K-SG04LP3-EU', 12: 'SUN-12K-SG04LP3-EU',
           15: 'SUN-15K-SG05LP3-EU-SM2', 20: 'SUN-20K-SG05LP3-EU-SM2', 30: 'SUN-30K-SG01HP3-EU-BM3',
           40: 'SUN-40K-SG01HP3-EU-BM4', 50: 'SUN-50K-SG01HP3-EU-BM4'},
}
HOYMILES_MODELS = {
    '1P': {2: 'HMS2000D', 4: 'HMS2000D x2', 6: 'HMS2000D x3', 8: 'HMS2000D x4', 10: 'HMS2000D x5'},
    '3P': {2: 'HMT2000', 4: 'HMT2000 x2', 6: 'HMT2000 x3', 10: 'MIT-5000-8T x2'},
}

# ─── Image Sets ───────────────────────────────────────────────
_PIC_ALIASES = {
    'ตัวอย่างการติดตั้งบนหลังคา.jpg': 'roof_install.jpg',
    'BBL.jfif': 'BBL.jpg',
    'SCB.jfif': 'SCB.jpg',
}

def _pic(name):
    p = os.path.join(PIC_DIR, name)
    if not os.path.exists(p) and name in _PIC_ALIASES:
        p = os.path.join(PIC_DIR, _PIC_ALIASES[name])
    return p

ATMOCE_IMAGES = {
    '1P_onGrid':    [_pic('1Phase-Atmoce.jpg'),                    _pic('Atmoce 1 phase.jpg'),                          _pic('Atmoce-system.jpg'),                          _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'), _pic('certificate.jpg')],
    '1P_batt':      [_pic('1Phase-batt-Atmoce.jpg'),               _pic('Atmoce 1 phase with batt.jpg'),                _pic('Atmoce-system.jpg'),                          _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'), _pic('certificate.jpg')],
    '1P_batt_bkup': [_pic('1Phase-batt-Atmoce-full system.jpg'),   _pic('Atmoce 1 phase with backup and batt 7kw.jpg'), _pic('Atmoce-system.jpg'),                          _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'), _pic('certificate.jpg')],
    '3P_onGrid':    [_pic('3Phase-Atmoce.jpg'),                    _pic('Atmoce 3 phase.jpg'),                          _pic('Atmoce-system.jpg'),                          _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'), _pic('certificate.jpg')],
    '3P_batt':      [_pic('3Phase-batt-Atmoce.jpg'),               _pic('Atmoce 3 phase with batt 7kw.jpg'),            _pic('Atmoce-system.jpg'),                          _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'), _pic('certificate.jpg')],
    '3P_batt_bkup': [_pic('3Phase-batt-Atmoce-full system.jpg'),   _pic('Atmoce 3 phase with backup and batt 7kw.jpg'), _pic('Atmoce-system.jpg'),                          _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'), _pic('certificate.jpg')],
}
SIGENERGY_IMAGES = [
    _pic('Sigenergy present1.png'), _pic('Sigenergy present2.png'),
    _pic('Sigenergy present3.png'), _pic('Sigenergy present4.png'),
    _pic('certificate.jpg'),
]
HUAWEI_IMAGES = [
    _pic('huawei.png'), _pic('huawei present.png'),
    _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'),
    _pic('certificate.jpg'),
]
SOLIS_IMAGES = [
    _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'),
    _pic('certificate.jpg'),
]
DEYE_IMAGES = [
    _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'),
    _pic('certificate.jpg'),
]
HOYMILES_IMAGES = [
    _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'),
    _pic('certificate.jpg'),
]


def fmt(num: float) -> str:
    """Format number with commas and 2 decimals."""
    return '{:,.2f}'.format(num)


def _nearest_key(table: dict, value):
    """Find the nearest key in a price table for the given value."""
    keys = sorted(table.keys())
    for k in keys:
        if value <= k:
            return k
    return keys[-1]


def _get_live_prices():
    """Try to fetch live prices from Google Sheets. Returns ({brand_prices}, {batt_prices}) or ({}, {})."""
    try:
        import sheet_prices
        return sheet_prices.fetch_live_prices(), sheet_prices.fetch_live_battery_prices()
    except Exception:
        return {}, {}


def get_selling_price(brand: str, phase: str, size_kw: float, panel_watt: int = 0) -> int:
    """
    Look up selling price. ALWAYS tries Google Sheets first for ALL brands,
    falls back to hardcoded SELLING_PRICES table only if sheet unavailable.
    """
    # Try live sheet prices first — ALL brands including ATMOCE
    try:
        live, _ = _get_live_prices()
        live_brand = live.get(brand, {})
        live_phase = live_brand.get(phase, {})
        if live_phase:
            if brand == 'ATMOCE':
                pw = panel_watt or 625
                panels = round(size_kw * 1000 / pw)
                key = _nearest_key(live_phase, panels)
            else:
                key = _nearest_key(live_phase, int(size_kw))
            price = live_phase.get(key, 0)
            if price > 0:
                return price
    except Exception:
        pass

    # Fallback: hardcoded table (only if sheet unavailable)
    brand_table = SELLING_PRICES.get(brand, {})
    phase_table = brand_table.get(phase, {})
    if not phase_table:
        return 0

    if brand == 'ATMOCE':
        pw = panel_watt or DEFAULT_PANEL['watt']
        panels = round(size_kw * 1000 / pw)
        key = _nearest_key(phase_table, panels)
        return phase_table[key]
    else:
        key = _nearest_key(phase_table, int(size_kw))
        return phase_table[key]


def get_panels_count(brand: str, size_kw: float, panel_watt: int = 0) -> int:
    """Return panel count for a given brand and system size."""
    if panel_watt > 0:
        return max(1, round(size_kw * 1000 / panel_watt))
    if brand == 'Sigenergy':
        # AIKO 670W panels (Sigenergy default)
        return max(1, round(size_kw * 1000 / 670))
    # All other brands: default panel watt
    return max(1, round(size_kw * 1000 / DEFAULT_PANEL['watt']))


# ─── ATMOCE battery item lines ────────────────────────────────
def _atmoce_battery_lines(phase: str, has_backup: bool, batt_qty: int = 1) -> list:
    """Generate ATMOCE battery PDF line items per section3.txt spec."""
    phase_text = '1-phase' if phase == '1P' else '3-phase'
    phase_label = '1 Phase' if phase == '1P' else '3 Phase'
    qty_text = f' จำนวน {batt_qty} เครื่อง' if batt_qty > 1 else ''

    if has_backup:
        title = f'MS-7K (ESS) + พร้อมระบบสำรองไฟ (Backup System) {phase_label}'
        lines = [
            (FB, 13, title),
            (F, 11, f'1. 7kw. Extra low voltage [ELV] Energy Storage System ({phase_text}){qty_text}'),
            (F, 11, 'BATTERY ENERGY STORAGE SYSTEM : MS-7K-U(ประกัน 10ปี) แบตเตอรี่ลิเธียมฟอสเฟต (LFP)'),
            (F, 11, 'แรงดันต่ำ (Extra Low Voltage หรือ ELV) ความปลอดภัยสูง อายุการใช้งาน 10,000 รอบการชาร์จ'),
            (F, 11, 'ตู้ ATMOCE M-Backup Box 1P (MU100S) สำหรับระบบไฟฟ้า 1 เฟส 1ชุด'),
            (F, 11, 'Switches to battery power in milliseconds (<10ms)'),
            (F, 11, '-พร้อมระบบ AC Coupling'),
        ]
    else:
        title = f'MS-7K (ESS) {phase_label}'
        lines = [
            (FB, 13, title),
            (F, 11, f'1. 7kw. Extra low voltage [ELV] Energy Storage System ({phase_text}){qty_text}'),
            (F, 11, 'BATTERY ENERGY STORAGE SYSTEM : MS-7K-U(ประกัน 10ปี) แบตเตอรี่ลิเธียมฟอสเฟต (LFP)'),
            (F, 11, 'แรงดันต่ำ (Extra Low Voltage หรือ ELV) ความปลอดภัยสูง อายุการใช้งาน 10,000 รอบการชาร์จ'),
        ]
    return lines


def _dyness_battery_section_lines(phase: str, has_backup: bool,
                                   model: str, kwh_per_unit: float,
                                   qty: int, total_kwh: float) -> list:
    """Generate Dyness battery PDF line items for Deye/Solis per section3.txt spec."""
    phase_label = '1 Phase' if phase == '1P' else '3 Phase'
    phase_text = '1-phase' if phase == '1P' else '3-phase'
    kwh_text = f'{total_kwh:.4g}kWh' if qty > 1 else f'{kwh_per_unit:.4g}kWh'
    qty_text = f' จำนวน {qty} ชุด' if qty > 1 else ''

    if has_backup:
        title = f'Dyness {model}{qty_text} + พร้อมระบบสำรองไฟ (Backup System) {phase_label}'
        lines = [
            (FB, 13, title),
            (F, 11, f'1. Dyness {model} {kwh_text}. Energy Storage System ({phase_text}){qty_text}'),
            (F, 11, f'BATTERY ENERGY STORAGE SYSTEM : Dyness {model} {kwh_text} (ประกัน 10ปี)'),
            (F, 11, 'แบตเตอรี่ลิเธียมฟอสเฟต (LFP) ความปลอดภัยสูง อายุการใช้งาน 6,000+ รอบการชาร์จ'),
            (F, 11, f'2. ตู้ ATS Backup Box {phase_label} สำหรับระบบไฟฟ้า {phase_label} 1ชุด'),
            (F, 11, 'Switches to battery power'),
        ]
    else:
        title = f'Dyness {model}{qty_text} (ESS) {phase_label}'
        lines = [
            (FB, 13, title),
            (F, 11, f'1. Dyness {model} {kwh_text}. Energy Storage System ({phase_text}){qty_text}'),
            (F, 11, f'BATTERY ENERGY STORAGE SYSTEM : Dyness {model} {kwh_text} (ประกัน 10ปี)'),
            (F, 11, 'แบตเตอรี่ลิเธียมฟอสเฟต (LFP) ความปลอดภัยสูง อายุการใช้งาน 6,000+ รอบการชาร์จ'),
        ]
    return lines


def _sigenergy_battery_section_lines(model: str, kwh_per_unit: float,
                                      qty: int, total_kwh: float) -> list:
    """Generate Sigenergy battery PDF line items per section3.txt spec."""
    qty_text = f' จำนวน {qty} ชุด' if qty > 1 else ''
    lines = [
        (FB, 13, f'SigenStor {model}{qty_text}'),
        (F, 11, f'{kwh_per_unit:.4g} kWh Battery{qty_text}'),
        (F, 11, 'เทคโนโลยีเซลล์ขั้นสูง 314 Ah 100% Depth of Discharge'),
        (F, 11, 'รองรับการชาร์จ/คายประจุได้ถึง 10,000 รอบ'),
        (F, 11, 'พร้อมกับระบบป้องกันแบตเตอรี่ ที่มีความปลอดภัยขั้นสูงถึง 5 ชั้น'),
        (F, 11, 'สามารถจัดการพลังงานอัจฉริยะ ควบคุมโดย AI'),
        (F, 11, 'Switches to battery power in milliseconds (< 10ms)'),
    ]
    return lines


# ─── Sigenergy Optimizer lines ────────────────────────────────
def _sigenergy_optimizer_lines(panels: int) -> list:
    """Build optimizer item lines for Sigenergy. Prices from Google Sheet catalog."""
    opt_qty = max(1, panels // 2)  # 2:1 ratio
    # Try to fetch prices from sheet
    opt_price, adcu_price, emg_price = 1660, 3330, 700  # defaults
    try:
        from sheets import fetch_sheet
        rows = fetch_sheet('Inverters - Sigenergy')
        for r in rows:
            model = r.get('รุ่น (Model)', '').strip()
            cost = r.get('ราคาสั่งซื้อ (฿)', '').replace(',', '').strip()
            if 'Optimizer' in model and cost:
                opt_price = float(cost)
            elif 'ADCU' in model and cost:
                adcu_price = float(cost)
            elif 'Emergency' in model and cost:
                emg_price = float(cost)
    except Exception:
        pass

    lines = [
        (FB, 13, 'Sigenergy Optimizer Kit'),
        (F, 11, f'1. Optimizer 1200-1500W 2:1 {opt_qty} ตัว'),
        (F, 11, '   (1 Optimizer ต่อ 2 แผง)'),
        (F, 11, '2. ADCU WIFI LAN 10 str 1 ชุด'),
        (F, 11, '3. Emergency Switch 1 ชุด'),
        (F, 11, 'เพิ่มประสิทธิภาพการผลิตไฟฟ้าจากแผงโซลาร์'),
    ]
    return lines, opt_price * opt_qty + adcu_price + emg_price


# ─── Default panel info ───────────────────────────────────────
DEFAULT_PANEL = {
    'brand': 'AIKO',
    'model': 'AIKO-G670-MDE72Mw',
    'watt': 670,
    'type': 'N-Type',
    'warranty': '15/30',
}


# ─── Section 1: PV Panel lines ───────────────────────────────
def _panel_section_lines(brand: str, panels: int, panel_brand: str, panel_watt: int,
                         panel_info: dict | None = None) -> list:
    """Build Section 1 (PV Panel) line items for any brand.

    panel_info: dict from find_panel() with keys: brand, model, watt, type, warranty
    """
    pi = panel_info or {}
    p_brand = panel_brand or pi.get('brand', '') or DEFAULT_PANEL['brand']
    p_watt = panel_watt or pi.get('watt', 0) or DEFAULT_PANEL['watt']
    _sheet_model = pi.get('model', '')
    _default_brands = ('aiko comet3n72', 'aiko', 'ja solar', 'ja')
    if _sheet_model:
        p_model = _sheet_model
    elif p_brand.lower() in _default_brands:
        p_model = DEFAULT_PANEL['model']
    else:
        p_model = f'{p_brand} {p_watt}W'
    p_type = pi.get('type', '') or DEFAULT_PANEL['type']
    p_warranty = pi.get('warranty', '') or DEFAULT_PANEL['warranty']

    # Parse warranty "12/30" → equipment/production years
    if '/' in str(p_warranty):
        parts = str(p_warranty).split('/')
        equip_yr = parts[0].strip()
        prod_yr = parts[1].strip()
    else:
        equip_yr = str(p_warranty).strip()
        prod_yr = '30'

    lines = [
        (FB, 13, f'แผงโซล่าเซลล์ (PV Panel) — {p_brand}'),
        (F, 11, f'รุ่น: {p_model}  {p_watt} Watt'),
        (F, 11, f'เทคโนโลยี: {p_type}'),
        (F, 11, f'จำนวน: {panels} แผ่น'),
        (F, 11, f'รับประกันประสิทธิภาพการผลิต {prod_yr} ปี / รับประกันอุปกรณ์ {equip_yr} ปี'),
    ]
    return lines


# ─── Section 2: Inverter lines ────────────────────────────────
def _inverter_section_lines(brand: str, phase: str, size_kw: float, model: str,
                            panels: int = 0, has_optimizer: bool = False,
                            panel_brand: str = '', panel_watt: int = 0) -> list:
    """Build Section 2 (Inverter) line items for any brand.
    panel_brand/panel_watt: for ATMOCE only — bundled panel info included in installation lines.

    v1.3: Refactored to use declarative specs (install_line_specs.py)
    and generic renderer (install_line_renderer.py)."""
    from install_line_specs import get_spec
    from install_line_renderer import render_install_lines

    spec = get_spec(brand, phase, size_kw)
    return render_install_lines(
        spec=spec,
        brand=brand,
        phase=phase,
        size_kw=size_kw,
        model=model,
        panels=panels,
        F=F,
        FB=FB,
        DEFAULT_PANEL=DEFAULT_PANEL,
        panel_brand=panel_brand,
        panel_watt=panel_watt,
    )


# ─── Shared: Enervia Warranty lines ──────────────────────────
def _warranty_lines(brand: str) -> list:
    panel_years = '15' if brand == 'ATMOCE' else '12'
    inverter_years = INVERTER_WARRANTY_YEARS.get(brand, '10')
    lines = [
        (FB, 13, 'Enervia การรับประกัน'),
        (F, 11, 'ประกันงานติดตั้งอุปกรณ์ทั้ง ระบบ 5 ปี หลังจากติดตั้ง และทดสอบระบบเรียบร้อย (และรับ'),
        (F, 11, 'ประกันกรณีติดตั้ง ตัวยึดไม่ดี ทำให้ลมพัดแผงหลุดและเกิดความเสียหาย)'),
        (F, 11, f'- แผงโซล่า เซลล์ Tier 1 รับประกันการผลิตไฟฟ้าและอุปกรณ์ {panel_years}/30 ปี'),
        (F, 11, '- บริการล้างแผงฟรี 2 ครั้ง ภายในระยะเวลา 2 ปี'),
        (F, 11, f'- INVERTER ยี่ห้อ {brand} รับประกัน {inverter_years} ปี'),
        (F, 11, '- บริการดูแลบำรุงรักษาเป็นระยะเวลา 25 ปี'),
    ]
    return lines


# ─── Brand-specific inverter warranty years ───────────────────
INVERTER_WARRANTY_YEARS = {
    'ATMOCE': '25', 'Sigenergy': '10', 'Huawei': '10',
    'Solis': '10', 'Deye': '10', 'Hoymiles': '10',
}

# ─── Shared: Terms item 4 (first part) ───────────────────────
def _terms_page1_lines(brand: str, grand_total: float) -> list:
    # All brands: 60% + 40% split
    pct1, pct2, label1, label2 = 0.60, 0.40, '60%', '40%'
    dep = grand_total * pct1
    fin = grand_total * pct2
    return [
        (FB, 13, f'รายละเอียดเพิ่มเติม {brand}'),
        (F, 11, 'หัวข้อ ที่ 1 : เงื่อนไขการยื่นราคาและชำระเงิน'),
        (F, 11, 'การชำระเงินแบ่ง ออกเป็น 2 รอบ'),
        (F, 11, f'รอบที่ 1 - {label1} Payment With PO ({fmt(dep)} บาท)'),
        (F, 11, f'รอบที่ 2 - {label2} หลังจากติดตั้งเรียบร้อย ({fmt(fin)} บาท)'),
        (F, 11, 'หัวข้อ ที่ 2 : ระยะเวลาการดำเนินโครงการ'),
        (F, 11, 'ระยะเวลาการดำเนินการในการติดตั้ง ภายในระยะเวลา 7 วัน หรือตามนัดหมาย นับจากวันที่ชำระ'),
        (F, 11, 'เงินมัดจำล่วงหน้า'),
        (F, 11, 'หัวข้อ ที่ 3 : เงื่อนไขอื่นๆ'),
        (F, 11, 'บริษัท จะเป็นผู้ดำเนิน การจัดหาอุปกรณ์ต่างๆ'),
        (F, 11, '(รวมทั้ง แผงโซล่า เซลล์และ อินเวอร์เตอร์) พร้อมทั้ง ดำเนินการติดตั้ง อุปกรณ์ ตลอดจน'),
        (F, 11, 'ทดสอบระบบให้แล้วเสร็จ'),
        (F, 11, 'รวมระยะสายไฟจากระบบโซล่าร์ไม่เกิน 50 เมตร'),
        (F, 11, 'หัวข้อ ที่ 4 : เงื่อนไขพิเศษ'),
    ]


def _terms_page2_lines(brand: str) -> list:
    inverter_years = INVERTER_WARRANTY_YEARS.get(brand, '10')
    # Panel warranty years: ATMOCE uses AIKO (15/30), others use JA Solar (12/30)
    panel_years = '15' if brand == 'ATMOCE' else '12'

    lines = [
        'ขอสงวนสิทธิไม่ สามารถ นำข้อมูล ที่เสนอไปใช้ในด้าน อื่น หรือให้บุคคลที่สามนอกจากจะ',
        'ได้รับอนุญาติจากบริษัทก่อน',
        'หัวข้อ ที่ 5 : ข้อ ยกเว้น การรับประกัน',
        'ในการรับประกัน จะรับประกันการติดตั้ง และการใช้งานในสภาวะปกติ ยกเว้น ในกรณีดังนี้',
        '- ไม่คลอบคลุมถึงผลกระทบที่เกิดจาก ภัยธรรมชาติ ฟ้าผ่า ฟ้าลง ไฟไหม้ น้ำท่วมและอื่นๆ',
        'เช่น ภัยจากการจลาจล',
        '- ความเสียหายที่เกิดจากเหตุสุดวิสัยหรืออุบัติเหตุ หรือผู้หนึ่งผู้ใดเจตนาทำให้สินค้าเสียหาย',
        '- ความเสียหายที่เกิดจากใช้งานไม่ถูกต้อง ไม่ถูกประเภทหรือที่ระบุไว้ในคู่มือการใช้งาน',
        '- ความเสียหายจากระบบไฟฟ้าเดิมของอาคาร (ก่อนการติดตั้งโซล่าเซลล์)',
        'ในส่วนที่ไม่ใช่งานติดตั้งของบริษัทฯ',
        '- เหตุไฟฟ้าลัดวงจรหรือไฟกระชากจากการดัดแปลงระบบโดยบุคคลอื่น',
        '- ปัญหาแรงดันไฟฟ้าตกหรือเกินจากการไฟฟ้าส่วนภูมิภาค (PEA)',
        'หรือการไฟฟ้านครหลวง (MEA) ซึ่งไม่ใช่ความผิดพลาดจากการติดตั้งโซล่าเซลล์',
        'หัวข้อ ที่ 6 : การรับประกัน',
        'ประกันงานติดตั้ง อุปกรณ์ทั้ง ระบบ 5 ปี หลังจากติดตั้ง และทดสอบระบบเรียบร้อย (และรับ',
        'ประกันกรณีติดตั้ง ตัวยึดไม่ดี ทำให้ลมพัดแผงหลุดและเกิดความเสียหาย)',
    ]
    # ATMOCE: includes roof leak warranty
    if brand == 'ATMOCE':
        lines.append('- ประกันหลังคารั่วซึม 2 ปี')
    lines += [
        f'- แผงโซล่า เซลล์ Tier 1 รับประกันความบกพร่องในการผลิต {panel_years} ปี รับประกันการผลิต',
        'ไฟฟ้า 30 ปี',
        f'- INVERTER ยี่ห้อ {brand} รับประกันความบกพร่องในการผลิต {inverter_years} ปี',
        '- บริการดูแลบำรุงรักษาเป็นระยะเวลา 25 ปี',
        'การรับประกันจะสิ้นสุดในกรณีต่อไปนี้',
        '- ความเสียหายเกิดจากการวัสดุอุปกรณ์ที่ทาง ผู้ซื้อดัดแปลงหรือเปลี่ยนอุปกรณ์ด้วยตนเอง',
        'และผลจากการที่ผู้ซื้อซ่อมอุปกรณ์',
        '- การต่อเติมและดัดแปลงวงจร',
        '- สินค้าของแถม ไม่อยู่ในเงื่อนไขการรับประกัน',
        '- ประกันงานติดตั้งอุปกรณ์ทั้ง ระบบ 5 ปี ฟรีค่าแรง 10 ครั้งภายใน 5 ปี',
        'หัวข้อ ที่ 7 : การตรวจรับ',
        'ในการตรวจรับ หรือรับมอบอุปกรณ์หรือ ระบบนั้น จะดำเนินการหลังจากติดตั้ง และทดสอบ',
        'ระบบเรียบร้อย',
    ]
    return lines


# ═══════════════════════════════════════════════════════════════
#  QuotationGenerator — Main class
# ═══════════════════════════════════════════════════════════════
class QuotationGenerator:

    def __init__(self):
        _register_fonts()

    def generate(self, data: dict) -> str:
        """
        Generate a PDF quotation.

        data keys:
          brand, size_kw, phase, customer_name, project_name,
          quote_number, date, salesperson, has_battery, has_backup,
          grand_total (optional override), output_path (optional)

        Returns path to generated PDF.
        """
        brand        = data.get('brand', 'ATMOCE')
        size_kw      = float(data.get('size_kw', 5.0))
        phase        = data.get('phase', '1P')
        customer     = data.get('customer_name', 'ใบเสนอราคา')
        _battery_only_flag = bool(data.get('battery_only', False))
        _default_proj = (f'Battery Storage System {phase} {brand}'
                         if _battery_only_flag
                         else f'Solar Cell Rooftop {size_kw:.4g}kW {phase} {brand}')
        project_name = data.get('project_name', _default_proj)
        quote_number = data.get('quote_number', self._gen_quote_number())
        date_str     = data.get('date', datetime.date.today().strftime('%d/%m/%Y'))
        salesperson  = data.get('salesperson', 'นาย นวฤกษ์ มะแอ')
        has_battery  = bool(data.get('has_battery', False))
        has_backup   = bool(data.get('has_backup', False))
        discount     = float(data.get('discount', 0.0))
        remarks      = data.get('remarks', [])
        output_path  = data.get('output_path', '')

        # Auto-derive grand_total if not provided
        if 'grand_total' in data:
            grand_total = float(data['grand_total'])
        else:
            _panels_est = get_panels_count(brand, size_kw, int(data.get('panel_watt', 0)))
            grand_total = self._calc_grand_total(
                brand, phase, size_kw, has_battery, has_backup,
                battery_model=data.get('battery_model', ''),
                battery_kwh=float(data.get('battery_kwh', 0)),
                has_optimizer=bool(data.get('has_optimizer', False)),
                panels=_panels_est,
            )

        battery_only = bool(data.get('battery_only', False))

        # Output path
        if not output_path:
            os.makedirs(OUTPUT_DIR, exist_ok=True)
            if battery_only:
                battery_kwh_val = float(data.get('battery_kwh', 0))
                safe_name = f'{brand}_batt-only_{phase}'
                if battery_kwh_val > 0:
                    safe_name += f'_{battery_kwh_val:.4g}kWh'
            else:
                safe_name = f'{brand}_{size_kw:.4g}kW_{phase}'
                if has_battery:
                    safe_name += '_batt'
                if has_backup:
                    safe_name += '_bkup'
            output_path = os.path.join(OUTPUT_DIR, f'{quote_number}_{safe_name}.pdf')

        lump_sum = bool(data.get('lump_sum', False))
        # LN-LOCALE: 'th' | 'en' | 'th-en' — selects label set for header/table
        locale   = data.get('locale', 'th')

        doc_data = {
            'quote_number': quote_number,
            'date': date_str,
            'salesperson': salesperson,
            'project_name': project_name,
            'customer_name': customer,
            'brand': brand,
            'size_kw': size_kw,
            'phase': phase,
            'has_battery': has_battery,
            'has_backup': has_backup,
            'grand_total': grand_total,
            'discount': discount,
            'remarks': remarks,
            'lump_sum': lump_sum,
            'locale': locale,
        }

        # Pass through panel/battery/optimizer overrides from caller.
        # BUG fix 2026-04-11: added 'panel_count' — was the missing link that made
        # commits 89e7f61 + e6e71e6 (honor explicit panel_count in _build_items and
        # _summary_bar) silently no-ops. data['panel_count'] was being dropped here,
        # so the downstream readers always saw 0 and recomputed from size_kw/670W.
        for _pass_key in ('panel_brand', 'panel_watt', 'panel_count', 'battery_model', 'battery_kwh', 'has_optimizer', 'credit', 'battery_only'):
            if _pass_key in data:
                doc_data[_pass_key] = data[_pass_key]

        self._build_pdf(output_path, doc_data)

        # ── Build structured line-item data for caller ──────────
        _panels_final = int(doc_data.get('panel_count', 0) or 0)
        if not _panels_final:
            _panels_final = get_panels_count(brand, size_kw, int(doc_data.get('panel_watt', 0)))
        structured = self._build_line_items_json(
            brand=brand,
            phase=phase,
            size_kw=size_kw,
            panels=_panels_final,
            has_battery=has_battery,
            has_backup=has_backup,
            grand_total=grand_total,
            discount=discount,
            data=doc_data,
            lump_sum=bool(doc_data.get('lump_sum', False)),
        )
        return {'pdf_path': output_path, 'items': structured}

    # ──────────────────────────────────────────────────────────
    def _calc_grand_total(self, brand, phase, size_kw, has_battery, has_backup, battery_model='', **kwargs):
        base = get_selling_price(brand, phase, size_kw)
        if brand == 'ATMOCE' and has_battery:
            battery_kwh = kwargs.get('battery_kwh', 0)
            batt_qty = max(1, round(battery_kwh / 7)) if battery_kwh > 0 else 1
            if phase == '1P':
                batt_qty = min(batt_qty, 3)  # 1P max 3 batteries (21kWh)
            # Try Google Sheet for ATMOCE battery price first
            live_batt = {}
            try:
                import sheet_prices
                live_batt = sheet_prices.fetch_live_battery_prices()
            except Exception:
                pass
            # Tiered pricing: 1P first=110k, 3P first=130k, additional=99k each
            if has_backup:
                first_price = float(live_batt.get('batt_backup_' + phase, 0)) or float(BATTERY_PRICES['batt_backup_' + phase])
            else:
                first_price = float(live_batt.get('batt_only', 0)) or float(BATTERY_PRICES['batt_unit'])
            additional_price = float(live_batt.get('batt_only', 0)) or float(BATTERY_PRICES['batt_unit'])
            batt_price = first_price + max(0, batt_qty - 1) * additional_price
            base += batt_price
        elif brand in ('Deye', 'Solis') and has_battery:
            battery_kwh = kwargs.get('battery_kwh', 0)
            # Always try Google Sheet first for battery pricing
            batt_info = _find_best_battery_from_sheet(brand, battery_kwh, phase=phase)
            if batt_info:
                base += batt_info['total_price']
            else:
                # Fallback to hardcoded — use _dyness_best_combo for correct qty × price
                bm = battery_model or ''
                if battery_kwh > 0:
                    combo = _dyness_best_combo(battery_kwh, preferred_model=bm)
                    base += combo['total_price']
                else:
                    bm = bm or DYNESS_DEFAULT_MODEL
                    base += float(DYNESS_BATTERY_PRICES.get(bm, DYNESS_BATTERY_PRICES[DYNESS_DEFAULT_MODEL]))
        elif brand in ('Huawei', 'Sigenergy') and has_battery:
            battery_kwh = kwargs.get('battery_kwh', 0)
            batt_info = _find_best_battery_from_sheet(brand, battery_kwh, phase=phase)
            if batt_info:
                base += batt_info['total_price']
                # Add accessories (e.g. Huawei Controller)
                for acc in batt_info.get('accessories', []):
                    base += acc['total_price']

        # Sigenergy optimizer cost
        has_optimizer = kwargs.get('has_optimizer', False)
        if brand == 'Sigenergy' and has_optimizer:
            panels_count = kwargs.get('panels', 0)
            if panels_count > 0:
                try:
                    from sheet_prices import find_optimizer as _fo
                    oi = _fo('Sigenergy', panels_count)
                    if oi:
                        base += float(oi['total_price'])
                    else:
                        base += _sigenergy_optimizer_lines(panels_count)[1]
                except Exception:
                    base += _sigenergy_optimizer_lines(panels_count)[1]

        return float(base)

    def _gen_quote_number(self) -> str:
        today = datetime.date.today()
        seq = random.randint(1, 9999)
        return f'QT{today.strftime("%Y%m%d")}{seq:04d}'

    # ──────────────────────────────────────────────────────────
    def _build_pdf(self, filename: str, d: dict):
        brand       = d['brand']
        size_kw     = d['size_kw']
        phase       = d['phase']
        has_battery = d['has_battery']
        has_backup  = d['has_backup']
        grand_total = d['grand_total']
        discount    = d.get('discount', 0.0)
        remarks     = d.get('remarks', [])
        lump_sum    = bool(d.get('lump_sum', False))

        custom_watt = int(d.get('panel_watt', 0))
        # BUG fix 2026-04-11: if user explicitly specifies panel_count (e.g. "10 แผง"),
        # use it verbatim. Previously always recomputed from size_kw/panel_watt which
        # overrode the user's explicit count (e.g. "10 kW 10 panels" showed 15 panels).
        explicit_panels = int(d.get('panel_count', 0) or 0)
        if explicit_panels > 0:
            panels = explicit_panels
        else:
            panels = get_panels_count(brand, size_kw, custom_watt)

        # Determine system images
        images = self._get_images(brand, phase, has_battery, has_backup)
        total_pages = 4 + len(images)

        c = canvas.Canvas(filename, pagesize=A4)

        _locale = d.get('locale', 'th')

        # ── PAGE 1 ─────────────────────────────────────────────
        y = self._header(c, d)
        y = self._summary_bar(c, y, d)
        y = self._table_header(c, y, _locale)

        # Build item list
        items = self._build_items(brand, panels, phase, size_kw, has_battery, has_backup, grand_total, d, lump_sum=lump_sum)

        # Pre-calculate overflow pages so total_pages is correct in page numbers
        MIN_Y = 80
        extra_item_pages = self._count_item_overflow_pages(items, y, MIN_Y)
        total_pages = 4 + len(images) + extra_item_pages

        current_page = 1
        item_start_y = y  # y after table header — same for every new page
        for num, lines, price, total in items:
            ih = self._measure_item_height(lines, price, total)
            if y - ih < MIN_Y:
                self._page_num(c, current_page, total_pages)
                c.showPage()
                current_page += 1
                y = self._header(c, d)
                y = self._table_header(c, y, _locale)
                item_start_y = y
            y = self._draw_item(c, y, num, lines, qty=1, price=price, total=total)

        self._page_num(c, current_page, total_pages)
        # Remaining pages after items are offset by extra_item_pages
        _page_offset = current_page  # page 2 in old logic = current_page + 1

        # ── PAGE 2 ─────────────────────────────────────────────
        c.showPage()
        y = self._header(c, d)
        y = self._table_header(c, y, _locale)

        terms2 = _terms_page2_lines(brand)
        cy = y - 10
        c.setFillColor(black)
        for text in terms2:
            c.setFont(F, 8)
            c.drawString(COL_DESC_X, cy, text)
            cy -= 12

        # Separator
        cy -= 5
        c.setStrokeColor(HexColor('#E8E8E8'))
        c.setLineWidth(0.5)
        c.line(ML, cy, ML + CONTENT_W, cy)

        # Financial summary
        cy -= 18
        cy = self._financial_summary(c, cy, grand_total, brand, size_kw, discount=discount, remarks=remarks,
                                     markup_pct=float(d.get('markup_pct', 0.0)),
                                     base_price=float(d.get('base_price', 0.0)))

        self._page_num(c, _page_offset + 1, total_pages)

        # ── PAGE 3: Signature ────────────────────────────────
        c.showPage()
        y = self._header(c, d)

        c.setStrokeColor(HexColor('#E8E8E8'))
        c.setLineWidth(0.5)
        c.line(ML, y + 8, ML + CONTENT_W, y + 8)

        sig_y = 150
        c.setFillColor(black)
        c.setFont(FB, 14)
        c.drawString(ML, sig_y + 30, 'ในนาม ลูกค้า')
        c.drawRightString(PAGE_W - MR, sig_y + 30, 'ในนาม เอเนอเวีย กรุ๊ป')

        # Center logo
        logo_path = os.path.join(PIC_DIR, 'logo enervia.jpg')
        if os.path.exists(logo_path):
            sig_logo_w = 140
            sig_logo_h = sig_logo_w * (300 / 1400)
            c.drawImage(logo_path, PAGE_W / 2 - sig_logo_w / 2, sig_y - 15,
                        width=sig_logo_w, height=sig_logo_h,
                        preserveAspectRatio=True, mask='auto')

        # S3: QR code — confirm URL (bottom-right of signature area)
        _qr_url = d.get('confirm_url') or d.get('dashboard_url') or ''
        if _qr_url:
            self._draw_qr(c, _qr_url, PAGE_W - MR - 58, sig_y - 12, size=55)

        sl_y = sig_y - 50
        c.setStrokeColor(black)
        c.setLineWidth(0.5)

        c.line(ML + 20, sl_y, ML + 150, sl_y)
        c.line(ML + 165, sl_y, ML + 235, sl_y)
        c.setFont(FB, 13)
        c.setFillColor(black)
        c.drawCentredString(ML + 85, sl_y - 16, 'ผู้สั่งซื้อสินค้า')
        c.drawCentredString(ML + 200, sl_y - 16, 'วันที่')

        rx = PAGE_W - MR - 235
        c.line(rx, sl_y, rx + 130, sl_y)
        c.line(rx + 145, sl_y, rx + 215, sl_y)
        c.drawCentredString(rx + 65, sl_y - 16, 'ผู้อนุมัติ')
        c.drawCentredString(rx + 180, sl_y - 16, 'วันที่')

        self._page_num(c, _page_offset + 2, total_pages)

        # ── PAGE 4: Payment ──────────────────────────────────
        c.showPage()
        y0 = PAGE_H - MT

        # Blue triangle
        p = c.beginPath()
        p.moveTo(PAGE_W - 55, PAGE_H)
        p.lineTo(PAGE_W, PAGE_H)
        p.lineTo(PAGE_W, PAGE_H - 55)
        p.close()
        c.setFillColor(LIGHT_BLUE)
        c.drawPath(p, fill=1, stroke=0)

        logo_path = os.path.join(PIC_DIR, 'logo enervia.jpg')
        if os.path.exists(logo_path):
            logo_w = 170
            logo_h = logo_w * (300 / 1400)
            c.drawImage(logo_path, ML, y0 - logo_h + 8,
                        width=logo_w, height=logo_h,
                        preserveAspectRatio=True, mask='auto')

        y = y0 - 50
        c.setFillColor(ORANGE)
        c.setFont(FB, 14)
        c.drawString(ML, y, 'ข้อมูลการรับชำระ')

        y -= 16
        c.setFillColor(black)
        c.setFont(F, 12)
        for line in [
            'เอเนอเวีย กรุ๊ป (สำนักงานใหญ่)',
            'เลขที่ 40/3 หมู่ 4 ถนนสังฆสันติสุข แขวงกระทุ่มราย',
            'เขตหนองจอก จังหวัดกรุงเทพมหานคร 10530',
            'เลขประจำตัวผู้เสียภาษี 0105556150779 เบอร์สำนักงาน 0967964587',
        ]:
            c.drawString(ML, y, line)
            y -= 16

        y -= 3
        c.setStrokeColor(ORANGE)
        c.setLineWidth(1)
        c.line(ML, y, PAGE_W - MR, y)

        y -= 22
        c.setFillColor(DARK_BLUE)
        c.setFont(FB, 14)
        c.drawString(ML, y, 'โอนเงิน')

        y -= 30
        card_w = (CONTENT_W - 20) / 2
        card_h = 110

        # BBL card
        cx1 = ML
        c.setStrokeColor(HexColor('#E0E0E0'))
        c.setLineWidth(0.5)
        c.roundRect(cx1, y - card_h, card_w, card_h, 8, stroke=1, fill=0)

        bbl_path = os.path.join(PIC_DIR, 'BBL.jfif')
        bbl_size = 35
        if os.path.exists(bbl_path):
            c.drawImage(bbl_path, cx1 + card_w / 2 - bbl_size / 2, y - 10 - bbl_size,
                        width=bbl_size, height=bbl_size,
                        preserveAspectRatio=True, mask='auto')

        c.setFillColor(black)
        c.setFont(FB, 11)
        c.drawCentredString(cx1 + card_w / 2, y - 55, '217-4-15352-4')
        c.setFont(F, 10)
        c.drawCentredString(cx1 + card_w / 2, y - 68, 'ธ. กรุงเทพ')
        c.drawCentredString(cx1 + card_w / 2, y - 80, '(หนองจอก)')
        c.drawCentredString(cx1 + card_w / 2, y - 92, 'บจ.เอเนอเวีย กรุ๊ป')

        # SCB card
        cx2 = ML + card_w + 20
        c.setStrokeColor(HexColor('#E0E0E0'))
        c.roundRect(cx2, y - card_h, card_w, card_h, 8, stroke=1, fill=0)

        scb_path = os.path.join(PIC_DIR, 'SCB.jfif')
        if os.path.exists(scb_path):
            c.drawImage(scb_path, cx2 + card_w / 2 - bbl_size / 2, y - 10 - bbl_size,
                        width=bbl_size, height=bbl_size,
                        preserveAspectRatio=True, mask='auto')

        c.setFillColor(black)
        c.setFont(FB, 11)
        c.drawCentredString(cx2 + card_w / 2, y - 55, '433-2-19177-5')
        c.setFont(F, 10)
        c.drawCentredString(cx2 + card_w / 2, y - 68, 'ธ. ไทยพาณิชย์')
        c.drawCentredString(cx2 + card_w / 2, y - 80, '(สาขาบิ๊กซี เคหะร่มเกล้า)')
        c.drawCentredString(cx2 + card_w / 2, y - 92, 'บจ.เอเนอเวีย กรุ๊ป')

        self._page_num(c, _page_offset + 3, total_pages)

        # ── PAGE 5+: System images ───────────────────────────
        img_w = PAGE_W - ML - MR
        img_h = PAGE_H - MT - MB - 30
        for idx, img_path in enumerate(images):
            c.showPage()
            if os.path.exists(img_path):
                try:
                    c.drawImage(img_path, ML, MB + 15, width=img_w, height=img_h,
                                preserveAspectRatio=True, mask='auto')
                except Exception as e:
                    c.setFont(F, 12)
                    c.setFillColor(black)
                    c.drawString(ML, PAGE_H / 2, f'[Image not available: {os.path.basename(img_path)}]')
            else:
                c.setFont(F, 12)
                c.setFillColor(black)
                c.drawString(ML, PAGE_H / 2, f'[Image not found: {os.path.basename(img_path)}]')
            self._page_num(c, _page_offset + 4 + idx, total_pages)

        # sobek K1: watermark for draft/sent status (not accepted)
        status = d.get('status', 'draft')
        if status in ('draft', 'sent'):
            self._stamp_watermark(c, status, total_pages)

        c.save()
        return filename

    # sobek K1: diagonal watermark stamped on every page after content
    def _stamp_watermark(self, c, status: str, total_pages: int):
        label = 'DRAFT' if status == 'draft' else 'ส่งแล้ว / SENT'
        c.saveState()
        c.setFont('Helvetica-Bold', 52)
        c.setFillColorRGB(0.85, 0.85, 0.85, alpha=0.35)
        cx, cy = PAGE_W / 2, PAGE_H / 2
        angle = 35
        # Stamp every page by iterating page range
        for _ in range(total_pages):
            c.beginForm('wm_' + status + '_' + str(_))
            c.translate(cx, cy)
            c.rotate(angle)
            c.drawCentredString(0, 0, label)
            c.rotate(-angle)
            c.translate(-cx, -cy)
            c.endForm()
        # Actually draw on current (last) page — prior pages already have showPage
        c.translate(cx, cy)
        c.rotate(angle)
        c.drawCentredString(0, 0, label)
        c.rotate(-angle)
        c.translate(-cx, -cy)
        c.restoreState()

    # ──────────────────────────────────────────────────────────
    def _build_items(self, brand, panels, phase, size_kw, has_battery, has_backup, grand_total, data=None, lump_sum=False):
        """
        Returns list of (item_num, lines, price, total) tuples.
        price = 0 means 'included / no separate charge'.

        3-section structure:
          Section 1 — PV Panel  (แผงโซล่าเซลล์)
          Section 2 — Inverter  (อินเวอร์เตอร์)
          Section 3 — Battery   (แบตเตอรี่) — only when has_battery=True
          Next      — Sigenergy Optimizer — only when has_optimizer=True
          Then      — Warranty
          Then      — Terms

        Pricing strategy:
          - panel_price: from sheet catalog (find_panel) → sell_price × qty
          - inverter_price: from sheet (find_inverter) → sell_price; falls back to hardcoded
          - battery_price: from _find_best_battery_from_sheet (unchanged logic)
          - If lump_sum=True: all three sections roll into Section 1 price; 2 and 3 shown at 0.
          - If grand_total given as override: remainder after battery stays in panel+inverter combined;
            inverter draws its sheet price and panel takes what is left.
        """
        items = []
        data = data or {}

        # ── Step 1: Resolve panel brand / watt from sheet ──────
        _user_brand = data.get('panel_brand', '')
        _user_watt  = int(data.get('panel_watt', 0))

        panel_brand = _user_brand
        panel_watt  = _user_watt
        panel_sell_price = 0.0   # per-panel sell price from catalog
        panel_info = None        # full panel dict from sheet

        # Default panel brand per inverter brand
        if brand == 'Sigenergy':
            _default_brand, _default_watt = 'AIKO', 670
        elif brand == 'ATMOCE':
            _default_brand, _default_watt = DEFAULT_PANEL['brand'], DEFAULT_PANEL['watt']
        else:
            _default_brand, _default_watt = DEFAULT_PANEL['brand'], DEFAULT_PANEL['watt']

        try:
            from sheet_prices import find_panel
            # If user specified a brand, search for that brand (watt=0 means any watt)
            # If no brand specified, ignore any watt guess and use default brand's default watt
            # (user-supplied watt without brand often comes from LLM default and won't match
            # the inverter-brand's actual default panel in the sheet)
            search_brand = _user_brand or _default_brand
            search_watt = _user_watt if _user_brand else _default_watt
            found = find_panel(search_brand, search_watt)
            # Safety net 1: if find_panel's internal watt-only fallback returned a cross-brand
            # match (e.g. AIKO 625 → VOLS 625), detect the brand mismatch and retry brand-only
            if found and search_brand:
                _fb = str(found.get('brand', '')).lower()
                _sb = search_brand.lower()
                if _sb and _fb and _sb not in _fb and _fb not in _sb:
                    alt = find_panel(search_brand, 0)
                    if alt:
                        found = alt
            # Safety net 2: if nothing found at all, retry brand-only
            if not found and search_brand:
                found = find_panel(search_brand, 0)
            if found:
                panel_brand = panel_brand or found['brand']
                panel_watt  = panel_watt or found['watt']
                panel_sell_price = float(found.get('sell_price', 0) or 0)
                panel_info = found
        except Exception:
            pass

        if not panel_brand:
            panel_brand = _default_brand
        if not panel_watt:
            panel_watt = _default_watt

        panel_catalog_total = panel_sell_price * panels  # 0 if catalog unavailable

        # ── Step 2: Resolve inverter model + price from sheet ───
        inverter_model = ''
        inverter_sheet_price = 0.0

        try:
            from sheet_prices import find_inverter as _find_inv
            inv_info = _find_inv(brand, size_kw, phase)
            if inv_info:
                inverter_model = inv_info.get('model', '')
                inverter_sheet_price = float(inv_info.get('sell_price', 0) or 0)
        except Exception:
            pass

        # Brand-specific model fallbacks (hardcoded)
        if not inverter_model:
            if brand == 'Huawei':
                inverter_model = HUAWEI_MODELS.get(phase, {}).get(int(size_kw), f'SUN2000-{int(size_kw)}kW')
            elif brand == 'Solis':
                inverter_model = SOLIS_MODELS.get(phase, {}).get(int(size_kw), f'Solis {size_kw:.4g}kW')
            elif brand == 'Deye':
                inverter_model = DEYE_MODELS.get(phase, {}).get(int(size_kw), f'SUN-{int(size_kw)}K-{phase}')
            elif brand == 'Hoymiles':
                inverter_model = HOYMILES_MODELS.get(phase, {}).get(int(size_kw), f'HMS{int(size_kw * 1000)}D')
            elif brand == 'ATMOCE':
                inverter_model = 'MI-1250' if phase == '3P' else 'MI-500'
            elif brand == 'Sigenergy':
                # Snap to valid Sigenergy inverter sizes (round up to nearest available)
                # 1P: 5.0, 10.0 kW | 3P: 10.0, 20.0, 25.0 kW
                if phase == '1P':
                    _valid_sizes = [5.0, 10.0]
                else:
                    _valid_sizes = [10.0, 20.0, 25.0]
                _snapped = next((s for s in _valid_sizes if s >= size_kw), _valid_sizes[-1])
                _suffix = 'SP' if phase == '1P' else 'TP'
                inverter_model = f'SigenStor EC {_snapped:.1f} {_suffix}'

        # ── Step 3: Resolve battery info ────────────────────────
        batt_info = None
        batt_price = 0.0

        if has_battery:
            battery_kwh = float(data.get('battery_kwh', 0))

            if brand == 'ATMOCE':
                batt_qty = max(1, round(battery_kwh / 7)) if battery_kwh > 0 else 1
                if phase == '1P':
                    batt_qty = min(batt_qty, 3)
                live_batt = {}
                try:
                    import sheet_prices as _sp
                    live_batt = _sp.fetch_live_battery_prices()
                except Exception:
                    pass
                # Tiered pricing: 1P first=110k, 3P first=130k, additional=99k each
                if has_backup:
                    first_price = float(live_batt.get('batt_backup_' + phase) or BATTERY_PRICES['batt_backup_' + phase])
                else:
                    first_price = float(live_batt.get('batt_only') or BATTERY_PRICES['batt_unit'])
                additional_price = float(live_batt.get('batt_only') or BATTERY_PRICES['batt_unit'])
                backup_add = first_price - additional_price  # for batt_info compatibility
                batt_price = first_price + max(0, batt_qty - 1) * additional_price
                batt_info = {
                    'model': 'MS-7K-U',
                    'brand': 'ATMOCE',
                    'kwh_per_unit': 7.0,
                    'quantity': batt_qty,
                    'unit_price': additional_price,
                    'total_price': batt_price,
                    'total_kwh': 7.0 * batt_qty,
                    'accessories': [],
                    '_has_backup': has_backup,
                    '_backup_add': backup_add,
                }

            elif brand in ('Deye', 'Solis'):
                batt_info = _find_best_battery_from_sheet(brand, battery_kwh, phase=phase)
                if batt_info:
                    batt_price = batt_info['total_price']
                else:
                    # Fallback: pick best Dyness model × qty from hardcoded catalog
                    bm = data.get('battery_model', '') or ''
                    if battery_kwh > 0:
                        batt_info = _dyness_best_combo(battery_kwh, preferred_model=bm)
                    else:
                        # No kWh specified — pick smallest Dyness model × 1
                        bm = bm or DYNESS_DEFAULT_MODEL
                        up = float(DYNESS_BATTERY_PRICES.get(bm, DYNESS_BATTERY_PRICES[DYNESS_DEFAULT_MODEL]))
                        kwh = DYNESS_BATTERY_KWH.get(bm, 5.12)
                        batt_info = {
                            'model': bm, 'brand': 'Dyness',
                            'kwh_per_unit': kwh, 'quantity': 1,
                            'unit_price': up, 'total_price': up,
                            'total_kwh': kwh, 'accessories': [],
                        }
                    batt_price = batt_info['total_price']

            elif brand in ('Huawei', 'Sigenergy'):
                batt_info = _find_best_battery_from_sheet(brand, battery_kwh, phase=phase)
                if batt_info:
                    batt_price = batt_info['total_price']
                    for acc in batt_info.get('accessories', []):
                        batt_price += acc['total_price']

        # ── Step 4: Price distribution ───────────────────────────
        # Pre-compute optimizer cost (Sigenergy only) so we can subtract it from budget
        _opt_cost_est = 0.0
        if brand == 'Sigenergy' and data.get('has_optimizer', False):
            try:
                from sheet_prices import find_optimizer as _find_opt_est
                _oi = _find_opt_est('Sigenergy', panels)
                if _oi:
                    _opt_cost_est = float(_oi['total_price'])
                else:
                    _opt_cost_est = _sigenergy_optimizer_lines(panels)[1]
            except Exception:
                _opt_cost_est = _sigenergy_optimizer_lines(panels)[1]

        # panel_price + inverter_price = grand_total - batt_price - opt_cost (unless lump_sum)
        pv_inverter_budget = grand_total - (batt_price if not lump_sum else 0.0) - (_opt_cost_est if not lump_sum else 0.0)

        # BUG-7 fix: clamp negative pv_inverter_budget to 0 — caused by
        # under-priced quotes (e.g. user entered grand_total lower than
        # batt_price + opt cost).  When this happens, proportionally shrink
        # batt_price / _opt_cost_est so they fit grand_total and Section 1
        # still shows something positive.
        if pv_inverter_budget < 0 and not lump_sum:
            overshoot_base = batt_price + _opt_cost_est
            if overshoot_base > 0 and grand_total >= 0:
                scale = max(0.0, grand_total / overshoot_base)
                batt_price = batt_price * scale
                _opt_cost_est = _opt_cost_est * scale
            else:
                batt_price = 0.0
                _opt_cost_est = 0.0
            pv_inverter_budget = max(0.0, grand_total - batt_price - _opt_cost_est)

        # batt_shown always equals batt_price (except lump_sum)
        batt_shown = batt_price

        if lump_sum:
            # All cost folds into Section 1; Section 2 and 3 show 0
            panel_price    = grand_total
            inverter_price = 0.0
            batt_shown     = 0.0
        elif inverter_sheet_price > 0 and panel_catalog_total > 0:
            # Both from sheet — scale proportionally to fit pv_inverter_budget
            combined = panel_catalog_total + inverter_sheet_price
            if combined > 0:
                panel_price    = round(pv_inverter_budget * (panel_catalog_total / combined))
                inverter_price = pv_inverter_budget - panel_price
            else:
                panel_price    = round(pv_inverter_budget * 0.40)
                inverter_price = pv_inverter_budget - panel_price
        elif inverter_sheet_price > 0:
            # Inverter from sheet; panel gets remainder
            inverter_price = min(inverter_sheet_price, pv_inverter_budget)
            panel_price    = max(0.0, pv_inverter_budget - inverter_price)
        elif panel_catalog_total > 0:
            # Panel from catalog; inverter gets remainder
            panel_price    = min(panel_catalog_total, pv_inverter_budget)
            inverter_price = max(0.0, pv_inverter_budget - panel_price)
        else:
            # Neither from sheet — split 40/60 (panel/inverter) of pv_inverter_budget
            panel_price    = round(pv_inverter_budget * 0.40)
            inverter_price = pv_inverter_budget - panel_price

        # BUG-7 safety: never let panel_price or inverter_price go negative
        # regardless of how the branches above computed them.
        if panel_price < 0:
            panel_price = 0.0
        if inverter_price < 0:
            inverter_price = 0.0

        battery_only = bool(data.get('battery_only', False))
        has_optimizer = data.get('has_optimizer', False)

        if not battery_only:
            # ── Step 5: Build Section 1 — PV Panel ──────────────────
            panel_lines = _panel_section_lines(brand, panels, panel_brand, panel_watt, panel_info=panel_info)
            items.append((1, panel_lines, panel_price, panel_price))

            # ── Step 6: Build Section 2 — Inverter ──────────────────
            inv_lines = _inverter_section_lines(brand, phase, size_kw, inverter_model,
                                                panels=panels, has_optimizer=has_optimizer,
                                                panel_brand=panel_brand if brand == 'ATMOCE' else '',
                                                panel_watt=panel_watt if brand == 'ATMOCE' else 0)
            items.append((2, inv_lines, inverter_price, inverter_price))
            item_num = 3
        else:
            # battery-only: skip Sections 1 and 2; battery section starts at item 1
            item_num = 1

        # ── Step 6b: Sigenergy Optimizer (optional — pricing as separate section) ──
        if brand == 'Sigenergy' and has_optimizer:
            try:
                from sheet_prices import find_optimizer as _find_opt
                opt_info = _find_opt('Sigenergy', panels)
            except Exception:
                opt_info = None

            if opt_info:
                opt_cost = float(opt_info['total_price'])
                opt_qty  = opt_info['quantity']
                opt_lines = [
                    (FB, 13, 'Sigenergy Optimizer Kit'),
                    (F, 11, f'1. Optimizer 1200-1500W 2:1 {opt_qty} ตัว'),
                    (F, 11, '   (1 Optimizer ต่อ 2 แผง)'),
                    (F, 11, '2. ADCU WIFI LAN 10 str 1 ชุด'),
                    (F, 11, '3. Emergency Switch 1 ชุด'),
                    (F, 11, 'เพิ่มประสิทธิภาพการผลิตไฟฟ้าจากแผงโซลาร์'),
                ]
            else:
                # Fallback to legacy helper
                opt_lines_raw, opt_cost = _sigenergy_optimizer_lines(panels)
                opt_lines = opt_lines_raw

            # BUG-7 fix: if the pv_inverter_budget clamp above scaled
            # _opt_cost_est down (override path where grand_total < batt+opt),
            # render that scaled value instead of the raw sheet price so the
            # line items still sum to grand_total.
            _opt_shown = _opt_cost_est if _opt_cost_est < opt_cost else opt_cost
            items.append((item_num, opt_lines, _opt_shown, _opt_shown))
            item_num += 1

        # ── Step 7: Build Section 3 — Battery (optional) ────────
        if has_battery and batt_info:
            bm        = batt_info['model']
            batt_qty  = batt_info['quantity']
            batt_kwh_per = batt_info['kwh_per_unit']
            batt_brand_name = batt_info['brand']
            total_kwh = batt_info['total_kwh']

            if brand == 'ATMOCE':
                batt_lines = _atmoce_battery_lines(phase, has_backup, batt_qty)
            elif brand == 'Sigenergy':
                batt_lines = _sigenergy_battery_section_lines(bm, batt_kwh_per, batt_qty, total_kwh)
                for acc in batt_info.get('accessories', []):
                    batt_lines.append((F, 11, f'อุปกรณ์เสริม: {acc["model"]} ({acc.get("notes", "")})'))
            elif brand in ('Deye', 'Solis'):
                batt_lines = _dyness_battery_section_lines(phase, has_backup, bm, batt_kwh_per, batt_qty, total_kwh)
            elif brand == 'Huawei':
                # Huawei: LUNA2000 generic format with accessories
                batt_lines = [
                    (FB, 13, f'แบตเตอรี่ (Battery) — {batt_brand_name}'),
                    (F, 11, f'รุ่น: {bm}  ความจุ: {batt_kwh_per:.4g} kWh/ชุด'),
                    (F, 11, f'จำนวน: {batt_qty} ชุด  รวมความจุ: {total_kwh:.1f} kWh'),
                    (F, 11, 'แบตเตอรี่ลิเธียมฟอสเฟต (LFP) แรงดันต่ำ ความปลอดภัยสูง'),
                    (F, 11, 'อายุการใช้งาน 6,000+ รอบการชาร์จ  รับประกัน 10 ปี'),
                ]
                for acc in batt_info.get('accessories', []):
                    batt_lines.append((F, 11, f'อุปกรณ์เสริม: {acc["model"]} ({acc.get("notes", "")})'))
            else:
                # Generic fallback
                warranty_years = '10' if brand in ('Huawei', 'Sigenergy') else '5'
                batt_lines = [
                    (FB, 13, f'แบตเตอรี่ (Battery) — {batt_brand_name}'),
                    (F, 11, f'รุ่น: {bm}  ความจุ: {batt_kwh_per:.4g} kWh/ชุด'),
                    (F, 11, f'จำนวน: {batt_qty} ชุด  รวมความจุ: {total_kwh:.1f} kWh'),
                    (F, 11, 'แบตเตอรี่ลิเธียมฟอสเฟต (LFP) ความปลอดภัยสูง'),
                    (F, 11, f'อายุการใช้งาน 6,000+ รอบการชาร์จ  รับประกัน {warranty_years} ปี'),
                ]

            items.append((item_num, batt_lines, batt_shown, batt_shown))
            item_num += 1

        # ── Step 8: Warranty and Terms ───────────────────────────
        items.append((item_num, _warranty_lines(brand), 0.0, 0.0))
        items.append((item_num + 1, _terms_page1_lines(brand, grand_total), 0.0, 0.0))

        return items

    # ──────────────────────────────────────────────────────────
    def _build_line_items_json(self, brand, phase, size_kw, panels, has_battery,
                               has_backup, grand_total, discount=0.0, data=None, lump_sum=False):
        """
        Return structured line-item data for every component in the quotation.
        Mirrors the pricing logic of _build_items() (Steps 1-4) but outputs
        List[dict] instead of PDF tuples.

        Each dict: {category, item_name, quantity, unit, unit_price, total_price,
                    formula, sort_order}

        Categories: panel | inverter | installation | bos | grid_fee | battery |
                    optimizer | vat | discount | total
        """
        data = data or {}
        items = []
        sort = 0

        # ── Step 1: Resolve panel info (mirrors _build_items Step 1) ──
        _user_brand = data.get('panel_brand', '')
        _user_watt  = int(data.get('panel_watt', 0))
        if brand == 'Sigenergy':
            _default_brand, _default_watt = 'AIKO', 670
        else:
            _default_brand, _default_watt = DEFAULT_PANEL['brand'], DEFAULT_PANEL['watt']

        panel_brand = _user_brand or _default_brand
        panel_watt  = _user_watt or _default_watt
        panel_sell_price = 0.0
        panel_info = None
        try:
            from sheet_prices import find_panel
            search_brand = _user_brand or _default_brand
            search_watt  = _user_watt if _user_brand else _default_watt
            found = find_panel(search_brand, search_watt)
            if found and search_brand:
                _fb = str(found.get('brand', '')).lower()
                _sb = search_brand.lower()
                if _sb and _fb and _sb not in _fb and _fb not in _sb:
                    alt = find_panel(search_brand, 0)
                    if alt:
                        found = alt
            if not found and search_brand:
                found = find_panel(search_brand, 0)
            if found:
                panel_brand      = panel_brand or found['brand']
                panel_watt       = panel_watt  or found['watt']
                panel_sell_price = float(found.get('sell_price', 0) or 0)
                panel_info       = found
        except Exception:
            pass

        panel_catalog_total = panel_sell_price * panels

        # ── Step 2: Resolve inverter model + price ─────────────
        inverter_model = ''
        inverter_sheet_price = 0.0
        try:
            from sheet_prices import find_inverter as _find_inv
            inv_info = _find_inv(brand, size_kw, phase)
            if inv_info:
                inverter_model       = inv_info.get('model', '')
                inverter_sheet_price = float(inv_info.get('sell_price', 0) or 0)
        except Exception:
            pass
        if not inverter_model:
            if brand == 'Huawei':
                inverter_model = HUAWEI_MODELS.get(phase, {}).get(int(size_kw), f'SUN2000-{int(size_kw)}kW')
            elif brand == 'Solis':
                inverter_model = SOLIS_MODELS.get(phase, {}).get(int(size_kw), f'Solis {size_kw:.4g}kW')
            elif brand == 'Deye':
                inverter_model = DEYE_MODELS.get(phase, {}).get(int(size_kw), f'SUN-{int(size_kw)}K-{phase}')
            elif brand == 'Hoymiles':
                inverter_model = HOYMILES_MODELS.get(phase, {}).get(int(size_kw), f'HMS{int(size_kw * 1000)}D')
            elif brand == 'ATMOCE':
                inverter_model = 'MI-1250' if phase == '3P' else 'MI-500'
            elif brand == 'Sigenergy':
                _valid = [5.0, 10.0] if phase == '1P' else [10.0, 20.0, 25.0]
                _snapped = next((s for s in _valid if s >= size_kw), _valid[-1])
                inverter_model = f'SigenStor EC {_snapped:.1f} {"SP" if phase == "1P" else "TP"}'

        # ── Step 3: Resolve battery ─────────────────────────────
        batt_info  = None
        batt_price = 0.0
        if has_battery:
            battery_kwh = float(data.get('battery_kwh', 0))
            if brand == 'ATMOCE':
                batt_qty = max(1, round(battery_kwh / 7)) if battery_kwh > 0 else 1
                if phase == '1P':
                    batt_qty = min(batt_qty, 3)
                live_batt = {}
                try:
                    import sheet_prices as _sp
                    live_batt = _sp.fetch_live_battery_prices()
                except Exception:
                    pass
                if has_backup:
                    first_price = float(live_batt.get('batt_backup_' + phase) or BATTERY_PRICES['batt_backup_' + phase])
                else:
                    first_price = float(live_batt.get('batt_only') or BATTERY_PRICES['batt_unit'])
                additional_price = float(live_batt.get('batt_only') or BATTERY_PRICES['batt_unit'])
                batt_price = first_price + max(0, batt_qty - 1) * additional_price
                batt_info = {
                    'model': 'MS-7K-U', 'brand': 'ATMOCE',
                    'kwh_per_unit': 7.0, 'quantity': batt_qty,
                    'unit_price': additional_price, 'total_price': batt_price,
                    'total_kwh': 7.0 * batt_qty, 'accessories': [],
                }
            elif brand in ('Deye', 'Solis'):
                batt_info = _find_best_battery_from_sheet(brand, battery_kwh, phase=phase)
                if batt_info:
                    batt_price = batt_info['total_price']
                else:
                    bm = data.get('battery_model', '') or DYNESS_DEFAULT_MODEL
                    if battery_kwh > 0:
                        batt_info = _dyness_best_combo(battery_kwh, preferred_model=bm)
                    else:
                        up  = float(DYNESS_BATTERY_PRICES.get(bm, DYNESS_BATTERY_PRICES[DYNESS_DEFAULT_MODEL]))
                        kwh = DYNESS_BATTERY_KWH.get(bm, 5.12)
                        batt_info = {'model': bm, 'brand': 'Dyness', 'kwh_per_unit': kwh,
                                     'quantity': 1, 'unit_price': up, 'total_price': up,
                                     'total_kwh': kwh, 'accessories': []}
                    batt_price = batt_info['total_price']
            elif brand in ('Huawei', 'Sigenergy'):
                batt_info = _find_best_battery_from_sheet(brand, battery_kwh, phase=phase)
                if batt_info:
                    batt_price = batt_info['total_price']
                    for acc in batt_info.get('accessories', []):
                        batt_price += acc['total_price']

        # ── Step 4: Price distribution (mirrors _build_items Step 4) ─
        _opt_cost = 0.0
        has_optimizer = bool(data.get('has_optimizer', False))
        if brand == 'Sigenergy' and has_optimizer:
            try:
                from sheet_prices import find_optimizer as _fo
                _oi = _fo('Sigenergy', panels)
                _opt_cost = float(_oi['total_price']) if _oi else _sigenergy_optimizer_lines(panels)[1]
            except Exception:
                _opt_cost = _sigenergy_optimizer_lines(panels)[1]

        pv_inv_budget = grand_total - (batt_price if not lump_sum else 0.0) - (_opt_cost if not lump_sum else 0.0)
        if pv_inv_budget < 0 and not lump_sum:
            overshoot = batt_price + _opt_cost
            if overshoot > 0 and grand_total >= 0:
                scale      = max(0.0, grand_total / overshoot)
                batt_price = batt_price * scale
                _opt_cost  = _opt_cost  * scale
            else:
                batt_price = 0.0
                _opt_cost  = 0.0
            pv_inv_budget = max(0.0, grand_total - batt_price - _opt_cost)

        if lump_sum:
            panel_price    = grand_total
            inverter_price = 0.0
            batt_price     = 0.0
        elif inverter_sheet_price > 0 and panel_catalog_total > 0:
            combined       = panel_catalog_total + inverter_sheet_price
            panel_price    = round(pv_inv_budget * (panel_catalog_total / combined)) if combined > 0 else round(pv_inv_budget * 0.4)
            inverter_price = pv_inv_budget - panel_price
        elif inverter_sheet_price > 0:
            inverter_price = min(inverter_sheet_price, pv_inv_budget)
            panel_price    = max(0.0, pv_inv_budget - inverter_price)
        elif panel_catalog_total > 0:
            panel_price    = min(panel_catalog_total, pv_inv_budget)
            inverter_price = max(0.0, pv_inv_budget - panel_price)
        else:
            panel_price    = round(pv_inv_budget * 0.40)
            inverter_price = pv_inv_budget - panel_price
        panel_price    = max(0.0, panel_price)
        inverter_price = max(0.0, inverter_price)

        _battery_only_json = bool(data.get('battery_only', False))

        # ── Build structured items ──────────────────────────────
        next_sort = 1
        if not _battery_only_json:
            # 1. PV Panel
            unit_price_panel = round(panel_price / panels, 2) if panels > 0 else panel_price
            items.append({
                'category':    'panel',
                'item_name':   f'{panel_brand} {panel_watt}W',
                'quantity':    panels,
                'unit':        'แผง',
                'unit_price':  unit_price_panel,
                'total_price': panel_price,
                'formula':     f'{panels} แผง × {unit_price_panel:,.0f} บาท',
                'sort_order':  next_sort,
            })
            next_sort += 1

            # 2. Inverter
            items.append({
                'category':    'inverter',
                'item_name':   inverter_model or f'{brand} {size_kw:.4g}kW {phase}',
                'quantity':    1,
                'unit':        'ชุด',
                'unit_price':  inverter_price,
                'total_price': inverter_price,
                'formula':     f'ราคาขาย {brand} {size_kw:.4g}kW',
                'sort_order':  next_sort,
            })
            next_sort += 1

            # 3. ค่าติดตั้ง (labor) — included in inverter section price
            items.append({
                'category':    'installation',
                'item_name':   'ค่าแรงติดตั้งระบบ',
                'quantity':    1,
                'unit':        'ชุด',
                'unit_price':  0.0,
                'total_price': 0.0,
                'formula':     'รวมใน Section อินเวอร์เตอร์',
                'sort_order':  next_sort,
            })
            next_sort += 1

            # 4. BOS (Balance of System — สาย, Mounting, Breaker)
            items.append({
                'category':    'bos',
                'item_name':   'BOS (สายไฟ + Mounting + อุปกรณ์ไฟฟ้า)',
                'quantity':    1,
                'unit':        'ชุด',
                'unit_price':  0.0,
                'total_price': 0.0,
                'formula':     'รวมใน Section อินเวอร์เตอร์',
                'sort_order':  next_sort,
            })
            next_sort += 1

            # 5. ค่าขอขนาน + ค่าธรรมเนียม SLD (MEA/PEA grid interconnect)
            items.append({
                'category':    'grid_fee',
                'item_name':   'ค่าขอขนาน + ค่าธรรมเนียมขออนุญาต MEA/PEA (SLD)',
                'quantity':    1,
                'unit':        'ชุด',
                'unit_price':  0.0,
                'total_price': 0.0,
                'formula':     'รวมใน Section อินเวอร์เตอร์',
                'sort_order':  next_sort,
            })
            next_sort += 1

        # 6. Battery (optional)
        if has_battery and batt_info:
            bm       = batt_info.get('model', '')
            batt_qty = batt_info.get('quantity', 1)
            batt_up  = batt_info.get('unit_price', batt_price)
            kwh_txt  = f'{batt_info.get("total_kwh", 0):.4g} kWh'
            items.append({
                'category':    'battery',
                'item_name':   f'{batt_info.get("brand", brand)} {bm} ({kwh_txt})',
                'quantity':    batt_qty,
                'unit':        'ชุด',
                'unit_price':  batt_up,
                'total_price': batt_price,
                'formula':     f'{batt_qty} ชุด × {batt_up:,.0f} บาท',
                'sort_order':  next_sort,
            })
            # Battery accessories (e.g. Huawei Controller)
            for acc in batt_info.get('accessories', []):
                next_sort += 1
                items.append({
                    'category':    'battery_accessory',
                    'item_name':   acc.get('model', 'อุปกรณ์เสริม'),
                    'quantity':    acc.get('quantity', 1),
                    'unit':        'ชุด',
                    'unit_price':  float(acc.get('unit_price', acc.get('total_price', 0))),
                    'total_price': float(acc.get('total_price', 0)),
                    'formula':     acc.get('notes', ''),
                    'sort_order':  next_sort,
                })
            next_sort += 1

        # 7. Optimizer (Sigenergy optional)
        if brand == 'Sigenergy' and has_optimizer and _opt_cost > 0:
            opt_qty = max(1, (panels + 1) // 2)
            items.append({
                'category':    'optimizer',
                'item_name':   'Sigenergy Optimizer 1200-1500W 2:1',
                'quantity':    opt_qty,
                'unit':        'ตัว',
                'unit_price':  round(_opt_cost / opt_qty, 2) if opt_qty > 0 else _opt_cost,
                'total_price': _opt_cost,
                'formula':     f'{opt_qty} ตัว (1 ตัวต่อ 2 แผง)',
                'sort_order':  next_sort,
            })
            next_sort += 1

        # 8. Discount (if any)
        if discount > 0:
            items.append({
                'category':    'discount',
                'item_name':   'ส่วนลดพิเศษ',
                'quantity':    1,
                'unit':        '',
                'unit_price':  -discount,
                'total_price': -discount,
                'formula':     f'ลด {discount:,.0f} บาท',
                'sort_order':  next_sort,
            })
            next_sort += 1

        # 9. VAT 7% (reverse-computed from grand_total incl. VAT)
        after       = grand_total - discount if discount > 0 else grand_total
        vat         = round(after - (after * 100 / 107), 2)
        excl_vat    = round(after * 100 / 107, 2)
        items.append({
            'category':    'vat',
            'item_name':   'ภาษีมูลค่าเพิ่ม 7%',
            'quantity':    1,
            'unit':        '',
            'unit_price':  vat,
            'total_price': vat,
            'formula':     f'{after:,.2f} × 7/107 = {vat:,.2f}',
            'sort_order':  next_sort,
        })
        next_sort += 1

        # 10. ราคาไม่รวม VAT
        items.append({
            'category':    'excl_vat',
            'item_name':   'ราคาไม่รวมภาษีมูลค่าเพิ่ม',
            'quantity':    1,
            'unit':        'บาท',
            'unit_price':  excl_vat,
            'total_price': excl_vat,
            'formula':     f'{after:,.2f} × 100/107 = {excl_vat:,.2f}',
            'sort_order':  next_sort,
        })
        next_sort += 1

        # 11. Grand total
        items.append({
            'category':    'total',
            'item_name':   'จำนวนเงินรวมทั้งสิ้น (รวม VAT)',
            'quantity':    1,
            'unit':        'บาท',
            'unit_price':  after,
            'total_price': after,
            'formula':     f'grand total incl. VAT 7%',
            'sort_order':  next_sort,
        })

        return items

    # ──────────────────────────────────────────────────────────
    def _get_images(self, brand, phase, has_battery, has_backup):
        if brand == 'ATMOCE':
            if has_battery and has_backup:
                key = f'{phase}_batt_bkup'
            elif has_battery:
                key = f'{phase}_batt'
            else:
                key = f'{phase}_onGrid'
            return ATMOCE_IMAGES.get(key, [])
        elif brand == 'Sigenergy':
            return SIGENERGY_IMAGES
        elif brand == 'Huawei':
            return HUAWEI_IMAGES
        elif brand == 'Deye':
            return DEYE_IMAGES
        elif brand == 'Hoymiles':
            return HOYMILES_IMAGES
        else:
            return SOLIS_IMAGES

    # ──────────────────────────────────────────────────────────
    def _header(self, c, d) -> float:
        """Draw page header. Returns y position after header."""
        y0 = PAGE_H - MT

        # Orange triangle top-right
        p = c.beginPath()
        p.moveTo(PAGE_W - 55, PAGE_H)
        p.lineTo(PAGE_W, PAGE_H)
        p.lineTo(PAGE_W, PAGE_H - 55)
        p.close()
        c.setFillColor(ORANGE)
        c.drawPath(p, fill=1, stroke=0)

        # Logo
        logo_path = os.path.join(PIC_DIR, 'logo enervia.jpg')
        logo_w = 170
        logo_h = logo_w * (300 / 1400)
        if os.path.exists(logo_path):
            c.drawImage(logo_path, ML, y0 - logo_h + 8,
                        width=logo_w, height=logo_h,
                        preserveAspectRatio=True, mask='auto')

        # Title — locale-aware
        _lbl = get_labels(d.get('locale', 'th'))
        c.setFillColor(ORANGE)
        c.setFont(FB, 24)
        c.drawRightString(PAGE_W - MR, y0 - 8, _lbl['doc_title'])
        # Underline
        c.setStrokeColor(ORANGE)
        c.setLineWidth(1)
        title_w = c.stringWidth(_lbl['doc_title'], FB, 24)
        c.line(PAGE_W - MR - title_w, y0 - 12, PAGE_W - MR, y0 - 12)

        # Company info
        y = y0 - logo_h - 5
        c.setFillColor(black)
        c.setFont(F, 10)
        for line in [
            'เอเนอเวีย กรุ๊ป (สำนักงานใหญ่)',
            'เลขที่ 40/3 หมู่ 4 ถนนสังฆสันติสุข แขวงกระทุ่มราย',
            'เขตหนองจอก จังหวัดกรุงเทพมหานคร 10530',
            'เลขประจำตัวผู้เสียภาษี 0105556150779',
            'โทร. 0967964587',
            'www.enervia.co.th',
        ]:
            c.drawString(ML, y, line)
            y -= 13

        # Quote info box (right side)
        bx = 350
        bw = PAGE_W - MR - bx
        by_top = y0 - logo_h - 5
        bh = 84

        c.setStrokeColor(HexColor('#CCCCCC'))
        c.setLineWidth(0.5)
        c.rect(bx, by_top - bh, bw, bh, stroke=1, fill=0)

        lx = bx + 8
        vx = bx + 50
        ry = by_top - 10

        for label, value in [
            (_lbl['qt_no'],       d['quote_number']),
            (_lbl['date'],        d['date']),
            (_lbl['credit'],      d.get('credit', '34 วัน')),
            (_lbl['salesperson'], d['salesperson']),
        ]:
            c.setFont(FB, 10)
            c.setFillColor(black)
            c.drawString(lx, ry, label)
            c.setFont(F, 10)
            c.drawString(vx, ry, value)
            ry -= 13

        sep_y = by_top - bh + 18
        c.line(bx, sep_y, bx + bw, sep_y)

        c.setFont(FB, 9)
        c.drawString(lx, sep_y - 12, _lbl['project'])
        c.setFont(F, 8)
        proj = d.get('project_name', '')
        proj_x = lx + 40
        proj_max_w = (bx + bw - 4) - proj_x  # right edge of box minus padding
        # Truncate with '...' if too wide
        while proj and c.stringWidth(proj, F, 8) > proj_max_w:
            proj = proj[:-1]
        if proj != d.get('project_name', ''):
            proj = proj[:-3] + '...'
        c.drawString(proj_x, sep_y - 12, proj)

        # Customer name
        cy = by_top - bh - 12
        c.setFillColor(ORANGE)
        c.setFont(FB, 11)
        c.drawString(ML, cy, _lbl['customer'])
        c.setFillColor(black)
        c.setFont(FB, 12)
        c.drawString(ML, cy - 14, d.get('customer_name', 'ลูกค้า'))

        return cy - 28

    # ──────────────────────────────────────────────────────────
    def _summary_bar(self, c, y: float, d: dict) -> float:
        """Draw horizontal system summary bar below customer name."""
        brand      = d.get('brand', 'ATMOCE')
        size_kw    = float(d.get('size_kw', 0))
        phase      = d.get('phase', '1P')
        panel_watt = int(d.get('panel_watt', 0)) or DEFAULT_PANEL['watt']
        # BUG fix 2026-04-11: respect explicit panel_count from spec — was
        # recomputing from size_kw/panel_watt and ignoring user's "8 PV".
        _explicit_panels = int(d.get('panel_count', 0) or 0)
        if _explicit_panels > 0:
            panels = _explicit_panels
        else:
            panels = get_panels_count(brand, size_kw, panel_watt)

        # Calculate DC system size (kWp)
        dc_kwp = round(panels * panel_watt / 1000, 2)

        # Inverter label
        if brand == 'ATMOCE':
            inv_label = 'MI-1250' if (phase == '3P' and size_kw >= 30) else 'MI-500'
            inv_label = f'Atmoce {inv_label}'
        elif brand == 'Sigenergy':
            inv_label = f'Sigenergy {size_kw:.4g}kW'
        elif brand == 'Huawei':
            inv_label = f'Huawei {size_kw:.4g}kW'
        elif brand == 'Solis':
            inv_label = f'Solis {size_kw:.4g}kW'
        elif brand == 'Deye':
            inv_label = f'Deye {size_kw:.4g}kW'
        else:
            inv_label = f'{brand} {size_kw:.4g}kW'

        phase_label = '1 Phase' if phase == '1P' else '3 Phase'

        # 4 columns: ระบบ | Inverter | เฟส | แผงโซล่าเซลล์
        # battery_only=True: show '-' for kWp + panel count; show brand as Inverter
        battery_only = bool(d.get('battery_only', False))
        if battery_only:
            cols = [
                ('ระบบ',           '-'),
                ('Inverter',       brand),
                ('เฟส',            phase_label),
                ('แผงโซล่าเซลล์',  '-'),
            ]
        else:
            cols = [
                ('ระบบ',           f'{dc_kwp:.2f} kWp'),
                ('Inverter',       inv_label),
                ('เฟส',            phase_label),
                ('แผงโซล่าเซลล์',  f'{panels} แผ่น'),
            ]

        bar_h   = 36
        bar_y   = y - bar_h
        col_w   = CONTENT_W / len(cols)

        # Background
        c.setFillColor(HexColor('#F5F5F5'))
        c.rect(ML, bar_y, CONTENT_W, bar_h, fill=1, stroke=0)

        # Dividers + text
        for i, (label, value) in enumerate(cols):
            cx = ML + i * col_w

            # Vertical divider (skip first)
            if i > 0:
                c.setStrokeColor(HexColor('#DDDDDD'))
                c.setLineWidth(0.5)
                c.line(cx, bar_y + 4, cx, bar_y + bar_h - 4)

            # Label (orange, small)
            c.setFillColor(ORANGE)
            c.setFont(FB, 8)
            c.drawCentredString(cx + col_w / 2, bar_y + bar_h - 12, label)

            # Value (black, bold)
            c.setFillColor(black)
            c.setFont(FB, 10)
            c.drawCentredString(cx + col_w / 2, bar_y + 6, value)

        # Bottom border
        c.setStrokeColor(ORANGE)
        c.setLineWidth(0.8)
        c.line(ML, bar_y, ML + CONTENT_W, bar_y)

        return bar_y - 6

    # ──────────────────────────────────────────────────────────
    def _table_header(self, c, y, locale: str = 'th') -> float:
        _lbl = get_labels(locale)
        h = 22
        c.setFillColor(ORANGE)
        c.rect(ML, y - h, CONTENT_W, h, fill=1, stroke=0)

        c.setFillColor(white)
        c.setFont(FB, 10)
        c.drawCentredString(ML + COL_NUM_W / 2, y - 14, _lbl['col_num'])
        c.drawCentredString(COL_DESC_X + COL_DESC_W / 2, y - 14, _lbl['col_desc'])
        c.drawCentredString(COL_QTY_X + COL_QTY_W / 2, y - 14, _lbl['col_qty'])
        c.drawCentredString(COL_PRICE_X + COL_PRICE_W / 2, y - 14, _lbl['col_unit_price'])
        c.drawCentredString(COL_TOTAL_X + COL_TOTAL_W / 2, y - 14, _lbl['col_total'])
        return y - h

    # ──────────────────────────────────────────────────────────
    def _measure_item_height(self, lines, price=0.0, total=0.0) -> float:
        """Estimate how many points this item will occupy (no canvas needed)."""
        is_detail = (price == 0.0 and total == 0.0)
        wrap_w = COL_DESC_FULL_W if is_detail else COL_DESC_W
        h = 16  # initial offset
        for font, size, text in lines:
            if size == 13: size = 11
            elif size == 11: size = 10
            line_h = size + 5
            if not text:
                h += line_h
                continue
            # Rough char width: Thai at size 10 ≈ 5.5pt/char
            avg_char_w = size * 0.55
            chars_per_line = max(1, int(wrap_w / avg_char_w))
            n_lines = max(1, -(-len(text) // chars_per_line))  # ceiling division
            h += line_h * n_lines
        h += 10  # bottom gap + separator
        return h

    def _count_item_overflow_pages(self, items, start_y, min_y=80) -> int:
        """Return how many pages (beyond page 1) the items list needs."""
        y = start_y
        extra = 0
        for num, lines, price, total in items:
            ih = self._measure_item_height(lines, price, total)
            if y - ih < min_y:
                extra += 1
                y = start_y  # reset to top of new page
            y -= ih
        return extra

    # ──────────────────────────────────────────────────────────
    def _draw_item(self, c, y, num, lines, qty=1, price=0.0, total=0.0) -> float:
        c.setFillColor(black)
        c.setFont(FB, 10)
        c.drawCentredString(ML + COL_NUM_W / 2, y - 16, str(num))

        is_detail = (price == 0.0 and total == 0.0)
        if not is_detail:
            c.setFont(F, 10)
            c.drawCentredString(COL_QTY_X + COL_QTY_W / 2, y - 16, str(qty))
            c.drawRightString(COL_PRICE_X + COL_PRICE_W - 2, y - 16, fmt(price))
            c.drawRightString(COL_TOTAL_X + COL_TOTAL_W - 2, y - 16, fmt(total))

        wrap_w = COL_DESC_FULL_W if is_detail else COL_DESC_W
        cy = y - 16
        for font, size, text in lines:
            # Match sample PDF font sizes
            if size == 13:
                size = 11
            elif size == 11:
                size = 10
            line_h = size + 5
            c.setFont(font, size)
            c.setFillColor(black)

            remaining = text
            while remaining:
                tw = c.stringWidth(remaining, font, size)
                if tw <= wrap_w:
                    c.drawString(COL_DESC_X, cy, remaining)
                    cy -= line_h
                    remaining = ''
                else:
                    # Find max chars that fit, then break at word boundary
                    cut = 1
                    for j in range(1, len(remaining) + 1):
                        if c.stringWidth(remaining[:j], font, size) <= wrap_w:
                            cut = j
                        else:
                            break
                    # Prefer breaking at space (word boundary)
                    last_space = remaining[:cut].rfind(' ')
                    if last_space > 0:
                        cut = last_space  # don't include the space on this line
                    c.drawString(COL_DESC_X, cy, remaining[:cut])
                    cy -= line_h
                    remaining = remaining[cut:].lstrip(' ')

        cy -= 6
        c.setStrokeColor(HexColor('#E8E8E8'))
        c.setLineWidth(0.3)
        c.line(ML, cy, ML + CONTENT_W, cy)
        return cy - 4

    # ──────────────────────────────────────────────────────────
    def _financial_summary(self, c, cy, grand_total, brand, size_kw, discount=0.0, remarks=None,
                           markup_pct=0.0, base_price=0.0):
        import sys, os as _os
        _here = _os.path.dirname(_os.path.abspath(__file__))
        if _here not in sys.path:
            sys.path.insert(0, _here)
        from thai_baht import baht_to_thai

        if discount > 0:
            original = grand_total + discount
            after = grand_total
        else:
            original = grand_total
            after = grand_total

        vat = round(after - (after * 100 / 107), 2)
        excl_vat = round(after * 100 / 107, 2)

        # Colors match screenshot: discount/vat/excl/grand = ORANGE
        # When markup was applied, show cost → markup → selling price breakdown
        summary = []
        if markup_pct > 0 and base_price > 0:
            summary.append(('ราคาต้นทุน', fmt(base_price) + ' บาท', black, False))
            summary.append((f'บวกกำไร {markup_pct:.4g}%', fmt(original - base_price) + ' บาท', ORANGE, False))
        summary.append(('รวมเป็นเงิน', fmt(original) + ' บาท', black, False))
        if discount > 0:
            summary.append(('ลดราคาพิเศษ', '-' + fmt(discount) + ' บาท', ORANGE, False))
            summary.append(('ราคาหลังลด', fmt(after) + ' บาท', black, False))
        summary += [
            ('ภาษีมูลค่าเพิ่ม 7%', fmt(vat) + ' บาท', ORANGE, False),
            ('ราคาไม่รวมภาษีมูลค่าเพิ่ม', fmt(excl_vat) + ' บาท', ORANGE, False),
            ('จำนวนเงินรวมทั้งสิ้น', fmt(after) + ' บาท', ORANGE, True),
        ]

        # Amount in words
        try:
            words = '(' + baht_to_thai(after) + ')'
        except Exception:
            words = ''

        LINE_H = 16
        # Two-column hard split — no overlap possible
        SUMMARY_LABEL_X = ML + int(CONTENT_W * 0.62)  # x=359 — summary labels LEFT-aligned
        NOTE_MAX_W      = SUMMARY_LABEL_X - ML - 15    # ~304pt — fill left column up to right col gap
        LEFT_MAX        = ML + NOTE_MAX_W              # dynamic right edge of note column
        RIGHT_EDGE      = ML + CONTENT_W               # x=555 — values RIGHT-aligned

        sum_start_y = cy

        # ── RIGHT COLUMN: financial summary (labels left-aligned, values right-aligned) ──
        for label, value, color, bold in summary:
            c.setFillColor(color)
            # Grand total: label 11pt to avoid overlap, value 13pt bold
            if bold:
                c.setFont(FB, 11)
                c.drawString(SUMMARY_LABEL_X, cy, label)
                c.setFont(FB, 13)
                c.drawRightString(RIGHT_EDGE, cy, value)
            else:
                c.setFont(F, 10)
                c.drawString(SUMMARY_LABEL_X, cy, label)
                c.drawRightString(RIGHT_EDGE, cy, value)
            cy -= LINE_H

        # Amount in words (right-aligned, small)
        c.setFillColor(black)
        c.setFont(F, 9)
        c.drawRightString(RIGHT_EDGE, cy, words)
        cy -= LINE_H

        # ── LEFT COLUMN: หมายเหตุ — starts at same y, stays within LEFT_MAX ──
        def draw_wrapped(text, x, start_y, font, size, color, line_h):
            """Wrap text within NOTE_MAX_W. Returns new y."""
            c.setFont(font, size)
            c.setFillColor(color)
            ny_ = start_y
            remaining = text
            while remaining:
                cut = len(remaining)
                while cut > 0 and c.stringWidth(remaining[:cut], font, size) > NOTE_MAX_W:
                    cut -= 1
                if cut < len(remaining):
                    space = remaining[:cut].rfind(' ')
                    if space > 0:
                        cut = space
                c.drawString(x, ny_, remaining[:cut])
                ny_ -= line_h
                remaining = remaining[cut:].lstrip()
            return ny_

        ny = sum_start_y
        c.setFont(FB, 12)
        c.setFillColor(ORANGE)
        c.drawString(ML, ny, 'หมายเหตุ')
        c.setFillColor(black)
        ny -= 14

        std_notes = [
            '- เพื่อความรวดเร็วในการติดตั้ง หากอุปกรณ์ยี่ห้อที่กำหนดขาดตลาด ทางเราขอสงวนสิทธิ์ในการจัดหาอุปกรณ์ทดแทนที่มีสเปกเดียวกันหรือดีกว่า ตามมาตรฐานทางเทคนิค โดยจะแจ้งให้ท่านทราบล่วงหน้าก่อนการดำเนินการ',
        ]
        for line in std_notes:
            ny = draw_wrapped(line, ML, ny, F, 10, black, 12)

        # Remarks in orange
        if remarks:
            for line in remarks:
                ny = draw_wrapped(line, ML, ny, FB, 10, ORANGE, 12)

        return min(cy, ny) - 10

    # ──────────────────────────────────────────────────────────
    def _page_num(self, c, cur, total):
        c.setFont(F, 11)
        c.setFillColor(black)
        c.drawString(ML, MB - 12, f'หน้าที่ {cur}/{total}')

    # ── S3: QR code helper ───────────────────────────────────
    def _draw_qr(self, c, url: str, x: float, y: float, size: float = 55) -> bool:
        """
        Draw a QR code at (x, y) with given side length (points).
        Returns True on success, False if qrcode lib not available.

        Typical call: self._draw_qr(c, dashboard_url, PAGE_W - MR - 55, MB + 10)
        """
        if not url:
            return False
        try:
            import qrcode as _qrc
            import io
            qr = _qrc.QRCode(version=1, box_size=4, border=2,
                              error_correction=_qrc.constants.ERROR_CORRECT_M)
            qr.add_data(url)
            qr.make(fit=True)
            img = qr.make_image(fill_color='black', back_color='white')
            buf = io.BytesIO()
            img.save(buf, format='PNG')
            buf.seek(0)
            from reportlab.lib.utils import ImageReader
            c.drawImage(ImageReader(buf), x, y, width=size, height=size,
                        preserveAspectRatio=True, mask='auto')
            # Label below QR
            c.setFont(F, 7)
            c.setFillColor(HexColor('#666666'))
            c.drawCentredString(x + size / 2, y - 9, 'Scan เพื่อ confirm')
            c.setFillColor(black)
            return True
        except Exception:
            return False


# ─── Convenience function ────────────────────────────────────
def generate_quotation(brand, size_kw, phase, customer_name='ใบเสนอราคา',
                       project_name='', has_battery=False, has_backup=False,
                       output_path='', **kwargs) -> str:
    """Quick wrapper around QuotationGenerator.generate()."""
    gen = QuotationGenerator()
    data = {
        'brand': brand,
        'size_kw': size_kw,
        'phase': phase,
        'customer_name': customer_name,
        'project_name': project_name or f'Solar Cell Rooftop {size_kw:.4g}kW {phase} {brand}',
        'has_battery': has_battery,
        'has_backup': has_backup,
        'output_path': output_path,
    }
    data.update(kwargs)
    return gen.generate(data)


if __name__ == '__main__':
    # Quick smoke test
    out = generate_quotation('ATMOCE', 5.0, '1P', 'ลูกค้า', 'Test 5kW ATMOCE 1P')
    print(f'Generated: {out["pdf_path"]}')
    import json
    print(json.dumps(out['items'], ensure_ascii=False, indent=2))
