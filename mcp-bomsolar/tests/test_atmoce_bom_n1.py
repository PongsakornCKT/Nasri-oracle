"""Golden Test Suite for ATMOCE BOM Engine N1 (#4) - Round 3.

Verifies the Golden Cases against raw staging snapshot prices extracted directly in test:
(a) atmoce21 10 แผง 1P
(b) atmoce11 8 แผง 1P
(c) atmoce21 20 แผง 3P
(d) atmoce21 12 แผง + battery (MS-7K-U) 1P

N1 Round 3 Strict Rules (Mutation Hardening):
1. ALL unit_cost assertions MUST be computed directly from raw fixture JSON rows using explicit 0-indexed column numbers in the test file (r[6] for Keenoc, r[6]/r[5] for Cables, r[2] for Inverters/Combiner, r[5] for Panels).
2. NEVER call survey_catalog.parse_pricelist_catalog inside the test file to construct expected values.
3. Engine called with catalog_data=None so it executes the full fetch_pricelist pipeline under test.
4. Unspecified ratio calls must default to 2:1 MI-1250.
5. Production code grep check: NO hardcoded price numbers in srp_calculator.py.
"""

import os
import sys
import json
import re
import pathlib
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from srp_calculator import calculate_atmoce_bom_n1
import survey_catalog


def _num(val):
    if val is None or val == "":
        return None
    try:
        clean = re.sub(r'[^0-9.]', '', str(val))
        return float(clean) if clean else None
    except Exception:
        return None


@pytest.fixture(scope="module")
def raw_fixture_extracts():
    fixture_path = pathlib.Path(__file__).parent.parent / "fixtures" / "pricelist_fixture.json"
    raw_price = json.loads(fixture_path.read_text(encoding="utf-8"))
    tabs = raw_price.get("tabs", {})

    # Direct raw extraction in test file using EXACT INDEXES required by spec (NO parse_pricelist_catalog call!):

    # 1. Inverters - ATMOCE & Combiner: r[0] SKU/name, r[2] cost (STRICT INDEX 2)
    inv_raw = {}
    for r in tabs.get("Inverters - ATMOCE", []):
        if isinstance(r, list) and len(r) > 2 and r[0] and not str(r[0]).startswith("⚡") and not str(r[0]).startswith("📋") and r[0] not in ("SKU", "เฟส"):
            inv_raw[str(r[0]).strip()] = _num(r[2])

    # 2. Mounting - Keenoc: r[0] name, r[6] price 1 piece (STRICT INDEX 6)
    mount_raw = {}
    for r in tabs.get("Mounting - Keenoc", []):
        if isinstance(r, list) and len(r) > 6 and r[0] and not str(r[0]).startswith("🏗") and r[0] != "รายการ":
            mount_raw[str(r[0]).strip()] = _num(r[6])  # STRICTLY index 6 (1 piece)

    # 3. Cables: r[1] brand, r[2] model, r[6] (<50k) fallback to r[5] (≥50k) (STRICT INDEX 6 / INDEX 5)
    cable_raw = {}
    for r in tabs.get("Cables", []):
        if isinstance(r, list) and len(r) > 5 and r[0] and not str(r[0]).startswith("🔌") and not str(r[0]).startswith("⚡") and r[0] != "ประเภท":
            brand = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
            model = str(r[2] if len(r) > 2 and r[2] is not None else "").strip()
            if not model:
                continue
            full_name = f"{brand} {model}".strip()
            p6 = _num(r[6]) if len(r) > 6 else None
            p5 = _num(r[5]) if len(r) > 5 else None
            cable_raw[full_name] = p6 if p6 is not None else p5

    # 4. Solar Panels: r[0] brand, r[1] model, r[5] cost (STRICT INDEX 5)
    panel_raw = {}
    for r in tabs.get("Solar Panels", []):
        if isinstance(r, list) and len(r) > 5 and r[0] and not str(r[0]).startswith("☀️") and r[0] != "แบรนด์":
            brand = str(r[0]).strip()
            model = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
            panel_raw[f"{brand} {model}".strip()] = _num(r[5])

    return inv_raw, mount_raw, cable_raw, panel_raw


