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

# ─── Paths ────────────────────────────────────────────────────
REPO_ROOT = os.environ.get('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')
ASSET_DIR = os.path.join(REPO_ROOT, 'tmppic', 'tempagent', 'quotation-solar', 'assets')
FONT_DIR = os.path.join(ASSET_DIR, 'font')
PIC_DIR = os.path.join(ASSET_DIR, 'picture ref use')
OUTPUT_DIR = os.path.join(REPO_ROOT, 'nasri-line-bot', 'deploy', 'boms')

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
    'batt_only': 99000,
    'batt_backup_1P': 110000,
    'batt_backup_3P': 130000,
}

# ─── Dyness Battery Pricing (for Deye / Solis combos) ────────
DYNESS_BATTERY_PRICES = {
    'DL5.0C': 36500,         # 5.1 kWh LV 48V
    'Powerbox Pro': 64000,   # ~10 kWh LV 48V
    'Power Brick SC': 75000, # 10 kWh LV 48V
}
DYNESS_DEFAULT_MODEL = 'DL5.0C'

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
def _pic(name):
    return os.path.join(PIC_DIR, name)

ATMOCE_IMAGES = {
    '1P_onGrid':    [_pic('1Phase-Atmoce.jpg'),                    _pic('Atmoce 1 phase.jpg'),                          _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg')],
    '1P_batt':      [_pic('1Phase-batt-Atmoce.jpg'),               _pic('Atmoce 1 phase with batt.jpg'),                _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg')],
    '1P_batt_bkup': [_pic('1Phase-batt-Atmoce-full system.jpg'),   _pic('Atmoce 1 phase with backup and batt 7kw.jpg'), _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg')],
    '3P_onGrid':    [_pic('3Phase-Atmoce.jpg'),                    _pic('Atmoce 3 phase.jpg'),                          _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg')],
    '3P_batt':      [_pic('3Phase-batt-Atmoce.jpg'),               _pic('Atmoce 3 phase with batt 7kw.jpg'),            _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg')],
    '3P_batt_bkup': [_pic('3Phase-batt-Atmoce-full system.jpg'),   _pic('Atmoce 3 phase with backup and batt 7kw.jpg'), _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg')],
}
SIGENERGY_IMAGES = [
    _pic('Sigenergy present1.png'), _pic('Sigenergy present2.png'),
    _pic('Sigenergy present3.png'), _pic('Sigenergy present4.png'),
]
HUAWEI_IMAGES = [
    _pic('huawei.png'), _pic('huawei present.png'),
    _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'),
]
SOLIS_IMAGES = [
    _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'),
]
DEYE_IMAGES = [
    _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'),
]
HOYMILES_IMAGES = [
    _pic('ตัวอย่างการติดตั้งบนหลังคา.jpg'),
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


def get_selling_price(brand: str, phase: str, size_kw: float) -> int:
    """
    Look up selling price. Tries Google Sheets first (for Huawei/Solis/Sigenergy),
    falls back to hardcoded SELLING_PRICES table.
    For ATMOCE: always uses hardcoded table (no system ราคาขาย in sheet).
    """
    # Try live sheet prices first (non-ATMOCE brands)
    if brand != 'ATMOCE':
        try:
            live, _ = _get_live_prices()
            live_brand = live.get(brand, {})
            live_phase = live_brand.get(phase, {})
            if live_phase:
                key = _nearest_key(live_phase, int(size_kw))
                price = live_phase.get(key, 0)
                if price > 0:
                    return price
        except Exception:
            pass

    # Fallback: hardcoded table
    brand_table = SELLING_PRICES.get(brand, {})
    phase_table = brand_table.get(phase, {})
    if not phase_table:
        return 0

    if brand == 'ATMOCE':
        # Convert kW to panel count (625W panels)
        panels = round(size_kw * 1000 / 625)
        key = _nearest_key(phase_table, panels)
        return phase_table[key]
    else:
        key = _nearest_key(phase_table, int(size_kw))
        return phase_table[key]


def get_panels_count(brand: str, size_kw: float) -> int:
    """Return panel count for a given brand and system size."""
    if brand == 'Sigenergy':
        # AIKO 670W panels
        return max(1, round(size_kw * 1000 / 670))
    # All other brands: JA Solar 625W
    return max(1, round(size_kw * 1000 / 625))


# ─── ATMOCE item lines ────────────────────────────────────────
def _atmoce_install_lines(panels: int, phase: str, size_kw: float,
                          panel_brand: str = 'JA Solar', panel_watt: int = 625) -> list:
    """Build the installation package line list for ATMOCE."""
    if phase == '3P':
        mi_model = 'MI-1250'
        mi_qty = panels // 2
        combiner = 'Three-phase M-Combiner 3P 1 ชุด'
        cable_ac = 'สายไฟ AC-Bangkok cable FR-CV VCT 4C*4 Sqmm. 1ชุด (Combiner box to Grid)'
    else:
        mi_model = 'MI-500'
        mi_qty = panels
        combiner = 'One-phase M-Combiner 1 ชุด'
        cable_ac = 'สายไฟ IEC01(THW) 6 Sqmm 1ชุด (Combiner box to Grid)'

    title = f'ATMOCE รายการติดตั้ง {size_kw:.4g}kW / {phase} Hybrid-onGrid'
    lines = [
        (FB, 13, title),
        (F, 11, f'1. แผงโซลาร์เซลล์ {panel_brand} N-Type bifacial {panel_watt} Watt  อายุใช้งาน 12ปี / 30ปี'),
        (F, 11, f'{panels} แผ่น'),
        (F, 11, f'2. {mi_model} Micro Inverter ATMOCE {phase} เฟชผ่าน Listการไฟฟ้าMEA/PEA {mi_qty} เครื่อง'),
        (F, 11, 'ประกัน 25ปี'),
        (F, 11, f'3. {combiner}'),
        (F, 11, '4. สายไฟ AC-Bangkok cable FR-CV VCT 2C*4 Sqmm. 1ชุด (PV to Combiner box)'),
        (F, 11, cable_ac),
        (F, 11, '6. อุปกรณ์ Mounting ยึดเกาะหลังคา ระบบโซล่าเซลชุดราง Keenoc'),
        (F, 11, '7. อุปกรณ์เม้าติ้ง (Mounting) สำหรับยึดแผงโซล่าเซลล์ตามหน้างาน Keenoc'),
        (F, 11, '10. อุปกรณ์รางเก็บสายไฟ+สายร้อยท่อ 1 ชุดตามหน้างาน'),
        (F, 11, '11. ชุดสายกราวด์ IEC01 สายไฟ THW YAZAKI 1x6 สายไฟ 1*6'),
        (F, 11, ''),
        (F, 11, 'ราคานี้รวมขออนุญาติการไฟฟ้า'),
    ]
    return lines


def _atmoce_battery_lines(phase: str, has_backup: bool) -> list:
    if phase == '1P':
        backup_box = 'ตู้ ATMOCE M-Backup box 1P 1ชุด Switches to battery power in milliseconds (<10ms)'
    else:
        backup_box = 'ตู้ ATMOCE M-Backup box 3P 1ชุด Switches to battery power in milliseconds (<10ms)'

    lines = [
        (FB, 13, 'MS-7K (ESS Kit)' + (' + พร้อมระบบสำรองไฟ (Backup System)' if has_backup else '')),
        (F, 11, '1. 7kw. Extra lowV Energy Storage System'),
        (F, 11, 'แบตเตอรี่ลิเธียมฟอสเฟต (LFP) แรงดันต่ำ (Extra Low Voltage หรือ ELV) ความ'),
        (F, 11, 'ปลอดภัยสูง อายุการใช้งาน 10,000 รอบการชาร์จ รับประกัน 10 ปี'),
    ]
    if has_backup:
        lines.append((F, 11, f'2. {backup_box}'))
    return lines


# ─── Sigenergy item lines ─────────────────────────────────────
def _sigenergy_install_lines(panels: int, phase: str, size_kw: float) -> list:
    phase_text = 'Single Phase' if phase == '1P' else 'Three Phase'
    gateway_size = '12K' if phase == '1P' else '30K'
    phase_num = '1' if phase == '1P' else '3'
    title = f'Sigenergy 5 in 1 รายการติดตั้ง {size_kw:.4g}kW / {phase} Hybrid-onGrid'
    lines = [
        (FB, 13, title),
        (F, 11, f'1. แผงโซลาร์เซลล์ AIKO 670 Watt Comet อายุใช้งาน 12ปี/30ปี'),
        (F, 11, f'{panels} แผ่น'),
        (F, 11, f'2. SP Sigen Energy Controller {size_kw:.4g} kW {phase_text} เฟชผ่าน Listการไฟฟ้า MEA/PEA 1 เครื่อง'),
        (F, 11, 'ประกัน 10ปี'),
        (F, 11, f'3. Sigen Energy Gateway Home {phase_text} {gateway_size} 1 ชุด'),
        (F, 11, f'4. Sigen Power Sensor {phase_text} External CT 100 A'),
        (F, 11, '5. สายไฟ VCT 2C*4 Sqmm. 1ชุด'),
        (F, 11, '6. สายไฟ red/black Link 6 Sqmm 1ชุด'),
        (F, 11, '7. ชุดราง mounting solar cell ตามหน้างาน 1ชุด'),
        (F, 11, '8. ชุดเม้าติ้งตามหน้างาน 1ชุด'),
        (F, 11, '9. Mid-clamp ใช้ตามหน้างาน 1ชุด'),
        (F, 11, '10. End-clamp ใช้ตามหน้างาน 1ชุด'),
        (F, 11, '11. รางเก็บสาย+ท่อ1ชุดตามหน้างาน 1ชุด'),
        (F, 11, '12. ชุดกาวแผงสายไฟ 1*6/1*10'),
        (F, 11, ''),
        (F, 11, f'รวม การขออนุญาตพร้อมแบบ SLD ติดตั้งโซลาร์เซลล์ {phase_num} เฟส (On-Grid) สำหรับบ้านอยู่อาศัย'),
        (F, 11, 'รวมค่าธรรมเนียมขออนุญาต การไฟฟ้า MEA/PEA'),
    ]
    return lines


# ─── Huawei/Solis item lines ──────────────────────────────────
def _string_inverter_install_lines(brand: str, panels: int, phase: str, size_kw: float, model: str) -> list:
    phase_label = '1P' if phase == '1P' else '3P'
    title = f'{brand} รายการติดตั้ง {size_kw:.4g}kW / {phase} {"Hybrid-onGrid" if brand == "Huawei" else "OnGrid"}'
    lines = [
        (FB, 13, title),
        (F, 11, f'1. แผงโซลาร์เซลล์ JA Solar Tire1 N-Type bifacial 625 Watt อายุใช้งาน 12ปี / 30ปี'),
        (F, 11, f'{panels} แผ่น'),
        (F, 11, f'2. {brand} {model} {phase_label} เฟชผ่าน Listการไฟฟ้า MEA/PEA 1 เครื่อง ประกัน 10ปี'),
        (F, 11, '3. สมาร์มิสเตอร์ + CT กันย้อน 1 ชุด'),
        (F, 11, f'4. ตู้กันฟ้าผ่า AC/DC Combiner Box โซล่าเซลล์ HighVolt 220V {phase_label} 1 ชุด'),
        (F, 11, '5. สายไฟ DC : Link PV1-F 1x4 sq.mm / MC4 1500V 1 ชุด'),
        (F, 11, '6. สายไฟ IEC01(THW) 6 Sqmm 1 ชุด (Combiner box to Grid)'),
        (F, 11, '7. อุปกรณ์ Mounting ยึดเกาะหลังคา ระบบโซล่าเซลชุดราง Keenoc'),
        (F, 11, '8. อุปกรณ์เม้าติ้ง (Mounting) สำหรับยึดแผงโซล่าเซลล์ตามหน้างาน Keenoc'),
        (F, 11, '10. อุปกรณ์รางเก็บสายไฟ+สายร้อยท่อ 1 ชุดตามหน้างาน'),
        (F, 11, '11. ชุดสายกราวด์ IEC01 สายไฟ THW YAZAKI 1x6 สายไฟ 1*6'),
        (F, 11, ''),
        (F, 11, 'ราคานี้รวมขออนุญาติการไฟฟ้า'),
    ]
    return lines


# ─── Deye item lines ──────────────────────────────────────────
def _deye_install_lines(panels: int, phase: str, size_kw: float, model: str, has_battery: bool) -> list:
    phase_label = '1P' if phase == '1P' else '3P'
    system_type = 'Hybrid-onGrid' if has_battery else 'OnGrid'
    title = f'Deye รายการติดตั้ง {size_kw:.4g}kW / {phase} {system_type}'
    lines = [
        (FB, 13, title),
        (F, 11, f'1. แผงโซลาร์เซลล์ JA Solar N-Type bifacial 625 Watt อายุใช้งาน 12ปี / 30ปี'),
        (F, 11, f'{panels} แผ่น'),
        (F, 11, f'2. Deye Hybrid Inverter {model} {phase_label} เฟชผ่าน Listการไฟฟ้า MEA/PEA 1 เครื่อง ประกัน 10ปี'),
        (F, 11, '3. สมาร์ทมิเตอร์ + CT กันย้อน 1 ชุด'),
        (F, 11, f'4. ตู้กันฟ้าผ่า AC/DC Combiner Box โซล่าเซลล์ {phase_label} 1 ชุด'),
        (F, 11, '5. สายไฟ DC : Link PV1-F 1x4 sq.mm / MC4 1500V 1 ชุด'),
        (F, 11, '6. สายไฟ IEC01(THW) 6 Sqmm 1 ชุด (Combiner box to Grid)'),
        (F, 11, '7. อุปกรณ์ Mounting ยึดเกาะหลังคา ระบบโซล่าเซลชุดราง Keenoc'),
        (F, 11, '8. อุปกรณ์เม้าติ้ง (Mounting) สำหรับยึดแผงโซล่าเซลล์ตามหน้างาน Keenoc'),
        (F, 11, '9. อุปกรณ์รางเก็บสายไฟ+สายร้อยท่อ 1 ชุดตามหน้างาน'),
        (F, 11, '10. ชุดสายกราวด์ IEC01 สายไฟ THW YAZAKI 1x6'),
        (F, 11, ''),
        (F, 11, 'ราคานี้รวมขออนุญาติการไฟฟ้า'),
    ]
    return lines


# ─── Hoymiles item lines ──────────────────────────────────────
def _hoymiles_install_lines(panels: int, phase: str, size_kw: float, model: str) -> list:
    phase_label = '1P' if phase == '1P' else '3P'
    title = f'Hoymiles รายการติดตั้ง {size_kw:.4g}kW / {phase} OnGrid'
    lines = [
        (FB, 13, title),
        (F, 11, f'1. แผงโซลาร์เซลล์ JA Solar N-Type bifacial 625 Watt อายุใช้งาน 12ปี / 30ปี'),
        (F, 11, f'{panels} แผ่น'),
        (F, 11, f'2. Hoymiles {model} Micro Inverter {phase_label} เฟชผ่าน Listการไฟฟ้า MEA/PEA ประกัน 10ปี'),
        (F, 11, '3. DTU-PRO-S Gateway สำหรับ monitoring 1 ชุด'),
        (F, 11, '4. สมาร์ทมิเตอร์ + CT กันย้อน 1 ชุด'),
        (F, 11, '5. Field Connector + Disconnect Tool 1 ชุด'),
        (F, 11, '6. สายไฟ AC Trunk Cable 1 ชุด'),
        (F, 11, '7. อุปกรณ์ Mounting ยึดเกาะหลังคา ระบบโซล่าเซลชุดราง Keenoc'),
        (F, 11, '8. อุปกรณ์เม้าติ้ง (Mounting) สำหรับยึดแผงโซล่าเซลล์ตามหน้างาน Keenoc'),
        (F, 11, '9. อุปกรณ์รางเก็บสายไฟ+สายร้อยท่อ 1 ชุดตามหน้างาน'),
        (F, 11, '10. ชุดสายกราวด์ IEC01 สายไฟ THW YAZAKI 1x6'),
        (F, 11, ''),
        (F, 11, 'ราคานี้รวมขออนุญาติการไฟฟ้า'),
    ]
    return lines


# ─── Dyness Battery item lines (for Deye/Solis combos) ───────
def _dyness_battery_lines(battery_model: str = 'DL5.0C') -> list:
    model_info = {
        'DL5.0C':        ('DL5.0C',        '5.1 kWh', 'LV 48V'),
        'Powerbox Pro':  ('Powerbox Pro',  '~10 kWh', 'LV 48V'),
        'Power Brick SC':('Power Brick SC','10 kWh',  'LV 48V'),
    }
    m, cap, volt = model_info.get(battery_model, ('DL5.0C', '5.1 kWh', 'LV 48V'))
    return [
        (FB, 13, f'Dyness {m} (ESS Battery)'),
        (F, 11, f'1. แบตเตอรี่ Dyness {m} ความจุ {cap} {volt}'),
        (F, 11, 'แบตเตอรี่ลิเธียมฟอสเฟต (LFP) คุณภาพสูง ความปลอดภัยสูง'),
        (F, 11, 'อายุการใช้งาน 6,000+ รอบการชาร์จ รับประกัน 5 ปี'),
    ]


# ─── Shared: Enervia Warranty lines ──────────────────────────
def _warranty_lines(brand: str) -> list:
    inverter_years = '25' if brand == 'ATMOCE' else '10'
    return [
        (FB, 13, 'Enervia การรับประกัน'),
        (F, 11, 'ประกันงานติดตั้งอุปกรณ์ทั้ง ระบบ 5 ปี หลังจากติดตั้ง และทดสอบระบบเรียบร้อย (และรับ'),
        (F, 11, 'ประกันกรณีติดตั้ง ตัวยึดไม่ดี ทำให้ลมพัดแผงหลุดและเกิดความเสียหาย)'),
        (F, 11, '- แผงโซล่า เซลล์ Tier 1 รับประกันการผลิตไฟฟ้าและอุปกรณ์ 12/30 ปี'),
        (F, 11, '- บริการล้างแผงฟรี 2 ครั้ง ภายในระยะเวลา 2 ปี'),
        (F, 11, '- บริการดูแลบำรุงรักษาเป็นระยะเวลา 25 ปี'),
    ]


# ─── Shared: Terms item 4 (first part) ───────────────────────
def _terms_page1_lines(brand: str, grand_total: float) -> list:
    dep60 = grand_total * 0.60
    fin40 = grand_total * 0.40
    return [
        (FB, 13, f'รายละเอียดเพิ่มเติม {brand}'),
        (F, 11, 'หัวข้อ ที่ 1 : เงื่อนไขการยื่นราคาและชำระเงิน'),
        (F, 11, 'การชำระเงินแบ่ง ออกเป็น 2 รอบ'),
        (F, 11, f'รอบที่ 1 - 60% Payment With PO ({fmt(dep60)} บาท)'),
        (F, 11, f'รอบที่ 2 - 40% หลังจากติดตั้งเรียบร้อย ({fmt(fin40)} บาท)'),
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
    inverter_years = '25' if brand == 'ATMOCE' else '10'
    return [
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
        '- แผงโซล่า เซลล์ Tier 1 รับประกันความบกพร่องในการผลิต 12 ปี รับประกันการผลิต',
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
        customer     = data.get('customer_name', 'เสนอราคา')
        project_name = data.get('project_name', f'Solar Cell Rooftop {size_kw:.4g}kW {phase} {brand}')
        quote_number = data.get('quote_number', self._gen_quote_number())
        date_str     = data.get('date', datetime.date.today().strftime('%d/%m/%Y'))
        salesperson  = data.get('salesperson', 'นาย นาฤกษ์ มะแอ')
        has_battery  = bool(data.get('has_battery', False))
        has_backup   = bool(data.get('has_backup', False))
        discount     = float(data.get('discount', 0.0))
        remarks      = data.get('remarks', [])
        output_path  = data.get('output_path', '')

        # Auto-derive grand_total if not provided
        if 'grand_total' in data:
            grand_total = float(data['grand_total'])
        else:
            grand_total = self._calc_grand_total(brand, phase, size_kw, has_battery, has_backup)

        # Output path
        if not output_path:
            os.makedirs(OUTPUT_DIR, exist_ok=True)
            safe_name = f'{brand}_{size_kw:.4g}kW_{phase}'
            if has_battery:
                safe_name += '_batt'
            if has_backup:
                safe_name += '_bkup'
            output_path = os.path.join(OUTPUT_DIR, f'{quote_number}_{safe_name}.pdf')

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
        }

        self._build_pdf(output_path, doc_data)
        return output_path

    # ──────────────────────────────────────────────────────────
    def _calc_grand_total(self, brand, phase, size_kw, has_battery, has_backup, battery_model=''):
        base = get_selling_price(brand, phase, size_kw)
        if brand == 'ATMOCE' and has_battery:
            # Try live battery price from sheet, fall back to hardcoded
            try:
                _, live_batt = _get_live_prices()
                if live_batt:
                    if has_backup:
                        key = 'batt_backup_3P' if phase == '3P' else 'batt_backup_1P'
                    else:
                        key = 'batt_only'
                    batt_price = live_batt.get(key, BATTERY_PRICES[key])
                else:
                    raise ValueError('empty')
            except Exception:
                if has_backup:
                    batt_price = BATTERY_PRICES['batt_backup_3P' if phase == '3P' else 'batt_backup_1P']
                else:
                    batt_price = BATTERY_PRICES['batt_only']
            base += batt_price
        elif brand in ('Deye', 'Solis') and has_battery:
            bm = battery_model or DYNESS_DEFAULT_MODEL
            base += float(DYNESS_BATTERY_PRICES.get(bm, DYNESS_BATTERY_PRICES[DYNESS_DEFAULT_MODEL]))
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

        custom_watt = int(d.get('panel_watt', 0))
        if custom_watt > 0:
            panels = max(1, round(size_kw * 1000 / custom_watt))
        else:
            panels = get_panels_count(brand, size_kw)

        # Determine system images
        images = self._get_images(brand, phase, has_battery, has_backup)
        total_pages = 4 + len(images)

        c = canvas.Canvas(filename, pagesize=A4)

        # ── PAGE 1 ─────────────────────────────────────────────
        y = self._header(c, d)
        y = self._table_header(c, y)

        # Build item list
        items = self._build_items(brand, panels, phase, size_kw, has_battery, has_backup, grand_total, d)

        for num, lines, price, total in items:
            y = self._draw_item(c, y, num, lines, qty=1, price=price, total=total)

        self._page_num(c, 1, total_pages)

        # ── PAGE 2 ─────────────────────────────────────────────
        c.showPage()
        y = self._header(c, d)
        y = self._table_header(c, y)

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

        self._page_num(c, 2, total_pages)

        # ── PAGE 3: Signature ────────────────────────────────
        c.showPage()
        y = self._header(c, d)

        c.setStrokeColor(HexColor('#E8E8E8'))
        c.setLineWidth(0.5)
        c.line(ML, y + 8, ML + CONTENT_W, y + 8)

        sig_y = 150
        c.setFillColor(black)
        c.setFont(FB, 14)
        c.drawString(ML, sig_y + 30, 'ในนาม เสนอราคา')
        c.drawRightString(PAGE_W - MR, sig_y + 30, 'ในนาม เอเนอเวีย กรุ๊ป')

        # Center logo
        logo_path = os.path.join(PIC_DIR, 'logo enervia.jpg')
        if os.path.exists(logo_path):
            sig_logo_w = 140
            sig_logo_h = sig_logo_w * (300 / 1400)
            c.drawImage(logo_path, PAGE_W / 2 - sig_logo_w / 2, sig_y - 15,
                        width=sig_logo_w, height=sig_logo_h,
                        preserveAspectRatio=True, mask='auto')

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

        self._page_num(c, 3, total_pages)

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
        c.setFont(FB, 24)
        c.drawString(ML, y, 'ข้อมูลการรับชำระ')

        y -= 16
        c.setFillColor(black)
        c.setFont(F, 11)
        for line in [
            'เอเนอเวีย กรุ๊ป (สำนักงานใหญ่)',
            'เลขที่ 40/3 หมู่ 4 ถนนสังฆสันติสุข แขวงกระทุ่มราย',
            'เขตหนองจอก จังหวัดกรุงเทพมหานคร 10530',
            'เลขประจำตัวผู้เสียภาษี 0105556150779 เบอร์สำนักงาน 0967964587',
        ]:
            c.drawString(ML, y, line)
            y -= 11

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
        c.setFont(FB, 14)
        c.drawCentredString(cx1 + card_w / 2, y - 55, '217-4-15352-4')
        c.setFont(F, 12)
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
        c.setFont(FB, 14)
        c.drawCentredString(cx2 + card_w / 2, y - 55, '433-2-19177-5')
        c.setFont(F, 12)
        c.drawCentredString(cx2 + card_w / 2, y - 68, 'ธ. ไทยพาณิชย์')
        c.drawCentredString(cx2 + card_w / 2, y - 80, '(สาขาบิ๊กซี เคหะร่มเกล้า)')
        c.drawCentredString(cx2 + card_w / 2, y - 92, 'บจ.เอเนอเวีย กรุ๊ป')

        self._page_num(c, 4, total_pages)

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
            self._page_num(c, 5 + idx, total_pages)

        c.save()
        return filename

    # ──────────────────────────────────────────────────────────
    def _build_items(self, brand, panels, phase, size_kw, has_battery, has_backup, grand_total, data=None):
        """
        Returns list of (item_num, lines, price, total) tuples.
        price = 0 means 'included / no separate charge'.
        """
        items = []

        # Installation price = grand_total minus any battery add-on
        install_price = grand_total
        batt_price = 0.0

        if brand == 'ATMOCE' and has_battery:
            try:
                _, live_batt = _get_live_prices()
                key = ('batt_backup_3P' if phase == '3P' else 'batt_backup_1P') if has_backup else 'batt_only'
                batt_price = float(live_batt.get(key, BATTERY_PRICES[key]) if live_batt else BATTERY_PRICES[key])
            except Exception:
                key = ('batt_backup_3P' if phase == '3P' else 'batt_backup_1P') if has_backup else 'batt_only'
                batt_price = float(BATTERY_PRICES[key])
            install_price = grand_total - batt_price
        elif brand in ('Deye', 'Solis') and has_battery:
            bm = (data.get('battery_model', '') if data else '') or DYNESS_DEFAULT_MODEL
            batt_price = float(DYNESS_BATTERY_PRICES.get(bm, DYNESS_BATTERY_PRICES[DYNESS_DEFAULT_MODEL]))
            install_price = grand_total - batt_price

        panel_brand = data.get('panel_brand', 'JA Solar') if data else 'JA Solar'
        panel_watt  = int(data.get('panel_watt', 625)) if data else 625

        if brand == 'ATMOCE':
            lines1 = _atmoce_install_lines(panels, phase, size_kw, panel_brand, panel_watt)
            items.append((1, lines1, install_price, install_price))

            if has_battery:
                lines2 = _atmoce_battery_lines(phase, has_backup)
                items.append((2, lines2, batt_price, batt_price))
                warranty_num = 3
                terms_num = 4
            else:
                warranty_num = 2
                terms_num = 3

        elif brand == 'Sigenergy':
            lines1 = _sigenergy_install_lines(panels, phase, size_kw)
            items.append((1, lines1, install_price, install_price))
            warranty_num = 2
            terms_num = 3

        elif brand in ('Huawei', 'Solis'):
            model_table = HUAWEI_MODELS if brand == 'Huawei' else SOLIS_MODELS
            model = model_table.get(phase, {}).get(int(size_kw), f'{brand} {size_kw:.4g}kW')
            lines1 = _string_inverter_install_lines(brand, panels, phase, size_kw, model)
            items.append((1, lines1, install_price, install_price))
            if has_battery:
                bm = (data.get('battery_model', '') if data else '') or DYNESS_DEFAULT_MODEL
                lines_batt = _dyness_battery_lines(bm)
                batt_add = float(DYNESS_BATTERY_PRICES.get(bm, DYNESS_BATTERY_PRICES[DYNESS_DEFAULT_MODEL]))
                items.append((2, lines_batt, batt_add, batt_add))
                warranty_num = 3
                terms_num = 4
            else:
                warranty_num = 2
                terms_num = 3

        elif brand == 'Deye':
            model = DEYE_MODELS.get(phase, {}).get(int(size_kw), f'SUN-{int(size_kw)}K {phase}')
            lines1 = _deye_install_lines(panels, phase, size_kw, model, has_battery)
            items.append((1, lines1, install_price, install_price))
            if has_battery:
                bm = (data.get('battery_model', '') if data else '') or DYNESS_DEFAULT_MODEL
                lines_batt = _dyness_battery_lines(bm)
                batt_add = float(DYNESS_BATTERY_PRICES.get(bm, DYNESS_BATTERY_PRICES[DYNESS_DEFAULT_MODEL]))
                items.append((2, lines_batt, batt_add, batt_add))
                warranty_num = 3
                terms_num = 4
            else:
                warranty_num = 2
                terms_num = 3

        elif brand == 'Hoymiles':
            model = HOYMILES_MODELS.get(phase, {}).get(int(size_kw), f'HMS {size_kw:.4g}kW')
            lines1 = _hoymiles_install_lines(panels, phase, size_kw, model)
            items.append((1, lines1, install_price, install_price))
            warranty_num = 2
            terms_num = 3

        else:
            # Generic fallback
            items.append((1, [(FB, 13, f'{brand} {size_kw:.4g}kW {phase}'), (F, 11, 'Solar installation package')], install_price, install_price))
            warranty_num = 2
            terms_num = 3

        # Warranty item
        items.append((warranty_num, _warranty_lines(brand), 0.0, 0.0))

        # Terms item (page 1 part)
        items.append((terms_num, _terms_page1_lines(brand, grand_total), 0.0, 0.0))

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

        # Title
        c.setFillColor(ORANGE)
        c.setFont(FB, 20)
        c.drawRightString(PAGE_W - MR, y0 - 8, 'ใบเสนอราคา')

        # Company info
        y = y0 - logo_h - 5
        c.setFillColor(black)
        c.setFont(F, 9)
        for line in [
            'เอเนอเวีย กรุ๊ป (สำนักงานใหญ่)',
            'เลขที่ 40/3 หมู่ 4 ถนนสังฆสันติสุข แขวงกระทุ่มราย',
            'เขตหนองจอก จังหวัดกรุงเทพมหานคร 10530',
            'เลขประจำตัวผู้เสียภาษี 0105556150779',
            'โทร. 0967964587',
            'www.enervia.co.th',
        ]:
            c.drawString(ML, y, line)
            y -= 11

        # Quote info box (right side)
        bx = 350
        bw = PAGE_W - MR - bx
        by_top = y0 - logo_h - 5
        bh = 70

        c.setStrokeColor(HexColor('#CCCCCC'))
        c.setLineWidth(0.5)
        c.rect(bx, by_top - bh, bw, bh, stroke=1, fill=0)

        lx = bx + 8
        vx = bx + 50
        ry = by_top - 10

        for label, value in [
            ('เลขที่', d['quote_number']),
            ('วันที่', d['date']),
            ('ผู้ขาย', d['salesperson']),
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
        c.drawString(lx, sep_y - 12, 'ชื่องาน')
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
        c.drawString(ML, cy, 'ลูกค้า')
        c.setFillColor(black)
        c.setFont(F, 10)
        c.drawString(ML, cy - 12, d.get('customer_name', 'เสนอราคา'))

        return cy - 20

    # ──────────────────────────────────────────────────────────
    def _table_header(self, c, y) -> float:
        h = 18
        c.setFillColor(ORANGE)
        c.rect(ML, y - h, CONTENT_W, h, fill=1, stroke=0)

        c.setFillColor(white)
        c.setFont(FB, 9)
        c.drawCentredString(ML + COL_NUM_W / 2, y - 12, '#')
        c.drawCentredString(COL_DESC_X + COL_DESC_W / 2, y - 12, 'รายละเอียด')
        c.drawCentredString(COL_QTY_X + COL_QTY_W / 2, y - 12, 'จำนวน')
        c.drawCentredString(COL_PRICE_X + COL_PRICE_W / 2, y - 12, 'ราคาต่อหน่วย')
        c.drawCentredString(COL_TOTAL_X + COL_TOTAL_W / 2, y - 12, 'ยอดรวม')
        return y - h

    # ──────────────────────────────────────────────────────────
    def _draw_item(self, c, y, num, lines, qty=1, price=0.0, total=0.0) -> float:
        c.setFillColor(black)
        c.setFont(F, 9)
        c.drawCentredString(ML + COL_NUM_W / 2, y - 10, str(num))

        is_detail = (price == 0.0 and total == 0.0)
        if not is_detail:
            c.setFont(F, 9)
            c.drawCentredString(COL_QTY_X + COL_QTY_W / 2, y - 10, str(qty))
            c.drawRightString(COL_PRICE_X + COL_PRICE_W - 2, y - 10, fmt(price))
            c.drawRightString(COL_TOTAL_X + COL_TOTAL_W - 2, y - 10, fmt(total))

        wrap_w = COL_DESC_FULL_W if is_detail else COL_DESC_W
        cy = y - 10
        for font, size, text in lines:
            # Scale font sizes down for compact layout
            if size == 13:
                size = 9
            elif size == 11:
                size = 8
            line_h = size + 2
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
                    cut = len(remaining)
                    for j in range(len(remaining), 0, -1):
                        if c.stringWidth(remaining[:j], font, size) <= wrap_w:
                            cut = j
                            break
                    c.drawString(COL_DESC_X, cy, remaining[:cut])
                    cy -= line_h
                    remaining = remaining[cut:]

        cy -= 3
        c.setStrokeColor(HexColor('#E8E8E8'))
        c.setLineWidth(0.3)
        c.line(ML, cy, ML + CONTENT_W, cy)
        return cy - 2

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
        c.setFillColor(black)
        c.drawString(ML, ny, 'หมายเหตุ')
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


# ─── Convenience function ────────────────────────────────────
def generate_quotation(brand, size_kw, phase, customer_name='เสนอราคา',
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
    out = generate_quotation('ATMOCE', 5.0, '1P', 'เสนอราคา', 'Test 5kW ATMOCE 1P')
    print(f'Generated: {out}')
