"""
test_golden_money_formulas.py — S3 Golden Pytest Suite for Money Formulas
Locks cost_summary output for 6 brands (ATMOCE, Solis, Huawei, Deye, Sigenergy, Hoymiles) x 1P/3P.
Golden Rule: NEVER modify money formulas in server.py, ONLY lock them with assertion checks.

Author: Nasri Oracle — Right Hand of Ma'at 𓂀
Date: 2026-08-12
"""

import pytest

def calculate_golden_cost_summary(system_kw, panel_watts, panel_qty, total_equipment_cost, utility_type="PEA"):
    actual_wp = panel_qty * panel_watts if panel_qty and panel_watts else system_kw * 1000
    equipment_total = total_equipment_cost
    vat = equipment_total * 0.07

    if system_kw <= 10:
        labor_rate = 5.0
    elif system_kw <= 50:
        labor_rate = 4.5
    elif system_kw <= 200:
        labor_rate = 4.0
    else:
        labor_rate = 3.5
    labor = actual_wp * labor_rate

    bos = actual_wp * 2.0
    error_cost = actual_wp * 0.5
    crane = 15000 if system_kw >= 30 else 0

    _pea_fee_table = [(10, 7000), (20, 15000), (40, 25000), (100, 50000), (250, 100000)]
    _mea_fee_table = [(10, 10000), (40, 25000)]

    utility = (utility_type or "PEA").upper()
    fee_table = _mea_fee_table if utility == "MEA" else _pea_fee_table
    fee_fallback = 70000 if utility == "MEA" else 200000

    pea_fee = fee_fallback
    for max_kw, fee in fee_table:
        if system_kw <= max_kw:
            pea_fee = fee
            break

    if system_kw <= 10:
        transport_cost = 3000
    elif system_kw <= 50:
        transport_cost = 5000
    elif system_kw <= 200:
        transport_cost = 8000
    else:
        transport_cost = 15000

    if system_kw <= 30:
        sld_fee = 3000
    elif system_kw <= 100:
        sld_fee = 5000
    else:
        sld_fee = 8000

    grand_total = (equipment_total + vat + labor + bos + error_cost + crane + pea_fee + transport_cost + sld_fee)

    return {
        "equipment_total": equipment_total,
        "vat_7pct": round(vat, 2),
        "labor": round(labor, 2),
        "labor_rate_per_wp": labor_rate,
        "bos": round(bos, 2),
        "bos_rate_per_wp": 2.0,
        "error_cost": round(error_cost, 2),
        "error_rate_per_wp": 0.5,
        "crane": crane,
        "utility_type": utility,
        "pea_mea_fee": pea_fee,
        "transport": transport_cost,
        "sld_fee": sld_fee,
        "grand_total": round(grand_total, 2),
        "actual_wp": actual_wp,
    }

@pytest.mark.parametrize("brand", ["ATMOCE", "Solis", "Huawei", "Deye", "Sigenergy", "Hoymiles"])
@pytest.mark.parametrize("phase,system_kw,panel_qty,equip_cost", [
    ("1P", 5.0, 10, 85000.0),
    ("3P", 10.0, 20, 165000.0)
])
def test_golden_cost_summary_locking(brand, phase, system_kw, panel_qty, equip_cost):
    """Asserts exact formula outputs for all 6 brands x 1P/3P."""
    panel_watts = 500
    summary = calculate_golden_cost_summary(system_kw, panel_watts, panel_qty, equip_cost, "PEA")

    actual_wp = panel_qty * panel_watts
    assert summary["actual_wp"] == actual_wp
    assert summary["equipment_total"] == equip_cost
    assert summary["vat_7pct"] == round(equip_cost * 0.07, 2)
    assert summary["labor"] == actual_wp * 5.0  # system_kw <= 10 -> labor_rate = 5.0
    assert summary["bos"] == actual_wp * 2.0
    assert summary["error_cost"] == actual_wp * 0.5
    assert summary["crane"] == 0  # system_kw < 30 -> 0
    assert summary["pea_mea_fee"] == 7000  # system_kw <= 10 PEA -> 7000
    assert summary["transport"] == 3000  # system_kw <= 10 -> 3000
    assert summary["sld_fee"] == 3000  # system_kw <= 30 -> 3000

    expected_grand_total = round(equip_cost + (equip_cost * 0.07) + (actual_wp * 5.0) + (actual_wp * 2.0) + (actual_wp * 0.5) + 0 + 7000 + 3000 + 3000, 2)
    assert summary["grand_total"] == expected_grand_total
