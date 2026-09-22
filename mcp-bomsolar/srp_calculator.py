"""
SRP Calculator — ATMOCE BOM pricing engine.

Mirrors the formulas in sheet 'SRP Calculation' of
'Internal Configuration guideline enervia042026.xlsx'.

Four configurations are supported:
    1:1-1P  — Single-phase, 1 MI-500 per panel
    2:1-1P  — Single-phase, 1 MI-1250 per 2 panels
    1:1-3P  — Three-phase,  1 MI-500 per panel
    2:1-3P  — Three-phase,  1 MI-1250 per 2 panels

Prices are supplied via the `prices` dict (catalog source of truth).
PRICES_ATMOCE_DEFAULT is a fallback only — production should pass
live catalog prices in.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone, timedelta
import survey_catalog
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
import math


# ────────────────────────────────────────────────────────────────
# Sheet-level parameters (from 'SRP Calculation' rows 1–12)
# ────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class SRPParams:
    panel_wp: int = 670
    panel_price_per_watt: float = 4.5
    mounting_per_watt: float = 1.0
    cable_ac_fixed: int = 3_000
    conduit_per_watt: float = 1.0
    grounding_fixed: int = 2_000
    installation_per_watt: float = 4.5
    service_fixed: int = 10_000
    permit_fixed: int = 2_500
    profit_pct: float = 30.0
    vat_pct: float = 7.0
    round_up_to: int = 1_000  # offer-price rounding, e.g. 172,484 → 173,000


# Fallback price table — snapshot from reference sheet 'Price List'.
# Note: MW-025020-B0 is 740 in Price List but the 2:1-1P section
# hardcodes 800 in the formula (J23=800). We follow the sheet to
# match golden totals; mark this for catalog sync later.
PRICES_ATMOCE_DEFAULT: Dict[str, float] = {
    # Inverters
    "MI-500": 4_000,
    "MI-1250": 4_750,
    "MI-1250-P5": 880,    # add-on warranty +5yr
    "MI-1250-P10": 1_760,  # add-on warranty +10yr
    # SolarBox / Combiner
    "MC100L": 10_900,
    "MC100": 15_900,
    "MC100T": 20_900,
    "MC100-Wye-4in1": 23_250,
    "MC100-Wye-8in1": 29_500,
    # Battery + Backup
    "MS-7K-U": 72_900,   # 7kWh M-Battery
    "MU100S": 15_900,    # Single-phase Backup Box
    "MU100T": 22_900,    # Three-phase Backup Box
    "MA-ESSKits-S": 10_500,  # 1P ESS kit for 3rd-party PV
    "MA-ESSKits-T": 12_600,  # 3P ESS kit for 3rd-party PV
    # Cables — 1P
    "MW-025013-A": 500,
    "MW-025020-B0": 740,
    "MW-025025-A": 700,   # 2.5m three-terminal AC cable
    "MT-04003-A": 640,
    "MT-03205-A": 1_050,  # 3P junction adapter 32A-5cores (Resi 3P)
    "MT-03505-A": 1_080,  # 3P cable connector 35A-5cores (C&I 3P)
    "MT-04002-2in1": 850,
    # Cables — 3P C&I
    "MWX-040030-B/30": 21_850 / 30,  # 1 roll = 30 cables
    "MA-CAP-003": 215,
    # C&I Gateway + CT
    "MG100-Wye": 19_050,
    "MA-CT-400A-T": 3_250,
    "MA-CT-250A-T": 2_150,
}

# Sheet-specific overrides. The reference Excel has a handful of hardcoded
# values that disagree with 'Price List'; we mirror them so our totals
# match the sheet byte-for-byte. Flag for catalog/ops review.
_SHEET_QUIRK_MW_025013_A_2to1_1p = 800  # sheet cell J23 is literal, not VLOOKUP


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
            "quantity": self.quantity,
            "unit": self.unit,
            "unit_cost": self.unit_cost,
            "total_cost": self.total_cost,
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
            "total_cost": self.total_cost,
            "profit": self.profit,
            "vat": self.vat,
            "offer_price": self.offer_price,
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
# Config-specific builders
# ────────────────────────────────────────────────────────────────
def _build_1to1_1p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels)  # 1 MI-500 per panel
    watts = panels * params.panel_wp
    kwp = watts / 1000.0
    solarbox = "MC100L" if panels < 12 else "MC100"

    lines: List[BOMLine] = []

    # Solar Panel
    panel_unit = params.panel_wp * params.panel_price_per_watt
    lines.append(BOMLine(
        "PANEL-670W", f"แผงโซลาร์ {params.panel_wp}Wp", "ATMOCE",
        "โมดูล", panels, "แผง", panel_unit, panel_unit * panels,
    ))

    # Inverter
    mi500 = _p(prices, "MI-500")
    lines.append(BOMLine(
        "MI-500", "Single Phase Micro Inverter 500W", "ATMOCE",
        "อินเวอร์เตอร์", inverters, "ตัว", mi500, mi500 * inverters,
    ))

    # Mounting (per watt)
    mount_total = params.mounting_per_watt * watts
    lines.append(BOMLine(
        "MOUNTING", "โครงยึดแผง (Mounting)", "ATMOCE",
        "ติดตั้ง", 1, "เหมา", mount_total, mount_total,
        notes=f"{params.mounting_per_watt} บาท/วัตต์ × {watts:,.0f} W",
    ))

    # Cable AC (fixed)
    lines.append(BOMLine(
        "CABLE-AC", "สายไฟ AC", "-",
        "สายไฟ", 1, "เหมา", params.cable_ac_fixed, params.cable_ac_fixed,
    ))

    # Atmoce Cable set
    mw_013 = _p(prices, "MW-025013-A")
    mt_03 = _p(prices, "MT-04003-A")
    mt_02 = _p(prices, "MT-04002-2in1")
    mw_013_qty = panels
    mt_03_qty = _mt_04003_a_qty(kwp)
    mt_02_qty = _mt_04002_2in1_qty_1p(solarbox, panels)

    lines.append(BOMLine("MW-025013-A", "1.3 m Three-terminal AC Cable",
                        "ATMOCE", "สายไฟ", mw_013_qty, "ชิ้น", mw_013, mw_013 * mw_013_qty))
    lines.append(BOMLine("MT-04003-A", "Single-phase junction adapter 40A-3cores",
                        "ATMOCE", "สายไฟ", mt_03_qty, "ชิ้น", mt_03, mt_03 * mt_03_qty))
    if mt_02_qty:
        lines.append(BOMLine("MT-04002-2in1", "2in1 AC junction connector 40A-2cores",
                            "ATMOCE", "สายไฟ", mt_02_qty, "ชิ้น", mt_02, mt_02 * mt_02_qty))
    else:
        lines.append(BOMLine("MT-04002-2in1", "2in1 AC junction connector 40A-2cores",
                            "ATMOCE", "สายไฟ", 0, "ชิ้น", mt_02, 0))

    # Conduit (per watt)
    conduit_total = params.conduit_per_watt * watts
    lines.append(BOMLine(
        "CONDUIT", "ท่อร้อยสาย (Conduit)", "-",
        "ติดตั้ง", 1, "เหมา", conduit_total, conduit_total,
        notes=f"{params.conduit_per_watt} บาท/วัตต์ × {watts:,.0f} W",
    ))

    # SolarBox (MC100L or MC100)
    sb_price = _p(prices, solarbox)
    lines.append(BOMLine(
        solarbox, f"SolarBox {solarbox}", "ATMOCE",
        "SolarBox", 1, "ชุด", sb_price, sb_price,
    ))

    # Grounding
    lines.append(BOMLine(
        "GROUND", "ระบบ Grounding", "-",
        "ติดตั้ง", 1, "เหมา", params.grounding_fixed, params.grounding_fixed,
    ))

    # Installation (per watt)
    install_total = params.installation_per_watt * watts
    lines.append(BOMLine(
        "INSTALL", "ค่าติดตั้ง (Installation)", "-",
        "ติดตั้ง", 1, "เหมา", install_total, install_total,
        notes=f"{params.installation_per_watt} บาท/วัตต์ × {watts:,.0f} W",
    ))

    # Service / Permit
    lines.append(BOMLine("SERVICE", "ค่าบริการ (Service)", "-",
                        "บริการ", 1, "เหมา", params.service_fixed, params.service_fixed))
    lines.append(BOMLine("PERMIT", "ค่าขออนุญาต (Permit)", "-",
                        "บริการ", 1, "เหมา", params.permit_fixed, params.permit_fixed))

    return lines, inverters


def _build_2to1_1p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels / 2)  # 1 MI-1250 per 2 panels
    watts = panels * params.panel_wp
    kwp = watts / 1000.0
    solarbox = "MC100"  # fixed in sheet (H31='MC100')

    lines: List[BOMLine] = []

    # Solar Panel
    panel_unit = params.panel_wp * params.panel_price_per_watt
    lines.append(BOMLine(
        "PANEL-670W", f"แผงโซลาร์ {params.panel_wp}Wp", "ATMOCE",
        "โมดูล", panels, "แผง", panel_unit, panel_unit * panels,
    ))

    # Inverter — MI-1250
    mi1250 = _p(prices, "MI-1250")
    lines.append(BOMLine(
        "MI-1250", "Single Phase Micro Inverter 1250W (15yr warranty)", "ATMOCE",
        "อินเวอร์เตอร์", inverters, "ตัว", mi1250, mi1250 * inverters,
    ))

    # Mounting
    mount_total = params.mounting_per_watt * watts
    lines.append(BOMLine(
        "MOUNTING", "โครงยึดแผง (Mounting)", "ATMOCE",
        "ติดตั้ง", 1, "เหมา", mount_total, mount_total,
        notes=f"{params.mounting_per_watt} บาท/วัตต์ × {watts:,.0f} W",
    ))

    # Cable AC
    lines.append(BOMLine(
        "CABLE-AC", "สายไฟ AC", "-",
        "สายไฟ", 1, "เหมา", params.cable_ac_fixed, params.cable_ac_fixed,
    ))

    # Atmoce Cable set — 2:1-1P sheet quirks:
    #   • MW-025013-A unit price = 800 (sheet cell J23 literal, overrides Price List 500)
    #   • MT-04003-A and MT-04002-2in1 are DISPLAYED in the BOM but their
    #     cost is NOT summed into the total (sheet SUM(L23:L24) only, not L25:L26).
    #     We mark them as 0-cost line items with a note for clarity.
    mw_013_price = _SHEET_QUIRK_MW_025013_A_2to1_1p
    mw_020 = _p(prices, "MW-025020-B0")
    mt_03 = _p(prices, "MT-04003-A")
    mt_02 = _p(prices, "MT-04002-2in1")

    mw_013_qty = inverters
    mw_020_qty = inverters
    mt_03_qty = _mt_04003_a_qty(kwp)
    mt_02_qty = _mt_04002_2in1_qty_1p(solarbox, panels)

    lines.append(BOMLine("MW-025013-A", "1.3 m Three-terminal AC Cable",
                        "ATMOCE", "สายไฟ", mw_013_qty, "ชิ้น", mw_013_price,
                        mw_013_price * mw_013_qty,
                        notes="sheet override: 800 บาท/ชิ้น (vs Price List 500)"))
    lines.append(BOMLine("MW-025020-B0", "AC Extension Cable 2.0m",
                        "ATMOCE", "สายไฟ", mw_020_qty, "ชิ้น", mw_020, mw_020 * mw_020_qty))
    lines.append(BOMLine("MT-04003-A", "Single-phase junction adapter 40A-3cores",
                        "ATMOCE", "สายไฟ", mt_03_qty, "ชิ้น", mt_03, 0,
                        notes="sheet excludes from total (SUM range L23:L24 only)"))
    lines.append(BOMLine("MT-04002-2in1", "2in1 AC junction connector 40A-2cores",
                        "ATMOCE", "สายไฟ", mt_02_qty, "ชิ้น", mt_02, 0,
                        notes="sheet excludes from total"))

    # Conduit
    conduit_total = params.conduit_per_watt * watts
    lines.append(BOMLine(
        "CONDUIT", "ท่อร้อยสาย (Conduit)", "-",
        "ติดตั้ง", 1, "เหมา", conduit_total, conduit_total,
        notes=f"{params.conduit_per_watt} บาท/วัตต์ × {watts:,.0f} W",
    ))

    # SolarBox MC100
    sb_price = _p(prices, "MC100")
    lines.append(BOMLine(
        "MC100", "SolarBox MC100 (3-input)", "ATMOCE",
        "SolarBox", 1, "ชุด", sb_price, sb_price,
    ))

    # Grounding / Installation / Service / Permit
    lines.append(BOMLine("GROUND", "ระบบ Grounding", "-",
                        "ติดตั้ง", 1, "เหมา", params.grounding_fixed, params.grounding_fixed))
    install_total = params.installation_per_watt * watts
    lines.append(BOMLine("INSTALL", "ค่าติดตั้ง (Installation)", "-",
                        "ติดตั้ง", 1, "เหมา", install_total, install_total,
                        notes=f"{params.installation_per_watt} บาท/วัตต์ × {watts:,.0f} W"))
    lines.append(BOMLine("SERVICE", "ค่าบริการ (Service)", "-",
                        "บริการ", 1, "เหมา", params.service_fixed, params.service_fixed))
    lines.append(BOMLine("PERMIT", "ค่าขออนุญาต (Permit)", "-",
                        "บริการ", 1, "เหมา", params.permit_fixed, params.permit_fixed))

    return lines, inverters


def _build_1to1_3p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels)  # 1 MI-500 per panel (same as 1:1-1P)
    watts = panels * params.panel_wp
    kwp = watts / 1000.0

    lines: List[BOMLine] = []

    # Solar Panel
    panel_unit = params.panel_wp * params.panel_price_per_watt
    lines.append(BOMLine(
        "PANEL-670W", f"แผงโซลาร์ {params.panel_wp}Wp", "ATMOCE",
        "โมดูล", panels, "แผง", panel_unit, panel_unit * panels,
    ))

    # Inverter
    mi500 = _p(prices, "MI-500")
    lines.append(BOMLine(
        "MI-500", "Single Phase Micro Inverter 500W", "ATMOCE",
        "อินเวอร์เตอร์", inverters, "ตัว", mi500, mi500 * inverters,
    ))

    # Mounting
    mount_total = params.mounting_per_watt * watts
    lines.append(BOMLine(
        "MOUNTING", "โครงยึดแผง (Mounting)", "ATMOCE",
        "ติดตั้ง", 1, "เหมา", mount_total, mount_total,
        notes=f"{params.mounting_per_watt} บาท/วัตต์ × {watts:,.0f} W",
    ))

    # Cable AC
    lines.append(BOMLine(
        "CABLE-AC", "สายไฟ AC", "-",
        "สายไฟ", 1, "เหมา", params.cable_ac_fixed, params.cable_ac_fixed,
    ))

    # Atmoce Cable — 1:1 3P = MW-025013-A + MT-04003-A (+ MT-04002-2in1 at qty 0)
    # Sheet quirk: MT-04003-A formula (D52) references cell B43 which holds the
    # label text "PV Wp", not the kWp number. Text>number in Excel, so every
    # bracket condition fails and the IF chain returns 3. We match that.
    mw_013 = _p(prices, "MW-025013-A")
    mt_03 = _p(prices, "MT-04003-A")
    mt_02 = _p(prices, "MT-04002-2in1")
    mw_013_qty = panels
    mt_03_qty = 3  # sheet hardcoded due to B43-label bug (see above)
    mt_02_qty = 0  # D53 formula returns 0 for 1:1-3P

    lines.append(BOMLine("MW-025013-A", "1.3 m Three-terminal AC Cable",
                        "ATMOCE", "สายไฟ", mw_013_qty, "ชิ้น", mw_013, mw_013 * mw_013_qty))
    lines.append(BOMLine("MT-04003-A", "Single-phase junction adapter 40A-3cores",
                        "ATMOCE", "สายไฟ", mt_03_qty, "ชิ้น", mt_03, mt_03 * mt_03_qty,
                        notes="sheet hardcodes qty=3 in 1:1-3P (D52 references label cell)"))
    lines.append(BOMLine("MT-04002-2in1", "2in1 AC junction connector 40A-2cores",
                        "ATMOCE", "สายไฟ", mt_02_qty, "ชิ้น", mt_02, 0))

    # Conduit
    conduit_total = params.conduit_per_watt * watts
    lines.append(BOMLine(
        "CONDUIT", "ท่อร้อยสาย (Conduit)", "-",
        "ติดตั้ง", 1, "เหมา", conduit_total, conduit_total,
        notes=f"{params.conduit_per_watt} บาท/วัตต์ × {watts:,.0f} W",
    ))

    # SolarBox MC100T — qty = ROUNDUP(kWp/60, 0), but sheet uses F43/60 = kWp/60
    # Actually D58: =ROUNDUP(F43/60,0) and F43 = 10.72 → ceil(10.72/60) = 1
    mc100t = _p(prices, "MC100T")
    mc100t_qty = _ru(kwp / 60)
    if mc100t_qty == 0:
        mc100t_qty = 1
    lines.append(BOMLine(
        "MC100T", "SolarBox MC100T (Three-phase, 2-input)", "ATMOCE",
        "SolarBox", mc100t_qty, "ชุด", mc100t, mc100t * mc100t_qty,
    ))

    # Grounding / Installation / Service / Permit
    lines.append(BOMLine("GROUND", "ระบบ Grounding", "-",
                        "ติดตั้ง", 1, "เหมา", params.grounding_fixed, params.grounding_fixed))
    install_total = params.installation_per_watt * watts
    lines.append(BOMLine("INSTALL", "ค่าติดตั้ง (Installation)", "-",
                        "ติดตั้ง", 1, "เหมา", install_total, install_total,
                        notes=f"{params.installation_per_watt} บาท/วัตต์ × {watts:,.0f} W"))
    lines.append(BOMLine("SERVICE", "ค่าบริการ (Service)", "-",
                        "บริการ", 1, "เหมา", params.service_fixed, params.service_fixed))
    lines.append(BOMLine("PERMIT", "ค่าขออนุญาต (Permit)", "-",
                        "บริการ", 1, "เหมา", params.permit_fixed, params.permit_fixed))

    return lines, inverters


def _build_2to1_3p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels / 2)
    watts = panels * params.panel_wp
    kwp = watts / 1000.0

    # SolarBox selection by panel count (sheet H58 formula)
    if panels < 30:
        solarbox = "MC100T"
    elif panels < 60:
        solarbox = "MC100-Wye-4in1"
    else:
        solarbox = "MC100-Wye-8in1"

    lines: List[BOMLine] = []

    # Solar Panel
    panel_unit = params.panel_wp * params.panel_price_per_watt
    lines.append(BOMLine(
        "PANEL-670W", f"แผงโซลาร์ {params.panel_wp}Wp", "ATMOCE",
        "โมดูล", panels, "แผง", panel_unit, panel_unit * panels,
    ))

    # Inverter
    mi1250 = _p(prices, "MI-1250")
    lines.append(BOMLine(
        "MI-1250", "Single Phase Micro Inverter 1250W (15yr warranty)", "ATMOCE",
        "อินเวอร์เตอร์", inverters, "ตัว", mi1250, mi1250 * inverters,
    ))

    # Mounting
    mount_total = params.mounting_per_watt * watts
    lines.append(BOMLine(
        "MOUNTING", "โครงยึดแผง (Mounting)", "ATMOCE",
        "ติดตั้ง", 1, "เหมา", mount_total, mount_total,
        notes=f"{params.mounting_per_watt} บาท/วัตต์ × {watts:,.0f} W",
    ))

    # Cable AC
    lines.append(BOMLine(
        "CABLE-AC", "สายไฟ AC", "-",
        "สายไฟ", 1, "เหมา", params.cable_ac_fixed, params.cable_ac_fixed,
    ))

    # Atmoce Cable — 2:1 3P = MWX-040030-B/30 + MT-03505-A + MA-CAP-003
    mwx = _p(prices, "MWX-040030-B/30")
    mt_35 = _p(prices, "MT-03505-A")
    ma_cap = _p(prices, "MA-CAP-003")

    mwx_qty = inverters              # K51 = K47
    mt_35_qty = _ru(inverters / 15)  # K52 = ROUNDUP(K47/15, 0)
    ma_cap_qty = _ru(inverters / 15) # K53 = same

    lines.append(BOMLine("MWX-040030-B", "3.0m 4mm² Three-phase 4-core AC cable (per cable)",
                        "ATMOCE", "สายไฟ", mwx_qty, "ชิ้น", mwx, mwx * mwx_qty,
                        notes="1 roll = 30 cables (21,850 ÷ 30)"))
    lines.append(BOMLine("MT-03505-A", "Three-phase cable connector 35A-5cores",
                        "ATMOCE", "สายไฟ", mt_35_qty, "ชิ้น", mt_35, mt_35 * mt_35_qty))
    lines.append(BOMLine("MA-CAP-003", "Three-phase AC Cable sealing cap",
                        "ATMOCE", "สายไฟ", ma_cap_qty, "ชิ้น", ma_cap, ma_cap * ma_cap_qty))

    # Conduit
    conduit_total = params.conduit_per_watt * watts
    lines.append(BOMLine(
        "CONDUIT", "ท่อร้อยสาย (Conduit)", "-",
        "ติดตั้ง", 1, "เหมา", conduit_total, conduit_total,
        notes=f"{params.conduit_per_watt} บาท/วัตต์ × {watts:,.0f} W",
    ))

    # SolarBox
    sb_price = _p(prices, solarbox)
    sb_qty = _ru(kwp / 150)
    if sb_qty == 0:
        sb_qty = 1
    lines.append(BOMLine(
        solarbox, f"SolarBox {solarbox}", "ATMOCE",
        "SolarBox", sb_qty, "ชุด", sb_price, sb_price * sb_qty,
    ))

    # AC MCB 32A 3P — free item in sheet (qty=1, price=0)
    lines.append(BOMLine(
        "AC-MCB-32A-3P", "AC MCB 32A 3P", "-",
        "อุปกรณ์ไฟฟ้า", 1, "ตัว", 0, 0,
        notes="ราคารวมแล้วใน SolarBox",
    ))

    # Grounding / Installation / Service / Permit
    lines.append(BOMLine("GROUND", "ระบบ Grounding", "-",
                        "ติดตั้ง", 1, "เหมา", params.grounding_fixed, params.grounding_fixed))
    install_total = params.installation_per_watt * watts
    lines.append(BOMLine("INSTALL", "ค่าติดตั้ง (Installation)", "-",
                        "ติดตั้ง", 1, "เหมา", install_total, install_total,
                        notes=f"{params.installation_per_watt} บาท/วัตต์ × {watts:,.0f} W"))
    lines.append(BOMLine("SERVICE", "ค่าบริการ (Service)", "-",
                        "บริการ", 1, "เหมา", params.service_fixed, params.service_fixed))
    lines.append(BOMLine("PERMIT", "ค่าขออนุญาต (Permit)", "-",
                        "บริการ", 1, "เหมา", params.permit_fixed, params.permit_fixed))

    return lines, inverters


# ────────────────────────────────────────────────────────────────
# C&I 3-Phase builder (from C&I_MI-1250 sheet)
# Component-only BOM (no per-watt labor) — mirrors distributor
# ordering template, not SRP Calculation sheet.
# ────────────────────────────────────────────────────────────────
def _build_ci_3p(panels: int, prices, params) -> tuple[List[BOMLine], int]:
    inverters = _ru(panels / 2)  # MI-1250, 2 panels per inverter
    watts = panels * params.panel_wp
    kwp = watts / 1000.0

    # SolarBox: 4in1 ≤60 inverters, 8in1 >60 (max 120)
    solarbox = "MC100-Wye-4in1" if inverters <= 60 else "MC100-Wye-8in1"

    lines: List[BOMLine] = []

    # Solar Panel
    panel_unit = params.panel_wp * params.panel_price_per_watt
    lines.append(BOMLine(
        "PANEL-670W", f"แผงโซลาร์ {params.panel_wp}Wp", "ATMOCE",
        "โมดูล", panels, "แผง", panel_unit, panel_unit * panels,
    ))

    # Inverter MI-1250
    mi1250 = _p(prices, "MI-1250")
    lines.append(BOMLine(
        "MI-1250", "Single Phase Micro Inverter 1250W (15yr warranty)", "ATMOCE",
        "อินเวอร์เตอร์", inverters, "ตัว", mi1250, mi1250 * inverters,
    ))

    # SolarBox (Wye series)
    sb_price = _p(prices, solarbox)
    lines.append(BOMLine(
        solarbox, f"SolarBox {solarbox}", "ATMOCE",
        "SolarBox", 1, "ชุด", sb_price, sb_price,
        notes=f"รองรับ MI สูงสุด {'60' if solarbox == 'MC100-Wye-4in1' else '120'} ตัว",
    ))

    # AC Cables — MWX-040030-B: ceil(inverters/30) rolls, per-cable price
    mwx = _p(prices, "MWX-040030-B/30")
    mwx_rolls = _ru(inverters / 30)
    mwx_cables = mwx_rolls * 30  # buy in full rolls, note how many cables used
    lines.append(BOMLine(
        "MWX-040030-B", "3.0m 4mm² Three-phase 4-core AC cable (per cable)",
        "ATMOCE", "สายไฟ", mwx_cables, "ชิ้น", mwx, mwx * mwx_cables,
        notes=f"{mwx_rolls} roll(s) × 30 cables (used {inverters})",
    ))

    # Cable connectors — 1 per array of 15 inverters
    arrays = _ru(inverters / 15)
    mt_35 = _p(prices, "MT-03505-A")
    ma_cap = _p(prices, "MA-CAP-003")
    lines.append(BOMLine("MT-03505-A", "Three-phase cable connector 35A-5cores",
                         "ATMOCE", "สายไฟ", arrays, "ชิ้น", mt_35, mt_35 * arrays))
    lines.append(BOMLine("MA-CAP-003", "Three-phase AC Cable sealing cap",
                         "ATMOCE", "สายไฟ", arrays, "ชิ้น", ma_cap, ma_cap * arrays))

    # Mounting / conduit / install / service / permit (same as other configs)
    mount_total = params.mounting_per_watt * watts
    lines.append(BOMLine("MOUNTING", "โครงยึดแผง (Mounting)", "ATMOCE",
                         "ติดตั้ง", 1, "เหมา", mount_total, mount_total,
                         notes=f"{params.mounting_per_watt} บาท/วัตต์ × {watts:,.0f} W"))
    lines.append(BOMLine("CABLE-AC", "สายไฟ AC", "-",
                         "สายไฟ", 1, "เหมา", params.cable_ac_fixed, params.cable_ac_fixed))
    conduit_total = params.conduit_per_watt * watts
    lines.append(BOMLine("CONDUIT", "ท่อร้อยสาย (Conduit)", "-",
                         "ติดตั้ง", 1, "เหมา", conduit_total, conduit_total,
                         notes=f"{params.conduit_per_watt} บาท/วัตต์ × {watts:,.0f} W"))
    lines.append(BOMLine("GROUND", "ระบบ Grounding", "-",
                         "ติดตั้ง", 1, "เหมา", params.grounding_fixed, params.grounding_fixed))
    install_total = params.installation_per_watt * watts
    lines.append(BOMLine("INSTALL", "ค่าติดตั้ง (Installation)", "-",
                         "ติดตั้ง", 1, "เหมา", install_total, install_total,
                         notes=f"{params.installation_per_watt} บาท/วัตต์ × {watts:,.0f} W"))
    lines.append(BOMLine("SERVICE", "ค่าบริการ (Service)", "-",
                         "บริการ", 1, "เหมา", params.service_fixed, params.service_fixed))
    lines.append(BOMLine("PERMIT", "ค่าขออนุญาต (Permit)", "-",
                         "บริการ", 1, "เหมา", params.permit_fixed, params.permit_fixed))

    return lines, inverters


# ────────────────────────────────────────────────────────────────
# Battery + Backup + Warranty addon helpers
# ────────────────────────────────────────────────────────────────
def _append_battery_backup(
    lines: List[BOMLine],
    prices: Dict[str, float],
    phase: str,
    battery_kwh: int = 0,
    backup: bool = False,
    warranty_years: int = 0,
    inverter_count: int = 0,
) -> None:
    """Append battery / backup / warranty lines in-place."""
    # Battery — MS-7K-U (7kWh each); max 3 units 1P, max 6 units 3P
    if battery_kwh > 0:
        batt_qty = _ru(battery_kwh / 7)
        batt_max = 6 if phase == "3P" else 3
        batt_qty = min(batt_qty, batt_max)
        bp = _p(prices, "MS-7K-U")
        lines.append(BOMLine(
            "MS-7K-U", "7kWh M-Battery", "ATMOCE",
            "battery", batt_qty, "ก้อน", bp, bp * batt_qty,
            notes=f"{batt_qty}×7kWh = {batt_qty * 7}kWh (max {batt_max} for {phase})",
        ))

    # Backup Box
    if backup:
        bu_key = "MU100T" if phase == "3P" else "MU100S"
        bu_desc = "Three-phase Backup Box" if phase == "3P" else "Single-phase Backup Box"
        bup = _p(prices, bu_key)
        lines.append(BOMLine(
            bu_key, bu_desc, "ATMOCE",
            "backup", 1, "ชุด", bup, bup,
        ))

    # Warranty extension (MI-1250 only)
    if warranty_years in (5, 10) and inverter_count > 0:
        w_key = "MI-1250-P5" if warranty_years == 5 else "MI-1250-P10"
        w_desc = f"MI-1250 Warranty +{warranty_years}yr"
        wp = _p(prices, w_key)
        lines.append(BOMLine(
            w_key, w_desc, "ATMOCE",
            "warranty", inverter_count, "ตัว", wp, wp * inverter_count,
            notes=f"warranty extension {warranty_years}yr × {inverter_count} inverters",
        ))


# ────────────────────────────────────────────────────────────────
# Public API
# ────────────────────────────────────────────────────────────────
_BUILDERS = {
    "1:1-1P": _build_1to1_1p,
    "2:1-1P": _build_2to1_1p,
    "1:1-3P": _build_1to1_3p,
    "2:1-3P": _build_2to1_3p,
    "C&I-3P": _build_ci_3p,
}


def calculate_srp(
    config: str = '2:1-1P',
    panels: int = 10,
    prices: Optional[Dict[str, float]] = None,
    params: Optional[SRPParams] = None,
    battery_kwh: int = 0,
    backup: bool = False,
    warranty_years: int = 0,
    **kwargs: Any,
) -> Any:
    """Calculate SRP BOM + totals for a given ATMOCE configuration or system.

    Supports legacy SRP configuration names ('1:1-1P', '2:1-1P', '1:1-3P', '2:1-3P', 'C&I-3P')
    returning SRPResult object, as well as N2 system keys ('atmoce21', 'atmoce11', etc.)
    returning N2 dict output.
    """
    if config not in _BUILDERS and (kwargs or config in ('atmoce21', 'atmoce11', 'sigenergy5in1', 'sigenneo', 'sigenci', 'atmoce_ac')):
        res = calculate_bom_n2(system=config, panels=panels, battery_kwh=battery_kwh, backup=backup, **kwargs)
        if isinstance(res, dict):
            res['offer_price'] = res.get('sale_price', 0.0)
        return res

    """Calculate SRP BOM + totals for a given ATMOCE configuration.

    Args:
        config:        one of '1:1-1P', '2:1-1P', '1:1-3P', '2:1-3P', 'C&I-3P'
        panels:        number of solar panels
        prices:        catalog price dict; falls back to PRICES_ATMOCE_DEFAULT
        params:        sheet-level parameters; defaults from SRPParams()
        battery_kwh:   desired battery capacity in kWh (0 = none); MS-7K-U 7kWh each
        backup:        True to add Backup Box (MU100S for 1P, MU100T for 3P)
        warranty_years: warranty extension for MI-1250 (5 or 10; 0 = none)
    """
    if config not in _BUILDERS:
        raise ValueError(f"Unknown config {config!r}. Expected one of {list(_BUILDERS)}")
    if panels <= 0:
        raise ValueError(f"panels must be positive, got {panels}")

    prices = prices if prices is not None else PRICES_ATMOCE_DEFAULT
    params = params if params is not None else SRPParams()

    lines, inverters = _BUILDERS[config](panels, prices, params)

    # Phase derived from config suffix
    phase = "3P" if config.endswith("3P") else "1P"

    _append_battery_backup(lines, prices, phase, battery_kwh, backup, warranty_years, inverters)

    total_cost = sum(line.total_cost for line in lines)
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


# ────────────────────────────────────────────────────────────────
# Reconstruction helper — used by bomsolar_generate_pdf to rebuild
# SRPResult from a saved cost_summary dict + raw item list.
# ────────────────────────────────────────────────────────────────
def srp_result_from_dict(cost_summary: dict, items_raw: list) -> SRPResult:
    """Reconstruct a minimal SRPResult from saved cost_summary + raw item dicts.

    Called by bomsolar_generate_pdf when the LINE bot re-generates a PDF
    from a previously saved BOM (lastBom) that carried srp_config metadata.
    """
    bom_lines = [
        BOMLine(
            part_number=it.get("part_number", ""),
            part_name=it.get("part_name", ""),
            manufacturer=it.get("manufacturer", ""),
            category=it.get("category", ""),
            quantity=float(it.get("quantity", 0)),
            unit=it.get("unit", "-"),
            unit_cost=float(it.get("unit_cost", 0)),
            total_cost=float(it.get("total_cost", 0)),
            notes=it.get("notes", ""),
        )
        for it in (items_raw or [])
    ]

    config = cost_summary.get("srp_config", "?")
    panels = int(cost_summary.get("srp_panels", 0))
    kwp = float(cost_summary.get("srp_kwp", 0.0))
    inverter_count = int(cost_summary.get("srp_inverter_count", 0))

    return SRPResult(
        config=config,
        panels=panels,
        kwp=kwp,
        inverter_count=inverter_count,
        lines=bom_lines,
        total_cost=float(cost_summary.get("equipment_total", 0)),
        profit=float(cost_summary.get("profit_30pct", 0)),
        vat=float(cost_summary.get("vat_7pct", 0)),
        offer_price=float(cost_summary.get("grand_total", 0)),
        battery_kwh=int(cost_summary.get("battery_kwh", 0)),
        has_backup=bool(cost_summary.get("has_backup", False)),
        warranty_years=int(cost_summary.get("warranty_years", 0)),
    )


def lookup_catalog_item(catalog_data: Dict[str, Any], tab_name: str, key: str) -> Optional[float]:
    """
    Lookup unit cost from parsed catalog data for a given item key.
    Supports exact match, case-insensitive match, and word-bounded prefix match.
    Returns None if missing.
    """
    if not catalog_data:
        return None

    c = catalog_data.get(tab_name, {})
    if not c:
        # Search all catalog pools
        for t, content in catalog_data.items():
            if isinstance(content, dict) and t != "raw_tabs":
                res = lookup_catalog_item({"target": content}, "target", key)
                if res is not None:
                    return res
        return None

    if not isinstance(c, dict):
        return None

    kc = key.strip().casefold()

    # 1. Exact match
    if key in c and isinstance(c[key], dict):
        return c[key].get("cost")
    elif key in c and isinstance(c[key], (int, float)):
        return float(c[key])

    # 2. Case-insensitive exact match
    for k, v in c.items():
        if k.strip().casefold() == kc:
            if isinstance(v, dict):
                return v.get("cost")
            elif isinstance(v, (int, float)):
                return float(v)

    # 3. Word boundary match (e.g. 'MC100' matching 'MC100 Warranty 5 year' but not 'MC100L')
    pattern = r'\b' + re.escape(kc) + r'\b'
    for k, v in c.items():
        k_cf = k.strip().casefold()
        if re.search(pattern, k_cf):
            if isinstance(v, dict):
                return v.get("cost")
            elif isinstance(v, (int, float)):
                return float(v)

    # 4. Substring / Alias match
    alias_map = {
        "andsolar amcp power optimizer": "Optimizer2:1",
        "andsolar amcp": "Optimizer2:1",
        "optimizer": "Optimizer2:1",
    }
    for alias_key, target in alias_map.items():
        if alias_key in kc:
            return lookup_catalog_item(catalog_data, tab_name, target)

    for k, v in c.items():
        k_cf = k.strip().casefold()
        if kc in k_cf or k_cf in kc:
            if isinstance(v, dict):
                return v.get("cost")
            elif isinstance(v, (int, float)):
                return float(v)

    return None



def qc_mea_fee(kw: float) -> float:

    """Calculate MEA/PEA grid connection fee based on system kW (matching qcMeaFee in theme)."""
    if kw <= 0:
        return 0.0
    tiers = [
        (10, 6000.0),
        (20, 8500.0),
        (30, 12500.0),
        (40, 15500.0),
        (100, 21500.0),
        (200, 24000.0),
        (500, 36000.0),
        (1000, 46000.0),
    ]
    for max_kw, fee in tiers:
        if kw <= max_kw:
            return fee
    return 46000.0


def calculate_bom_n2(

    system: str = "atmoce21",
    panels: int = 0,
    ratio: Optional[str] = None,
    phase: str = "1P",
    kw: float = 0.0,
    battery_kwh: float = 0.0,
    battery_sku: Optional[str] = None,
    backup: bool = False,
    c_rate: Optional[str] = None,
    warr: Optional[str] = None,
    warranty_years: Optional[Any] = None,
    melv16: bool = False,
    roof_type: str = "metal",
    rows: int = 1,
    trunk_cable_length: str = "2.5",
    catalog_data: Optional[Dict[str, Any]] = None,
    qpkg_data: Optional[Dict[str, Any]] = None,
    fixture_filename: str = "pricelist_fixture.json",
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Unified BOM & Cost Breakdown Engine (N2).
    Outputs cost breakdown lines matching theme qcCostBreakdownLines format.
    """
    sys_norm = str(system).strip().lower().replace(" ", "")
    if sys_norm in ("atmoce21", "2:1", "atmoce"):
        sys_key = "atmoce21"
    elif sys_norm in ("atmoce11", "1:1"):
        sys_key = "atmoce11"
    elif sys_norm in ("atmoce_ac", "atmoceac", "accoupling"):
        sys_key = "atmoce_ac"
    elif sys_norm in ("sigenergy5in1", "sigenergy", "5in1", "sigen5in1"):
        sys_key = "sigenergy5in1"
    elif sys_norm in ("sigenneo", "neo"):
        sys_key = "sigenneo"
    elif sys_norm in ("sigenci", "ci", "c&i"):
        sys_key = "sigenci"
    else:
        sys_key = "atmoce21"

    phase_norm = "3P" if ("3" in str(phase).upper() or "3P" in str(phase).upper()) else "1P"

    # Load Catalog & QPKG data if not provided
    if catalog_data is None:
        raw_price = survey_catalog.fetch_pricelist(fixture_filename=fixture_filename)
        catalog_data = survey_catalog.parse_pricelist_catalog(raw_price.get("tabs", {}))
        synced_at = raw_price.get("synced_at")
    else:
        synced_at = catalog_data.get("synced_at")

    if qpkg_data is None:
        try:
            qpkg_data = survey_catalog.fetch_qpkg()
        except Exception:
            qpkg_data = {}

    # Thai timestamp
    if synced_at and isinstance(synced_at, (int, float)):
        tz_th = timezone(timedelta(hours=7))
        dt = datetime.fromtimestamp(synced_at, tz=tz_th)
        synced_at_thai = dt.strftime("%d/%m/%Y %H:%M:%S")
    else:
        synced_at_thai = "ไม่ระบุเวลา"

    # --- Step 1: Resolve Package & Quantities ---
    panel_watt = 650
    if panels <= 0 and kw > 0:
        panels = math.ceil((kw * 1000.0) / panel_watt)

    kwp = (panels * panel_watt) / 1000.0 if sys_key != "atmoce_ac" else 0.0

    # Package Sale Price & Label matching qpkg
    pkg_sale_price = 0.0
    package_label = ""
    pkg_kw_val = 0.0
    if isinstance(qpkg_data, dict) and sys_key in qpkg_data:
        sys_qpkg = qpkg_data[sys_key]
        phase_key = "3" if phase_norm == "3P" else "1"
        pkg_list = sys_qpkg.get(phase_key, [])
        for pkg in pkg_list:
            pkg_panel_count = -1
            try:
                if pkg[1] != "":
                    pkg_panel_count = int(pkg[1])
            except Exception:
                pass
            if len(pkg) >= 3 and (pkg_panel_count == panels or sys_key == "atmoce_ac"):
                kw_str = f"{pkg[0]}kW" if str(pkg[0]).replace(".", "").isdigit() else str(pkg[0])
                sys_title = "Residential" if sys_key in ("atmoce21", "atmoce11") else sys_qpkg.get('name', sys_key)
                package_label = f"{sys_title} {kw_str} ({panels} แผง {phase_norm})" if panels > 0 else f"{sys_title} ({kw_str})"
                try:
                    pkg_sale_price = float(pkg[2])
                except Exception:
                    pkg_sale_price = 0.0
                try:
                    pkg_kw_val = float(pkg[0])
                except Exception:
                    pass
                break

    if not package_label:
        package_label = f"{sys_key} ({panels} แผง {phase_norm})"

    # --- Step 2: Build Line Items by Section (A, A2, B, C, C2, D) ---
    raw_lines: List[Dict[str, Any]] = []

    # === SECTION A: อุปกรณ์หลัก ===
    # A1. Solar Panels (if not AC Coupling)
    if sys_key != "atmoce_ac" and panels > 0:
        panel_sku = "AIKO AIKO-G650-MCH72Mw"
        raw_lines.append({
            "k": "panel", "s": "A", "n": panel_sku, "q": panels, "u": "แผง",
            "tab": "solar_panels", "lookup_key": panel_sku
        })

    # A2. Inverters & Hardware
    if sys_key in ("atmoce21", "atmoce11"):
        per = 2 if sys_key == "atmoce21" else 1
        micro_sku = "MI-1250" if sys_key == "atmoce21" else "MI-500"
        micro_qty = math.ceil(panels / per)
        raw_lines.append({
            "k": "inv", "s": "A", "n": micro_sku, "q": micro_qty, "u": "เครื่อง",
            "tab": "atmoce_inverters", "lookup_key": micro_sku
        })

        # Micro AC Trunk Cable (2.5m default, 1.3m if requested)
        trunk_sku = "MW-025013-A" if str(trunk_cable_length).strip() in ("1.3", "1.3m") else "MW-025025-A"
        raw_lines.append({
            "k": "accable", "s": "A", "n": trunk_sku, "q": micro_qty, "u": "เส้น",
            "tab": "atmoce_inverters", "lookup_key": trunk_sku
        })

        # Extension Cable 2.0m for atmoce21
        if sys_key == "atmoce21":
            raw_lines.append({
                "k": "acext", "s": "A", "n": "MW-025020-B0", "q": micro_qty, "u": "เส้น",
                "tab": "atmoce_inverters", "lookup_key": "MW-025020-B0"
            })

        # Warranty Add-on (MI-1250-P5 / MI-1250-P10)
        warr_val = str(warr or warranty_years or kwargs.get("warr") or kwargs.get("warranty_years") or "").strip().lower()
        if sys_key == "atmoce21" and micro_qty > 0 and warr_val in ("p5", "p10", "20", "25", "20ปี", "25ปี"):
            warr_sku = "MI-1250-P5" if warr_val in ("p5", "20", "20ปี") else "MI-1250-P10"
            raw_lines.append({
                "k": "warr", "s": "A", "n": warr_sku, "q": micro_qty, "u": "ชุด",
                "tab": "atmoce_inverters", "lookup_key": warr_sku
            })

        # Combiner Box
        comb_sku = "MC100T" if phase_norm == "3P" else ("MC100L" if panels < 9 else "MC100")
        raw_lines.append({
            "k": "comb", "s": "A", "n": comb_sku, "q": 1, "u": "ตู้",
            "tab": "atmoce_inverters", "lookup_key": comb_sku
        })

        # Junction Adapter
        junc_sku = "MT-03205-A" if phase_norm == "3P" else "MT-04003-A"
        junc_qty = math.ceil(micro_qty / 15) if phase_norm == "3P" else (1 if micro_qty < 12 else (2 if micro_qty < 25 else math.ceil(micro_qty / 12)))
        raw_lines.append({
            "k": "junction", "s": "A", "n": junc_sku, "q": junc_qty, "u": "ชุด",
            "tab": "atmoce_inverters", "lookup_key": junc_sku
        })

        # Battery & Backup if requested
        melv16_val = bool(melv16 or kwargs.get("melv16", False))
        if battery_sku or battery_kwh > 0 or melv16_val:
            if melv16_val or "16k" in str(battery_sku).lower() or battery_kwh >= 16:
                batt_qty = math.ceil(battery_kwh / 16.0) if battery_kwh > 0 else 1
                raw_lines.append({
                    "k": "batt", "s": "A", "n": "MS-16k-U", "q": batt_qty, "u": "ชุด",
                    "tab": "atmoce_inverters", "lookup_key": "MS-16k-U"
                })
                raw_lines.append({
                    "k": "batt:scu", "s": "A", "n": "MS-SCU-CIN", "q": 1, "u": "ชุด",
                    "tab": "atmoce_inverters", "lookup_key": "MS-SCU-CIN"
                })
                raw_lines.append({
                    "k": "batt:accb", "s": "A", "n": "MS-ACCB-CNI", "q": 1, "u": "ชุด",
                    "tab": "atmoce_inverters", "lookup_key": "MS-ACCB-CNI"
                })
            else:
                batt_qty = math.ceil(battery_kwh / 7.0) if battery_kwh > 0 else 1
                raw_lines.append({
                    "k": "batt", "s": "A", "n": "MS-7K-U", "q": batt_qty, "u": "ก้อน",
                    "tab": "atmoce_inverters", "lookup_key": "MS-7K-U"
                })
            backup = True

        if backup:
            bu_sku = "MU100T" if phase_norm == "3P" else "MU100S"
            raw_lines.append({
                "k": "backup", "s": "A", "n": bu_sku, "q": 1, "u": "ตู้",
                "tab": "atmoce_inverters", "lookup_key": bu_sku
            })

    elif sys_key == "atmoce_ac":
        batt_qty = math.ceil(battery_kwh / 7.0) if battery_kwh > 0 else 1
        raw_lines.append({
            "k": "batt", "s": "A", "n": "MS-7K-U", "q": batt_qty, "u": "ก้อน",
            "tab": "atmoce_inverters", "lookup_key": "MS-7K-U"
        })
        bu_sku = "MU100T" if phase_norm == "3P" else "MU100S"
        raw_lines.append({
            "k": "backup", "s": "A", "n": bu_sku, "q": 1, "u": "ตู้",
            "tab": "atmoce_inverters", "lookup_key": bu_sku
        })

    elif sys_key in ("sigenergy5in1", "sigenneo"):
        inv_kw_num = pkg_kw_val if pkg_kw_val > 0 else (kw if kw > 0 else kwp)
        inv_kw_str = f"{inv_kw_num:.1f}"
        inv_suffix = "TP" if phase_norm == "3P" else "SP"

        if sys_key == "sigenergy5in1":
            inv_model = f"SigenStor EC {inv_kw_str} {inv_suffix}"
        else:
            inv_model = f"SigenStor Neo {inv_kw_str} {inv_suffix}"

        raw_lines.append({
            "k": "inv", "s": "A", "n": inv_model, "q": 1, "u": "เครื่อง",
            "tab": "sigenergy_items", "lookup_key": inv_model
        })

        # Optimizer (default 2:1 ratio for Sigenergy)
        opt_qty = math.ceil(panels / 2) if panels > 0 else 0
        if opt_qty > 0:
            raw_lines.append({
                "k": "amcp", "s": "A", "n": "AndSolar AMCP Power Optimizer", "q": opt_qty, "u": "ตัว",
                "tab": "sigenergy_items", "lookup_key": "Optimizer2:1"
            })

        # Battery if requested
        if battery_kwh > 0:
            batt_model = "SigenStor BAT 6.0" if sys_key == "sigenergy5in1" else "SigenStor Neo BAT 6.0"
            batt_qty = math.ceil(battery_kwh / 6.0)
            raw_lines.append({
                "k": "batt", "s": "A", "n": batt_model, "q": batt_qty, "u": "ชุด",
                "tab": "sigenergy_items", "lookup_key": batt_model
            })

    elif sys_key == "sigenci":
        # C&I Inverter selection: backup -> HYB, battery no backup -> HYA, no battery -> PV
        ci_kw = kw if kw > 0 else (kwp if kwp > 0 else 110.0)
        ci_kw_int = int(ci_kw)
        if backup:
            inv_model = f"Sigen PV {ci_kw_int}M1-HYB"
        elif battery_kwh > 0:
            inv_model = f"Sigen PV {ci_kw_int}M1-HYA"
        else:
            inv_model = f"Sigen PV {ci_kw_int}M1"

        raw_lines.append({
            "k": "inv", "s": "A", "n": inv_model, "q": 1, "u": "เครื่อง",
            "tab": "sigenergy_items", "lookup_key": inv_model
        })

        # C&I Battery selection (1C or 0.5C)
        if battery_kwh > 0:
            c_norm = str(c_rate).strip().upper() if c_rate else "1C"
            batt_model = "SigenStack BAT 12.0 (M2)" if "1C" in c_norm else "SigenStack BAT 12.0 (M2 · 0.5C)"
            batt_qty = math.ceil(battery_kwh / 12.06)
            raw_lines.append({
                "k": "batt", "s": "A", "n": batt_model, "q": batt_qty, "u": "ชุด",
                "tab": "sigenergy_items", "lookup_key": "SigenStack BAT 12.0"
            })

        # Optimizer (default 2:1 ratio)
        opt_qty = math.ceil(panels / 2) if panels > 0 else 0
        if opt_qty > 0:
            raw_lines.append({
                "k": "amcp", "s": "A", "n": "AndSolar AMCP Power Optimizer", "q": opt_qty, "u": "ตัว",
                "tab": "sigenergy_items", "lookup_key": "Optimizer2:1"
            })

    # === SECTION A2: สายไฟ ===
    if sys_key != "atmoce_ac" and panels > 0:
        # DC Cable (50m default)
        raw_lines.append({
            "k": "cable:dc6", "s": "A2", "n": "สายไฟโซล่าเซลล์ DC — 6 sq.mm (Link)", "q": 50, "u": "เมตร",
            "tab": "cables", "lookup_key": "Link CB-1060AB"
        })

    # AC Cable & Ground Cable
    thw_size = "35" if (kwp >= 10 or sys_key == "sigenci" or backup) else ("25" if phase_norm == "1P" and kwp >= 6 else "16")
    thw_name = f"สายไฟ AC — THW 1×{thw_size} Sqmm (Yazaki/BCC)"
    thw_key = f"thw 1x{thw_size}"
    raw_lines.append({
        "k": f"cable:ac-thw{thw_size}", "s": "A2", "n": thw_name, "q": 50, "u": "เมตร",
        "tab": "cables", "lookup_key": thw_key
    })

    gnd_size = "10" if kwp >= 6 else "6"
    raw_lines.append({
        "k": f"cable:gnd{gnd_size}", "s": "A2", "n": f"สายกราวด์ — เขียว/เหลือง 1×{gnd_size} Sqmm", "q": 50, "u": "เมตร",
        "tab": "cables", "lookup_key": f"gnd 1x{gnd_size}"
    })

    # === SECTION B: Mounting Keenoc ===
    if sys_key != "atmoce_ac" and panels > 0:
        row_count = max(1, rows)
        panels_in_row = math.ceil(panels / row_count)
        row_len = (panels_in_row * 1.134) + ((panels_in_row - 1) * 0.02) + 0.1

        rail_sku = "Rail 4800m"
        rails_per_row = math.ceil(row_len / 4.8) * 2
        rail_total = rails_per_row * row_count
        raw_lines.append({
            "k": f"mnt:{rail_sku}", "s": "B", "n": rail_sku, "q": rail_total, "u": "ชิ้น",
            "tab": "mounting_keenoc", "lookup_key": rail_sku
        })

        splice_qty = (math.ceil(row_len / 4.8) - 1) * 2 * row_count
        if splice_qty > 0:
            raw_lines.append({
                "k": "mnt:Rail Splice", "s": "B", "n": "Rail Splice", "q": splice_qty, "u": "ชิ้น",
                "tab": "mounting_keenoc", "lookup_key": "Rail Splice"
            })

        raw_lines.append({
            "k": "mnt:Mid Clamp", "s": "B", "n": "Mid Clamp", "q": 2 * (panels - row_count), "u": "ชิ้น",
            "tab": "mounting_keenoc", "lookup_key": "Mid Clamp"
        })

        raw_lines.append({
            "k": "mnt:End Clamp", "s": "B", "n": "End Clamp", "q": 4 * row_count, "u": "ชิ้น",
            "tab": "mounting_keenoc", "lookup_key": "End Clamp"
        })

        raw_lines.append({
            "k": "mnt:Grounding Lug", "s": "B", "n": "Grounding Lug", "q": 2 * row_count, "u": "ชิ้น",
            "tab": "mounting_keenoc", "lookup_key": "Grounding Lug"
        })

        raw_lines.append({
            "k": "mnt:Earthing Clip", "s": "B", "n": "Earthing Clip", "q": panels, "u": "ชิ้น",
            "tab": "mounting_keenoc", "lookup_key": "Earthing Clip"
        })

        raw_lines.append({
            "k": "mnt:Cable Clip", "s": "B", "n": "Cable Clip", "q": 2 * panels, "u": "ชิ้น",
            "tab": "mounting_keenoc", "lookup_key": "Cable Clip"
        })

        rf_norm = str(roof_type).lower()
        if "tile" in rf_norm or "กระเบื้อง" in rf_norm:
            fastener_sku = "Tile Roof Hook (CPAC Euro)"
        elif "hangerbolt" in rf_norm or "ลอนคู่" in rf_norm:
            fastener_sku = "Hangerbolt"
        elif "kliplock" in rf_norm:
            fastener_sku = "CRC Raill Clamp Kits"
        else:
            fastener_sku = "L-Feet"

        fastener_qty = (math.ceil(row_len / 1.2) + 1) * 2 * row_count
        raw_lines.append({
            "k": f"mnt:{fastener_sku}", "s": "B", "n": fastener_sku, "q": fastener_qty, "u": "ชิ้น",
            "tab": "mounting_keenoc", "lookup_key": fastener_sku
        })

    # === SECTION C: ค่าแรง & ค่าขนส่ง ===
    if sys_key == "atmoce_ac":
        raw_lines.append({
            "k": "labor:flat", "s": "C", "n": "ค่าแรงติดตั้ง ESS (เหมา)", "q": 1, "u": "บาท",
            "tab": "labor_fees", "lookup_key": "ค่าแรงติดตั้ง"
        })
    else:
        wp = panels * panel_watt
        raw_lines.append({
            "k": "labor:0", "s": "C", "n": "ค่าแรงติดตั้งระบบโซลาร์เซลล์", "q": wp, "u": "Wp",
            "tab": "labor_fees", "lookup_key": "ค่าแรงติดตั้ง"
        })

    # Shipping (default 3,500 THB/job)
    raw_lines.append({
        "k": "labor:ship", "s": "C", "n": "ค่าขนส่ง", "q": 1, "u": "บาท/งาน",
        "tab": "labor_fees", "lookup_key": "ค่าขนส่ง", "fixed_fallback": 3500.0
    })

    # === SECTION D: MEA/PEA Fee ===
    sys_kw = kw if kw > 0 else (kwp if kwp > 0 else 5.0)
    mea_fee = qc_mea_fee(sys_kw) if sys_key != "atmoce_ac" else 0.0
    if mea_fee > 0:
        raw_lines.append({
            "k": "D:meaFee", "s": "D", "n": "ค่าขอขนานไฟ MEA/PEA", "q": 1, "u": "บาท",
            "fixed_cost": mea_fee
        })

    # --- Step 3: Resolve Prices & Format Output Lines ---
    formatted_lines: List[Dict[str, Any]] = []
    totals: Dict[str, float] = {"A": 0.0, "A2": 0.0, "B": 0.0, "C": 0.0, "C2": 0.0, "D": 0.0}
    missing_items: List[str] = []
    has_missing_price = False

    legacy_items: List[Dict[str, Any]] = []

    for line in raw_lines:
        k = line["k"]
        sec = line["s"]
        name = line["n"]
        qty = float(line["q"])
        unit = line["u"]

        if "fixed_cost" in line:
            unit_cost = float(line["fixed_cost"])
        else:
            tab = line.get("tab", "")
            key = line.get("lookup_key", name)
            unit_cost = lookup_catalog_item(catalog_data, tab, key)



            if unit_cost is None and "fixed_fallback" in line:
                unit_cost = float(line["fixed_fallback"])

        if unit_cost is not None:
            amount = round(unit_cost * qty, 2)
            totals[sec] = round(totals[sec] + amount, 2)
            missing = False
        else:
            amount = 0.0
            missing = True
            has_missing_price = True
            missing_items.append(name)

        formatted_lines.append({
            "k": k,
            "s": sec,
            "n": name,
            "q": qty,
            "u": unit,
            "c": unit_cost,
            "t": amount if not missing else None,
            "m": missing,
        })

        legacy_items.append({
            "part_number": name,
            "part_name": name,
            "manufacturer": "Survey",
            "category": sec,
            "quantity": qty,
            "unit": unit,
            "unit_cost": unit_cost,
            "total_cost": amount if not missing else None,
            "notes": "ไม่มีราคาในชีตราคากลาง" if missing else "",
        })

    total_cost = round(sum(totals.values()), 2)
    sale_price = pkg_sale_price if pkg_sale_price > 0 else round(total_cost * 1.3, 2)
    profit = round(sale_price - total_cost, 2)
    margin = round((profit / sale_price * 100.0), 1) if sale_price > 0 else 0.0

    # Human Readable Summary Text
    summary_lines = [
        f"📋 BOM ใบเสนอราคา ({package_label}):",
        f"• ต้นทุนรวม: {total_cost:,.2f} บาท",
        f"• ราคาขายระบบ: {sale_price:,.2f} บาท",
        f"• กำไรขั้นต้น: {profit:,.2f} บาท (Margin {margin:.1f}%)",
    ]
    if has_missing_price:
        summary_lines.append(f"⚠️ มี {len(missing_items)} รายการไม่มีราคาในชีตราคากลาง: {', '.join(missing_items)}")
    summary_lines.append(f"📌 ราคาจากชีตราคากลาง survey ณ {synced_at_thai}")
    summary_text = "\n".join(summary_lines)

    return {
        "success": True,
        "system": sys_key,
        "phase": phase_norm,
        "panels": panels,
        "kwp": round(kwp, 2),
        "kw_ac": round(sys_kw, 2),
        "total_cost": total_cost,
        "sale_price": sale_price,
        "profit": profit,
        "margin": margin,
        "has_missing_price": has_missing_price,
        "missing_items": missing_items,
        "lines": formatted_lines,
        "totals": totals,
        "summary_text": summary_text,
        "items": legacy_items,
        "package_label": package_label,

        # Backward compatibility fields for N1 CLI bridge
        "ratio": ratio if ratio else "2:1",
        "inverter_sku": "MI-1250" if sys_key == "atmoce21" else "MI-500",
        "inverter_count": math.ceil(panels / 2) if sys_key == "atmoce21" else panels,
    }