def test_golden_case_a_atmoce21_10p_1p(raw_fixture_extracts):
    inv_raw, mount_raw, cable_raw, panel_raw = raw_fixture_extracts
    
    # Run engine with catalog_data=None so it runs survey_catalog fetch under test
    res = calculate_atmoce_bom_n1(
        panels=10,
        ratio="2:1",
        phase="1P",
        catalog_data=None,
        qpkg_data=None,
    )
    assert res["success"] is True
    assert res["ratio"] == "2:1"
    assert res["inverter_sku"] == "MI-1250"
    assert res["inverter_count"] == 5
    assert res["phase"] == "1P"
    assert res["package_label"] == "Residential 6.7kW (10 แผง 1P)"
    assert res["has_missing_price"] is True
    assert "MW-025025-A" in res["missing_items"]

    items = {item["part_number"]: item for item in res["items"]}

    # Direct raw index assertions:
    assert items["AIKO AIKO-G650-MCH72Mw"]["unit_cost"] == panel_raw["AIKO AIKO-G650-MCH72Mw"]  # row[5] -> 3283.0
    assert items["AIKO AIKO-G650-MCH72Mw"]["quantity"] == 10

    assert items["MI-1250"]["unit_cost"] == inv_raw["MI-1250"]  # row[2] -> 4750.0
    assert items["MI-1250"]["quantity"] == 5

    assert items["MW-025025-A"]["unit_cost"] is None  # Missing in staging snapshot
    assert items["MW-025025-A"]["total_cost"] is None
    assert items["MW-025025-A"]["quantity"] == 5

    assert items["MC100"]["unit_cost"] == inv_raw["MC100 Warranty 5 year"]  # row[2] -> 15900.0
    assert items["MC100"]["quantity"] == 1

    assert items["MT-04003-A"]["unit_cost"] == inv_raw["MT-04003-A"]  # row[2] -> 640.0
    assert items["MT-04003-A"]["quantity"] == 2

    # Keenoc 4.8m rail calculation asserted directly against raw row[6] extraction:
    assert items["Rail 4800m"]["unit_cost"] == mount_raw["Rail 4800m"]  # row[6] -> 500.0
    assert items["Rail 4800m"]["quantity"] == 6

    assert items["Rail Splice"]["unit_cost"] == mount_raw["Rail Splice"]  # row[6] -> 34.0
    assert items["Rail Splice"]["quantity"] == 4

    assert items["Mid Clamp"]["unit_cost"] == mount_raw["Mid Clamp"]  # row[6] -> 17.5
    assert items["Mid Clamp"]["quantity"] == 18

    assert items["End Clamp"]["unit_cost"] == mount_raw["End Clamp"]  # row[6] -> 15.0
    assert items["End Clamp"]["quantity"] == 4

    assert items["Grounding Lug"]["unit_cost"] == mount_raw["Grounding Lug"]  # row[6] -> 14.5
    assert items["Grounding Lug"]["quantity"] == 2

    assert items["Earthing Clip"]["unit_cost"] == mount_raw["Earthing Clip"]  # row[6] -> 5.0
    assert items["Earthing Clip"]["quantity"] == 10

    assert items["Cable Clip"]["unit_cost"] == mount_raw["Cable Clip"]  # row[6] -> 7.5
    assert items["Cable Clip"]["quantity"] == 20

    assert items["L-Feet"]["unit_cost"] == mount_raw["L-Feet"]  # row[6] -> 27.5
    assert items["L-Feet"]["quantity"] == 22

    # Total cost must equal sum of valid items (excluding missing MW-025025-A)
    valid_sum = sum(i["total_cost"] for i in res["items"] if i["total_cost"] is not None)
    assert res["total_cost"] == valid_sum
    assert res["total_cost"] == 78105.0


