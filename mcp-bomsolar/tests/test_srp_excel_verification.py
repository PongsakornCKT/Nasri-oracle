"""Empirical Golden Verification Test against /tmp/atmoce-srp.xlsx sheet values."""

import openpyxl
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from srp_calculator import calculate_srp, SRPParams

wb_v = openpyxl.load_workbook('/tmp/atmoce-srp.xlsx', data_only=True)

print("\n=== ATMOCE SRP Excel Verification Suite ===\n")

pass_count = 0
fail_count = 0

def check(label, actual, expected, tol=1.0):
    global pass_count, fail_count
    diff = abs(actual - expected)
    if diff <= tol:
        print(f"  PASS {label}: Actual={actual:,.2f} | Expected={expected:,.2f}")
        pass_count += 1
    else:
        print(f"  FAIL {label}: Actual={actual:,.2f} | Expected={expected:,.2f} (diff={diff:,.2f})")
        fail_count += 1

# 1. Test Resi_MI-500 1P (Row 16 total)
ws500 = wb_v['Resi_MI-500']
# Row 3: 10 panels, 630W -> 6.3 kWp, 7kWh battery, backup=True
res_500_1p = calculate_srp("Resi_MI-500-1P", panels=10, battery_kwh=7, backup=True)
check("Resi_MI-500 1P Total Ex VAT (Row 16)", res_500_1p.total_cost, ws500.cell(16, 5).value)

# 2. Test Resi_Mi-1250 1P (Row 19 total)
ws1250 = wb_v['Resi_Mi-1250']
# Row 3: 18 panels, 670W -> 12.06 kWp, 7kWh battery, backup=True
res_1250_1p = calculate_srp("Resi_Mi-1250-1P", panels=18, battery_kwh=7, backup=True)
check("Resi_Mi-1250 1P Total Ex VAT (Row 19)", res_1250_1p.total_cost, ws1250.cell(19, 5).value)

# 3. Test C&I_MI-1250 3P (Row 23 total & Row 26 include VAT)
wsci = wb_v['C&I_MI-1250']
# Row 3: 316 panels, 670W -> 211.72 kWp
res_ci_3p = calculate_srp("C&I_MI-1250", panels=316, warranty_years=25)
check("C&I_MI-1250 3P Total Ex VAT (Row 23)", res_ci_3p.total_cost, wsci.cell(23, 5).value)
check("C&I_MI-1250 3P Include VAT (Row 26)", res_ci_3p.offer_price, wsci.cell(26, 5).value)

# 4. Test SRP Calculation Turnkey Pricing (Row 14-38, 41-65)
wssrp = wb_v['SRP Calculation']

# 1:1 1P (Row 38 offer price for 33 panels / 22.11 kWp)
res_srp_1p = calculate_srp("1:1-1P", panels=33)
check("SRP Calculation 1:1-1P Total Cost (Row 35)", res_srp_1p.total_cost, wssrp.cell(35, 6).value)
check("SRP Calculation 1:1-1P Offer Price (Row 38)", res_srp_1p.offer_price, wssrp.cell(38, 6).value)

# 2:1 1P (Row 38 offer price for 33 panels / 22.11 kWp)
res_srp_2to1_1p = calculate_srp("2:1-1P", panels=33)
check("SRP Calculation 2:1-1P Total Cost (Row 35)", res_srp_2to1_1p.total_cost, wssrp.cell(35, 13).value)
check("SRP Calculation 2:1-1P Offer Price (Row 38)", res_srp_2to1_1p.offer_price, wssrp.cell(38, 13).value)

# 1:1 3P (Row 65 offer price for 60 panels / 40.2 kWp)
res_srp_1p3 = calculate_srp("1:1-3P", panels=60)
check("SRP Calculation 1:1-3P Total Cost (Row 62)", res_srp_1p3.total_cost, wssrp.cell(62, 6).value)
check("SRP Calculation 1:1-3P Offer Price (Row 65)", res_srp_1p3.offer_price, wssrp.cell(65, 6).value)

# 2:1 3P (Row 66 offer price for 5000 panels / 3350 kWp)
res_srp_2to1_3p = calculate_srp("2:1-3P", panels=5000)
check("SRP Calculation 2:1-3P Total Cost (Row 63)", res_srp_2to1_3p.total_cost, wssrp.cell(63, 13).value)
check("SRP Calculation 2:1-3P Offer Price (Row 66)", res_srp_2to1_3p.offer_price, wssrp.cell(66, 13).value)

print("\n─────────────────────────────")
print(f"Results: {pass_count} passed, {fail_count} failed / {pass_count + fail_count} total")
if fail_count > 0:
    sys.exit(1)
