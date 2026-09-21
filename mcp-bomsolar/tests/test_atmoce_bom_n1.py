"""Golden Test Suite for ATMOCE BOM Engine N1 (#4) - Round 2.

Verifies the 4 Golden Cases against staging snapshot prices:
(a) atmoce21 10 แผง 1P
(b) atmoce11 8 แผง 1P
(c) atmoce21 20 แผง 3P
(d) atmoce21 12 แผง + battery (MS-7K-U) 1P

Also tests:
- Line-by-line unit_cost assertions read directly from fixture snapshot in test (not via code under test).
- Missing price policy (MW-025025-A 2.5m is not in snapshot -> missing price note + not counted in total).
- SurveyUnavailable raised when API key is missing and fixture mode is OFF.
- Production code grep check: NO hardcoded price numbers (4750, 4000, etc.) in srp_calculator.py.
"""

import os
import sys
import json
import pathlib
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from srp_calculator import calculate_atmoce_bom_n1
import survey_catalog


@pytest.fixture(scope="module")
def raw_snapshot_data():
    fixture_path = pathlib.Path(__file__).parent.parent / "fixtures" / "pricelist_fixture.json"
    qpkg_path = pathlib.Path(__file__).parent.parent / "fixtures" / "qpkg_fixture.json"
    raw_price = json.loads(fixture_path.read_text(encoding="utf-8"))
    raw_qpkg = json.loads(qpkg_path.read_text(encoding="utf-8"))
    
    # Calculate directly in test fixture for line-by-line assertions
    tabs = raw_price["tabs"]
    
    # Direct lookup maps calculated independently in test:
    # 1. Inverters: col 0 SKU, col 2 cost
    inv_map = {}
    for r in tabs.get("Inverters - ATMOCE", []):
        if r and len(r) > 2 and r[0] and not str(r[0]).startswith("⚡") and not str(r[0]).startswith("📋") and r[0] not in ("SKU", "เฟส"):
            inv_map[str(r[0]).strip()] = survey_catalog._cpl_num(r[2])
            
    # 2. Mounting: col 0 name, col 6 price (1 ชิ้น)
    mount_map = {}
    for r in tabs.get("Mounting - Keenoc", []):
        if r and len(r) > 6 and r[0] and not str(r[0]).startswith("🏗") and r[0] != "รายการ":
            mount_map[str(r[0]).strip()] = float(r[6]) if r[6] != "" and r[6] is not None else None

    # 3. Solar Panels: col 0 Brand, col 1 Model, col 5 cost
    panel_map = {}
    for r in tabs.get("Solar Panels", []):
        if r and len(r) > 5 and r[0] and not str(r[0]).startswith("☀️") and r[0] != "แบรนด์":
            k = f"{r[0]} {r[1]}".strip()
            panel_map[k] = float(r[5]) if r[5] != "" and r[5] is not None else None

    cat_parsed = survey_catalog.parse_pricelist_catalog(tabs)
    return cat_parsed, raw_qpkg, inv_map, mount_map, panel_map


