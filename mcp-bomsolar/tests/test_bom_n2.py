"""Golden Test Suite for Unified BOM Engine N2 (#N2).

Verifies the 6 Golden Cases against raw staging snapshot prices extracted directly in test:
1. atmoce21 10p 1P (2.5m cable with price 605 in pricelist_fixture_2p5.json)
2. atmoce11 8p 1P
3. sigenergy5in1 16p 3P
4. sigenneo 10p 1P
5. sigenci 50kW 3P + backup + 1C battery
6. atmoce_ac 1P AC coupling with 7kWh battery

Strict Mutation Rules:
- Direct raw index extractions in test (r[4] for Sigenergy, r[6] for Keenoc, r[6]/r[5] for Cables, r[2] for ATMOCE/Combiners, r[5] for Panels).
- NEVER call survey_catalog.parse_pricelist_catalog in tests to build expected values.
- Engine called with catalog_data=None under test.
"""

import os
import sys
import json
import re
import pathlib
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from srp_calculator import calculate_bom_n2, calculate_atmoce_bom_n1
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
def raw_fixture_2p5_extracts():
    fixture_path = pathlib.Path(__file__).parent.parent / "fixtures" / "pricelist_fixture_2p5.json"
    raw_price = json.loads(fixture_path.read_text(encoding="utf-8"))
    tabs = raw_price.get("tabs", {})

    # Direct raw extraction in test file using EXACT INDEXES:
    # 1. Inverters - ATMOCE & Combiner: r[0] SKU/name, r[2] cost (STRICT INDEX 2)
    inv_atmoce = {}
    for r in tabs.get("Inverters - ATMOCE", []):
        if isinstance(r, list) and len(r) > 2 and r[0] and not str(r[0]).startswith("⚡") and not str(r[0]).startswith("📋") and r[0] not in ("SKU", "เฟส"):
            inv_atmoce[str(r[0]).strip()] = _num(r[2])

    # 2. Inverters - Sigenergy: r[1] model, r[4] cost (STRICT INDEX 4)
    sig_raw = {}
    for r in tabs.get("Inverters - Sigenergy", []):
        if isinstance(r, list) and len(r) > 4 and r[1] and not str(r[0]).startswith("⚡") and r[0] != "หมวด":
            model = str(r[1]).strip()
            sig_raw[model] = _num(r[4])

    # 3. Mounting - Keenoc: r[0] name, r[6] price 1 piece (STRICT INDEX 6)
    mount_raw = {}
    for r in tabs.get("Mounting - Keenoc", []):
        if isinstance(r, list) and len(r) > 6 and r[0] and not str(r[0]).startswith("🏗") and r[0] != "รายการ":
            mount_raw[str(r[0]).strip()] = _num(r[6])

    # 4. Cables: r[1] brand, r[2] model, r[6] (<50k) fallback to r[5] (≥50k) (STRICT INDEX 6 / INDEX 5)
    cable_raw = {}
    for r in tabs.get("Cables", []):
        if isinstance(r, list) and len(r) > 5 and r[0] and not str(r[0]).startswith("🔌") and not str(r[0]).startswith("⚡") and r[0] != "ประเภท":
            brand = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
            model = str(r[2] if len(r) > 2 and r[2] is not None else "").strip()
            detail = str(r[3] if len(r) > 3 and r[3] is not None else "").strip()
            unit = str(r[4] if len(r) > 4 and r[4] is not None else "").strip()
            if not model:
                continue
            full_name = f"{brand} {model}".strip()
            p6 = _num(r[6]) if len(r) > 6 else None
            p5 = _num(r[5]) if len(r) > 5 else None
            val = p6 if p6 is not None else p5
            if val is not None and ("ม้วน" in unit or "100m" in model.lower() or "100m" in detail.lower()):
                val = round(val / 100.0, 4)
            cable_raw[full_name] = val

    # 5. Solar Panels: r[0] brand, r[1] model, r[5] cost (STRICT INDEX 5)
    panel_raw = {}
    for r in tabs.get("Solar Panels", []):
        if isinstance(r, list) and len(r) > 5 and r[0] and not str(r[0]).startswith("☀️") and r[0] != "แบรนด์":
            brand = str(r[0]).strip()
            model = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
            panel_raw[f"{brand} {model}".strip()] = _num(r[5])

    return inv_atmoce, sig_raw, mount_raw, cable_raw, panel_raw


def test_golden_1_atmoce21_10p_1p_2p5(raw_fixture_2p5_extracts):
    inv_atmoce, sig_raw, mount_raw, cable_raw, panel_raw = raw_fixture_2p5_extracts

    res = calculate_bom_n2(
        system="atmoce21",
        panels=10,
        phase="1P",
        fixture_filename="pricelist_fixture_2p5.json",
        catalog_data=None,
        qpkg_data=None,
    )
    assert res["success"] is True
    assert res["has_missing_price"] is False
    assert res["missing_items"] == []

    line_map = {l["k"]: l for l in res["lines"]}

    # Direct raw index assertions
    assert line_map["panel"]["c"] == panel_raw["AIKO AIKO-G650-MCH72Mw"]  # row[5] -> 3283.0
    assert line_map["inv"]["c"] == inv_atmoce["MI-1250"]  # row[2] -> 4750.0
    assert line_map["accable"]["c"] == inv_atmoce["MW-025025-A"]  # row[2] -> 605.0 in pricelist_fixture_2p5.json!
    assert line_map["accable"]["c"] == 605.0

    # Mounting assertions against raw index 6
    assert line_map["mnt:Rail 4800m"]["c"] == mount_raw["Rail 4800m"]  # row[6] -> 500.0
    assert line_map["mnt:Rail 4800m"]["q"] == 6.0

    assert line_map["D:meaFee"]["c"] == 6000.0  # 10 kW -> 6000 THB MEA fee


