"""Test server.py imports and compatibility exports (#N2 r6).

Verifies that server.py successfully imports calculate_srp, SRPParams,
PRICES_ATMOCE_DEFAULT, and srp_result_from_dict from srp_calculator.py.
"""

import sys
import os
import pytest

pytest.importorskip("mcp")

# Add mcp-bomsolar and root repo dir to sys.path
mcp_bomsolar_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(mcp_bomsolar_dir)
for p in (mcp_bomsolar_dir, root_dir):
    if p not in sys.path:
        sys.path.insert(0, p)


def test_server_imports_cleanly():
    """Verify that server.py imports srp_calculator exports cleanly."""
    try:
        import server
    except ModuleNotFoundError as e:
        if "solar_catalog" in str(e) or "mcp" in str(e):
            pytest.skip(f"Skipping server import test due to missing env module: {e}", allow_module_level=True)
        raise

    assert server.SRP_CALC_AVAILABLE is True

    from srp_calculator import (
        calculate_srp,
        SRPParams,
        PRICES_ATMOCE_DEFAULT,
        srp_result_from_dict,
        SRPResult,
        BOMLine,
    )

    assert SRPParams is not None
    assert isinstance(PRICES_ATMOCE_DEFAULT, dict)
    assert "MI-500" in PRICES_ATMOCE_DEFAULT
    assert "MI-1250" in PRICES_ATMOCE_DEFAULT

    # Test calculate_srp legacy call returning SRPResult
    res = calculate_srp("2:1-1P", 10)
    assert isinstance(res, SRPResult)
    assert res.offer_price > 0
    assert len(res.lines) > 0

    # Test srp_result_from_dict reconstruction
    cost_summary = {
        "srp_config": "2:1-1P",
        "srp_panels": 10,
        "srp_kwp": 6.7,
        "srp_inverter_count": 5,
        "equipment_total": 100000.0,
        "profit_30pct": 30000.0,
        "vat_7pct": 9100.0,
        "grand_total": 140000.0,
    }
    items_raw = [
        {
            "part_number": "MI-1250",
            "part_name": "Micro Inverter MI-1250",
            "manufacturer": "ATMOCE",
            "category": "อินเวอร์เตอร์",
            "quantity": 5,
            "unit": "ตัว",
            "unit_cost": 4750.0,
            "total_cost": 23750.0,
        }
    ]
    reconstructed = srp_result_from_dict(cost_summary, items_raw)
    assert isinstance(reconstructed, SRPResult)
    assert reconstructed.offer_price == 140000.0
    assert len(reconstructed.lines) == 1
