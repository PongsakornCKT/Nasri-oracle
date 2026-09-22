#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
10 End-to-End test cases — full quotation build.
Each case simulates a real user request and validates ALL sections together:
  Section 1 — PV Panel (from sheet, model/type/warranty)
  Section 2 — Inverter (brand-specific detail lines)
  Section 3 — Battery  (brand-specific: ATMOCE/Dyness/Sigenergy/Huawei)
  + Warranty + Terms

Covers all changes:
  - Section 1: panel model, type, warranty from Google Sheet
  - Section 2: detailed per-brand x phase lines
  - Section 3: brand-specific battery text (ATMOCE/Dyness/Sigenergy)
  - Dyness battery qty fix (16kWh → proper combo, not DL5.0C x1)
"""
import sys, os, traceback

_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)
os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import QuotationGenerator, SELLING_PRICES, DEFAULT_PANEL, F, FB

gen = QuotationGenerator()

PASS_COUNT = 0
FAIL_COUNT = 0


def _text(item_tuple):
    """Extract all text from a section item."""
    lines = item_tuple[1]
    parts = []
    for entry in lines:
        if isinstance(entry, tuple) and len(entry) >= 3:
            parts.append(str(entry[2]))
        elif isinstance(entry, str):
            parts.append(entry)
    return ' '.join(parts)


def _find_section(items, keywords, skip=0):
    """Find the first section (after skip) whose text contains any keyword."""
    for item in items[skip:]:
        text = _text(item)
        if any(kw in text for kw in keywords):
            return text
    return ''


def run_test(name, fn):
    global PASS_COUNT, FAIL_COUNT
    try:
        fn()
        PASS_COUNT += 1
        print(f'  PASS  {name}')
    except AssertionError as e:
        FAIL_COUNT += 1
        safe = str(e).encode('ascii', 'replace').decode('ascii')[:250]
        print(f'  FAIL  {name}')
        print(f'        {safe}')
    except Exception as e:
        FAIL_COUNT += 1
        print(f'  ERR   {name}: {type(e).__name__}: {e}')
        traceback.print_exc()


# ══════════════════════════════════════════════════════════════
print('=' * 64)
print('E2E Full Quotation — 10 Cases')
print('=' * 64)


# ── E2E-1: ATMOCE 5kW 1P + battery + backup ──────────────────
# "ไอ่นัด ทำใบเสนอราคา atmoce 5kw 1เฟส แบท 7kw backup รวม 180000"
def test_e2e_1():
    items = gen._build_items('ATMOCE', 10, '1P', 5.0, True, True, 180000)
    assert len(items) >= 5, f'Expected >=5 items, got {len(items)}'

    # Section 1 — Panel
    s1 = _text(items[0])
    assert 'PV Panel' in s1, f'Sec1 missing PV Panel: {s1[:100]}'
    assert 'Watt' in s1, f'Sec1 missing Watt: {s1[:100]}'
    assert any(w in s1 for w in ['N-Type', 'TOPCON', 'Bifacial', 'Mono']), \
        f'Sec1 missing panel type: {s1[:150]}'

    # Section 2 — Inverter
    s2 = _text(items[1])
    assert 'MI-500' in s2, f'Sec2 missing MI-500: {s2[:100]}'
    assert '2C*4' in s2, f'Sec2 missing VCT 2C*4 for 1P: {s2[:200]}'
    assert 'Mounting' in s2, f'Sec2 missing Mounting: {s2[:200]}'
    assert 'SLD' in s2 or 'MEA/PEA' in s2, f'Sec2 missing SLD permit: {s2[:300]}'

    # Section 3 — Battery (ATMOCE + backup)
    s3 = _find_section(items, ['MS-7K', 'ESS', 'MU100'], skip=2)
    assert 'MS-7K' in s3, f'Sec3 missing MS-7K: {s3[:100]}'
    assert 'MU100S' in s3, f'Sec3 missing MU100S backup box: {s3[:200]}'
    assert 'AC Coupling' in s3, f'Sec3 missing AC Coupling: {s3[:300]}'

    # Pricing: sec1 + sec2 + sec3 = grand_total (or close)
    p1, p2, p3 = items[0][2], items[1][2], 0
    for it in items[2:]:
        t = _text(it)
        if 'MS-7K' in t or 'ESS' in t:
            p3 = it[2]
            break
    assert p1 + p2 + p3 > 0, 'Total price should be > 0'

run_test('E2E-1: ATMOCE 5kW 1P + batt + backup = 180K', test_e2e_1)


# ── E2E-2: Deye 10kW 3P + Dyness batt 16kWh (qty fix) ───────
# "ไอ่นัด ทำใบเสนอราคา deye 10kw 3เฟส dyness batt 16kw รวม 288000"
def test_e2e_2():
    items = gen._build_items('Deye', 16, '3P', 10.0, True, False, 288000,
                             data={'battery_kwh': 16})
    # Section 1 — Panel
    s1 = _text(items[0])
    assert 'PV Panel' in s1, f'Sec1: {s1[:100]}'

    # Section 2 — Deye 3P inverter
    s2 = _text(items[1])
    assert 'Deye' in s2 or 'Hybrid' in s2, f'Sec2 missing Deye: {s2[:100]}'
    assert '2C*6' in s2, f'Sec2 missing VCT 2C*6 for 3P: {s2[:200]}'
    assert 'Combiner' in s2, f'Sec2 missing Combiner Box: {s2[:200]}'

    # Section 3 — Dyness battery (NOT DL5.0C x1 !)
    s3 = _find_section(items, ['Dyness', 'BATTERY', 'LFP'], skip=2)
    assert 'Dyness' in s3, f'Sec3 missing Dyness: {s3[:100]}'
    # Must NOT be DL5.0C x1 with 5.1 kWh for a 16kWh request
    assert '5.1 kWh' not in s3 and '5.1kw' not in s3.lower(), \
        f'Sec3 still shows DL5.0C 5.1kWh (bug not fixed): {s3[:200]}'

run_test('E2E-2: Deye 10kW 3P + Dyness 16kWh (qty fix)', test_e2e_2)


# ── E2E-3: Sigenergy 10kW 3P + optimizer + batt 10kWh ────────
# "sigenergy 10kw 3phase optimizer batt 10kw 450000"
def test_e2e_3():
    items = gen._build_items('Sigenergy', 16, '3P', 10.0, True, False, 450000,
                             data={'has_optimizer': True, 'battery_kwh': 10})

    # Section 2 — Sigenergy with optimizer items inside
    s2 = _text(items[1])
    assert 'Sigenergy' in s2 or '5 in 1' in s2, f'Sec2: {s2[:100]}'
    assert 'Gateway Home TP 30K' in s2, f'Sec2 missing Gateway 30K: {s2[:200]}'
    assert 'ADCU' in s2, f'Sec2 missing ADCU: {s2[:300]}'
    assert 'Emergency Switch' in s2, f'Sec2 missing Emergency: {s2[:300]}'
    assert 'Optimizer 1200' in s2, f'Sec2 missing Optimizer: {s2[:400]}'
    assert 'Rapid Shutdown' in s2 and 'AMCL' in s2, f'Sec2 missing Rapid Shutdown: {s2[:400]}'

    # Section 3 (or 4) — Sigenergy battery
    s_batt = _find_section(items, ['SigenStor BAT', '314 Ah', 'Depth of Discharge'], skip=2)
    assert 'SigenStor' in s_batt, f'Batt section missing SigenStor: {s_batt[:100]}'
    assert '314 Ah' in s_batt, f'Batt missing 314 Ah: {s_batt[:200]}'
    assert '10,000' in s_batt or '10000' in s_batt, f'Batt missing 10K cycles: {s_batt[:200]}'
    assert 'AI' in s_batt, f'Batt missing AI: {s_batt[:200]}'

run_test('E2E-3: Sigenergy 10kW 3P + optimizer + batt 10kWh', test_e2e_3)


# ── E2E-4: Huawei 10kW 3P + batt 10kWh ──────────────────────
# "huawei 10kw 3phase batt 10kw 350000"
def test_e2e_4():
    items = gen._build_items('Huawei', 16, '3P', 10.0, True, False, 350000,
                             data={'battery_kwh': 10})

    # Section 2 — Huawei
    s2 = _text(items[1])
    assert 'Huawei' in s2, f'Sec2: {s2[:100]}'
    assert 'Smart meter' in s2 and 'CT' in s2, f'Sec2 missing Smart meter+CT: {s2[:200]}'
    assert '2C*6' in s2, f'Sec2 missing VCT 2C*6: {s2[:200]}'

    # Section 3 — Huawei battery (LUNA2000)
    s3 = _find_section(items, ['Battery', 'LUNA', 'Huawei', 'LFP'], skip=2)
    assert s3, 'Battery section not found'
    assert '10' in s3, f'Batt missing warranty/kWh: {s3[:200]}'

run_test('E2E-4: Huawei 10kW 3P + batt 10kWh', test_e2e_4)


# ── E2E-5: Solis 5kW 1P + Dyness batt + backup ─────────────
# "solis 5kw 1phase batt 10kw backup 250000"
def test_e2e_5():
    items = gen._build_items('Solis', 10, '1P', 5.0, True, True, 250000,
                             data={'battery_kwh': 10})

    # Section 2 — Solis 1P
    s2 = _text(items[1])
    assert 'Solis' in s2 or 'Hybrid' in s2, f'Sec2: {s2[:100]}'
    assert '2C*4' in s2, f'Sec2 missing VCT 2C*4 for 1P: {s2[:200]}'

    # Section 3 — Dyness + backup
    s3 = _find_section(items, ['Dyness', 'ATS', 'Backup'], skip=2)
    assert 'Dyness' in s3, f'Sec3 missing Dyness: {s3[:100]}'
    assert 'ATS' in s3 or 'Backup Box' in s3, f'Sec3 missing ATS Backup: {s3[:200]}'
    assert '1 Phase' in s3 or '1-phase' in s3, f'Sec3 missing 1P label: {s3[:200]}'

run_test('E2E-5: Solis 5kW 1P + Dyness batt + backup', test_e2e_5)


# ── E2E-6: Hoymiles 6kW 1P no battery ───────────────────────
# "hoymiles 6kw 1phase 155000"
def test_e2e_6():
    items = gen._build_items('Hoymiles', 10, '1P', 6.0, False, False, 155000)

    assert len(items) == 4, f'Expected 4 items (no batt), got {len(items)}'

    # Section 1 — Panel with model from sheet
    s1 = _text(items[0])
    assert 'Watt' in s1, f'Sec1 missing Watt: {s1[:100]}'

    # Section 2 — Hoymiles
    s2 = _text(items[1])
    assert 'Hoymiles' in s2 or 'Hybrid' in s2, f'Sec2: {s2[:100]}'
    assert 'Gateway' in s2 and 'CT' in s2, f'Sec2 missing Gateway+CT: {s2[:200]}'

    # No battery section
    for it in items[2:]:
        t = _text(it)
        assert 'Battery' not in t and 'ESS' not in t and 'Dyness' not in t, \
            f'Should not have battery section: {t[:100]}'

run_test('E2E-6: Hoymiles 6kW 1P no battery', test_e2e_6)


# ── E2E-7: ATMOCE 3P C&I 30kW (MI-1250) no battery ─────────
# "atmoce 30kw 3phase 600000"
def test_e2e_7():
    items = gen._build_items('ATMOCE', 60, '3P', 30.0, False, False, 600000)

    # Section 2 — ATMOCE C&I
    s2 = _text(items[1])
    assert 'MI-1250' in s2, f'Sec2 missing MI-1250 for C&I: {s2[:200]}'
    assert 'MC100' in s2, f'Sec2 missing MC100-Wye combiner: {s2[:200]}'
    assert '4C*6' in s2, f'Sec2 missing VCT 4C*6: {s2[:200]}'
    assert '1x10' in s2, f'Sec2 missing ground 1x10: {s2[:300]}'

run_test('E2E-7: ATMOCE 30kW 3P C&I (MI-1250)', test_e2e_7)


# ── E2E-8: Sigenergy 5kW 1P no optimizer ─────────────────────
# "sigenergy 5kw 1phase 250000"
def test_e2e_8():
    items = gen._build_items('Sigenergy', 10, '1P', 5.0, False, False, 250000,
                             data={'has_optimizer': False})

    # Section 2 — Sigenergy 1P without optimizer
    s2 = _text(items[1])
    assert 'Gateway HomePro SP' in s2, f'Sec2 missing 1P gateway: {s2[:200]}'
    assert 'ADCU' not in s2, f'Sec2 should NOT have ADCU without optimizer: {s2[:300]}'
    assert 'Rapid Shutdown' not in s2, f'Sec2 should NOT have Rapid Shutdown: {s2[:300]}'
    assert 'THW 35' in s2, f'Sec2 missing THW 35: {s2[:200]}'

run_test('E2E-8: Sigenergy 5kW 1P no optimizer', test_e2e_8)


# ── E2E-9: Deye 5kW 1P + Dyness 25kWh (multi-unit combo) ────
# "deye 5kw 1phase batt 25kw 350000"
def test_e2e_9():
    items = gen._build_items('Deye', 10, '1P', 5.0, True, False, 350000,
                             data={'battery_kwh': 25})

    # Section 3 — Dyness must NOT be single DL5.0C
    s3 = _find_section(items, ['Dyness', 'BATTERY', 'LFP', 'Energy Storage'], skip=2)
    assert 'Dyness' in s3, f'Sec3 missing Dyness: {s3[:100]}'
    # For 25kWh, total should be >= 20kWh (not 5.1kWh x1)
    assert '5.1kw' not in s3.lower(), \
        f'Sec3 bug: still 5.1kWh for 25kWh request: {s3[:200]}'

    # Section 1 — has panel warranty years
    s1 = _text(items[0])
    assert any(yr in s1 for yr in ['12', '15', '25', '30']), \
        f'Sec1 missing warranty years: {s1[:200]}'

run_test('E2E-9: Deye 5kW 1P + Dyness 25kWh combo', test_e2e_9)


# ── E2E-10: ATMOCE 6kW 3P + batt no backup (panel override) ─
# "atmoce 6kw 3phase batt แผง AIKO 670W 220000"
def test_e2e_10():
    items = gen._build_items('ATMOCE', 10, '3P', 6.0, True, False, 220000,
                             data={'panel_brand': 'AIKO', 'panel_watt': 670})

    # Section 1 — AIKO panel
    s1 = _text(items[0])
    assert 'AIKO' in s1, f'Sec1 missing AIKO override: {s1[:100]}'
    assert '670' in s1, f'Sec1 missing 670W: {s1[:100]}'

    # Section 2 — ATMOCE 3P residential (not C&I)
    s2 = _text(items[1])
    assert 'MI-500' in s2, f'Sec2 should be MI-500 (not C&I): {s2[:100]}'
    assert '4C*4' in s2, f'Sec2 missing VCT 4C*4 for 3P: {s2[:200]}'

    # Section 3 — ATMOCE battery no backup
    s3 = _find_section(items, ['MS-7K', 'ESS'], skip=2)
    assert 'MS-7K' in s3, f'Sec3 missing MS-7K: {s3[:100]}'
    assert 'MU100' not in s3, f'Sec3 should NOT have MU100 without backup: {s3[:200]}'
    assert '10,000' in s3 or '10000' in s3, f'Sec3 missing 10K cycle: {s3[:200]}'

run_test('E2E-10: ATMOCE 6kW 3P + batt no backup + AIKO 670W', test_e2e_10)


# ══════════════════════════════════════════════════════════════
print()
print('=' * 64)
print(f'E2E Results: {PASS_COUNT}/{PASS_COUNT + FAIL_COUNT} passed, {FAIL_COUNT} failed')
print('=' * 64)

sys.exit(1 if FAIL_COUNT else 0)