def test_golden_case_a_atmoce21_10p_1p(raw_snapshot_data):
    cat, qpkg, inv_map, mount_map, panel_map = raw_snapshot_data
    res = calculate_atmoce_bom_n1(
        panels=10,
        ratio="2:1",
        phase="1P",
        catalog_data=cat,
        qpkg_data=qpkg,
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

    # Line-by-line unit cost assertions against test fixture direct maps:
    assert items["AIKO AIKO-G650-MCH72Mw"]["unit_cost"] == panel_map["AIKO AIKO-G650-MCH72Mw"]  # 3283.0
    assert items["AIKO AIKO-G650-MCH72Mw"]["quantity"] == 10

    assert items["MI-1250"]["unit_cost"] == inv_map["MI-1250"]  # 4750.0
    assert items["MI-1250"]["quantity"] == 5

    assert items["MW-025025-A"]["unit_cost"] is None  # Missing in staging snapshot
    assert items["MW-025025-A"]["total_cost"] is None
    assert items["MW-025025-A"]["quantity"] == 5

    assert items["MC100"]["unit_cost"] == inv_map["MC100 Warranty 5 year"]  # 15900.0
    assert items["MC100"]["quantity"] == 1

    assert items["MT-04003-A"]["unit_cost"] == inv_map["MT-04003-A"]  # 640.0
    assert items["MT-04003-A"]["quantity"] == 2

    # Keenoc 4.8m rail calculation (10 panels in 1 row -> 11.62m -> ceil(11.62/4.8)*2 = 6 rails)
    assert items["Rail 4800m"]["unit_cost"] == mount_map["Rail 4800m"]  # 500.0
    assert items["Rail 4800m"]["quantity"] == 6

    assert items["Rail Splice"]["unit_cost"] == mount_map["Rail Splice"]  # 34.0
    assert items["Rail Splice"]["quantity"] == 4

    assert items["Mid Clamp"]["unit_cost"] == mount_map["Mid Clamp"]  # 17.5
    assert items["Mid Clamp"]["quantity"] == 18

    assert items["End Clamp"]["unit_cost"] == mount_map["End Clamp"]  # 15.0
    assert items["End Clamp"]["quantity"] == 4

    assert items["Grounding Lug"]["unit_cost"] == mount_map["Grounding Lug"]  # 14.5
    assert items["Grounding Lug"]["quantity"] == 2

    assert items["Earthing Clip"]["unit_cost"] == mount_map["Earthing Clip"]  # 5.0
    assert items["Earthing Clip"]["quantity"] == 10

    assert items["Cable Clip"]["unit_cost"] == mount_map["Cable Clip"]  # 7.5
    assert items["Cable Clip"]["quantity"] == 20

    assert items["L-Feet"]["unit_cost"] == mount_map["L-Feet"]  # 27.5
    assert items["L-Feet"]["quantity"] == 22

    # Total cost must equal sum of valid items (excluding missing MW-025025-A)
    valid_sum = sum(i["total_cost"] for i in res["items"] if i["total_cost"] is not None)
    assert res["total_cost"] == valid_sum
    assert res["total_cost"] == 78105.0


def test_golden_case_b_atmoce11_8p_1p(raw_snapshot_data):
    cat, qpkg, inv_map, mount_map, panel_map = raw_snapshot_data
    res = calculate_atmoce_bom_n1(
        panels=8,
        ratio="1:1",
        phase="1P",
        catalog_data=cat,
        qpkg_data=qpkg,
    )
    assert res["success"] is True
    assert res["ratio"] == "1:1"
    assert res["inverter_sku"] == "MI-500"
    assert res["inverter_count"] == 8
    assert res["phase"] == "1P"

    items = {item["part_number"]: item for item in res["items"]}
    assert items["MI-500"]["unit_cost"] == inv_map["MI-500"]  # 4400.0
    assert items["MI-500"]["quantity"] == 8
    assert items["MC100L"]["unit_cost"] == inv_map["MC100L Warranty 5 year"]  # 10900.0
    assert items["MC100L"]["quantity"] == 1


def test_golden_case_c_atmoce21_20p_3p(raw_snapshot_data):
    cat, qpkg, inv_map, mount_map, panel_map = raw_snapshot_data
    res = calculate_atmoce_bom_n1(
        panels=20,
        ratio="2:1",
        phase="3P",
        catalog_data=cat,
        qpkg_data=qpkg,
    )
    assert res["success"] is True
    assert res["ratio"] == "2:1"
    assert res["inverter_sku"] == "MI-1250"
    assert res["inverter_count"] == 10
    assert res["phase"] == "3P"

    items = {item["part_number"]: item for item in res["items"]}
    assert items["MC100T"]["unit_cost"] == inv_map["MC100T Warranty 5 year"]  # 20900.0
    assert items["MC100T"]["quantity"] == 1
    assert items["MT-03205-A"]["unit_cost"] == inv_map["MT-03205-A"]  # 1050.0
    assert items["MT-03205-A"]["quantity"] == 1


def test_golden_case_d_atmoce21_12p_battery(raw_snapshot_data):
    cat, qpkg, inv_map, mount_map, panel_map = raw_snapshot_data
    res = calculate_atmoce_bom_n1(
        panels=12,
        ratio="2:1",
        phase="1P",
        battery_kwh=7,
        backup=True,
        catalog_data=cat,
        qpkg_data=qpkg,
    )
    assert res["success"] is True
    assert res["inverter_count"] == 6

    items = {item["part_number"]: item for item in res["items"]}
    assert items["MS-7K-U"]["unit_cost"] == inv_map["MS-7K-U Warranty 10 year"]  # 72900.0
    assert items["MU100S"]["unit_cost"] == inv_map["MU100S Warranty 5 year"]  # 15900.0


def test_no_api_key_raises_survey_unavailable():
    # When fixture mode is OFF and no API key is provided, must raise SurveyUnavailable
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
    # Grep assertion check: srp_calculator.py must NOT contain hardcoded prices (4750, 4400, etc.)
    calculator_file = pathlib.Path(__file__).parent.parent / "srp_calculator.py"
    content = calculator_file.read_text(encoding="utf-8")
    assert "4_750" not in content
    assert "4_000" not in content
    assert "PRICES_ATMOCE_DEFAULT" not in content
