#!/usr/bin/env python3
"""
Test suite for Section 1 (PV Panel) — validates panel info from sheet flows into PDF.
"""
import sys, os
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)
os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import QuotationGenerator, SELLING_PRICES, DEFAULT_PANEL, F, FB

gen = QuotationGenerator()

passed = 0
failed = 0


def _section_text(item_tuple):
    lines = item_tuple[1]
    parts = []
    for entry in lines:
        if isinstance(entry, tuple) and len(entry) >= 3:
            parts.append(str(entry[2]))
        elif isinstance(entry, str):
            parts.append(entry)
    return ' '.join(parts)


def check(name, condition, detail=''):
    global passed, failed
    if condition:
        passed += 1
        print(f'  PASS  {name}')
    else:
        failed += 1
        safe = detail.encode('ascii', 'replace').decode('ascii')[:150]
        print(f'  FAIL  {name}: {safe}')


def get_sec1(brand, panels, phase, size_kw, grand_total=200000, data=None):
    items = gen._build_items(brand, panels, phase, size_kw, False, False,
                             grand_total, data=data or {})
    return _section_text(items[0])


print('=' * 60)
print('Section 1 - PV Panel Test Suite (20 cases)')
print('=' * 60)

# ── T1-T5: Default panel (sheet data or hardcoded fallback) ──
s = get_sec1('ATMOCE', 10, '1P', 5.0)
check('T1: Default — has a brand name in header', 'PV Panel' in s and '---' not in s.split('PV Panel')[1][:30], s[:200])
check('T2: Default — has model line', 'Watt' in s, s[:200])
check('T3: Default — has technology type', 'N-Type' in s or 'TOPCON' in s or 'Bifacial' in s or 'HJT' in s or 'Mono' in s, s[:200])
check('T4: Default — has warranty years', any(yr in s for yr in ['12', '15', '25', '30']), s[:200])
check('T5: Default — 10 panels', '10' in s, s[:200])

# ── T6-T7: Explicit panel brand override (AIKO 670W) ──
s = get_sec1('Huawei', 16, '3P', 10.0, grand_total=300000,
             data={'panel_brand': 'AIKO', 'panel_watt': 670})
check('T6: Override — AIKO brand shown', 'AIKO' in s, s[:200])
check('T7: Override — 670 watt shown', '670' in s, s[:200])

# ── T8: JA Solar explicit ──
s = get_sec1('Deye', 10, '1P', 5.0, data={'panel_brand': 'JA Solar', 'panel_watt': 640})
check('T8: JA Solar explicit — model or brand shown', 'JA' in s or 'JAM' in s, s[:200])

# ── T9: Section 1 header format "PV Panel" ──
s = get_sec1('Deye', 10, '1P', 5.0)
check('T9: Header — PV Panel text', 'PV Panel' in s, s[:200])

# ── T10: Panel count in section text ──
s = get_sec1('Solis', 20, '3P', 12.0, grand_total=350000)
check('T10: Panel count — 20 shown', '20' in s, s[:200])

# ── T11-T16: All 6 brands produce valid Section 1 with watt value ──
for i, (brand, gt) in enumerate([
    ('ATMOCE', 150000), ('Sigenergy', 370000), ('Deye', 200000),
    ('Solis', 200000), ('Huawei', 300000), ('Hoymiles', 200000)
]):
    s = get_sec1(brand, 10, '1P', 5.0, grand_total=gt)
    has_watt = any(w in s for w in ['Watt', 'watt', 'W'])
    check(f'T{11+i}: {brand} — has Watt value', has_watt, s[:200])

# ── T17: Warranty line structure (Thai) ──
s = get_sec1('ATMOCE', 10, '1P', 5.0)
has_warranty = any(w in s for w in ['warranty', 'Warranty', 'guarantee'])
check('T17: Warranty — Thai text present', has_warranty or any(w in s for w in ['30', '25', '12', '15']), s[:300])

# ── T18: Section has >= 4 lines (header, model, tech, panels, warranty) ──
items = gen._build_items('ATMOCE', 10, '1P', 5.0, False, False, 150000, data={})
sec1_lines = items[0][1]
check('T18: Section 1 — at least 4 lines', len(sec1_lines) >= 4, f'got {len(sec1_lines)} lines')

# ── T19: Trina Solar explicit ──
s = get_sec1('Solis', 10, '1P', 5.0, data={'panel_brand': 'Trina', 'panel_watt': 0})
check('T19: Trina override — Trina shown', 'Trina' in s or 'trina' in s.lower(), s[:200])

# ── T20: Large system 50 panels ──
s = get_sec1('ATMOCE', 50, '3P', 30.0, grand_total=600000)
check('T20: 50 panels shown', '50' in s, s[:200])

print()
print('=' * 60)
print(f'Results: {passed}/{passed + failed} passed, {failed} failed')
print('=' * 60)

sys.exit(1 if failed else 0)
