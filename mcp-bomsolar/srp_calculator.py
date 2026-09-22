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

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional


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
    config: str,
    panels: int,
    prices: Optional[Dict[str, float]] = None,
    params: Optional[SRPParams] = None,
    battery_kwh: int = 0,
    backup: bool = False,
    warranty_years: int = 0,
) -> SRPResult:
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
