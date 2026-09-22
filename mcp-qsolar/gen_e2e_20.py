#!/usr/bin/env python3
"""Generate 20 E2E PDFs — full quotation scenarios covering all fixes."""
import sys, os
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)
os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import QuotationGenerator

OUT = 'C:/Users/pO-Ch/Nasri-oracle/tmppic/e2e_20'
os.makedirs(OUT, exist_ok=True)

gen = QuotationGenerator()

cases = [
    # (brand, kw, phase, batt, backup, extra, label)
    # --- Panel brand override tests ---
    ('ATMOCE', 10.0, '1P', True, False,
     {'panel_brand': 'AIKO', 'panel_watt': 670, 'battery_kwh': 7},
     '01_ATMOCE_10kW_AIKO670_batt7'),

    ('Deye', 10.0, '3P', True, False,
     {'panel_brand': 'Trina Solar', 'panel_watt': 715, 'battery_kwh': 16},
     '02_Deye_10kW_Trina715_batt16'),

    ('Solis', 5.0, '1P', False, False,
     {'panel_brand': 'JINKO', 'panel_watt': 715},
     '03_Solis_5kW_JINKO715'),

    ('Huawei', 10.0, '3P', True, False,
     {'panel_brand': 'LONGi', 'panel_watt': 640, 'battery_kwh': 15},
     '04_Huawei_10kW_LONGi640_batt15'),

    ('Sigenergy', 10.0, '3P', True, False,
     {'panel_brand': 'AIKO', 'panel_watt': 670, 'has_optimizer': True, 'battery_kwh': 10},
     '05_Sigen_10kW_AIKO670_opt_batt10'),

    # --- Default panel = JA Solar 625W ---
    ('ATMOCE', 5.0, '1P', False, False,
     {},
     '06_ATMOCE_5kW_DEFAULT_JA625'),

    ('Deye', 5.0, '1P', False, False,
     {},
     '07_Deye_5kW_DEFAULT_JA625'),

    ('Hoymiles', 6.0, '1P', False, False,
     {},
     '08_Hoymiles_6kW_DEFAULT_JA625'),

    # --- Battery best-match tests ---
    ('Deye', 5.0, '1P', True, False,
     {'battery_kwh': 5},
     '09_Deye_batt5_DL5C'),

    ('Deye', 10.0, '3P', True, False,
     {'battery_kwh': 10},
     '10_Deye_batt10_PowerboxPro'),

    ('Deye', 10.0, '3P', True, False,
     {'battery_kwh': 14},
     '11_Deye_batt14_PowerBrick'),

    ('Deye', 10.0, '3P', True, False,
     {'battery_kwh': 16},
     '12_Deye_batt16_BrickSC'),

    ('Solis', 10.0, '3P', True, True,
     {'battery_kwh': 16},
     '13_Solis_batt16_BrickSC_backup'),

    ('Sigenergy', 10.0, '3P', True, False,
     {'battery_kwh': 10},
     '14_Sigen_batt10_BAT10'),

    ('Huawei', 10.0, '3P', True, False,
     {'battery_kwh': 15},
     '15_Huawei_batt15_LUNAx2'),

    ('ATMOCE', 10.0, '3P', True, True,
     {'battery_kwh': 42},
     '16_ATMOCE_batt42_MSx6_backup'),

    # --- Section 2 detail tests ---
    ('ATMOCE', 30.0, '3P', False, False,
     {'grand_total': 600000},
     '17_ATMOCE_30kW_CI_MI1250'),

    ('Sigenergy', 5.0, '1P', False, False,
     {'has_optimizer': False},
     '18_Sigen_5kW_1P_noOpt'),

    # --- Combo: panel + battery + section2 ---
    ('Deye', 10.0, '3P', True, True,
     {'panel_brand': 'AIKO', 'panel_watt': 670, 'battery_kwh': 16, 'grand_total': 400000},
     '19_Deye_AIKO670_batt16_backup_400K'),

    ('Solis', 10.0, '3P', True, False,
     {'panel_brand': 'Trina Solar', 'panel_watt': 715, 'battery_kwh': 25},
     '20_Solis_Trina715_batt25_combo'),
]

results = []
for i, (brand, kw, phase, batt, backup, extra, label) in enumerate(cases, 1):
    fpath = os.path.join(OUT, f'{label}.pdf')
    try:
        data = {
            'brand': brand,
            'size_kw': kw,
            'phase': phase,
            'customer_name': f'E2E Test {i}',
            'project_name': label,
            'has_battery': batt,
            'has_backup': backup,
            'output_path': fpath,
        }
        data.update(extra)
        path = gen.generate(data)
        size_kb = os.path.getsize(path) / 1024
        results.append((i, label, 'OK', f'{size_kb:.0f}KB'))
        print(f'  [{i:2d}/20] OK  {label}  ({size_kb:.0f}KB)')
    except Exception as e:
        import traceback
        results.append((i, label, 'FAIL', str(e)[:120]))
        print(f'  [{i:2d}/20] FAIL {label}: {e}')
        traceback.print_exc()

print()
ok = sum(1 for _, _, s, _ in results if s == 'OK')
print(f'Results: {ok}/20 OK')
print(f'PDFs in: {OUT}')
