"""Golden tests — SRP calculator must match 'SRP Calculation' sheet totals.

Source: Internal Configuration guideline enervia042026.xlsx → SRP Calculation
Reference snapshot at ψ/inbox/ptah/SRP-reference.xlsx

Runs as standalone script (no pytest dependency):
    python tests/test_srp_calculator.py
"""

from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.dirname(HERE)
sys.path.insert(0, PARENT)

from srp_calculator import calculate_srp  # noqa: E402


# Tolerances — match Excel to within 1 THB for totals,
# and floating-point slack for intermediate lines.
TOL_TOTAL = 1.0
TOL_LINE = 0.5


def assert_close(actual, expected, tol, msg):
    diff = abs(actual - expected)
    if diff > tol:
        raise AssertionError(
            f"{msg}: expected {expected:,.2f} ± {tol}, got {actual:,.2f} (diff {diff:,.2f})"
        )


def test_1to1_1p_8panels():
    """1:1 1-Phase, 8 panels, 5.36 kWp → Offer 173,000"""
    r = calculate_srp("1:1-1P", 8)
    assert r.panels == 8
    assert_close(r.kwp, 5.36, 0.001, "kWp")
    assert r.inverter_count == 8
    assert_close(r.total_cost, 124_000, TOL_TOTAL, "Total Cost")
    assert_close(r.profit, 37_200, TOL_TOTAL, "Profit")
    assert_close(r.vat, 11_284, TOL_TOTAL, "VAT")
    assert r.offer_price == 173_000, f"Offer price: expected 173,000, got {r.offer_price:,}"

    # Spot-check critical line items
    by_pn = {line.part_number: line for line in r.lines}
    assert_close(by_pn["PANEL-670W"].total_cost, 24_120, TOL_LINE, "Panel total")
    assert_close(by_pn["MI-500"].total_cost, 32_000, TOL_LINE, "MI-500 total")
    assert_close(by_pn["MOUNTING"].total_cost, 5_360, TOL_LINE, "Mounting total")
    assert_close(by_pn["MW-025013-A"].total_cost, 4_000, TOL_LINE, "MW-025013-A total")
    assert_close(by_pn["MT-04003-A"].total_cost, 640, TOL_LINE, "MT-04003-A total")
    assert by_pn["MT-04002-2in1"].quantity == 0, "MT-04002-2in1 qty should be 0 (panels ≤ 9)"
    assert_close(by_pn["MC100L"].total_cost, 10_900, TOL_LINE, "MC100L total")
    assert_close(by_pn["INSTALL"].total_cost, 24_120, TOL_LINE, "Installation total")


def test_2to1_1p_8panels():
    """2:1 1-Phase, 8 panels, 5.36 kWp → Offer 164,000.

    Verifies two sheet quirks:
      • MW-025013-A uses 800 per unit (J23 literal, not Price List VLOOKUP)
      • MT-04003-A / MT-04002-2in1 are displayed but their cost is excluded
        from the total (sheet SUM(L23:L24) range misses L25:L26)
    """
    r = calculate_srp("2:1-1P", 8)
    assert r.inverter_count == 4, f"MI-1250 count: expected 4, got {r.inverter_count}"
    assert_close(r.total_cost, 117_520, TOL_TOTAL, "Total Cost")
    assert r.offer_price == 164_000, f"Offer price: expected 164,000, got {r.offer_price:,}"

    by_pn = {line.part_number: line for line in r.lines}
    assert_close(by_pn["MI-1250"].total_cost, 19_000, TOL_LINE, "MI-1250 total")
    assert by_pn["MW-025013-A"].unit_cost == 800, "MW-025013-A unit price should be 800 (sheet quirk)"
    assert_close(by_pn["MW-025013-A"].total_cost, 3_200, TOL_LINE, "MW-025013-A total")
    assert_close(by_pn["MW-025020-B0"].total_cost, 2_960, TOL_LINE, "MW-025020-B0 total")
    assert by_pn["MT-04003-A"].total_cost == 0, "MT-04003-A cost excluded per sheet SUM quirk"
    assert by_pn["MT-04002-2in1"].total_cost == 0, "MT-04002-2in1 cost excluded per sheet SUM quirk"
    assert_close(by_pn["MC100"].total_cost, 15_900, TOL_LINE, "MC100 total")


