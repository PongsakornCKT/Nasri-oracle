#!/usr/bin/env python3
"""Generate 20 PDFs — each with a different panel brand/model from the catalog."""
import sys, os
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)
os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import generate_quotation

OUT = 'C:/Users/pO-Ch/Nasri-oracle/tmppic/test_20panels'
os.makedirs(OUT, exist_ok=True)

# 20 test cases: different panel brands × different inverter brands
cases = [
    # (panel_brand, panel_watt, inv_brand, kw, phase, label)
    ('JA Solar',    640,  'ATMOCE',    5.0,  '1P', '01_JA640_ATMOCE_5kW_1P'),
    ('JA Solar',    625,  'Deye',     10.0,  '3P', '02_JA625_Deye_10kW_3P'),
    ('JA Solar',    590,  'Solis',     5.0,  '1P', '03_JA590_Solis_5kW_1P'),
    ('VOLS',        625,  'ATMOCE',    5.0,  '1P', '04_VOLS625_ATMOCE_5kW_1P'),
    ('Trina',       625,  'Huawei',   10.0,  '3P', '05_Trina625_Huawei_10kW_3P'),
    ('Trina',       715,  'Sigenergy',10.0,  '3P', '06_Trina715_Sigen_10kW_3P'),
    ('AIKO',        650,  'Sigenergy', 5.0,  '1P', '07_AIKO650_Sigen_5kW_1P'),
    ('AIKO',        650,  'ATMOCE',    6.0,  '3P', '08_AIKO650_ATMOCE_6kW_3P'),
    ('JINKO',       585,  'Deye',      5.0,  '1P', '09_JINKO585_Deye_5kW_1P'),
    ('JINKO',       590,  'Solis',     5.0,  '1P', '10_JINKO590_Solis_5kW_1P'),
    ('JINKO',       635,  'Huawei',   10.0,  '3P', '11_JINKO635_Huawei_10kW_3P'),
    ('JINKO',       715,  'Hoymiles',  6.0,  '1P', '12_JINKO715_Hoymiles_6kW_1P'),
    ('LONGi',       585,  'ATMOCE',    5.0,  '1P', '13_LONGi585_ATMOCE_5kW_1P'),
    ('LONGi',       620,  'Deye',     10.0,  '3P', '14_LONGi620_Deye_10kW_3P'),
    ('LONGi',       630,  'Solis',    10.0,  '3P', '15_LONGi630_Solis_10kW_3P'),
    ('LONGi',       640,  'Huawei',   10.0,  '3P', '16_LONGi640_Huawei_10kW_3P'),
    ('LONGi',       645,  'Sigenergy',10.0,  '3P', '17_LONGi645_Sigen_10kW_3P'),
    ('LONGi',       650,  'Hoymiles', 10.0,  '3P', '18_LONGi650_Hoymiles_10kW_3P'),
    ('JA Solar',    640,  'ATMOCE',   30.0,  '3P', '19_JA640_ATMOCE_30kW_CI'),
    ('',              0,  'Deye',      5.0,  '1P', '20_DEFAULT_Deye_5kW_1P'),
]

results = []
for i, (pb, pw, brand, kw, phase, label) in enumerate(cases, 1):
    fpath = os.path.join(OUT, f'{label}.pdf')
    try:
        data = {}
        if pb:
            data['panel_brand'] = pb
        if pw:
            data['panel_watt'] = pw
        path = generate_quotation(
            brand, kw, phase,
            customer_name=f'Test Panel {i}',
            project_name=f'Panel Test: {pb or "DEFAULT"} {pw or "auto"}W + {brand} {kw}kW {phase}',
            has_battery=False, has_backup=False,
            output_path=fpath,
            **data
        )
        size_kb = os.path.getsize(path) / 1024
        results.append((label, 'OK', f'{size_kb:.0f}KB'))
        panel_desc = f'{pb or "DEFAULT"} {pw or "auto"}W'
        print(f'  [{i:2d}/20] OK  {panel_desc:22s} + {brand:10s} {kw:5.1f}kW {phase}  ({size_kb:.0f}KB)')
    except Exception as e:
        results.append((label, 'FAIL', str(e)[:100]))
        print(f'  [{i:2d}/20] FAIL {label}: {e}')

print()
ok = sum(1 for _, s, _ in results if s == 'OK')
fail = 20 - ok
print(f'Results: {ok}/20 OK, {fail} FAIL')
print(f'PDFs in: {OUT}')
if fail:
    for label, status, detail in results:
        if status == 'FAIL':
            print(f'  FAIL: {label} — {detail}')