def test_golden_2_atmoce11_8p_1p(raw_fixture_2p5_extracts):
    inv_atmoce, sig_raw, mount_raw, cable_raw, panel_raw = raw_fixture_2p5_extracts

    res = calculate_bom_n2(
        system="atmoce11",
        panels=8,
        phase="1P",
        fixture_filename="pricelist_fixture_2p5.json",
        catalog_data=None,
        qpkg_data=None,
    )
    assert res["success"] is True
    line_map = {l["k"]: l for l in res["lines"]}
    assert line_map["inv"]["c"] == inv_atmoce["MI-500"]  # row[2] -> 4400.0
    assert line_map["inv"]["q"] == 8.0


def test_golden_3_sigenergy5in1_16p_3p(raw_fixture_2p5_extracts):
    inv_atmoce, sig_raw, mount_raw, cable_raw, panel_raw = raw_fixture_2p5_extracts

    res = calculate_bom_n2(
        system="sigenergy5in1",
        panels=16,
        phase="3P",
        fixture_filename="pricelist_fixture_2p5.json",
        catalog_data=None,
        qpkg_data=None,
    )
    assert res["success"] is True
    assert res["has_missing_price"] is False
    line_map = {l["k"]: l for l in res["lines"]}

    # Sigenergy hardware assertions against raw index 4
    assert line_map["inv"]["c"] == sig_raw["SigenStor EC 10.0 TP"]  # row[4] -> 70000.0
    assert line_map["amcp"]["c"] == sig_raw["Optimizer2:1"]  # row[4] -> 1900.0
    assert line_map["amcp"]["q"] == 8.0  # ceil(16 / 2) = 8 optimizers

    assert line_map["D:meaFee"]["c"] == 8500.0  # 10.4 kW -> 8500 THB MEA fee


def test_golden_4_sigenneo_10p_1p(raw_fixture_2p5_extracts):
    inv_atmoce, sig_raw, mount_raw, cable_raw, panel_raw = raw_fixture_2p5_extracts

    res = calculate_bom_n2(
        system="sigenneo",
        panels=10,
        phase="1P",
        fixture_filename="pricelist_fixture_2p5.json",
        catalog_data=None,
        qpkg_data=None,
    )
    assert res["success"] is True
    line_map = {l["k"]: l for l in res["lines"]}
    assert line_map["amcp"]["q"] == 5.0  # ceil(10 / 2) = 5 optimizers


def test_golden_5_sigenci_50kw_backup_1c(raw_fixture_2p5_extracts):
    inv_atmoce, sig_raw, mount_raw, cable_raw, panel_raw = raw_fixture_2p5_extracts

    res = calculate_bom_n2(
        system="sigenci",
        kw=50,
        phase="3P",
        battery_kwh=100,
        backup=True,
        c_rate="1C",
        fixture_filename="pricelist_fixture_2p5.json",
        catalog_data=None,
        qpkg_data=None,
    )
    assert res["success"] is True
    line_map = {l["k"]: l for l in res["lines"]}

    # C&I assertions against raw index 4
    assert line_map["inv"]["n"] == "Sigen PV 50M1-HYB"
    assert line_map["inv"]["c"] == sig_raw["Sigen PV 50M1-HYB"]  # row[4] -> 161100.0

    assert line_map["batt"]["n"] == "SigenStack BAT 12.0 (M2)"
    assert line_map["batt"]["c"] == sig_raw["SigenStack BAT 12.0"]  # row[4] -> 83200.0
    assert line_map["batt"]["q"] == 9.0  # ceil(100 / 12.06) = 9 units

    assert line_map["D:meaFee"]["c"] == 21500.0  # 50 kW -> 21500 THB MEA fee


def test_golden_6_atmoce_ac_coupling(raw_fixture_2p5_extracts):
    inv_atmoce, sig_raw, mount_raw, cable_raw, panel_raw = raw_fixture_2p5_extracts

    res = calculate_bom_n2(
        system="atmoce_ac",
        phase="1P",
        battery_kwh=7,
        backup=True,
        fixture_filename="pricelist_fixture_2p5.json",
        catalog_data=None,
        qpkg_data=None,
    )
    assert res["success"] is True
    line_map = {l["k"]: l for l in res["lines"]}

    assert line_map["batt"]["n"] == "MS-7K-U"
    assert line_map["backup"]["n"] == "MU100S"
    assert line_map["labor:flat"]["q"] == 1.0
    assert "panel" not in line_map  # AC coupling has no panels!


def test_no_key_raises_survey_unavailable():
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
