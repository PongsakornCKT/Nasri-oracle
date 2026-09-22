#!/usr/bin/env python3
"""
30-case test suite for Section 2 (Inverter) content per brand × phase.
Validates the PDF section text matches the spec from section2.txt.
"""
import sys, os
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)
os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import QuotationGenerator, SELLING_PRICES, F, FB

gen = QuotationGenerator()

passed = 0
failed = 0

def _section_text(item_tuple):
    """Extract all text from a section item tuple."""
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
        msg = f'{name}: {detail}' if detail else name
        try:
            print(f'  FAIL  {msg}')
        except UnicodeEncodeError:
            print(f'  FAIL  {name}: (unicode detail omitted)')


def get_sec2(brand, panels, phase, size_kw, has_battery=False, has_backup=False,
             grand_total=200000, data=None):
    """Build items and return Section 2 text."""
    items = gen._build_items(brand, panels, phase, size_kw, has_battery, has_backup,
                             grand_total, data=data or {})
    return _section_text(items[1])


print('=' * 60)
print('Section 2 — 30-Case Validation Suite')
print('=' * 60)

# ── ATMOCE 1P (T1-T2) ──
s = get_sec2('ATMOCE', 10, '1P', 5.0)
check('T1: ATMOCE 1P — MI-500 mentioned', 'MI-500' in s, s[:150])
check('T2: ATMOCE 1P — VCT 2C*4 cable', '2C*4' in s, s[:200])

# ── ATMOCE 3P residential (T3-T5) ──
s = get_sec2('ATMOCE', 12, '3P', 6.0)
check('T3: ATMOCE 3P — MI-500 mentioned', 'MI-500' in s, s[:150])
check('T4: ATMOCE 3P — VCT 4C*4 cable', '4C*4' in s, s[:200])
check('T5: ATMOCE 3P — M-Combiner', 'M-Combiner' in s, s[:200])

# ── ATMOCE 3P C&I ≥30kW (T6-T9) ──
s = get_sec2('ATMOCE', 60, '3P', 30.0, grand_total=600000)
check('T6: ATMOCE 3P C&I — MI-1250 mentioned', 'MI-1250' in s, s[:200])
check('T7: ATMOCE 3P C&I — MC100-Wye-4in1', 'MC100' in s, s[:200])
check('T8: ATMOCE 3P C&I — VCT 4C*6 cable', '4C*6' in s, s[:200])
check('T9: ATMOCE 3P C&I — THW 25 Sqmm', 'THW) 25' in s or 'THW 25' in s, s[:300])

# ── Sigenergy 3P + optimizer (T10-T13) ──
s = get_sec2('Sigenergy', 16, '3P', 10.0, grand_total=370000,
             data={'has_optimizer': True})
check('T10: Sigen 3P+opt — Gateway Home TP 30K', 'Gateway Home TP 30K' in s, s[:300])
check('T11: Sigen 3P+opt — ADCU', 'ADCU' in s, s)
check('T12: Sigen 3P+opt — Emergency Switch', 'Emergency Switch' in s, s)
check('T13: Sigen 3P+opt — Rapid Shutdown AMCL', 'Rapid Shutdown' in s and 'AMCL' in s, s)

# ── Sigenergy 1P + optimizer (T14-T15) ──
s = get_sec2('Sigenergy', 10, '1P', 5.0, grand_total=250000,
             data={'has_optimizer': True})
check('T14: Sigen 1P+opt — Gateway HomePro SP', 'Gateway HomePro SP' in s, s[:300])
check('T15: Sigen 1P+opt — Optimizer 1200-1500', 'Optimizer 1200' in s, s)

# ── Sigenergy 3P no optimizer (T16-T17) ──
s = get_sec2('Sigenergy', 16, '3P', 10.0, grand_total=370000,
             data={'has_optimizer': False})
check('T16: Sigen 3P plain — no ADCU', 'ADCU' not in s, s)
check('T17: Sigen 3P plain — has THW 35', 'THW 35' in s, s[:300])

# ── Sigenergy 1P no optimizer (T18) ──
s = get_sec2('Sigenergy', 10, '1P', 5.0, grand_total=250000,
             data={'has_optimizer': False})
check('T18: Sigen 1P plain — no Rapid Shutdown', 'Rapid Shutdown' not in s, s)

