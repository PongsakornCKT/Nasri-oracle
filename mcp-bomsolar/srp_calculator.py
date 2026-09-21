"""
SRP Calculator — ATMOCE BOM pricing engine (v24 May 2026 Source of Truth).
All pricing dynamic from Survey REST API /pricelist tabs. Zero hardcoded price dicts.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any

import survey_catalog


def lookup_catalog_item(catalog_data: Dict[str, Any], tab_name: str, key: str) -> Optional[float]:
    """
    Look up unit cost for key in catalog tab.
    Supports exact match, case-insensitive match, and word-bounded prefix match
    (e.g., "MC100" matching "MC100 Warranty 5 year").
    Returns None if missing.
    """
    if not catalog_data:
        return None

    c = catalog_data.get(tab_name, {})
    if not c and tab_name in ("atmoce_inverters", "mounting_keenoc"):
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

    # 2. Case-insensitive exact match
    for k, v in c.items():
        if isinstance(v, dict) and k.strip().casefold() == kc:
            return v.get("cost")

    # 3. Word-bounded prefix match (space, hyphen, or underscore boundary)
    for k, v in c.items():
        if isinstance(v, dict):
            k_cf = k.strip().casefold()
            if k_cf.startswith(kc + " ") or k_cf.startswith(kc + "-") or k_cf.startswith(kc + "_"):
                return v.get("cost")

    return None


@dataclass
class BOMLine:
    part_number: str
    part_name: str
    manufacturer: str
    category: str
    quantity: float
    unit: str
    unit_cost: Optional[float]
    total_cost: Optional[float]
    notes: str = ""

    def as_dict(self) -> dict:
        return {
            "part_number": self.part_number,
            "part_name": self.part_name,
            "manufacturer": self.manufacturer,
            "category": self.category,
            "quantity": float(self.quantity),
            "unit": self.unit,
            "unit_cost": float(self.unit_cost) if self.unit_cost is not None else None,
            "total_cost": float(self.total_cost) if self.total_cost is not None else None,
            "notes": self.notes,
        }


def calculate_atmoce_bom_n1(
    panels: int,
    ratio: str = "2:1",
    phase: str = "1P",
    roof_type: str = "metal",
    rows: int = 1,
    trunk_cable_length: str = "2.5",
    battery_kwh: int = 0,
    battery_sku: Optional[str] = None,
    backup: bool = False,
    catalog_data: Optional[Dict[str, Any]] = None,
    qpkg_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Calculate BOM for ATMOCE system according to N1 rules (#4):
    - Default ratio = 2:1 (MI-1250 micro inverter, per=2)
    - Cable default = MW-025025-A (2.5 m). If missing in catalog, marked as missing price.
    - Keenoc mounting calculated by row formula using sheet item names (Rail 4800m, L-Feet, etc.)
    - Dynamic prices parsed from Survey REST API /pricelist tabs
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
        per = 2
        inverter_kw_ac = 1.25
    elif r_norm in ("11", "1to1", "atmoce11", "1-1"):
        ratio_key = "1:1"
        system_key = "atmoce11"
        inverter_sku = "MI-500"
        per = 1
        inverter_kw_ac = 0.5
    else:
        raise ValueError(f"ไม่พบ ratio {ratio!r}. กรุณาระบุ 2:1 หรือ 1:1")

    phase_norm = "3P" if ("3" in str(phase).upper() or "3P" in str(phase).upper()) else "1P"

    # Fetch catalog from survey_catalog if not passed
    if catalog_data is None:
        raw_price = survey_catalog.fetch_pricelist()
        catalog_data = survey_catalog.parse_pricelist_catalog(raw_price.get("tabs", {}))
        synced_at = raw_price.get("synced_at")
    else:
        synced_at = catalog_data.get("synced_at")

    if qpkg_data is None:
        try:
            qpkg_data = survey_catalog.fetch_qpkg()
        except Exception:
            qpkg_data = {}

    # Format Thai synced_at
    if synced_at and isinstance(synced_at, (int, float)):
        tz_th = timezone(timedelta(hours=7))
        dt = datetime.fromtimestamp(synced_at, tz=tz_th)
        synced_at_thai = dt.strftime("%d/%m/%Y %H:%M:%S")
    else:
        synced_at_thai = "ไม่ระบุเวลา"

    # Quantities
    inverter_count = math.ceil(panels / per)
    panel_watt = 650  # Default AIKO 650W from sheet
    kwp = (panels * panel_watt) / 1000.0
    kw_ac = inverter_count * inverter_kw_ac

    # Trunk cable SKU
    trunk_sku = "MW-025013-A" if str(trunk_cable_length).strip() in ("1.3", "1.3m") else "MW-025025-A"

    # SolarBox SKU
    if phase_norm == "3P":
        solarbox_sku = "MC100T"
    else:
        solarbox_sku = "MC100L" if panels < 9 else "MC100"

    # Build Raw Item Specifications
    items_raw = []

    # 1. Panels (AIKO AIKO-G650-MCH72Mw or AIKO 650W)
    panel_sku = "AIKO AIKO-G650-MCH72Mw"
    items_raw.append({
        "part_number": panel_sku,
        "part_name": f"{panel_sku} ({panel_watt}W N-Type)",
        "manufacturer": "AIKO",
        "category": "โมดูล",
        "quantity": panels,
        "unit": "แผง",
        "tab": "solar_panels",
        "lookup_key": panel_sku,
    })

    # 2. Micro Inverters
    inv_desc = "Single Phase Micro Inverter - 1250W" if ratio_key == "2:1" else "Single Phase Micro Inverter - 500W"
    items_raw.append({
        "part_number": inverter_sku,
        "part_name": f"{inverter_sku} ({inv_desc})",
        "manufacturer": "ATMOCE",
        "category": "อินเวอร์เตอร์",
        "quantity": inverter_count,
        "unit": "ตัว",
        "tab": "atmoce_inverters",
        "lookup_key": inverter_sku,
    })

    # 3. AC Trunk Cable
    cable_desc = "1.3m Three-terminal AC Cable" if trunk_sku == "MW-025013-A" else "2.5m Three-terminal AC Cable"
    items_raw.append({
        "part_number": trunk_sku,
        "part_name": f"{trunk_sku} ({cable_desc})",
        "manufacturer": "ATMOCE",
        "category": "สายไฟ",
        "quantity": inverter_count,
        "unit": "เส้น",
        "tab": "atmoce_inverters",
        "lookup_key": trunk_sku,
    })

    # 4. SolarBox
    items_raw.append({
        "part_number": solarbox_sku,
        "part_name": f"SolarBox {solarbox_sku}",
        "manufacturer": "ATMOCE",
        "category": "SolarBox",
        "quantity": 1,
        "unit": "ชุด",
        "tab": "atmoce_inverters",
        "lookup_key": solarbox_sku,
    })

    # 5. Adapters & Connectors
    if phase_norm == "1P":
        # Junction Adapter MT-04003-A
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

        # 2in1 Connector MT-04002-2in1
        mt02_qty = 0
        if solarbox_sku == "MC100L" and inverter_count > 9:
            mt02_qty = 1
        elif solarbox_sku == "MC100" and inverter_count > 27:
            mt02_qty = 3
        if mt02_qty > 0:
            items_raw.append({
                "part_number": "MT-04002-2in1",
                "part_name": "MT-04002-2in1 (2in1 AC junction connector, 40A-2cores)",
                "manufacturer": "ATMOCE",
                "category": "สายไฟ",
                "quantity": mt02_qty,
                "unit": "ชิ้น",
                "tab": "atmoce_inverters",
                "lookup_key": "MT-04002-2in1",
            })
    else:  # 3P
        mt32_qty = math.ceil(inverter_count / 15)
        items_raw.append({
            "part_number": "MT-03205-A",
            "part_name": "MT-03205-A (Three-phase junction adapter, 32A-5cores)",
            "manufacturer": "ATMOCE",
            "category": "สายไฟ",
            "quantity": mt32_qty,
            "unit": "ชิ้น",
            "tab": "atmoce_inverters",
            "lookup_key": "MT-03205-A",
        })

    # 6. Keenoc Mounting (Row Formula using 4.8m rail from sheet)
    row_count = max(1, rows)
    panels_in_row = math.ceil(panels / row_count)
    row_len = (panels_in_row * 1.134) + ((panels_in_row - 1) * 0.02) + 0.1

    rail_sku = "Rail 4800m"
    rail_len_m = 4.8
    rails_per_row = math.ceil(row_len / rail_len_m) * 2
    rail_total = rails_per_row * row_count

    items_raw.append({
        "part_number": rail_sku,
        "part_name": f"{rail_sku} (รางอลูมิเนียม {rail_len_m}m)",
        "manufacturer": "Keenoc",
        "category": "โครงสร้าง",
        "quantity": rail_total,
        "unit": "เส้น",
        "tab": "mounting_keenoc",
        "lookup_key": rail_sku,
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

    # Roof Fasteners
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

    # 7. Battery & Backup (if requested)
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
        backup = True  # Default backup box with battery

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

    # Resolve Prices against catalog_data using lookup_catalog_item
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

    # Package Matching from qpkg
    pkg_label = f"ATMOCE {ratio_key} {panels} แผง {phase_norm}"
    if isinstance(qpkg_data, dict) and system_key in qpkg_data:
        sys_info = qpkg_data[system_key]
        phase_code = "3" if phase_norm == "3P" else "1"
        pkgs = sys_info.get(phase_code, [])
        for pkg in pkgs:
            if isinstance(pkg, list) and len(pkg) >= 2 and pkg[1] == panels:
                pkg_label = f"Residential {pkg[0]}kW ({panels} แผง {phase_norm})"
                break

    # Build Header & Summary Text
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
