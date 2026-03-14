#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
10 test cases for mcp-qsolar.
Run: cd C:/Users/pO-Ch/Nasri-oracle && python mcp-qsolar/test_qsolar.py
"""

import sys
import os
import traceback

# Ensure local package is importable
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)

os.environ.setdefault('ORACLE_REPO_ROOT', 'C:/Users/pO-Ch/Nasri-oracle')

from generate_pdf import (
    QuotationGenerator, get_selling_price, get_panels_count,
    SELLING_PRICES, BATTERY_PRICES,
)
from server import qsolar_generate, qsolar_from_spec, qsolar_list_options, qsolar_get_prices
from thai_baht import baht_to_thai

PASS = 0
FAIL = 0
RESULTS = []


def run_test(name, fn):
    global PASS, FAIL
    try:
        fn()
        PASS += 1
        RESULTS.append(('PASS', name, ''))
        print(f'  PASS  {name}')
    except AssertionError as e:
        FAIL += 1
        RESULTS.append(('FAIL', name, str(e)))
        print(f'  FAIL  {name}: {e}')
    except Exception as e:
        FAIL += 1
        tb = traceback.format_exc().strip().split('\n')[-1]
        RESULTS.append(('ERROR', name, tb))
        print(f'  ERROR {name}: {tb}')


# ─────────────────────────────────────────────────────────────
# Test 1: ATMOCE 5kW 1P on-grid basic
# ─────────────────────────────────────────────────────────────
def test1():
    result = qsolar_generate(
        brand='ATMOCE', size_kw=5.0, phase='1P',
        customer_name='ทดสอบ', project_name='Test ATMOCE 5kW 1P',
        has_battery=False, has_backup=False,
    )
    assert result['success'], f"Failed: {result.get('error')}"
    assert result['grand_total'] == 169000, f"Expected 169000 got {result['grand_total']}"
    assert result['phase'] == '1P'
    assert result['brand'] == 'ATMOCE'
    assert os.path.exists(result['path']), f"PDF not found: {result['path']}"
    assert os.path.getsize(result['path']) > 10000, 'PDF too small'


# ─────────────────────────────────────────────────────────────
# Test 2: ATMOCE 10kW 3P on-grid
# ─────────────────────────────────────────────────────────────
def test2():
    result = qsolar_generate(
        brand='ATMOCE', size_kw=10.0, phase='3P',
        customer_name='ทดสอบ', project_name='Test ATMOCE 10kW 3P',
        has_battery=False, has_backup=False,
    )
    assert result['success'], f"Failed: {result.get('error')}"
    assert result['grand_total'] == 329000, f"Expected 329000 got {result['grand_total']}"
    assert result['phase'] == '3P'
    assert os.path.exists(result['path'])
    assert os.path.getsize(result['path']) > 10000


# ─────────────────────────────────────────────────────────────
# Test 3: ATMOCE 5kW 1P + battery only
# ─────────────────────────────────────────────────────────────
def test3():
    result = qsolar_generate(
        brand='ATMOCE', size_kw=5.0, phase='1P',
        customer_name='ทดสอบ', project_name='Test ATMOCE 5kW 1P + Batt',
        has_battery=True, has_backup=False,
    )
    assert result['success'], f"Failed: {result.get('error')}"
    expected = 169000 + BATTERY_PRICES['batt_only']  # 169000 + 99000 = 268000
    assert result['grand_total'] == expected, f"Expected {expected} got {result['grand_total']}"
    assert result['has_battery'] is True
    assert result['has_backup'] is False
    assert os.path.exists(result['path'])


# ─────────────────────────────────────────────────────────────
# Test 4: ATMOCE 5kW 1P + battery + backup
# ─────────────────────────────────────────────────────────────
def test4():
    result = qsolar_generate(
        brand='ATMOCE', size_kw=5.0, phase='1P',
        customer_name='ทดสอบ', project_name='Test ATMOCE 5kW 1P + Batt + Backup',
        has_battery=True, has_backup=True,
    )
    assert result['success'], f"Failed: {result.get('error')}"
    expected = 169000 + BATTERY_PRICES['batt_backup_1P']  # 169000 + 110000 = 279000
    assert result['grand_total'] == expected, f"Expected {expected} got {result['grand_total']}"
    assert result['has_battery'] is True
    assert result['has_backup'] is True
    assert os.path.exists(result['path'])


# ─────────────────────────────────────────────────────────────
# Test 5: ATMOCE 10kW 3P + battery + backup
# ─────────────────────────────────────────────────────────────
def test5():
    result = qsolar_generate(
        brand='ATMOCE', size_kw=10.0, phase='3P',
        customer_name='ทดสอบ', project_name='Test ATMOCE 10kW 3P + Batt + Backup',
        has_battery=True, has_backup=True,
    )
    assert result['success'], f"Failed: {result.get('error')}"
    expected = 329000 + BATTERY_PRICES['batt_backup_3P']  # 329000 + 130000 = 459000
    assert result['grand_total'] == expected, f"Expected {expected} got {result['grand_total']}"
    assert os.path.exists(result['path'])


# ─────────────────────────────────────────────────────────────
# Test 6: Sigenergy 5kW 1P
# ─────────────────────────────────────────────────────────────
def test6():
    result = qsolar_generate(
        brand='Sigenergy', size_kw=5.0, phase='1P',
        customer_name='ทดสอบ', project_name='Test Sigenergy 5kW 1P',
    )
    assert result['success'], f"Failed: {result.get('error')}"
    assert result['grand_total'] == 191000, f"Expected 191000 got {result['grand_total']}"
    assert result['brand'] == 'Sigenergy'
    assert os.path.exists(result['path'])
    assert os.path.getsize(result['path']) > 10000


# ─────────────────────────────────────────────────────────────
# Test 7: Sigenergy 10kW 3P
# ─────────────────────────────────────────────────────────────
def test7():
    result = qsolar_generate(
        brand='Sigenergy', size_kw=10.0, phase='3P',
        customer_name='ทดสอบ', project_name='Test Sigenergy 10kW 3P',
    )
    assert result['success'], f"Failed: {result.get('error')}"
    assert result['grand_total'] == 370000, f"Expected 370000 got {result['grand_total']}"
    assert os.path.exists(result['path'])


# ─────────────────────────────────────────────────────────────
# Test 8: Huawei 10kW 3P
# ─────────────────────────────────────────────────────────────
def test8():
    result = qsolar_generate(
        brand='Huawei', size_kw=10.0, phase='3P',
        customer_name='ทดสอบ', project_name='Test Huawei 10kW 3P',
    )
    assert result['success'], f"Failed: {result.get('error')}"
    assert result['grand_total'] == 266000, f"Expected 266000 got {result['grand_total']}"
    assert result['brand'] == 'Huawei'
    assert os.path.exists(result['path'])


# ─────────────────────────────────────────────────────────────
# Test 9: Solis 5kW 1P
# ─────────────────────────────────────────────────────────────
def test9():
    result = qsolar_generate(
        brand='Solis', size_kw=5.0, phase='1P',
        customer_name='ทดสอบ', project_name='Test Solis 5kW 1P',
    )
    assert result['success'], f"Failed: {result.get('error')}"
    assert result['grand_total'] == 146000, f"Expected 146000 got {result['grand_total']}"
    assert result['brand'] == 'Solis'
    assert os.path.exists(result['path'])


# ─────────────────────────────────────────────────────────────
# Test 10: qsolar_from_spec natural language
# ─────────────────────────────────────────────────────────────
def test10():
    result = qsolar_from_spec(
        spec='atmoce 5kw 1phase batt backup',
        customer_name='ทดสอบ NL',
        project_name='Test NL Parse',
    )
    assert result['success'], f"Failed: {result.get('error')}"
    assert result['brand'] == 'ATMOCE'
    assert result['size_kw'] == 5.0
    assert result['phase'] == '1P'
    assert result['has_battery'] is True
    assert result['has_backup'] is True
    expected = 169000 + BATTERY_PRICES['batt_backup_1P']
    assert result['grand_total'] == expected, f"Expected {expected} got {result['grand_total']}"
    assert os.path.exists(result['path'])

    # Also test Sigenergy spec
    r2 = qsolar_from_spec(spec='sigenergy 10kw 3phase')
    assert r2['success'], f"Sigenergy NL failed: {r2.get('error')}"
    assert r2['brand'] == 'Sigenergy'
    assert r2['size_kw'] == 10.0
    assert r2['phase'] == '3P'
    assert r2['grand_total'] == 370000


# ─────────────────────────────────────────────────────────────
# Bonus: qsolar_list_options + qsolar_get_prices
# ─────────────────────────────────────────────────────────────
def test_list_options():
    result = qsolar_list_options()
    assert 'brands' in result
    assert 'ATMOCE' in result['brands']
    assert 'Sigenergy' in result['brands']
    assert 'configurations' in result


def test_get_prices():
    result = qsolar_get_prices(brand='ATMOCE', phase='1P')
    assert 'prices' in result
    assert 'ATMOCE' in result['prices']
    assert '1P' in result['prices']['ATMOCE']

    result_all = qsolar_get_prices()
    for brand in ('ATMOCE', 'Sigenergy', 'Huawei', 'Solis'):
        assert brand in result_all['prices'], f'{brand} missing from prices'


# ─────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print('=' * 60)
    print('mcp-qsolar test suite')
    print('=' * 60)

    run_test('Test 1: ATMOCE 5kW 1P on-grid', test1)
    run_test('Test 2: ATMOCE 10kW 3P on-grid', test2)
    run_test('Test 3: ATMOCE 5kW 1P + battery', test3)
    run_test('Test 4: ATMOCE 5kW 1P + battery + backup', test4)
    run_test('Test 5: ATMOCE 10kW 3P + battery + backup', test5)
    run_test('Test 6: Sigenergy 5kW 1P', test6)
    run_test('Test 7: Sigenergy 10kW 3P', test7)
    run_test('Test 8: Huawei 10kW 3P', test8)
    run_test('Test 9: Solis 5kW 1P', test9)
    run_test('Test 10: qsolar_from_spec NL parse', test10)
    run_test('Bonus: qsolar_list_options', test_list_options)
    run_test('Bonus: qsolar_get_prices', test_get_prices)

    print()
    print('=' * 60)
    total = PASS + FAIL
    print(f'Results: {PASS}/{total} passed, {FAIL} failed')
    print('=' * 60)

    if FAIL > 0:
        print()
        print('Failed tests:')
        for status, name, msg in RESULTS:
            if status != 'PASS':
                print(f'  [{status}] {name}: {msg}')

    sys.exit(0 if FAIL == 0 else 1)