# ── Deye 1P (T19-T20) ──
s = get_sec2('Deye', 10, '1P', 5.0, grand_total=200000)
check('T19: Deye 1P — Combiner Box', 'Combiner' in s, s[:200])
check('T20: Deye 1P — VCT 2C*4', '2C*4' in s, s[:300])

# ── Deye 3P (T21-T22) ──
s = get_sec2('Deye', 16, '3P', 10.0, grand_total=300000)
check('T21: Deye 3P — Combiner Box', 'Combiner' in s, s[:200])
check('T22: Deye 3P — VCT 2C*6', '2C*6' in s, s[:300])

# ── Solis 1P (T23-T24) ──
s = get_sec2('Solis', 10, '1P', 5.0, grand_total=200000)
check('T23: Solis 1P — Combiner Box', 'Combiner' in s, s[:200])
check('T24: Solis 1P — VCT 2C*4', '2C*4' in s, s[:300])

# ── Solis 3P (T25) ──
s = get_sec2('Solis', 16, '3P', 10.0, grand_total=300000)
check('T25: Solis 3P — VCT 2C*6', '2C*6' in s, s[:300])

# ── Huawei 3P (T26-T27) ──
s = get_sec2('Huawei', 16, '3P', 10.0, grand_total=300000)
check('T26: Huawei 3P — Smart meter + CT', 'Smart meter' in s and 'CT' in s, s[:300])
check('T27: Huawei 3P — VCT 2C*6', '2C*6' in s, s[:300])

# ── Huawei 1P (T28) ──
s = get_sec2('Huawei', 10, '1P', 5.0, grand_total=200000)
check('T28: Huawei 1P — Smart meter + CT', 'Smart meter' in s, s[:300])

# ── Hoymiles 1P (T29) ──
s = get_sec2('Hoymiles', 10, '1P', 6.0, grand_total=200000)
check('T29: Hoymiles 1P — Smart meter Gateway + CT', 'Gateway' in s and 'CT' in s, s[:300])

# ── Hoymiles 3P (T30) ──
s = get_sec2('Hoymiles', 16, '3P', 10.0, grand_total=300000)
check('T30: Hoymiles 3P — Smart meter Gateway + CT', 'Gateway' in s and 'CT' in s, s[:300])

# ── Common checks across all brands ──
print()
print('--- Common element checks ---')

brands_phases = [
    ('ATMOCE', '1P', 10, 5.0, 150000, {}),
    ('ATMOCE', '3P', 12, 6.0, 180000, {}),
    ('Sigenergy', '3P', 16, 10.0, 370000, {}),
    ('Sigenergy', '1P', 10, 5.0, 250000, {}),
    ('Deye', '1P', 10, 5.0, 200000, {}),
    ('Deye', '3P', 16, 10.0, 300000, {}),
    ('Solis', '1P', 10, 5.0, 200000, {}),
    ('Solis', '3P', 16, 10.0, 300000, {}),
    ('Huawei', '1P', 10, 5.0, 200000, {}),
    ('Huawei', '3P', 16, 10.0, 300000, {}),
    ('Hoymiles', '1P', 10, 6.0, 200000, {}),
    ('Hoymiles', '3P', 16, 10.0, 300000, {}),
]

all_have_mounting = True
all_have_ground = True
all_have_sld = True

for brand, phase, panels, kw, gt, data in brands_phases:
    s = get_sec2(brand, panels, phase, kw, grand_total=gt, data=data)
    if 'Mounting' not in s:
        all_have_mounting = False
        print(f'  WARN  {brand} {phase} missing Mounting')
    if 'กราวด์' not in s:
        all_have_ground = False
        print(f'  WARN  {brand} {phase} missing กราวด์')
    if 'SLD' not in s and 'การขออนุญาต' not in s:
        all_have_sld = False
        print(f'  WARN  {brand} {phase} missing SLD/permit')

if all_have_mounting: print('  OK    All brands have Mounting')
if all_have_ground: print('  OK    All brands have ground wire')
if all_have_sld: print('  OK    All brands have SLD permit line')

print()
print('=' * 60)
print(f'Results: {passed}/{passed + failed} passed, {failed} failed')
print('=' * 60)

sys.exit(1 if failed else 0)
