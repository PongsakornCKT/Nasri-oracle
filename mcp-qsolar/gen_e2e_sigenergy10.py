#!/usr/bin/env python3
"""Generate 10 E2E PDFs — Sigenergy brand, covering all variations.

Cases:
 01  5kW  1P   no battery, no optimizer  (basic)
 02  10kW 1P   no battery, with optimizer
 03  5kW  3P   no battery, no optimizer
 04  10kW 3P   with optimizer, no battery
 05  5kW  1P   with battery 6kWh (BAT 6.0), no optimizer
 06  10kW 3P   with battery 10kWh (BAT 10.0), with optimizer
 07  20kW 3P   with battery 10kWh, with optimizer, AIKO 670W panel
 08  25kW 3P   with battery 20kWh (2x BAT 10.0), with optimizer
 09  10kW 3P   with battery 10kWh, with optimizer, Trina Solar 715W, grand_total override 500000
 10  5kW  1P   lump_sum mode, with battery 6kWh, AIKO panel
"""
import sys, os

_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)
os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import QuotationGenerator

OUT = 'C:/Users/pO-Ch/Nasri-oracle/tmppic/e2e_sigenergy10'
os.makedirs(OUT, exist_ok=True)

gen = QuotationGenerator()

# (brand, kw, phase, batt, backup, extra, label)
cases = [
    # 01 — basic, no battery, no optimizer
    ('Sigenergy', 5.0, '1P', False, False,
     {'has_optimizer': False},
     '01_Sigen_5kW_1P_basic'),

    # 02 — no battery, with optimizer (1P)
    ('Sigenergy', 10.0, '1P', False, False,
     {'has_optimizer': True},
     '02_Sigen_10kW_1P_opt'),

    # 03 — 3P, no battery, no optimizer
    ('Sigenergy', 5.0, '3P', False, False,
     {'has_optimizer': False},
     '03_Sigen_5kW_3P_noOpt'),

    # 04 — 3P, with optimizer, no battery
    ('Sigenergy', 10.0, '3P', False, False,
     {'has_optimizer': True},
     '04_Sigen_10kW_3P_opt_noBatt'),

    # 05 — 1P, battery 6kWh (BAT 6.0), no optimizer
    ('Sigenergy', 5.0, '1P', True, False,
     {'has_optimizer': False, 'battery_kwh': 6},
     '05_Sigen_5kW_1P_batt6_noOpt'),

    # 06 — 3P, battery 10kWh (BAT 10.0), with optimizer
    ('Sigenergy', 10.0, '3P', True, False,
     {'has_optimizer': True, 'battery_kwh': 10},
     '06_Sigen_10kW_3P_batt10_opt'),

    # 07 — 3P 20kW, battery 10kWh, optimizer, AIKO 670W
    ('Sigenergy', 20.0, '3P', True, False,
     {'has_optimizer': True, 'battery_kwh': 10,
      'panel_brand': 'AIKO', 'panel_watt': 670},
     '07_Sigen_20kW_3P_batt10_opt_AIKO670'),

    # 08 — 3P 25kW, battery 20kWh (2x BAT 10.0), optimizer
    ('Sigenergy', 25.0, '3P', True, False,
     {'has_optimizer': True, 'battery_kwh': 20},
     '08_Sigen_25kW_3P_batt20_opt'),

    # 09 — 3P 10kW, battery 10kWh, optimizer, Trina Solar 715W, grand_total override
    ('Sigenergy', 10.0, '3P', True, False,
     {'has_optimizer': True, 'battery_kwh': 10,
      'panel_brand': 'Trina Solar', 'panel_watt': 715,
      'grand_total': 500000},
     '09_Sigen_10kW_3P_batt10_Trina715_500K'),

    # 10 — 1P lump_sum mode, battery 6kWh, AIKO panel
    ('Sigenergy', 5.0, '1P', True, False,
     {'battery_kwh': 6,
      'panel_brand': 'AIKO', 'panel_watt': 670,
      'lump_sum': True},
     '10_Sigen_5kW_1P_lumpsum_batt6_AIKO'),
]

TOTAL = len(cases)
results = []

for i, (brand, kw, phase, batt, backup, extra, label) in enumerate(cases, 1):
    fpath = os.path.join(OUT, f'{label}.pdf')
    try:
        data = {
            'brand': brand,
            'size_kw': kw,
            'phase': phase,
            'customer_name': f'Sigenergy E2E Test {i}',
            'project_name': label,
            'has_battery': batt,
            'has_backup': backup,
            'output_path': fpath,
        }
        data.update(extra)
        path = gen.generate(data)
        size_kb = os.path.getsize(path) / 1024
        results.append((i, label, 'OK', f'{size_kb:.0f}KB'))
        print(f'  [{i:2d}/{TOTAL}] OK   {label}  ({size_kb:.0f}KB)')
    except Exception as e:
        import traceback
        results.append((i, label, 'FAIL', str(e)[:120]))
        print(f'  [{i:2d}/{TOTAL}] FAIL {label}: {e}')
        traceback.print_exc()

print()
ok = sum(1 for _, _, s, _ in results if s == 'OK')
fail = TOTAL - ok
print(f'Results: {ok}/{TOTAL} OK  |  {fail} FAIL')
if fail:
    print('Failed cases:')
    for _, lbl, status, msg in results:
        if status == 'FAIL':
            print(f'  - {lbl}: {msg}')
print(f'PDFs in: {OUT}')
