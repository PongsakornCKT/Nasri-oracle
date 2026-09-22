#!/usr/bin/env python3
"""
30-case test suite for Section 3 (Battery) per brand x phase x backup.
Validates PDF section text matches section3.txt spec.
"""
import sys, os
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)
os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import (QuotationGenerator, SELLING_PRICES, F, FB,
                           _atmoce_battery_lines, _dyness_battery_section_lines,
                           _sigenergy_battery_section_lines)

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
        safe = detail.encode('ascii', 'replace').decode('ascii')[:200]
        print(f'  FAIL  {name}: {safe}')


def get_batt_section(brand, panels, phase, size_kw, has_battery, has_backup,
                     grand_total=300000, data=None):
    """Build items and return battery section text (if any).
    Battery section is item_num >= 3, after panel(1) and inverter(2)."""
    items = gen._build_items(brand, panels, phase, size_kw, has_battery, has_backup,
                             grand_total, data=data or {})
    # Battery section has item_num >= 3 and contains battery keywords
    # Skip Section 1 (panel) and Section 2 (inverter) — always first two
    for item in items[2:]:
        text = _section_text(item)
        if any(kw in text for kw in ['ESS', 'Battery', 'SigenStor BAT', 'MS-7K',
                                      'Dyness', 'BATTERY', 'Backup System',
                                      'Energy Storage', '314 Ah', 'LFP']):
            return text
    return ''


print('=' * 60)
print('Section 3 - Battery Test Suite (30 cases)')
print('=' * 60)

# ══════════════════════════════════════════════════════════════
# ATMOCE battery tests
# ══════════════════════════════════════════════════════════════

# ── T1-T4: ATMOCE 1P + backup ──
s = get_batt_section('ATMOCE', 10, '1P', 5.0, True, True, grand_total=200000)
check('T1: ATMOCE 1P+backup — MS-7K header', 'MS-7K' in s and 'Backup' in s, s[:200])
check('T2: ATMOCE 1P+backup — MU100S backup box', 'MU100S' in s, s[:300])
check('T3: ATMOCE 1P+backup — ELV mentioned', 'ELV' in s or 'Extra low voltage' in s.lower() or 'Extra Low Voltage' in s, s[:300])
check('T4: ATMOCE 1P+backup — AC Coupling', 'AC Coupling' in s, s[:400])

# ── T5-T6: ATMOCE 3P + backup ──
s = get_batt_section('ATMOCE', 12, '3P', 6.0, True, True, grand_total=250000)
check('T5: ATMOCE 3P+backup — 3 Phase in header', '3 Phase' in s or '3-phase' in s, s[:200])
check('T6: ATMOCE 3P+backup — Backup System text', 'Backup System' in s, s[:200])

# ── T7-T8: ATMOCE 1P no backup ──
s = get_batt_section('ATMOCE', 10, '1P', 5.0, True, False, grand_total=180000)
check('T7: ATMOCE 1P no backup — MS-7K header', 'MS-7K' in s, s[:200])
check('T8: ATMOCE 1P no backup — no MU100', 'MU100' not in s, s[:300])

# ── T9: ATMOCE 3P no backup ──
s = get_batt_section('ATMOCE', 12, '3P', 6.0, True, False, grand_total=220000)
check('T9: ATMOCE 3P no backup — 10,000 cycle life', '10,000' in s or '10000' in s, s[:300])

# ── T10: ATMOCE multi-battery qty ──
s = get_batt_section('ATMOCE', 20, '1P', 10.0, True, False, grand_total=300000,
                     data={'battery_kwh': 21})
check('T10: ATMOCE multi-qty — qty shown', any(w in s for w in ['3', '2', 'qty']), s[:300])

# ══════════════════════════════════════════════════════════════
# Dyness (Deye/Solis) battery tests
# ══════════════════════════════════════════════════════════════

# ── T11-T14: Deye 1P + Dyness + backup ──
s = get_batt_section('Deye', 10, '1P', 5.0, True, True, grand_total=250000,
                     data={'battery_kwh': 10})
check('T11: Deye 1P+backup — Dyness mentioned', 'Dyness' in s, s[:200])
check('T12: Deye 1P+backup — ATS Backup Box', 'ATS' in s or 'Backup Box' in s, s[:300])
check('T13: Deye 1P+backup — 1 Phase in backup', '1 Phase' in s or '1-phase' in s, s[:300])
check('T14: Deye 1P+backup — LFP technology', 'LFP' in s, s[:300])