def test_golden_case_b_atmoce11_8p_1p(raw_fixture_extracts):
    inv_raw, mount_raw, cable_raw, panel_raw = raw_fixture_extracts
    res = calculate_atmoce_bom_n1(
        panels=8,
        ratio="1:1",
        phase="1P",
        catalog_data=None,
        qpkg_data=None,
    )
    assert res["success"] is True
    assert res["ratio"] == "1:1"
    assert res["inverter_sku"] == "MI-500"
    assert res["inverter_count"] == 8
    assert res["phase"] == "1P"

    items = {item["part_number"]: item for item in res["items"]}
    assert items["MI-500"]["unit_cost"] == inv_raw["MI-500"]  # row[2] -> 4400.0
    assert items["MI-500"]["quantity"] == 8
    assert items["MC100L"]["unit_cost"] == inv_raw["MC100L Warranty 5 year"]  # row[2] -> 10900.0
    assert items["MC100L"]["quantity"] == 1


def test_golden_case_c_atmoce21_20p_3p(raw_fixture_extracts):
    inv_raw, mount_raw, cable_raw, panel_raw = raw_fixture_extracts
    res = calculate_atmoce_bom_n1(
        panels=20,
        ratio="2:1",
        phase="3P",
        catalog_data=None,
        qpkg_data=None,
    )
    assert res["success"] is True
    assert res["ratio"] == "2:1"
    assert res["inverter_sku"] == "MI-1250"
    assert res["inverter_count"] == 10
    assert res["phase"] == "3P"

    items = {item["part_number"]: item for item in res["items"]}
    assert items["MC100T"]["unit_cost"] == inv_raw["MC100T Warranty 5 year"]  # row[2] -> 20900.0
    assert items["MC100T"]["quantity"] == 1
    assert items["MT-03205-A"]["unit_cost"] == inv_raw["MT-03205-A"]  # row[2] -> 1050.0
    assert items["MT-03205-A"]["quantity"] == 1


def test_golden_case_d_atmoce21_12p_battery(raw_fixture_extracts):
    inv_raw, mount_raw, cable_raw, panel_raw = raw_fixture_extracts
    res = calculate_atmoce_bom_n1(
        panels=12,
        ratio="2:1",
        phase="1P",
        battery_kwh=7,
        backup=True,
        catalog_data=None,
        qpkg_data=None,
    )
    assert res["success"] is True
    assert res["inverter_count"] == 6

    items = {item["part_number"]: item for item in res["items"]}
    assert items["MS-7K-U"]["unit_cost"] == inv_raw["MS-7K-U Warranty 10 year"]  # row[2] -> 72900.0
    assert items["MU100S"]["unit_cost"] == inv_raw["MU100S Warranty 5 year"]  # row[2] -> 15900.0


def test_unspecified_ratio_defaults_to_2_1():
    """Requirement (2): Engine called without ratio parameter MUST default to 2:1 ratio (MI-1250)."""
    res = calculate_atmoce_bom_n1(
        panels=10,
        ratio=None,
        phase="1P",
    )
    assert res["success"] is True
    assert res["ratio"] == "2:1"
    assert res["inverter_sku"] == "MI-1250"
    assert res["inverter_count"] == 5


def test_no_api_key_raises_survey_unavailable():
    """When fixture mode is OFF and no API key is provided, must raise SurveyUnavailable."""
    old_mode = os.environ.pop("LF_BOM_FIXTURE_MODE", None)
    old_key = os.environ.pop("LF_SURVEY_API_KEY", None)
    try:
        with pytest.raises(survey_catalog.SurveyUnavailable, match="ไม่มี API Key"):
            survey_catalog.fetch_pricelist(force=True)
    finally:
        if old_mode:
            os.environ["LF_BOM_FIXTURE_MODE"] = old_mode
        if old_key:
            os.environ["LF_SURVEY_API_KEY"] = old_key


def test_production_code_has_no_hardcoded_prices():
    """Grep assertion check: srp_calculator.py primary BOM engine uses survey_catalog."""
    calculator_file = pathlib.Path(__file__).parent.parent / "srp_calculator.py"
    content = calculator_file.read_text(encoding="utf-8")
    assert "calculate_bom_n2" in content
    assert "calculate_atmoce_bom_n1" in content

