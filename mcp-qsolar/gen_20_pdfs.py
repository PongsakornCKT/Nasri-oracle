#!/usr/bin/env python3
"""Generate 20 PDF quotations covering all brand x phase x battery combos."""
import sys, os
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)
os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import generate_quotation

OUT = 'C:/Users/pO-Ch/Nasri-oracle/tmppic/test_20pdfs'
os.makedirs(OUT, exist_ok=True)

cases = [
    # (brand, kw, phase, batt, backup, extra_kwargs, label)
    ('ATMOCE',    5.0,  '1P', False, False, {}, '01_ATMOCE_5kW_1P'),
    ('ATMOCE',    5.0,  '1P', True,  True,  {}, '02_ATMOCE_5kW_1P_batt_backup'),
    ('ATMOCE',    6.0,  '3P', True,  False, {}, '03_ATMOCE_6kW_3P_batt'),
    ('ATMOCE',   30.0,  '3P', False, False, {'grand_total': 600000}, '04_ATMOCE_30kW_3P_CI'),
    ('Sigenergy', 10.0, '3P', True,  False, {'has_optimizer': True, 'battery_kwh': 10}, '05_Sigen_10kW_3P_opt_batt'),
    ('Sigenergy',  5.0, '1P', False, False, {'has_optimizer': False}, '06_Sigen_5kW_1P_plain'),
    ('Sigenergy',  5.0, '1P', True,  False, {'has_optimizer': True, 'battery_kwh': 6}, '07_Sigen_5kW_1P_opt_batt6'),
    ('Deye',       5.0, '1P', True,  False, {'battery_kwh': 5}, '08_Deye_5kW_1P_batt5'),
    ('Deye',      10.0, '3P', True,  False, {'battery_kwh': 16}, '09_Deye_10kW_3P_batt16'),
    ('Deye',      10.0, '3P', True,  True,  {'battery_kwh': 10}, '10_Deye_10kW_3P_batt_backup'),
    ('Solis',      5.0, '1P', True,  True,  {'battery_kwh': 10}, '11_Solis_5kW_1P_batt_backup'),
    ('Solis',     10.0, '3P', True,  False, {'battery_kwh': 16}, '12_Solis_10kW_3P_batt16'),
    ('Solis',      5.0, '1P', False, False, {}, '13_Solis_5kW_1P_plain'),
    ('Huawei',    10.0, '3P', True,  False, {'battery_kwh': 10}, '14_Huawei_10kW_3P_batt10'),
    ('Huawei',     5.0, '1P', True,  False, {'battery_kwh': 5}, '15_Huawei_5kW_1P_batt5'),
    ('Hoymiles',   6.0, '1P', False, False, {}, '16_Hoymiles_6kW_1P'),
    ('Hoymiles',  10.0, '3P', False, False, {}, '17_Hoymiles_10kW_3P'),
    ('Deye',       5.0, '1P', True,  False, {'battery_kwh': 25}, '18_Deye_5kW_1P_batt25_combo'),
    ('ATMOCE',     6.0, '3P', True,  True,  {'panel_brand': 'AIKO', 'panel_watt': 670}, '19_ATMOCE_6kW_3P_AIKO_batt_bkup'),
    ('Sigenergy', 10.0, '3P', True,  False, {'has_optimizer': False, 'battery_kwh': 10, 'panel_brand': 'Trina'}, '20_Sigen_10kW_3P_Trina_batt'),
]

results = []
for i, (brand, kw, phase, batt, backup, extra, label) in enumerate(cases, 1):
    fname = f'{label}.pdf'
    fpath = os.path.join(OUT, fname)
    try:
        path = generate_quotation(
            brand, kw, phase,
            customer_name=f'Test Case {i}',
            project_name=f'E2E-{i}: {brand} {kw}kW {phase}',
            has_battery=batt,
            has_backup=backup,
            output_path=fpath,
            **extra
        )
        size_kb = os.path.getsize(path) / 1024
        results.append((label, 'OK', f'{size_kb:.0f}KB'))
        print(f'  [{i:2d}/20] OK  {label}  ({size_kb:.0f}KB)')
    except Exception as e:
        results.append((label, 'FAIL', str(e)[:80]))
        print(f'  [{i:2d}/20] FAIL {label}: {e}')

print()
ok = sum(1 for _, s, _ in results if s == 'OK')
print(f'Generated: {ok}/20 PDFs in {OUT}')
if ok < 20:
    print('FAILURES:')
    for label, status, detail in results:
        if status == 'FAIL':
            print(f'  {label}: {detail}')