def test_1to1_3p_16panels():
    """1:1 3-Phase, 16 panels, 10.72 kWp → Offer 321,000"""
    r = calculate_srp("1:1-3P", 16)
    assert r.inverter_count == 16
    assert_close(r.kwp, 10.72, 0.001, "kWp")
    assert_close(r.total_cost, 230_240, TOL_TOTAL, "Total Cost")
    assert r.offer_price == 321_000, f"Offer price: expected 321,000, got {r.offer_price:,}"

    by_pn = {line.part_number: line for line in r.lines}
    assert_close(by_pn["MI-500"].total_cost, 64_000, TOL_LINE, "MI-500 total (16 × 4000)")
    assert_close(by_pn["MW-025013-A"].total_cost, 8_000, TOL_LINE, "MW-025013-A (16 × 500)")
    assert by_pn["MT-04003-A"].quantity == 3, f"MT-04003-A qty: expected 3 (kWp ≥ 2 band), got {by_pn['MT-04003-A'].quantity}"
    assert_close(by_pn["MT-04003-A"].total_cost, 1_920, TOL_LINE, "MT-04003-A total")
    assert_close(by_pn["MC100T"].total_cost, 20_900, TOL_LINE, "MC100T total")


def test_2to1_3p_16panels():
    """2:1 3-Phase, 16 panels, 10.72 kWp → Offer 281,000"""
    r = calculate_srp("2:1-3P", 16)
    assert r.inverter_count == 8
    assert_close(r.total_cost, 201_442, 5.0, "Total Cost (loose ±5 for rounding)")
    assert r.offer_price == 281_000, f"Offer price: expected 281,000, got {r.offer_price:,}"

    by_pn = {line.part_number: line for line in r.lines}
    assert_close(by_pn["MI-1250"].total_cost, 38_000, TOL_LINE, "MI-1250 total (8 × 4750)")
    # MWX-040030-B: 8 × (21850/30) = 8 × 728.33 = 5,826.67
    assert_close(by_pn["MWX-040030-B"].total_cost, 5_826.67, 0.5, "MWX cable")
    assert by_pn["MT-03505-A"].quantity == 1, f"MT-03505-A qty: expected 1 (8/15 roundup), got {by_pn['MT-03505-A'].quantity}"
    assert by_pn["MA-CAP-003"].quantity == 1, f"MA-CAP-003 qty: expected 1"
    assert_close(by_pn["MC100T"].total_cost, 20_900, TOL_LINE, "MC100T (panels < 30)")


def test_derived_quantity_rules():
    """MT-04003-A tiered quantity rule + MT-04002 MC100L activation."""
    from srp_calculator import _mt_04003_a_qty, _mt_04002_2in1_qty_1p
    # MT-04003-A
    assert _mt_04003_a_qty(5.36) == 1
    assert _mt_04003_a_qty(11.99) == 1
    assert _mt_04003_a_qty(12.0) == 2
    assert _mt_04003_a_qty(23.99) == 2
    assert _mt_04003_a_qty(24.0) == 3
    assert _mt_04003_a_qty(50.0) == 3

    # MT-04002-2in1
    assert _mt_04002_2in1_qty_1p("MC100L", 8) == 0
    assert _mt_04002_2in1_qty_1p("MC100L", 10) == 1
    assert _mt_04002_2in1_qty_1p("MC100", 20) == 0
    assert _mt_04002_2in1_qty_1p("MC100", 28) == 3


def test_battery_backup_1p():
    """1:1-1P + 7kWh battery + backup → MS-7K-U × 1, MU100S × 1 in lines."""
    r = calculate_srp("1:1-1P", 8, battery_kwh=7, backup=True)
    by_pn = {line.part_number: line for line in r.lines}
    assert "MS-7K-U" in by_pn, "MS-7K-U should be in BOM"
    assert by_pn["MS-7K-U"].quantity == 1
    assert_close(by_pn["MS-7K-U"].total_cost, 72_900, 1.0, "MS-7K-U total")
    assert "MU100S" in by_pn, "MU100S should be in BOM (1P backup)"
    assert by_pn["MU100S"].quantity == 1
    # offer_price should be higher than base (173,000)
    assert r.offer_price > 173_000, "Offer price with battery/backup should exceed base"
    assert r.battery_kwh == 7
    assert r.has_backup is True