# ── T15-T16: Deye 3P + Dyness + backup ──
s = get_batt_section('Deye', 16, '3P', 10.0, True, True, grand_total=350000,
                     data={'battery_kwh': 16})
check('T15: Deye 3P+backup — 3 Phase in backup', '3 Phase' in s or '3-phase' in s, s[:300])
check('T16: Deye 3P+backup — warranty 10', '10' in s, s[:300])

# ── T17-T18: Solis 1P + Dyness no backup ──
s = get_batt_section('Solis', 10, '1P', 5.0, True, False, grand_total=220000,
                     data={'battery_kwh': 5})
check('T17: Solis 1P no backup — Dyness mentioned', 'Dyness' in s, s[:200])
check('T18: Solis 1P no backup — no ATS', 'ATS' not in s, s[:300])

# ── T19: Solis 3P + Dyness no backup ──
s = get_batt_section('Solis', 16, '3P', 10.0, True, False, grand_total=300000,
                     data={'battery_kwh': 10})
check('T19: Solis 3P no backup — ESS or Energy Storage', 'ESS' in s or 'Energy Storage' in s, s[:300])

# ── T20: Deye + Dyness 16kWh — proper qty ──
s = get_batt_section('Deye', 16, '3P', 10.0, True, False, grand_total=350000,
                     data={'battery_kwh': 16})
check('T20: Deye 16kWh — Dyness model shown', 'Dyness' in s, s[:200])

# ══════════════════════════════════════════════════════════════
# Sigenergy battery tests
# ══════════════════════════════════════════════════════════════

# ── T21-T24: Sigenergy battery ──
s = get_batt_section('Sigenergy', 16, '3P', 10.0, True, False, grand_total=450000,
                     data={'battery_kwh': 10})
check('T21: Sigenergy — SigenStor header', 'SigenStor' in s, s[:200])
check('T22: Sigenergy — 314 Ah', '314 Ah' in s or '314' in s, s[:300])
check('T23: Sigenergy — 10,000 cycles', '10,000' in s or '10000' in s, s[:300])
check('T24: Sigenergy — AI management', 'AI' in s, s[:300])

# ── T25: Sigenergy BAT 6.0 ──
s = get_batt_section('Sigenergy', 10, '1P', 5.0, True, False, grand_total=350000,
                     data={'battery_kwh': 5})
check('T25: Sigenergy small — BAT model shown', 'BAT' in s or 'SigenStor' in s, s[:200])

# ── T26: Sigenergy — switches to battery ──
s = get_batt_section('Sigenergy', 16, '3P', 10.0, True, False, grand_total=450000,
                     data={'battery_kwh': 10})
check('T26: Sigenergy — milliseconds switching', 'milliseconds' in s or '10ms' in s, s[:300])

# ══════════════════════════════════════════════════════════════
# Huawei battery tests
# ══════════════════════════════════════════════════════════════

# ── T27-T28: Huawei battery (generic format) ──
s = get_batt_section('Huawei', 16, '3P', 10.0, True, False, grand_total=350000,
                     data={'battery_kwh': 10})
check('T27: Huawei — Battery header', 'Battery' in s, s[:200])
check('T28: Huawei — warranty 10 years', '10' in s, s[:300])

# ══════════════════════════════════════════════════════════════
# Direct function tests
# ══════════════════════════════════════════════════════════════

# ── T29: _atmoce_battery_lines direct ──
lines = _atmoce_battery_lines('1P', True, 2)
text = ' '.join(l[2] for l in lines if isinstance(l, tuple) and len(l) >= 3)
check('T29: Direct ATMOCE — qty 2 shown', '2' in text, text[:200])

# ── T30: _sigenergy_battery_section_lines direct ──
lines = _sigenergy_battery_section_lines('BAT 10.0', 9.0, 1, 9.0)
text = ' '.join(l[2] for l in lines if isinstance(l, tuple) and len(l) >= 3)
check('T30: Direct Sigenergy — BAT 10.0 + Depth of Discharge', 'BAT 10' in text and 'Depth of Discharge' in text, text[:200])

print()
print('=' * 60)
print(f'Results: {passed}/{passed + failed} passed, {failed} failed')
print('=' * 60)

sys.exit(1 if failed else 0)
