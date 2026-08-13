"""
SRP Calculator — ATMOCE BOM pricing engine (v24 May 2026 Source of Truth).

Mirrors the formulas in 'Internal Configuration guideline_V24May26.xlsx':
  - Sheet 'SRP Calculation' (Turnkey Resi SRP Pricing)
  - Sheet 'Price List' (Master SKU Prices)
  - Sheet 'C&I_MI-1250' (C&I 3-Phase Commercial System)
  - Sheet 'Resi_Mi-1250' (Residential MI-1250 1P & 3P)
  - Sheet 'Resi_MI-500' (Residential MI-500 1P & 3P)

Configurations supported:
    Resi / Model Sheet Component BOMs:
        Resi_MI-500-1P, Resi_MI-500-3P
        Resi_Mi-1250-1P, Resi_Mi-1250-3P
        C&I_MI-1250 (or C&I-3P)
    Turnkey SRP BOMs (SRP Calculation sheet):
        1:1-1P, 2:1-1P, 1:1-3P, 2:1-3P
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional


# ────────────────────────────────────────────────────────────────
# Sheet-level parameters (from 'SRP Calculation' B1:B12)
# ────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class SRPParams:
    panel_wp: int = 670
    panel_price_per_watt: float = 4.3
    mounting_per_watt: float = 1.0
    cable_ac_fixed: int = 100_000
    conduit_per_watt: float = 1.0
    grounding_fixed: int = 10_000
    installation_per_watt: float = 2.0
    service_fixed: int = 30_000
    permit_fixed: int = 50_000
    profit_pct: float = 30.0
    vat_pct: float = 7.0
    round_up_to: int = 1_000  # offer-price rounding to next 1,000 THB


# Master price table — snapshot from 'Price List' sheet.
PRICES_ATMOCE_DEFAULT: Dict[str, float] = {
    # Micro Inverters
    "MI-500": 4_000,
    "MI-1250": 4_750,
    "MI-1250-P5": 880,      # add-on warranty +5yr
    "MI-1250-P10": 1_760,    # add-on warranty +10yr
    # SolarBox / Combiner
    "MC100L": 10_900,
    "MC100": 15_900,
    "MC100T": 20_900,
    "MC100-Wye-4in1": 23_250,
    "MC100-Wye-8in1": 29_500,
    # C&I Gateway & CT
    "MG100-Wye": 19_050,
    "MA-CT-400A-T": 3_250,
    "MA-CT-250A-T": 2_150,
    # Battery & Backup
    "MS-7K-U": 72_900,       # 7kWh M-Battery (Resi)
    "MS-16K-U": 105_550,     # 16kWh M-ELV Battbank (C&I)
    "MS-SCU-CNI": 16_900,    # Stack Control Unit (C&I)
    "MS-ACCB-CNI": 16_900,   # AC Connection Base (C&I)
    "MU100S": 15_900,        # Single-phase Backup Box
    "MU100T": 22_900,        # Three-phase Backup Box
    "MA-ESSKits-S": 10_500,  # 1P ESS kit for 3rd-party PV
    "MA-ESSKits-T": 12_600,  # 3P ESS kit for 3rd-party PV
    # Cables & Accessories
    "MW-025013-A": 500,
    "MW-025020-B0": 740,
    "MW-025025-A": 605,      # 2.5m three-terminal AC cable (Price List v24)
    "MT-04003-A": 640,
    "MT-03205-A": 1_050,    # 3P junction adapter 32A-5cores (Resi 3P)
    "MT-03505-A": 1_080,    # 3P cable connector 35A-5cores (C&I 3P)
    "MT-04002-2in1": 850,
    "MWX-040030-B": 21_850,  # 1 roll of 30 3P AC cables
    "MWX-040030-B/30": 21_850 / 30.0, # 728.3333333333334 per cable
    "MA-CAP-003": 215,
}

_SHEET_QUIRK_MW_025013_A_2to1_1p = 800  # cell J23 in 2:1-1P sheet


# ────────────────────────────────────────────────────────────────
# Output dataclasses
# ────────────────────────────────────────────────────────────────
@dataclass
class BOMLine:
    part_number: str
    part_name: str
    manufacturer: str
    category: str
    quantity: float
    unit: str
    unit_cost: float
    total_cost: float
    notes: str = ""

    def as_dict(self) -> dict:
        return {
            "part_number": self.part_number,
            "part_name": self.part_name,
            "manufacturer": self.manufacturer,
            "category": self.category,
            "quantity": float(self.quantity),
            "unit": self.unit,
            "unit_cost": float(self.unit_cost),
            "total_cost": float(self.total_cost),
            "notes": self.notes,
        }


@dataclass
class SRPResult:
    config: str
    panels: int
    kwp: float
    inverter_count: int
    lines: List[BOMLine]
    total_cost: float
    profit: float
    vat: float
    offer_price: float
    battery_kwh: int = 0
    has_backup: bool = False
    warranty_years: int = 0

    def as_dict(self) -> dict:
        return {
            "config": self.config,
            "panels": self.panels,
            "kwp": self.kwp,
            "inverter_count": self.inverter_count,
            "items": [line.as_dict() for line in self.lines],
            "total_cost": float(self.total_cost),
            "profit": float(self.profit),
            "vat": float(self.vat),
            "offer_price": float(self.offer_price),
            "battery_kwh": self.battery_kwh,
            "has_backup": self.has_backup,
            "warranty_years": self.warranty_years,
        }


# ────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────
def _ru(x: float) -> int:
    """ROUNDUP(x, 0) — Excel behaviour."""
    return int(math.ceil(x))


def _round_up_to(x: float, step: int) -> int:
    """ROUNDUP(x, -3) where step=1000 → next higher multiple of step."""
    if step <= 0:
        return int(x)
    return int(math.ceil(x / step) * step)


def _p(prices: Dict[str, float], key: str) -> float:
    try:
        return float(prices[key])
    except KeyError as e:
        raise KeyError(f"Missing price for {key!r} in catalog") from e


def _mt_04003_a_qty(kwp: float) -> int:
    """1-phase junction adapter qty — sheet rule IF(kWp<12,1, IF(<24,2, 3))."""
    if kwp < 12:
        return 1
    if kwp < 24:
        return 2
    return 3


def _mt_04002_2in1_qty_1p(solarbox: str, panels: int) -> int:
    """2in1 connector qty — MC100L: 1 if panels>9, else 0.
    MC100: 3 if panels>27, else 0."""
    if solarbox == "MC100L":
        return 1 if panels > 9 else 0
    if solarbox == "MC100":
        return 3 if panels > 27 else 0
    return 0


# ────────────────────────────────────────────────────────────────
# Model Sheet Builders (Component-only BOMs from model sheets)
# ────────────────────────────────────────────────────────────────

def _build_resi_mi500_1p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = panels  # 1 MI-500 per panel
    solarbox = "MC100L" if panels < 9 else "MC100"

    lines: List[BOMLine] = []

    # Inverter
    mi500 = _p(prices, "MI-500")
    lines.append(BOMLine("MI-500", "Single Phase Micro Inverter - 500W", "ATMOCE", "อินเวอร์เตอร์", inverters, "ตัว", mi500, mi500 * inverters))

    # SolarBox
    sb_price = _p(prices, solarbox)
    lines.append(BOMLine(solarbox, f"SolarBox {solarbox}", "ATMOCE", "SolarBox", 1, "ชุด", sb_price, sb_price))

    # Cable
    mw13 = _p(prices, "MW-025013-A")
    lines.append(BOMLine("MW-025013-A", "1.3 m, Three-terminal AC Cable", "ATMOCE", "สายไฟ", inverters, "ชิ้น", mw13, mw13 * inverters))

    # Junction Adapter
    mt_03_qty = 1 if panels < 12 else (2 if panels < 24 else 3)
    mt03 = _p(prices, "MT-04003-A")
    lines.append(BOMLine("MT-04003-A", "Single-phase junction adapter, 40A-3cores", "ATMOCE", "สายไฟ", mt_03_qty, "ชิ้น", mt03, mt03 * mt_03_qty))

    # 2in1 Connector
    mt_02_qty = _mt_04002_2in1_qty_1p(solarbox, inverters)
    if mt_02_qty > 0:
        mt02 = _p(prices, "MT-04002-2in1")
        lines.append(BOMLine("MT-04002-2in1", "2in1 AC junction connector, 40A-2cores", "ATMOCE", "สายไฟ", mt_02_qty, "ชิ้น", mt02, mt02 * mt_02_qty))

    return lines, inverters


def _build_resi_mi1250_1p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels / 2)  # 1 MI-1250 per 2 panels
    solarbox = "MC100L" if panels < 9 else "MC100"

    lines: List[BOMLine] = []

    # Inverter
    mi1250 = _p(prices, "MI-1250")
    lines.append(BOMLine("MI-1250", "Single Phase Micro Inverter - 1250W (15 year warranty)", "ATMOCE", "อินเวอร์เตอร์", inverters, "ตัว", mi1250, mi1250 * inverters))

    # SolarBox
    sb_price = _p(prices, solarbox)
    lines.append(BOMLine(solarbox, f"SolarBox {solarbox}", "ATMOCE", "SolarBox", 1, "ชุด", sb_price, sb_price))

    # Cable
    mw25 = _p(prices, "MW-025025-A")
    lines.append(BOMLine("MW-025025-A", "2.5 m, Three-terminal AC Cable", "ATMOCE", "สายไฟ", inverters, "ชิ้น", mw25, mw25 * inverters))

    # Junction Adapter
    mt_03_qty = 1 if panels < 9 else (2 if panels < 17 else 3)
    mt03 = _p(prices, "MT-04003-A")
    lines.append(BOMLine("MT-04003-A", "Single-phase junction adapter, 40A-3cores", "ATMOCE", "สายไฟ", mt_03_qty, "ชิ้น", mt03, mt03 * mt_03_qty))

    # 2in1 Connector
    mt_02_qty = _mt_04002_2in1_qty_1p(solarbox, inverters)
    if mt_02_qty > 0:
        mt02 = _p(prices, "MT-04002-2in1")
        lines.append(BOMLine("MT-04002-2in1", "2in1 AC junction connector, 40A-2cores", "ATMOCE", "สายไฟ", mt_02_qty, "ชิ้น", mt02, mt02 * mt_02_qty))

    return lines, inverters


def _build_ci_3p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels / 2)  # MI-1250, 2 panels per inverter

    # Q3 Resolution: Combiner box selection (<120: 4in1 x1, >=120: 8in1 ROUNDUP(panels/240))
    if panels < 120:
        solarbox = "MC100-Wye-4in1"
        sb_qty = 1
    else:
        solarbox = "MC100-Wye-8in1"
        sb_qty = _ru(panels / 240)

    lines: List[BOMLine] = []

    # Inverter MI-1250
    mi1250 = _p(prices, "MI-1250")
    lines.append(BOMLine("MI-1250", "Single Phase Micro Inverter - 1250W (15 year warranty)", "ATMOCE", "อินเวอร์เตอร์", inverters, "ตัว", mi1250, mi1250 * inverters))

    # Default C&I Warranty: 25yr (MI-1250-P10 addon for all inverters)
    p10 = _p(prices, "MI-1250-P10")
    lines.append(BOMLine("MI-1250-P10", "Single Phase Micro Inverter - 1250W add on warranty 10 year", "ATMOCE", "รับประกัน", inverters, "ตัว", p10, p10 * inverters))

    # SolarBox
    sb_price = _p(prices, solarbox)
    lines.append(BOMLine(solarbox, f"SolarBox {solarbox}", "ATMOCE", "SolarBox", sb_qty, "ชุด", sb_price, sb_price * sb_qty))

    # Q2 Resolution: MWX-040030-B expressed per cable at 728.3333 THB/cable (buying full rolls total cost)
    mwx_per_cable = _p(prices, "MWX-040030-B/30")
    rolls = _ru(inverters / 30)
    cables_bought = rolls * 30
    lines.append(BOMLine("MWX-040030-B", "3.0 m Gap, 4.0mm² Three-phase 4cores AC Cable (1 roll have 30 terminal)",
                        "ATMOCE", "สายไฟ", cables_bought, "เส้น", mwx_per_cable, rolls * 21_850,
                        notes=f"{rolls} ม้วน ({cables_bought} เส้น @ {mwx_per_cable:,.2f} บาท/เส้น)"))

    # Connectors and Sealing Caps
    arrays = _ru(inverters / 15)
    mt_35 = _p(prices, "MT-03505-A")
    ma_cap = _p(prices, "MA-CAP-003")
    lines.append(BOMLine("MT-03505-A", "Three-phase cable connector, 35A-5cores", "ATMOCE", "สายไฟ", arrays, "ชิ้น", mt_35, mt_35 * arrays))
    lines.append(BOMLine("MA-CAP-003", "Three-phase AC Cable sealing cap", "ATMOCE", "สายไฟ", arrays, "ชิ้น", ma_cap, ma_cap * arrays))

    return lines, inverters


# ────────────────────────────────────────────────────────────────
# Turnkey SRP Calculation Builders (SRP Calculation sheet)
# ────────────────────────────────────────────────────────────────

def _build_1to1_1p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels)
    watts = panels * params.panel_wp
    kwp = watts / 1000.0
    solarbox = "MC100L" if panels < 12 else "MC100"

    lines: List[BOMLine] = []

    panel_unit = params.panel_wp * params.panel_price_per_watt
    lines.append(BOMLine("PANEL-670W", f"แผงโซลาร์ {params.panel_wp}Wp", "ATMOCE", "โมดูล", panels, "แผง", panel_unit, panel_unit * panels))
    mi500 = _p(prices, "MI-500")
    lines.append(BOMLine("MI-500", "Single Phase Micro Inverter 500W", "ATMOCE", "อินเวอร์เตอร์", inverters, "ตัว", mi500, mi500 * inverters))

    mount_total = params.mounting_per_watt * watts
    lines.append(BOMLine("MOUNTING", "โครงยึดแผง (Mounting)", "ATMOCE", "ติดตั้ง", 1, "เหมา", mount_total, mount_total))
    lines.append(BOMLine("CABLE-AC", "สายไฟ AC", "-", "สายไฟ", 1, "เหมา", params.cable_ac_fixed, params.cable_ac_fixed))

    mw_013 = _p(prices, "MW-025013-A")
    mt_03 = _p(prices, "MT-04003-A")
    mt_02 = _p(prices, "MT-04002-2in1")
    mw_013_qty = panels
    mt_03_qty = _mt_04003_a_qty(kwp)
    mt_02_qty = _mt_04002_2in1_qty_1p(solarbox, panels)

    lines.append(BOMLine("MW-025013-A", "1.3 m Three-terminal AC Cable", "ATMOCE", "สายไฟ", mw_013_qty, "ชิ้น", mw_013, mw_013 * mw_013_qty))
    lines.append(BOMLine("MT-04003-A", "Single-phase junction adapter 40A-3cores", "ATMOCE", "สายไฟ", mt_03_qty, "ชิ้น", mt_03, mt_03 * mt_03_qty))
    if mt_02_qty:
        lines.append(BOMLine("MT-04002-2in1", "2in1 AC junction connector 40A-2cores", "ATMOCE", "สายไฟ", mt_02_qty, "ชิ้น", mt_02, mt_02 * mt_02_qty))

    conduit_total = params.conduit_per_watt * watts
    lines.append(BOMLine("CONDUIT", "ท่อร้อยสาย (Conduit)", "-", "ติดตั้ง", 1, "เหมา", conduit_total, conduit_total))

    sb_price = _p(prices, solarbox)
    lines.append(BOMLine(solarbox, f"SolarBox {solarbox}", "ATMOCE", "SolarBox", 1, "ชุด", sb_price, sb_price))

    lines.append(BOMLine("GROUND", "ระบบ Grounding", "-", "ติดตั้ง", 1, "เหมา", params.grounding_fixed, params.grounding_fixed))
    install_total = params.installation_per_watt * watts
    lines.append(BOMLine("INSTALL", "ค่าติดตั้ง (Installation)", "-", "ติดตั้ง", 1, "เหมา", install_total, install_total))
    lines.append(BOMLine("SERVICE", "ค่าบริการ (Service)", "-", "บริการ", 1, "เหมา", params.service_fixed, params.service_fixed))
    lines.append(BOMLine("PERMIT", "ค่าขออนุญาต (Permit)", "-", "บริการ", 1, "เหมา", params.permit_fixed, params.permit_fixed))

    return lines, inverters


def _build_2to1_1p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels / 2)
    watts = panels * params.panel_wp
    kwp = watts / 1000.0
    solarbox = "MC100"

    lines: List[BOMLine] = []

    panel_unit = params.panel_wp * params.panel_price_per_watt
    lines.append(BOMLine("PANEL-670W", f"แผงโซลาร์ {params.panel_wp}Wp", "ATMOCE", "โมดูล", panels, "แผง", panel_unit, panel_unit * panels))
    mi1250 = _p(prices, "MI-1250")
    lines.append(BOMLine("MI-1250", "Single Phase Micro Inverter 1250W (15yr warranty)", "ATMOCE", "อินเวอร์เตอร์", inverters, "ตัว", mi1250, mi1250 * inverters))

    mount_total = params.mounting_per_watt * watts
    lines.append(BOMLine("MOUNTING", "โครงยึดแผง (Mounting)", "ATMOCE", "ติดตั้ง", 1, "เหมา", mount_total, mount_total))
    lines.append(BOMLine("CABLE-AC", "สายไฟ AC", "-", "สายไฟ", 1, "เหมา", params.cable_ac_fixed, params.cable_ac_fixed))

    mw_25 = _p(prices, "MW-025025-A")
    lines.append(BOMLine("MW-025025-A", "2.5 m Three-terminal AC Cable", "ATMOCE", "สายไฟ", inverters, "ชิ้น", mw_25, mw_25 * inverters))

    conduit_total = params.conduit_per_watt * watts
    lines.append(BOMLine("CONDUIT", "ท่อร้อยสาย (Conduit)", "-", "ติดตั้ง", 1, "เหมา", conduit_total, conduit_total))

    sb_price = _p(prices, "MC100")
    lines.append(BOMLine("MC100", "SolarBox MC100 (3-input)", "ATMOCE", "SolarBox", 1, "ชุด", sb_price, sb_price))

    lines.append(BOMLine("GROUND", "ระบบ Grounding", "-", "ติดตั้ง", 1, "เหมา", params.grounding_fixed, params.grounding_fixed))
    install_total = params.installation_per_watt * watts
    lines.append(BOMLine("INSTALL", "ค่าติดตั้ง (Installation)", "-", "ติดตั้ง", 1, "เหมา", install_total, install_total))
    lines.append(BOMLine("PERMIT", "ค่าขออนุญาต (Permit)", "-", "บริการ", 1, "เหมา", params.permit_fixed, params.permit_fixed))
    lines.append(BOMLine("SERVICE", "ค่าบริการ (Service)", "-", "บริการ", 1, "เหมา", params.service_fixed, params.service_fixed))

    return lines, inverters


def _build_1to1_3p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels)
    watts = panels * params.panel_wp
    kwp = watts / 1000.0

    lines: List[BOMLine] = []

    panel_unit = params.panel_wp * params.panel_price_per_watt
    lines.append(BOMLine("PANEL-670W", f"แผงโซลาร์ {params.panel_wp}Wp", "ATMOCE", "โมดูล", panels, "แผง", panel_unit, panel_unit * panels))
    mi500 = _p(prices, "MI-500")
    lines.append(BOMLine("MI-500", "Single Phase Micro Inverter 500W", "ATMOCE", "อินเวอร์เตอร์", inverters, "ตัว", mi500, mi500 * inverters))

    mount_total = params.mounting_per_watt * watts
    lines.append(BOMLine("MOUNTING", "โครงยึดแผง (Mounting)", "ATMOCE", "ติดตั้ง", 1, "เหมา", mount_total, mount_total))
    lines.append(BOMLine("CABLE-AC", "สายไฟ AC", "-", "สายไฟ", 1, "เหมา", params.cable_ac_fixed, params.cable_ac_fixed))

    mw_013 = _p(prices, "MW-025013-A")
    mt_03 = _p(prices, "MT-04003-A")
    lines.append(BOMLine("MW-025013-A", "1.3 m Three-terminal AC Cable", "ATMOCE", "สายไฟ", panels, "ชิ้น", mw_013, mw_013 * panels))
    lines.append(BOMLine("MT-04003-A", "Single-phase junction adapter 40A-3cores", "ATMOCE", "สายไฟ", 3, "ชิ้น", mt_03, mt_03 * 3))

    conduit_total = params.conduit_per_watt * watts
    lines.append(BOMLine("CONDUIT", "ท่อร้อยสาย (Conduit)", "-", "ติดตั้ง", 1, "เหมา", conduit_total, conduit_total))

    mc100t = _p(prices, "MC100T")
    mc100t_qty = _ru(kwp / 60) or 1
    lines.append(BOMLine("MC100T", "SolarBox MC100T (Three-phase, 2-input)", "ATMOCE", "SolarBox", mc100t_qty, "ชุด", mc100t, mc100t * mc100t_qty))

    lines.append(BOMLine("GROUND", "ระบบ Grounding", "-", "ติดตั้ง", 1, "เหมา", params.grounding_fixed, params.grounding_fixed))
    install_total = params.installation_per_watt * watts
    lines.append(BOMLine("INSTALL", "ค่าติดตั้ง (Installation)", "-", "ติดตั้ง", 1, "เหมา", install_total, install_total))
    lines.append(BOMLine("SERVICE", "ค่าบริการ (Service)", "-", "บริการ", 1, "เหมา", params.service_fixed, params.service_fixed))
    lines.append(BOMLine("PERMIT", "ค่าขออนุญาต (Permit)", "-", "บริการ", 1, "เหมา", params.permit_fixed, params.permit_fixed))

    return lines, inverters


def _build_2to1_3p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels / 2)
    watts = panels * params.panel_wp
    kwp = watts / 1000.0
    solarbox = "MC100T" if panels < 30 else ("MC100-Wye-4in1" if panels < 60 else "MC100-Wye-8in1")

    lines: List[BOMLine] = []

    panel_unit = params.panel_wp * params.panel_price_per_watt
    lines.append(BOMLine("PANEL-670W", f"แผงโซลาร์ {params.panel_wp}Wp", "ATMOCE", "โมดูล", panels, "แผง", panel_unit, panel_unit * panels))
    mi1250 = _p(prices, "MI-1250")
    lines.append(BOMLine("MI-1250", "Single Phase Micro Inverter 1250W (15yr warranty)", "ATMOCE", "อินเวอร์เตอร์", inverters, "ตัว", mi1250, mi1250 * inverters))

    mount_total = params.mounting_per_watt * watts
    lines.append(BOMLine("MOUNTING", "โครงยึดแผง (Mounting)", "ATMOCE", "ติดตั้ง", 1, "เหมา", mount_total, mount_total))
    lines.append(BOMLine("CABLE-AC", "สายไฟ AC", "-", "สายไฟ", 1, "เหมา", params.cable_ac_fixed, params.cable_ac_fixed))

    mwx_per_cable = _p(prices, "MWX-040030-B/30")
    mt_35 = _p(prices, "MT-03505-A")
    ma_cap = _p(prices, "MA-CAP-003")
    mt_35_qty = _ru(inverters / 15)
    ma_cap_qty = _ru(inverters / 15)

    lines.append(BOMLine("MWX-040030-B", "3.0m 4mm² Three-phase 4-core AC cable (per cable)",
                        "ATMOCE", "สายไฟ", inverters, "เส้น", mwx_per_cable, inverters * mwx_per_cable))
    lines.append(BOMLine("MT-03505-A", "Three-phase cable connector 35A-5cores", "ATMOCE", "สายไฟ", mt_35_qty, "ชิ้น", mt_35, mt_35 * mt_35_qty))
    lines.append(BOMLine("MA-CAP-003", "Three-phase AC Cable sealing cap", "ATMOCE", "สายไฟ", ma_cap_qty, "ชิ้น", ma_cap, ma_cap * ma_cap_qty))

    conduit_total = params.conduit_per_watt * watts
    lines.append(BOMLine("CONDUIT", "ท่อร้อยสาย (Conduit)", "-", "ติดตั้ง", 1, "เหมา", conduit_total, conduit_total))

    sb_price = _p(prices, solarbox)
    sb_qty = _ru(kwp / 150) or 1
    lines.append(BOMLine(solarbox, f"SolarBox {solarbox}", "ATMOCE", "SolarBox", sb_qty, "ชุด", sb_price, sb_price * sb_qty))

    lines.append(BOMLine("GROUND", "ระบบ Grounding", "-", "ติดตั้ง", 1, "เหมา", params.grounding_fixed, params.grounding_fixed))
    install_total = params.installation_per_watt * watts
    lines.append(BOMLine("INSTALL", "ค่าติดตั้ง (Installation)", "-", "ติดตั้ง", 1, "เหมา", install_total, install_total))
    lines.append(BOMLine("SERVICE", "ค่าบริการ (Service)", "-", "บริการ", 1, "เหมา", params.service_fixed, params.service_fixed))
    lines.append(BOMLine("PERMIT", "ค่าขออนุญาต (Permit)", "-", "บริการ", 1, "เหมา", params.permit_fixed, params.permit_fixed))

    return lines, inverters


# ────────────────────────────────────────────────────────────────
# Battery + Backup + Warranty addon helpers
# ────────────────────────────────────────────────────────────────
def _append_battery_backup(
    lines: List[BOMLine],
    prices: Dict[str, float],
    phase: str,
    config: str,
    battery_kwh: int = 0,
    backup: bool = False,
    warranty_years: int = 0,
    inverter_count: int = 0,
) -> None:
    """Append battery / backup / warranty lines in-place."""
    if "C&I" in config:
        # C&I Battery System: MS-16K-U (16kWh M-ELV Battbank)
        if battery_kwh > 0:
            batt_qty = _ru(battery_kwh / 16)
            bp = _p(prices, "MS-16K-U")
            lines.append(BOMLine("MS-16K-U", "16kWh M-ELV Battbank", "ATMOCE", "battery", batt_qty, "ตู้", bp, bp * batt_qty))

            scu_qty = _ru(batt_qty / 7)
            scu_p = _p(prices, "MS-SCU-CNI")
            lines.append(BOMLine("MS-SCU-CNI", "Stack Control Unit(SCU) Cap of M-ELV BattBank for C&I", "ATMOCE", "battery", scu_qty, "ชุด", scu_p, scu_p * scu_qty))

            if backup:
                accb_p = _p(prices, "MS-ACCB-CNI")
                lines.append(BOMLine("MS-ACCB-CNI", "AC Connection Base of M-ELV BattBank for C&I", "ATMOCE", "backup", scu_qty, "ชุด", accb_p, accb_p * scu_qty))

            ct_p = _p(prices, "MA-CT-250A-T")
            lines.append(BOMLine("MA-CT-250A-T", "Three-phase 250A CT Kits", "ATMOCE", "อุปกรณ์วัดไฟ", 1, "ชุด", ct_p, ct_p))
    else:
        # Resi Battery System: MS-7K-U (7kWh M-Battery)
        if battery_kwh > 0:
            batt_qty = _ru(battery_kwh / 7)
            batt_max = 6 if phase == "3P" else 3
            batt_qty = min(batt_qty, batt_max)
            bp = _p(prices, "MS-7K-U")
            lines.append(BOMLine("MS-7K-U", "7kWh M-Battery", "ATMOCE", "battery", batt_qty, "ก้อน", bp, bp * batt_qty))

        if backup:
            bu_key = "MU100T" if phase == "3P" else "MU100S"
            bu_desc = "Three-phase Backup Box" if phase == "3P" else "Single-phase Backup Box"
            bup = _p(prices, bu_key)
            lines.append(BOMLine(bu_key, bu_desc, "ATMOCE", "backup", 1, "ชุด", bup, bup))

    # Warranty extension override
    if warranty_years in (5, 10) and inverter_count > 0 and "C&I" not in config:
        w_key = "MI-1250-P5" if warranty_years == 5 else "MI-1250-P10"
        w_desc = f"MI-1250 Warranty +{warranty_years}yr"
        wp = _p(prices, w_key)
        lines.append(BOMLine(w_key, w_desc, "ATMOCE", "warranty", inverter_count, "ตัว", wp, wp * inverter_count))


# ────────────────────────────────────────────────────────────────
# Public API
# ────────────────────────────────────────────────────────────────
_BUILDERS = {
    "1:1-1P": _build_1to1_1p,
    "2:1-1P": _build_2to1_1p,
    "1:1-3P": _build_1to1_3p,
    "2:1-3P": _build_2to1_3p,
    "C&I-3P": _build_ci_3p,
    "C&I_MI-1250": _build_ci_3p,
    "Resi_MI-500-1P": _build_resi_mi500_1p,
    "Resi_Mi-1250-1P": _build_resi_mi1250_1p,
}


def calculate_srp(
    config: str,
    panels: int,
    prices: Optional[Dict[str, float]] = None,
    params: Optional[SRPParams] = None,
    battery_kwh: int = 0,
    backup: bool = False,
    warranty_years: int = 0,
) -> SRPResult:
    if config not in _BUILDERS:
        raise ValueError(f"Unknown config {config!r}. Expected one of {list(_BUILDERS)}")
    if panels <= 0:
        raise ValueError(f"panels must be positive, got {panels}")

    prices = prices if prices is not None else PRICES_ATMOCE_DEFAULT
    params = params if params is not None else SRPParams()

    lines, inverters = _BUILDERS[config](panels, prices, params)
    phase = "3P" if ("3P" in config or "3p" in config) else "1P"

    _append_battery_backup(lines, prices, phase, config, battery_kwh, backup, warranty_years, inverters)

    total_cost = sum(line.total_cost for line in lines)

    # Component-only BOM vs Turnkey SRP BOM
    is_component_bom = ("C&I" in config or "Resi_" in config)

    if is_component_bom:
        profit = 0.0
        vat = total_cost * params.vat_pct / 100.0
        offer_price = total_cost + vat
    else:
        profit = total_cost * params.profit_pct / 100.0
        vat = (total_cost + profit) * params.vat_pct / 100.0
        offer_price = _round_up_to(total_cost + profit + vat, params.round_up_to)

    kwp = panels * params.panel_wp / 1000.0
    return SRPResult(
        config=config,
        panels=panels,
        kwp=kwp,
        inverter_count=inverters,
        lines=lines,
        total_cost=total_cost,
        profit=profit,
        vat=vat,
        offer_price=offer_price,
        battery_kwh=battery_kwh,
        has_backup=backup,
        warranty_years=warranty_years,
    )