def calculate_atmoce_bom_n1(
    panels: int,
    ratio: Optional[str] = "2:1",
    phase: str = "1P",
    roof_type: str = "metal",
    rows: int = 1,
    trunk_cable_length: str = "2.5",
    battery_kwh: int = 0,
    battery_sku: Optional[str] = None,
    backup: bool = False,
    catalog_data: Optional[Dict[str, Any]] = None,
    qpkg_data: Optional[Dict[str, Any]] = None,
    fixture_filename: str = "pricelist_fixture.json",
) -> Dict[str, Any]:
    """
    Calculate ATMOCE Micro Inverter System BOM (N1 contract).
    """
    if panels <= 0:
        raise ValueError("จำนวนแผงต้องมากกว่า 0")

    if ratio is None or not str(ratio).strip() or str(ratio).strip().lower() == "none":
        ratio = "2:1"

    r_norm = str(ratio).strip().lower().replace(":", "")
    if r_norm in ("21", "2to1", "atmoce21", "2-1"):
        ratio_key = "2:1"
        system_key = "atmoce21"
        inverter_sku = "MI-1250"
        inverter_count = math.ceil(panels / 2)
        kw_ac = inverter_count * 1.25
    elif r_norm in ("11", "1to1", "atmoce11", "1-1"):
        ratio_key = "1:1"
        system_key = "atmoce11"
        inverter_sku = "MI-500"
        inverter_count = panels
        kw_ac = inverter_count * 0.5
    else:
        raise ValueError(f"ไม่รองรับ ratio '{ratio}' (ต้องเป็น 2:1 หรือ 1:1)")

    phase_norm = "3P" if ("3" in str(phase).upper() or "3P" in str(phase).upper()) else "1P"

    if catalog_data is None:
        raw_price = survey_catalog.fetch_pricelist(fixture_filename=fixture_filename)
        catalog_data = survey_catalog.parse_pricelist_catalog(raw_price.get("tabs", {}))
        synced_at = raw_price.get("synced_at")
    else:
        synced_at = catalog_data.get("synced_at")

    if qpkg_data is None:
        try:
            qpkg_data = survey_catalog.fetch_qpkg()
        except Exception:
            qpkg_data = {}

    if synced_at and isinstance(synced_at, (int, float)):
        tz_th = timezone(timedelta(hours=7))
        dt = datetime.fromtimestamp(synced_at, tz=tz_th)
        synced_at_thai = dt.strftime("%d/%m/%Y %H:%M:%S")
    else:
        synced_at_thai = "ไม่ระบุเวลา"

    panel_watt = 650
    kwp = (panels * panel_watt) / 1000.0

    items_raw: List[Dict[str, Any]] = []

    # 1. Solar Panels
    items_raw.append({
        "part_number": "AIKO AIKO-G650-MCH72Mw",
        "part_name": "AIKO AIKO-G650-MCH72Mw (N-Type ABC 650W)",
        "manufacturer": "AIKO",
        "category": "แผงโซล่าเซลล์",
        "quantity": panels,
        "unit": "แผง",
        "tab": "solar_panels",
        "lookup_key": "AIKO AIKO-G650-MCH72Mw",
    })

    # 2. Inverters
    items_raw.append({
        "part_number": inverter_sku,
        "part_name": f"{inverter_sku} ({'Micro Inverter 1250W 2:1' if ratio_key == '2:1' else 'Micro Inverter 500W 1:1'})",
        "manufacturer": "ATMOCE",
        "category": "อินเวอร์เตอร์",
        "quantity": inverter_count,
        "unit": "เครื่อง",
        "tab": "atmoce_inverters",
        "lookup_key": inverter_sku,
    })

    # 3. Micro AC Trunk Cables
    trunk_len_str = str(trunk_cable_length).strip()
    if trunk_len_str in ("1.3", "1.3m"):
        trunk_sku = "MW-025013-A"
        trunk_name = "MW-025013-A (ATMOCE AC Cable 1.3m)"
    else:
        trunk_sku = "MW-025025-A"
        trunk_name = "MW-025025-A (ATMOCE AC Cable 2.5m)"

    items_raw.append({
        "part_number": trunk_sku,
        "part_name": trunk_name,
        "manufacturer": "ATMOCE",
        "category": "สายไฟ",
        "quantity": inverter_count,
        "unit": "เส้น",
        "tab": "atmoce_inverters",
        "lookup_key": trunk_sku,
    })



    # 4. Solar Box / Combiner
    if phase_norm == "3P":
        solarbox_sku = "MC100T"
        solarbox_name = "MC100T (Three-phase M-Combiner Box)"
    else:
        if panels < 9:
            solarbox_sku = "MC100L"
            solarbox_name = "MC100L (Single-phase M-Combiner Lite Box)"
        else:
            solarbox_sku = "MC100"
            solarbox_name = "MC100 (Single-phase M-Combiner Box)"

    items_raw.append({
        "part_number": solarbox_sku,
        "part_name": solarbox_name,
        "manufacturer": "ATMOCE",
        "category": "ตู้คอนโทรล",
        "quantity": 1,
        "unit": "ตู้",
        "tab": "atmoce_inverters",
        "lookup_key": solarbox_sku,
    })

    # 5. Adapters & Connectors
    if phase_norm == "1P":
        if ratio_key == "2:1":
            mt03_qty = 1 if panels < 9 else (2 if panels < 17 else 3)
        else:
            mt03_qty = 1 if panels < 12 else (2 if panels < 24 else 3)

        items_raw.append({
            "part_number": "MT-04003-A",
            "part_name": "MT-04003-A (Single-phase junction adapter, 40A-3cores)",
            "manufacturer": "ATMOCE",
            "category": "สายไฟ",
            "quantity": mt03_qty,
            "unit": "ชิ้น",
            "tab": "atmoce_inverters",
            "lookup_key": "MT-04003-A",
        })
    else:
        items_raw.append({
            "part_number": "MT-03205-A",
            "part_name": "MT-03205-A (Three-phase junction adapter, 32A-5cores)",
            "manufacturer": "ATMOCE",
            "category": "สายไฟ",
            "quantity": 1,
            "unit": "ชิ้น",
            "tab": "atmoce_inverters",
            "lookup_key": "MT-03205-A",
        })

    # 6. Mounting - Keenoc
    row_count = max(1, rows)
    panels_in_row = math.ceil(panels / row_count)
    row_len = (panels_in_row * 1.134) + ((panels_in_row - 1) * 0.02) + 0.1
    rails_per_row = math.ceil(row_len / 4.8) * 2
    rail_48m_qty = rails_per_row * row_count
    items_raw.append({
        "part_number": "Rail 4800m",
        "part_name": "Rail 4800m (รางอลูมิเนียม 4.8m)",
        "manufacturer": "Keenoc",
        "category": "โครงสร้าง",
        "quantity": rail_48m_qty,
        "unit": "เส้น",
        "tab": "mounting_keenoc",
        "lookup_key": "Rail 4800m",
    })

    if (rails_per_row / 2) > 1:
        splice_qty = int((rails_per_row / 2) - 1) * 2 * row_count
        items_raw.append({
            "part_number": "Rail Splice",
            "part_name": "Rail Splice (ตัวต่อราง)",
            "manufacturer": "Keenoc",
            "category": "โครงสร้าง",
            "quantity": splice_qty,
            "unit": "ตัว",
            "tab": "mounting_keenoc",
            "lookup_key": "Rail Splice",
        })

    mid_clamp_qty = 2 * (panels - row_count)
    items_raw.append({
        "part_number": "Mid Clamp",
        "part_name": "Mid Clamp (ตัวล็อคกลาง)",
        "manufacturer": "Keenoc",
        "category": "โครงสร้าง",
        "quantity": mid_clamp_qty,
        "unit": "ตัว",
        "tab": "mounting_keenoc",
        "lookup_key": "Mid Clamp",
    })

    end_clamp_qty = 4 * row_count
    items_raw.append({
        "part_number": "End Clamp",
        "part_name": "End Clamp (ตัวล็อคริม)",
        "manufacturer": "Keenoc",
        "category": "โครงสร้าง",
        "quantity": end_clamp_qty,
        "unit": "ตัว",
        "tab": "mounting_keenoc",
        "lookup_key": "End Clamp",
    })

    ground_lug_qty = 2 * row_count
    items_raw.append({
        "part_number": "Grounding Lug",
        "part_name": "Grounding Lug (กราวด์ลัก)",
        "manufacturer": "Keenoc",
        "category": "โครงสร้าง",
        "quantity": ground_lug_qty,
        "unit": "ตัว",
        "tab": "mounting_keenoc",
        "lookup_key": "Grounding Lug",
    })

    items_raw.append({
        "part_number": "Earthing Clip",
        "part_name": "Earthing Clip (เพลตกราวด์)",
        "manufacturer": "Keenoc",
        "category": "โครงสร้าง",
        "quantity": panels,
        "unit": "ตัว",
        "tab": "mounting_keenoc",
        "lookup_key": "Earthing Clip",
    })

    items_raw.append({
        "part_number": "Cable Clip",
        "part_name": "Cable Clip (คลิปรัดสาย)",
        "manufacturer": "Keenoc",
        "category": "โครงสร้าง",
        "quantity": 2 * panels,
        "unit": "ตัว",
        "tab": "mounting_keenoc",
        "lookup_key": "Cable Clip",
    })

    rf_norm = str(roof_type).lower()
    if "tile" in rf_norm or "กระเบื้อง" in rf_norm:
        fastener_sku = "Tile Roof Hook (CPAC Euro)"
    elif "hangerbolt" in rf_norm or "ลอนคู่" in rf_norm:
        fastener_sku = "Hangerbolt"
    elif "kliplock" in rf_norm:
        fastener_sku = "CRC Raill Clamp Kits"
    else:
        fastener_sku = "L-Feet"

    fastener_qty = (math.ceil(row_len / 1.2) + 1) * 2 * row_count
    items_raw.append({
        "part_number": fastener_sku,
        "part_name": f"{fastener_sku} (ขาขายึดหลังคา)",
        "manufacturer": "Keenoc",
        "category": "โครงสร้าง",
        "quantity": fastener_qty,
        "unit": "ตัว",
        "tab": "mounting_keenoc",
        "lookup_key": fastener_sku,
    })

    if battery_sku or battery_kwh > 0:
        batt_qty = math.ceil(battery_kwh / 7) if battery_kwh > 0 else 1
        items_raw.append({
            "part_number": "MS-7K-U",
            "part_name": "MS-7K-U (M-Battery 7kWh)",
            "manufacturer": "ATMOCE",
            "category": "แบตเตอรี่",
            "quantity": batt_qty,
            "unit": "ก้อน",
            "tab": "atmoce_inverters",
            "lookup_key": "MS-7K-U",
        })
        backup = True

    if backup:
        bu_sku = "MU100T" if phase_norm == "3P" else "MU100S"
        bu_name = "MU100T (Three-phase Backup Box)" if phase_norm == "3P" else "MU100S (Single-phase Backup Box)"
        items_raw.append({
            "part_number": bu_sku,
            "part_name": bu_name,
            "manufacturer": "ATMOCE",
            "category": "สำรองไฟ",
            "quantity": 1,
            "unit": "ชุด",
            "tab": "atmoce_inverters",
            "lookup_key": bu_sku,
        })

    resolved_items = []
    total_cost = 0.0
    has_missing_price = False
    missing_items = []

    for it in items_raw:
        tab_name = it["tab"]
        lookup_key = it["lookup_key"]
        unit_cost = lookup_catalog_item(catalog_data, tab_name, lookup_key)



        if unit_cost is not None:
            line_total = unit_cost * it["quantity"]
            total_cost += line_total
            notes = ""
        else:
            line_total = None
            has_missing_price = True
            missing_items.append(it["part_number"])
            notes = "ไม่มีราคาในชีตราคากลาง"

        resolved_items.append({
            "part_number": it["part_number"],
            "part_name": it["part_name"],
            "manufacturer": it["manufacturer"],
            "category": it["category"],
            "quantity": it["quantity"],
            "unit": it["unit"],
            "unit_cost": unit_cost,
            "total_cost": line_total,
            "notes": notes,
        })

    pkg_label = f"ATMOCE {ratio_key} {panels} แผง {phase_norm}"
    if isinstance(qpkg_data, dict) and system_key in qpkg_data:
        sys_info = qpkg_data[system_key]
        phase_code = "3" if phase_norm == "3P" else "1"
        pkgs = sys_info.get(phase_code, [])
        for pkg in pkgs:
            if isinstance(pkg, list) and len(pkg) >= 2 and pkg[1] == panels:
                pkg_label = f"Residential {pkg[0]}kW ({panels} แผง {phase_norm})"
                break

    phase_th = "3 เฟส" if phase_norm == "3P" else "1 เฟส"
    header = f"ATMOCE {ratio_key} · {panels} แผง {kwp:.2f} kWp · {inverter_sku} ×{inverter_count} = {kw_ac:.2f} kW AC · {phase_th}"

    summary_lines = [header]
    if pkg_label:
        summary_lines.append(f"[แพ็กเกจ: {pkg_label}]")
    summary_lines.append("━━━━━━━━━━━━━━━")

    for i, it in enumerate(resolved_items, 1):
        if it["unit_cost"] is not None:
            cost_str = f"฿{it['unit_cost']:,.2f}"
            tot_str = f"฿{it['total_cost']:,.2f}"
        else:
            cost_str = "ไม่มีราคาในชีตราคากลาง"
            tot_str = "ไม่มีราคาในชีตราคากลาง"

        summary_lines.append(
            f"{i}. {it['part_name']}\n   {it['quantity']} {it['unit']} × {cost_str} = {tot_str}"
        )

    summary_lines.append("━━━━━━━━━━━━━━━")
    if has_missing_price:
        summary_lines.append(f"⚠️ มี {len(missing_items)} รายการไม่มีราคาในชีตราคากลาง ({', '.join(missing_items)})")
        summary_lines.append(f"💰 รวมค่าอุปกรณ์ (ต้นทุน): ฿{total_cost:,.2f} (ไม่รวมรายการไม่มีราคา)")
    else:
        summary_lines.append(f"💰 รวมค่าอุปกรณ์ (ต้นทุน): ฿{total_cost:,.2f}")

    summary_lines.append(f"ราคาจากชีตราคากลาง survey ณ {synced_at_thai} ไทย")

    return {
        "success": True,
        "config": system_key,
        "ratio": ratio_key,
        "panels": panels,
        "kwp": kwp,
        "kw_ac": kw_ac,
        "inverter_sku": inverter_sku,
        "inverter_count": inverter_count,
        "phase": phase_norm,
        "items": resolved_items,
        "total_cost": total_cost,
        "package_label": pkg_label,
        "summary_text": "\n".join(summary_lines),
        "synced_at": synced_at,
        "synced_at_thai": synced_at_thai,
        "has_missing_price": has_missing_price,
        "missing_items": missing_items,
    }


