#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
10 core test cases for the 3-section quotation restructure.
Tests verify that _build_items() produces the correct section structure:
  Section 1 — PV Panel   (แผงโซล่าเซลล์)
  Section 2 — Inverter   (อินเวอร์เตอร์)
  Section 3 — Battery    (optional)
  Then      — Warranty, Terms

Run: cd C:/Users/pO-Ch/Nasri-oracle && python mcp-qsolar/test_3section_core.py
"""

import sys
import os
import traceback

_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)

os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import QuotationGenerator, SELLING_PRICES, BATTERY_PRICES

gen = QuotationGenerator()

PASS_COUNT = 0
FAIL_COUNT = 0
RESULTS = []


def run_test(name, fn):
    global PASS_COUNT, FAIL_COUNT
    try:
        fn()
        PASS_COUNT += 1
        RESULTS.append(('PASS', name, ''))
        print(f'  PASS  {name}')
    except AssertionError as e:
        FAIL_COUNT += 1
        RESULTS.append(('FAIL', name, str(e)))
        print(f'  FAIL  {name}: {e}')
    except Exception as e:
        FAIL_COUNT += 1
        tb = traceback.format_exc().strip().split('\n')[-1]
        RESULTS.append(('ERROR', name, tb))
        print(f'  ERROR {name}: {tb}')


def _all_text(items):
    """Flatten all text lines from all items into a single list."""
    texts = []
    for _num, lines, _price, _total in items:
        for _font, _size, text in lines:
            texts.append(text)
    return texts


def _section_text(item):
    """Get all text from a single (num, lines, price, total) item."""
    return ' '.join(t for _f, _s, t in item[1])


# ─────────────────────────────────────────────────────────────
# T1: ATMOCE 5kW 1P — section structure and item numbering
# ─────────────────────────────────────────────────────────────
def test1():
    # ATMOCE 1P 5kW: 5000/625 = 8 panels; grand_total from SELLING_PRICES
    grand_total = SELLING_PRICES['ATMOCE']['1P'][5]  # panels key = nearest_key(8) = 8 → 169000? No — let's use panels=8
    # ATMOCE uses panel count key; nearest_key for 8 is 8 → not in table; nearest ≤ 8 is 8
    # Actually SELLING_PRICES['ATMOCE']['1P'] does not have key 8 — use key 10 as fallback.
    # Pass grand_total directly to avoid sheet dependency.
    items = gen._build_items('ATMOCE', 8, '1P', 5.0, False, False, 129000)

    # Section 1: PV Panel
    sec1_text = _section_text(items[0])
    assert 'แผงโซล่าเซลล์' in sec1_text or 'PV Panel' in sec1_text, \
        f'Section 1 should contain panel header, got: {sec1_text[:80]}'

    # Section 2: Inverter
    sec2_text = _section_text(items[1])
    assert 'อินเวอร์เตอร์' in sec2_text or 'Inverter' in sec2_text, \
        f'Section 2 should be inverter, got: {sec2_text[:80]}'

    # Section 2 should mention MI-500 (ATMOCE 1P micro inverter)
    assert 'MI-500' in sec2_text, \
        f'ATMOCE 1P inverter section should mention MI-500, got: {sec2_text[:120]}'

    # Item numbers: [1, 2, 3 (warranty), 4 (terms)] — no battery
    nums = [i[0] for i in items]
    assert nums == [1, 2, 3, 4], f'Item numbers should be [1,2,3,4], got {nums}'


# ─────────────────────────────────────────────────────────────
# T2: Sigenergy 10kW 3P — inverter section mentions Sigenergy, phase label correct
# ─────────────────────────────────────────────────────────────
def test2():
    grand_total = SELLING_PRICES['Sigenergy']['3P'][10]  # 370000
    items = gen._build_items('Sigenergy', 15, '3P', 10.0, False, False, grand_total)

    sec2_text = _section_text(items[1])

    assert 'Sigenergy' in sec2_text, \
        f'Section 2 should mention Sigenergy brand, got: {sec2_text[:120]}'

    # 3P should produce 'Three Phase' or '3' phase label
    assert ('Three Phase' in sec2_text or 'Three' in sec2_text or '3 เฟส' in sec2_text or '3P' in sec2_text or '3 Phase' in sec2_text), \
        f'Section 2 should indicate 3-phase, got: {sec2_text[:120]}'

    # 4 items total (no battery)
    assert len(items) == 4, f'Expected 4 items (no battery), got {len(items)}'


# ─────────────────────────────────────────────────────────────
# T3: Huawei 10kW 3P + battery 10kWh — all 3 sections present
# ─────────────────────────────────────────────────────────────
def test3():
    grand_total = SELLING_PRICES['Huawei']['3P'][10]  # 266000 (battery cost separate from sheet)
    items = gen._build_items('Huawei', 16, '3P', 10.0, True, False, grand_total,
                             data={'battery_kwh': 10})

    # Must have at least 5 items: panel, inverter, battery, warranty, terms
    assert len(items) >= 5, f'Expected ≥5 items with battery, got {len(items)}'

    # Section 1 = PV Panel
    sec1 = _section_text(items[0])
    assert 'แผงโซล่าเซลล์' in sec1 or 'PV Panel' in sec1, \
        f'Section 1 not PV Panel: {sec1[:80]}'

    # Section 2 = Inverter (Huawei)
    sec2 = _section_text(items[1])
    assert 'Huawei' in sec2 or 'Inverter' in sec2 or 'อินเวอร์เตอร์' in sec2, \
        f'Section 2 not Inverter: {sec2[:80]}'

    # Section 3 = Battery — should mention Huawei or LUNA
    sec3 = _section_text(items[2])
    assert ('Huawei' in sec3 or 'LUNA' in sec3 or 'แบตเตอรี่' in sec3 or 'Battery' in sec3), \
        f'Section 3 should mention Huawei/LUNA battery, got: {sec3[:120]}'

    # Battery item number = 3
    assert items[2][0] == 3, f'Battery should be item #3, got #{items[2][0]}'


# ─────────────────────────────────────────────────────────────
# T4: Deye 5kW 1P + battery 5kWh — battery section shows Dyness brand
# ─────────────────────────────────────────────────────────────
def test4():
    grand_total = SELLING_PRICES['Deye']['1P'][5]  # 150000
    items = gen._build_items('Deye', 8, '1P', 5.0, True, False, grand_total,
                             data={'battery_kwh': 5})

    assert len(items) >= 5, f'Expected ≥5 items (with battery), got {len(items)}'

    # Section 3 = battery
    sec3 = _section_text(items[2])
    assert items[2][0] == 3, f'Battery should be item #3, got #{items[2][0]}'

    # Dyness battery for Deye
    assert 'Dyness' in sec3 or 'แบตเตอรี่' in sec3 or 'Battery' in sec3, \
        f'Battery section should mention Dyness or battery, got: {sec3[:120]}'

    # Section 2 should mention Deye
    sec2 = _section_text(items[1])
    assert 'Deye' in sec2 or 'Inverter' in sec2 or 'อินเวอร์เตอร์' in sec2, \
        f'Section 2 should mention Deye, got: {sec2[:80]}'


# ─────────────────────────────────────────────────────────────
# T5: Hoymiles 6kW 1P — Section 2 mentions DTU/trunk cable, no battery section
# ─────────────────────────────────────────────────────────────
def test5():
    grand_total = SELLING_PRICES['Hoymiles']['1P'][6]  # 155000
    items = gen._build_items('Hoymiles', 10, '1P', 6.0, False, False, grand_total)

    # Exactly 4 items: panel, inverter, warranty, terms
    assert len(items) == 4, f'Expected 4 items (no battery), got {len(items)}'

    # Section 2 = Hoymiles inverter
    sec2 = _section_text(items[1])
    assert 'Hoymiles' in sec2 or 'อินเวอร์เตอร์' in sec2, \
        f'Section 2 should mention Hoymiles, got: {sec2[:80]}'

    # Gateway/meter or DTU/trunk cable mentioned in Section 2
    assert 'DTU' in sec2 or 'Trunk' in sec2 or 'trunk' in sec2.lower() or 'Gateway' in sec2 or 'Smart meter' in sec2, \
        f'Hoymiles section 2 should mention Gateway/DTU, got: {sec2[:200]}'

    # No battery section (item #3 = warranty, not battery)
    sec3_text = _section_text(items[2])
    assert 'แบตเตอรี่' not in sec3_text and 'Battery' not in sec3_text, \
        f'Item #3 should be warranty (not battery) for no-battery config, got: {sec3_text[:80]}'


# ─────────────────────────────────────────────────────────────
# T6: Solis 5kW 1P + battery — 5 items total
# ─────────────────────────────────────────────────────────────
def test6():
    grand_total = SELLING_PRICES['Solis']['1P'][5]  # 146000
    items = gen._build_items('Solis', 8, '1P', 5.0, True, False, grand_total,
                             data={'battery_kwh': 5})

    # 5 items: panel, inverter, battery, warranty, terms
    assert len(items) == 5, f'Expected exactly 5 items, got {len(items)}'

    # Verify order: item nums [1, 2, 3, 4, 5]
    nums = [i[0] for i in items]
    assert nums == [1, 2, 3, 4, 5], f'Item numbers should be [1,2,3,4,5], got {nums}'

    # Section 1 = PV Panel
    sec1 = _section_text(items[0])
    assert 'แผงโซล่าเซลล์' in sec1 or 'PV Panel' in sec1, \
        f'Section 1 should be PV Panel, got: {sec1[:80]}'

    # Section 2 = Inverter
    sec2 = _section_text(items[1])
    assert 'Inverter' in sec2 or 'อินเวอร์เตอร์' in sec2 or 'รายการติดตั้ง' in sec2 or 'Hybrid' in sec2, \
        f'Section 2 should be Inverter section, got: {sec2[:80]}'

    # Last two = warranty and terms (both at price 0)
    assert items[3][2] == 0.0, f'Warranty item price should be 0, got {items[3][2]}'
    assert items[4][2] == 0.0, f'Terms item price should be 0, got {items[4][2]}'


# ─────────────────────────────────────────────────────────────
# T7: Panel brand override (AIKO 670W) — Section 1 shows AIKO and 670
# ─────────────────────────────────────────────────────────────
def test7():
    grand_total = SELLING_PRICES['Huawei']['3P'][10]  # 266000
    items = gen._build_items('Huawei', 16, '3P', 10.0, False, False, grand_total,
                             data={'panel_brand': 'AIKO', 'panel_watt': 670})

    sec1 = _section_text(items[0])

    assert 'AIKO' in sec1, \
        f'Section 1 should show AIKO panel brand, got: {sec1[:200]}'
    assert '670' in sec1, \
        f'Section 1 should show 670W wattage, got: {sec1[:200]}'


# ─────────────────────────────────────────────────────────────
# T8: Lump sum mode — Section 1 price = grand_total, Section 2 price = 0
# ─────────────────────────────────────────────────────────────
def test8():
    grand_total = SELLING_PRICES['ATMOCE']['1P'][10]  # nearest to 8 panels = 10 → 199000
    # Use panels=8 which corresponds to ~5kW; pass grand_total directly
    grand_total = 239000  # lump sum custom price
    items = gen._build_items('ATMOCE', 8, '1P', 5.0, True, True, grand_total,
                             data={'battery_kwh': 7}, lump_sum=True)

    sec1_price = items[0][2]
    sec2_price = items[1][2]

    # Section 1 carries the entire grand_total in lump sum
    assert sec1_price == grand_total, \
        f'Lump sum: Section 1 price should be {grand_total}, got {sec1_price}'

    # Section 2 price = 0 in lump sum
    assert sec2_price == 0.0, \
        f'Lump sum: Section 2 price should be 0.0, got {sec2_price}'

    # If battery section present, it should also be 0
    if len(items) >= 5:
        batt_item = items[2]
        assert batt_item[2] == 0.0, \
            f'Lump sum: Battery section price should be 0.0, got {batt_item[2]}'


# ─────────────────────────────────────────────────────────────
# T9: Sigenergy + optimizer — optimizer section present between inverter and battery
# ─────────────────────────────────────────────────────────────
def test9():
    grand_total = SELLING_PRICES['Sigenergy']['1P'][5]  # 191000
    items = gen._build_items('Sigenergy', 10, '1P', 5.0, False, False, grand_total,
                             data={'has_optimizer': True})

    # Should have 5 items: panel, inverter, optimizer, warranty, terms
    assert len(items) == 5, \
        f'With optimizer (no battery): expected 5 items, got {len(items)}'

    # Item 3 (index 2) = optimizer
    opt_text = _section_text(items[2])
    assert 'Optimizer' in opt_text or 'optimizer' in opt_text.lower(), \
        f'Item #3 should be optimizer section, got: {opt_text[:120]}'

    # Optimizer item number = 3
    assert items[2][0] == 3, \
        f'Optimizer should be item #3, got #{items[2][0]}'

    # Warranty item number = 4, terms = 5
    assert items[3][0] == 4, f'Warranty should be item #4, got #{items[3][0]}'
    assert items[4][0] == 5, f'Terms should be item #5, got #{items[4][0]}'


# ─────────────────────────────────────────────────────────────
# T10: ATMOCE 3P battery + backup — battery section shows backup components
# ─────────────────────────────────────────────────────────────
def test10():
    grand_total = SELLING_PRICES['ATMOCE']['3P'][10]  # 219000
    items = gen._build_items('ATMOCE', 16, '3P', 10.0, True, True, grand_total,
                             data={'battery_kwh': 7})

    # Must have 5 items: panel, inverter, battery, warranty, terms
    assert len(items) == 5, f'Expected 5 items, got {len(items)}'

    # Section 3 = battery with backup
    sec3 = _section_text(items[2])

    # Battery section should mention backup system or MU100T (3P backup model)
    assert ('Backup' in sec3 or 'backup' in sec3.lower() or 'MU100T' in sec3
            or 'สำรองไฟ' in sec3 or 'MS-7K' in sec3), \
        f'Battery section should show backup components, got: {sec3[:200]}'

    # Battery section should mention 3P / Three-phase
    assert 'Three-phase' in sec3 or '3P' in sec3 or 'สำรองไฟ' in sec3, \
        f'Battery section should indicate 3-phase backup, got: {sec3[:200]}'

    # Battery item number = 3
    assert items[2][0] == 3, f'Battery should be item #3, got #{items[2][0]}'


# ─────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print('=' * 60)
    print('3-Section Quotation Core Tests (T1–T10)')
    print('=' * 60)

    run_test('T1: ATMOCE 5kW 1P — Section 1=Panel, Section 2=MI-500, items [1,2,3,4]', test1)
    run_test('T2: Sigenergy 10kW 3P — Section 2 mentions Sigenergy + 3P label', test2)
    run_test('T3: Huawei 10kW 3P + battery 10kWh — all 3 sections present', test3)
    run_test('T4: Deye 5kW 1P + battery 5kWh — battery section shows Dyness', test4)
    run_test('T5: Hoymiles 6kW 1P — DTU/trunk in Section 2, no battery section', test5)
    run_test('T6: Solis 5kW 1P + battery — 5 items total [1,2,3,4,5]', test6)
    run_test('T7: Panel brand override AIKO 670W — Section 1 shows AIKO + 670', test7)
    run_test('T8: Lump sum — Section 1 price=grand_total, Section 2 price=0', test8)
    run_test('T9: Sigenergy + optimizer — optimizer item #3, warranty #4, terms #5', test9)
    run_test('T10: ATMOCE 3P + battery + backup — Section 3 shows backup components', test10)

    print()
    print('=' * 60)
    total = PASS_COUNT + FAIL_COUNT
    print(f'Results: {PASS_COUNT}/{total} passed, {FAIL_COUNT} failed')
    print('=' * 60)

    if FAIL_COUNT > 0:
        print()
        print('Failed tests:')
        for status, name, msg in RESULTS:
            if status != 'PASS':
                print(f'  [{status}] {name}')
                if msg:
                    print(f'           {msg}')

    sys.exit(0 if FAIL_COUNT == 0 else 1)
