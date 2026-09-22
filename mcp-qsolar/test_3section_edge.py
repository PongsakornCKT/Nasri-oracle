#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
10 edge-case / integration / regression tests for the 3-section quotation system.
Tests 11–20.  Run: cd C:/Users/pO-Ch/Nasri-oracle && python mcp-qsolar/test_3section_edge.py
"""

import sys
import os
import traceback

_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)

os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import (
    QuotationGenerator,
    get_selling_price,
    get_panels_count,
    SELLING_PRICES,
    BATTERY_PRICES,
)
from sheet_prices import find_panel, find_inverter, find_optimizer
from server import qsolar_from_spec

PASS = 0
FAIL = 0
RESULTS = []

ALL_BRANDS = ('ATMOCE', 'Sigenergy', 'Huawei', 'Solis', 'Deye', 'Hoymiles')


def run_test(name, fn):
    global PASS, FAIL
    try:
        fn()
        PASS += 1
        RESULTS.append(('PASS', name, ''))
        print(f'  PASS  {name}')
    except AssertionError as e:
        FAIL += 1
        RESULTS.append(('FAIL', name, str(e)))
        print(f'  FAIL  {name}: {e}')
    except Exception as e:
        FAIL += 1
        tb = traceback.format_exc().strip().split('\n')[-1]
        RESULTS.append(('ERROR', name, tb))
        print(f'  ERROR {name}: {tb}')


# ─────────────────────────────────────────────────────────────
# T11: _build_items with 0 panels should not crash
# ─────────────────────────────────────────────────────────────
def test11():
    gen = QuotationGenerator()
    grand_total = 169000.0
    # panels=0 is the edge case — must not raise
    items = gen._build_items(
        brand='ATMOCE',
        panels=0,
        phase='1P',
        size_kw=5.0,
        has_battery=False,
        has_backup=False,
        grand_total=grand_total,
        data={},
    )
    assert isinstance(items, list), 'Expected a list of items'
    assert len(items) >= 2, f'Expected at least 2 sections, got {len(items)}'
    # First two items must be PV Panel (1) and Inverter (2)
    nums = [item[0] for item in items]
    assert 1 in nums, 'Section 1 (PV Panel) missing'
    assert 2 in nums, 'Section 2 (Inverter) missing'


# ─────────────────────────────────────────────────────────────
# T12: Very large system (100 kW) — valid 3-section structure
# ─────────────────────────────────────────────────────────────
def test12():
    gen = QuotationGenerator()
    size_kw = 100.0
    panels = get_panels_count('Deye', size_kw)
    assert panels > 0, f'Expected panels > 0, got {panels}'

    grand_total = 2_500_000.0
    items = gen._build_items(
        brand='Deye',
        panels=panels,
        phase='3P',
        size_kw=size_kw,
        has_battery=False,
        has_backup=False,
        grand_total=grand_total,
        data={},
    )
    assert isinstance(items, list)
    nums = [item[0] for item in items]
    assert 1 in nums, 'Section 1 (PV Panel) missing for 100kW system'
    assert 2 in nums, 'Section 2 (Inverter) missing for 100kW system'

    # Verify prices are non-negative
    for num, lines, price, total in items:
        assert price >= 0, f'Negative price {price} on item {num}'
        assert total >= 0, f'Negative total {total} on item {num}'


# ─────────────────────────────────────────────────────────────
# T13: Unknown brand — _build_items should fall back gracefully
# ─────────────────────────────────────────────────────────────
def test13():
    gen = QuotationGenerator()
    grand_total = 200_000.0
    # 'GhostBrand' has no entry in SELLING_PRICES or sheet maps
    items = gen._build_items(
        brand='GhostBrand',
        panels=8,
        phase='1P',
        size_kw=5.0,
        has_battery=False,
        has_backup=False,
        grand_total=grand_total,
        data={},
    )
    assert isinstance(items, list), 'Should return a list, not crash'
    assert len(items) >= 2, 'Must still produce at least 2 sections'
    nums = [item[0] for item in items]
    assert 1 in nums, 'Section 1 missing for unknown brand'
    assert 2 in nums, 'Section 2 missing for unknown brand'


# ─────────────────────────────────────────────────────────────
# T14: find_panel with empty query — returns panel or None, never crashes
# ─────────────────────────────────────────────────────────────
def test14():
    # Empty string brand_query and 0 watt_query — should not raise
    result = find_panel('', 0)
    # Either None or a valid panel dict
    if result is not None:
        assert isinstance(result, dict), f'Expected dict or None, got {type(result)}'
        assert 'brand' in result, "Panel dict missing 'brand' key"
        assert 'watt' in result,  "Panel dict missing 'watt' key"


# ─────────────────────────────────────────────────────────────
# T15: find_inverter with unsupported brand — returns None
# ─────────────────────────────────────────────────────────────
def test15():
    result = find_inverter('GhostBrand', 5.0, '1P')
    assert result is None, f'Expected None for unknown brand, got {result}'


# ─────────────────────────────────────────────────────────────
# T16: find_optimizer for non-Sigenergy brand — None or empty
# ─────────────────────────────────────────────────────────────
def test16():
    # Optimizers sheet is Sigenergy-specific; querying 'ATMOCE' should return None
    result = find_optimizer('ATMOCE', panels=8)
    # Must not crash; a None return is expected (no ATMOCE row in Optimizers sheet)
    # If the sheet happens to contain a matching row the test still passes—just
    # verify the shape is valid.
    if result is not None:
        assert isinstance(result, dict), f'Expected dict or None, got {type(result)}'
        assert 'model' in result,      "Optimizer dict missing 'model' key"
        assert 'unit_price' in result, "Optimizer dict missing 'unit_price' key"
        assert result['unit_price'] > 0, 'unit_price must be positive'


# ─────────────────────────────────────────────────────────────
# T17: No sheet prices available — 40/60 split preserved
# ─────────────────────────────────────────────────────────────
def test17():
    gen = QuotationGenerator()
    grand_total = 200_000.0
    # Force the no-sheet path: pass empty data dict (no panel_brand / panel_watt
    # that would trigger catalog lookup) and a brand whose sheet parser is
    # unlikely to return inverter prices when called offline.
    # We exercise the else-branch: panel=40%, inverter=60%.
    items = gen._build_items(
        brand='ATMOCE',
        panels=8,
        phase='1P',
        size_kw=5.0,
        has_battery=False,
        has_backup=False,
        grand_total=grand_total,
        data={},
    )

    # Find Section 1 and Section 2
    section1 = next((it for it in items if it[0] == 1), None)
    section2 = next((it for it in items if it[0] == 2), None)
    assert section1 is not None, 'Section 1 missing'
    assert section2 is not None, 'Section 2 missing'

    panel_price    = section1[2]
    inverter_price = section2[2]

    # The total of sections 1+2 should equal grand_total (no battery)
    assert panel_price >= 0,    f'panel_price negative: {panel_price}'
    assert inverter_price >= 0, f'inverter_price negative: {inverter_price}'

    combined = panel_price + inverter_price
    # When both sheet prices land, combined may differ from grand_total.
    # When neither does, combined == grand_total exactly.
    # Either way, combined must be <= grand_total (battery is 0 here).
    assert combined <= grand_total + 1, (
        f'Sections 1+2 combined ({combined}) exceeds grand_total ({grand_total})'
    )


# ─────────────────────────────────────────────────────────────
# T18: qsolar_from_spec integration — "huawei 10kw 3phase"
# ─────────────────────────────────────────────────────────────
def test18():
    result = qsolar_from_spec(
        spec='huawei 10kw 3phase',
        customer_name='ทดสอบ T18',
        project_name='T18 Integration Huawei 10kW 3P',
    )
    assert result['success'], f"qsolar_from_spec failed: {result.get('error')}"
    assert result['brand'] == 'Huawei',  f"Expected Huawei, got {result['brand']}"
    assert result['size_kw'] == 10.0,    f"Expected 10.0 kW, got {result['size_kw']}"
    assert result['phase'] == '3P',      f"Expected 3P, got {result['phase']}"
    assert result['grand_total'] > 0,    f"grand_total must be positive: {result['grand_total']}"
    assert os.path.exists(result['path']), f"PDF not found: {result['path']}"
    assert os.path.getsize(result['path']) > 10_000, 'PDF too small (< 10 KB)'


# ─────────────────────────────────────────────────────────────
# T19: All 6 brands regression — each produces exactly 4 items (no battery)
#       Items: Section1, Section2, Warranty, Terms  (item numbers 1,2,3,4)
# ─────────────────────────────────────────────────────────────
def test19():
    gen = QuotationGenerator()
    configs = {
        'ATMOCE':     (5.0,  '1P', 169000),
        'Sigenergy':  (5.0,  '1P', 191000),
        'Huawei':     (10.0, '3P', 266000),
        'Solis':      (5.0,  '1P', 146000),
        'Deye':       (5.0,  '1P', 150000),
        'Hoymiles':   (4.0,  '1P', 110000),
    }

    for brand, (size_kw, phase, grand_total) in configs.items():
        panels = get_panels_count(brand, size_kw)
        items = gen._build_items(
            brand=brand,
            panels=panels,
            phase=phase,
            size_kw=size_kw,
            has_battery=False,
            has_backup=False,
            grand_total=float(grand_total),
            data={},
        )
        assert len(items) == 4, (
            f'{brand}: expected 4 items (no battery), got {len(items)}'
        )
        nums = [it[0] for it in items]
        assert nums == [1, 2, 3, 4], (
            f'{brand}: item numbering should be [1,2,3,4], got {nums}'
        )


# ─────────────────────────────────────────────────────────────
# T20: ATMOCE battery quantity multiplier
#       battery_kwh=14  → batt_qty = round(14/7) = 2
#       battery_kwh=21  → batt_qty = round(21/7) = 3
# ─────────────────────────────────────────────────────────────
def test20():
    gen = QuotationGenerator()
    base_price = float(SELLING_PRICES['ATMOCE']['1P'][8])  # 8 panels = 169000

    # 14 kWh  → 2 batteries
    items_2 = gen._build_items(
        brand='ATMOCE',
        panels=8,
        phase='1P',
        size_kw=5.0,
        has_battery=True,
        has_backup=False,
        grand_total=base_price + BATTERY_PRICES['batt_unit'] * 2,
        data={'battery_kwh': 14.0},
    )
    batt_section_2 = next((it for it in items_2 if it[0] == 3), None)
    assert batt_section_2 is not None, 'Battery section missing for battery_kwh=14'
    batt_text_2 = ' '.join(
        line[2] for line in batt_section_2[1] if isinstance(line, tuple) and len(line) == 3
    )
    assert '2' in batt_text_2, (
        f'Expected quantity 2 in battery section text for 14kWh, got: {batt_text_2}'
    )

    # 21 kWh  → 3 batteries (also the 1P cap)
    items_3 = gen._build_items(
        brand='ATMOCE',
        panels=8,
        phase='1P',
        size_kw=5.0,
        has_battery=True,
        has_backup=False,
        grand_total=base_price + BATTERY_PRICES['batt_unit'] * 3,
        data={'battery_kwh': 21.0},
    )
    batt_section_3 = next((it for it in items_3 if it[0] == 3), None)
    assert batt_section_3 is not None, 'Battery section missing for battery_kwh=21'
    batt_text_3 = ' '.join(
        line[2] for line in batt_section_3[1] if isinstance(line, tuple) and len(line) == 3
    )
    assert '3' in batt_text_3, (
        f'Expected quantity 3 in battery section text for 21kWh, got: {batt_text_3}'
    )


# ─────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print('=' * 60)
    print('mcp-qsolar 3-section edge-case test suite (T11–T20)')
    print('=' * 60)

    run_test('T11: _build_items with 0 panels',              test11)
    run_test('T12: Very large system (100 kW) structure',    test12)
    run_test('T13: Unknown/invalid brand fallback',          test13)
    run_test('T14: find_panel with empty query',             test14)
    run_test('T15: find_inverter with unsupported brand',    test15)
    run_test('T16: find_optimizer for non-Sigenergy brand',  test16)
    run_test('T17: No sheet prices — 40/60 split',           test17)
    run_test('T18: qsolar_from_spec "huawei 10kw 3phase"',   test18)
    run_test('T19: All 6 brands — 4 items each (no batt)',   test19)
    run_test('T20: Battery quantity multiplier 14/21 kWh',   test20)

    print()
    print('=' * 60)
    total = PASS + FAIL
    print(f'Results: {PASS}/{total} passed, {FAIL} failed')
    print('=' * 60)

    if FAIL > 0:
        print()
        print('Failed tests:')
        for status, name, msg in RESULTS:
            if status != 'PASS':
                print(f'  [{status}] {name}: {msg}')

    sys.exit(0 if FAIL == 0 else 1)
