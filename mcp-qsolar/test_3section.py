#!/usr/bin/env python3
"""
Test suite for the 3-section quotation restructure.
Verifies that _build_items() now produces:
  Section 1 — PV Panel
  Section 2 — Inverter
  Section 3 — Battery (optional)
  Then      — Optimizer, Warranty, Terms
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_pdf import QuotationGenerator, SELLING_PRICES

gen = QuotationGenerator()

passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  PASS  {name}")
        passed += 1
    else:
        print(f"  FAIL  {name}  {detail}")
        failed += 1


print("=" * 60)
print("3-Section Quotation Tests")
print("=" * 60)

# ── Test 1: Happy path — ATMOCE 5kW 1P, no battery ──
items = gen._build_items('ATMOCE', 8, '1P', 5.0, False, False, 129000)
sec1_text = ' '.join(t for _, _, t in items[0][1])
sec2_text = ' '.join(t for _, _, t in items[1][1])
check("T1: ATMOCE 5kW — Section 1 is PV Panel",
      'แผงโซล่าเซลล์' in sec1_text or 'PV Panel' in sec1_text)
check("T1: ATMOCE 5kW — Section 2 is Inverter",
      'อินเวอร์เตอร์' in sec2_text or 'Inverter' in sec2_text)
check("T1: ATMOCE 5kW — Item nums are 1, 2, 3(warranty), 4(terms)",
      [i[0] for i in items] == [1, 2, 3, 4])

# ── Test 2: With battery — Huawei 10kW 3P + batt ──
items = gen._build_items('Huawei', 16, '3P', 10.0, True, False, 266000,
                         data={'battery_kwh': 10})
sec3_text = ' '.join(t for _, _, t in items[2][1])
check("T2: Huawei+batt — Section 3 is Battery",
      'แบตเตอรี่' in sec3_text or 'Battery' in sec3_text)
check("T2: Huawei+batt — 5 items total (panel, inv, batt, warranty, terms)",
      len(items) == 5)

# ── Test 3: Edge case — empty/minimal input (0 panels, 0 kW) ──
try:
    items = gen._build_items('ATMOCE', 0, '1P', 0.1, False, False, 50000)
    check("T3: Zero panels — no crash", True)
except Exception as e:
    check("T3: Zero panels — no crash", False, str(e))

# ── Test 4: Large system — Deye 50kW 3P ──
items = gen._build_items('Deye', 80, '3P', 50.0, False, False, 890000)
check("T4: Deye 50kW — Section 1 is PV Panel",
      'PV Panel' in ' '.join(t for _, _, t in items[0][1]))
check("T4: Deye 50kW — 4 items (panel, inv, warranty, terms)",
      len(items) == 4)

# ── Test 5: Invalid brand — should use generic fallback ──
items = gen._build_items('UnknownBrand', 8, '1P', 5.0, False, False, 100000)
check("T5: Unknown brand — still produces Section 1+2",
      len(items) >= 3 and items[0][0] == 1 and items[1][0] == 2)

# ── Test 6: Sigenergy + optimizer ──
items = gen._build_items('Sigenergy', 10, '1P', 5.0, False, False, 191000,
                         data={'has_optimizer': True})
# Find the optimizer item (if optimizer found in sheet)
item_texts = [' '.join(t for _, _, t in i[1]) for i in items]
has_opt_item = any('Optimizer' in t or 'optimizer' in t.lower() for t in item_texts)
check("T6: Sigenergy+optimizer — optimizer section present", has_opt_item)

# ── Test 7: Lump sum mode — Section 2 and 3 show 0 ──
items = gen._build_items('ATMOCE', 8, '1P', 5.0, True, True, 239000,
                         data={'battery_kwh': 7}, lump_sum=True)
sec1_price = items[0][2]
sec2_price = items[1][2]
# Battery is section 3 if present
batt_item = items[2] if len(items) > 4 else None
check("T7: Lump sum — Section 1 carries full price",
      sec1_price == 239000)
check("T7: Lump sum — Section 2 price is 0",
      sec2_price == 0.0)
if batt_item:
    check("T7: Lump sum — Section 3 (batt) price is 0",
          batt_item[2] == 0.0)

# ── Test 8: Solis + Dyness battery fallback ──
items = gen._build_items('Solis', 8, '1P', 5.0, True, False, 146000,
                         data={'battery_kwh': 5})
check("T8: Solis+batt — has battery section",
      len(items) >= 5)
sec3 = items[2]
sec3_text = ' '.join(t for _, _, t in sec3[1])
check("T8: Solis+batt — battery section mentions brand",
      'Dyness' in sec3_text or 'แบตเตอรี่' in sec3_text)

# ── Test 9: Panel brand override ──
items = gen._build_items('Huawei', 16, '3P', 10.0, False, False, 266000,
                         data={'panel_brand': 'AIKO', 'panel_watt': 670})
sec1_text = ' '.join(t for _, _, t in items[0][1])
check("T9: Panel brand override — AIKO in section 1",
      'AIKO' in sec1_text)
check("T9: Panel brand override — 670W in section 1",
      '670' in sec1_text)

# ── Test 10: Regression — all brands produce correct item count ──
brands_config = [
    ('ATMOCE', 8, '1P', 5.0, False, 4),     # panel, inv, warranty, terms
    ('Sigenergy', 10, '1P', 5.0, False, 4),
    ('Huawei', 16, '3P', 10.0, False, 4),
    ('Solis', 8, '1P', 5.0, False, 4),
    ('Deye', 8, '1P', 5.0, False, 4),
    ('Hoymiles', 8, '1P', 5.0, False, 4),
]
all_ok = True
for b, panels, phase, kw, batt, expected_count in brands_config:
    price = SELLING_PRICES.get(b, {}).get(phase, {})
    gt = price.get(int(kw), price.get(panels, 100000))
    its = gen._build_items(b, panels, phase, kw, batt, False, gt)
    if len(its) != expected_count:
        all_ok = False
        print(f"    {b}: expected {expected_count} items, got {len(its)}")
check("T10: All 6 brands — correct item count (4 each, no battery)", all_ok)


print()
print("=" * 60)
print(f"Results: {passed}/{passed+failed} passed, {failed} failed")
print("=" * 60)
sys.exit(1 if failed else 0)