def test_battery_backup_3p():
    """2:1-3P + 14kWh battery + backup → MS-7K-U × 2, MU100T × 1."""
    r = calculate_srp("2:1-3P", 16, battery_kwh=14, backup=True)
    by_pn = {line.part_number: line for line in r.lines}
    assert by_pn["MS-7K-U"].quantity == 2, "14kWh → 2 × MS-7K-U"
    assert "MU100T" in by_pn, "MU100T should be in BOM (3P backup)"
    assert by_pn["MU100T"].quantity == 1


def test_battery_max_cap_1p():
    """1P battery is capped at 3 × MS-7K-U (21kWh max)."""
    r = calculate_srp("1:1-1P", 8, battery_kwh=28)  # would be 4 units uncapped
    by_pn = {line.part_number: line for line in r.lines}
    assert by_pn["MS-7K-U"].quantity == 3, "1P battery capped at 3 units"


def test_warranty_mi1250():
    """2:1-1P + warranty_years=5 → MI-1250-P5 × inverter_count."""
    r = calculate_srp("2:1-1P", 8, warranty_years=5)
    by_pn = {line.part_number: line for line in r.lines}
    assert "MI-1250-P5" in by_pn, "MI-1250-P5 warranty line expected"
    # 8 panels → 4 inverters (2:1)
    assert by_pn["MI-1250-P5"].quantity == 4
    assert r.warranty_years == 5


def test_ci_3p_36panels():
    """C&I-3P, 36 panels → MI-1250×18, MC100-Wye-4in1×1, 2 rolls MWX, arrays×3."""
    r = calculate_srp("C&I-3P", 36)
    assert r.inverter_count == 18
    by_pn = {line.part_number: line for line in r.lines}
    assert by_pn["MI-1250"].quantity == 18
    assert "MC100-Wye-4in1" in by_pn, "36 panels → 4in1 combiner"
    # MWX: ceil(18/30)=1 roll → 30 cables
    assert by_pn["MWX-040030-B"].quantity == 30, f"1 roll = 30 cables, got {by_pn['MWX-040030-B'].quantity}"
    # arrays = ceil(18/15) = 2
    assert by_pn["MT-03505-A"].quantity == 2, f"MT-03505-A: expected 2, got {by_pn['MT-03505-A'].quantity}"
    assert by_pn["MA-CAP-003"].quantity == 2, f"MA-CAP-003: expected 2, got {by_pn['MA-CAP-003'].quantity}"


def test_ci_3p_with_battery():
    """C&I-3P with battery+backup wires correctly."""
    r = calculate_srp("C&I-3P", 36, battery_kwh=28, backup=True)
    by_pn = {line.part_number: line for line in r.lines}
    assert by_pn["MS-7K-U"].quantity == 4, "28kWh → ceil(28/7)=4 units"
    assert "MU100T" in by_pn, "C&I-3P uses MU100T (3P backup)"


def main():
    tests = [
        test_1to1_1p_8panels,
        test_2to1_1p_8panels,
        test_1to1_3p_16panels,
        test_2to1_3p_16panels,
        test_derived_quantity_rules,
        test_battery_backup_1p,
        test_battery_backup_3p,
        test_battery_max_cap_1p,
        test_warranty_mi1250,
        test_ci_3p_36panels,
        test_ci_3p_with_battery,
    ]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  ✓ {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  ✗ {t.__name__}: {e}")
        except Exception as e:
            failed += 1
            print(f"  ✗ {t.__name__} [unexpected]: {type(e).__name__}: {e}")
    if failed:
        print(f"\n{failed}/{len(tests)} tests failed")
        sys.exit(1)
    else:
        print(f"\nAll {len(tests)} tests passed ✓")


if __name__ == "__main__":
    main()
