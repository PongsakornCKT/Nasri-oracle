"""
Battery matching test suite — verifies _find_best_battery + brand-specific rules.
Run from mcp-bomsolar/: python tests/test_battery_matching.py
"""
import sys
import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ---------------------------------------------------------------------------
# Mock catalog rows (simulating Google Sheet Batteries tab)
# ---------------------------------------------------------------------------
MOCK_BATT_ROWS = [
    {"ยี่ห้อ": "Dyness", "รุ่น": "DL5.0C",          "ขนาด (kWh)": 5.12,  "฿ ราคาสั่งซื้อ": "36,500"},
    {"ยี่ห้อ": "Dyness", "รุ่น": "Powerbox Pro",     "ขนาด (kWh)": 10.24, "฿ ราคาสั่งซื้อ": "64,000"},
    {"ยี่ห้อ": "Dyness", "รุ่น": "PowerBrick",       "ขนาด (kWh)": 14.3,  "฿ ราคาสั่งซื้อ": "85,000"},
    {"ยี่ห้อ": "Dyness", "รุ่น": "Power Brick SC",   "ขนาด (kWh)": 16.0,  "฿ ราคาสั่งซื้อ": "95,000"},
    {"ยี่ห้อ": "Deye",   "รุ่น": "SE-G5.3 Pro",      "ขนาด (kWh)": 5.3,   "฿ ราคาสั่งซื้อ": "38,000"},
    {"ยี่ห้อ": "Sigenergy","รุ่น": "SigenStor BAT 6.0","ขนาด (kWh)": 6.0,  "฿ ราคาสั่งซื้อ": "55,000"},
    {"ยี่ห้อ": "Sigenergy","รุ่น": "SigenStor BAT 10.0","ขนาด (kWh)": 9.0, "฿ ราคาสั่งซื้อ": "75,000"},
    {"ยี่ห้อ": "ATMOCE", "รุ่น": "MS-7K-U",          "ขนาด (kWh)": 7.0,   "฿ ราคาสั่งซื้อ": "85,000"},
    {"ยี่ห้อ": "Huawei", "รุ่น": "LUNA2000-7-E1 (Battery S1)", "ขนาด (kWh)": 7.0, "฿ ราคาสั่งซื้อ": "63,720"},
    {"ยี่ห้อ": "Huawei", "รุ่น": "LUNA2000-10kW-C1 (Controller S1)", "ขนาด (kWh)": 0, "฿ ราคาสั่งซื้อ": "30,630"},
    # Bad row: zero price — should be skipped
    {"ยี่ห้อ": "bad row","รุ่น": "X",               "ขนาด (kWh)": 0,     "฿ ราคาสั่งซื้อ": "0"},
]


def _mock_price(row):
    for k, v in row.items():
        if "฿" in k and "ราคา" in k.lower():
            try:
                return float(str(v).replace(",", "").replace("฿", "").strip())
            except Exception:
                pass
    return 0


def _mock_field(row, keys):
    for k in keys:
        for col, val in row.items():
            if k.lower() in col.lower() and str(val).strip():
                return str(val).strip()
    return ""


from server import _find_best_battery, BATTERY_BRAND_COMPAT  # noqa: E402

passed = 0
failed = 0


def test(name: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}  {detail}")


print("=== Battery Matching Tests (Brand-Specific Rules) ===\n")

# --- Test 1: Huawei 7kWh -> 1x LUNA2000-7-E1 + 1x Controller ---
r1 = _find_best_battery("Huawei", 7, MOCK_BATT_ROWS, _mock_price, _mock_field)
test("1. Huawei 7kWh -> 1x battery",
     r1 is not None and r1["quantity"] == 1 and "LUNA" in r1["model"],
     f"got: {r1}")

# --- Test 2: Huawei 7kWh has mandatory Controller accessory ---
test("2. Huawei has mandatory Controller accessory",
     r1 is not None and len(r1.get("accessories", [])) == 1 and "Controller" in r1["accessories"][0]["model"],
     f"accessories: {r1.get('accessories') if r1 else None}")

# --- Test 3: Huawei 14kWh -> 2x battery + Controller ---
r3 = _find_best_battery("Huawei", 14, MOCK_BATT_ROWS, _mock_price, _mock_field)
test("3. Huawei 14kWh -> 2x battery",
     r3 is not None and r3["quantity"] == 2,
     f"got qty={r3['quantity'] if r3 else None}")

# --- Test 4: Sigenergy 9kWh -> 1x BAT 10.0 (9kWh, prefer larger) ---
r4 = _find_best_battery("Sigenergy", 9, MOCK_BATT_ROWS, _mock_price, _mock_field)
test("4. Sigenergy 9kWh -> BAT 10.0 (9kWh)",
     r4 is not None and r4["kwh_per_unit"] == 9.0 and r4["quantity"] == 1,
     f"got: {r4}")

# --- Test 5: Sigenergy 12kWh -> 2x BAT 6.0 (12kWh) ---
r5 = _find_best_battery("Sigenergy", 12, MOCK_BATT_ROWS, _mock_price, _mock_field)
test("5. Sigenergy 12kWh -> 2x BAT 6.0",
     r5 is not None and r5["kwh_per_unit"] == 6.0 and r5["quantity"] == 2,
     f"got: model={r5['model'] if r5 else None} qty={r5['quantity'] if r5 else None} kwh={r5['kwh_per_unit'] if r5 else None}")

# --- Test 6: ATMOCE 1P 28kWh -> capped at 3x MS-7K-U (21kWh) ---
r6 = _find_best_battery("ATMOCE", 28, MOCK_BATT_ROWS, _mock_price, _mock_field, phase="1P")
test("6. ATMOCE 1P capped at 3 units (21kWh max)",
     r6 is not None and r6["quantity"] == 3 and r6["total_kwh"] == 21.0,
     f"got qty={r6['quantity'] if r6 else None} kwh={r6['total_kwh'] if r6 else None}")

# --- Test 7: ATMOCE 3P 28kWh -> 4x (no cap) ---
r7 = _find_best_battery("ATMOCE", 28, MOCK_BATT_ROWS, _mock_price, _mock_field, phase="3P")
test("7. ATMOCE 3P no cap -> 4x (28kWh)",
     r7 is not None and r7["quantity"] == 4,
     f"got qty={r7['quantity'] if r7 else None}")

# --- Test 8: Deye 14kWh -> prefers PowerBrick (14.3kWh) largest model ---
r8 = _find_best_battery("Deye", 14, MOCK_BATT_ROWS, _mock_price, _mock_field)
test("8. Deye 14kWh prefers largest model (PowerBrick 14.3kWh)",
     r8 is not None and r8["kwh_per_unit"] >= 14,
     f"got: {r8['model'] if r8 else None} ({r8['kwh_per_unit'] if r8 else None}kWh)")

# --- Test 9: Hoymiles -> None ---
r9 = _find_best_battery("Hoymiles", 10, MOCK_BATT_ROWS, _mock_price, _mock_field)
test("9. Hoymiles returns None (no battery)",
     r9 is None)

# --- Test 10: Thai kWh regex ---
lo = "deye 42kw ใส่แบท 14kw"
batt_kwh = 0.0
if m := re.search(r"(?:batt(?:ery)?|แบต|แบท)\s*(\d+(?:\.\d+)?)\s*(?:kw|kwh)?", lo):
    batt_kwh = float(m.group(1))
elif m := re.search(r"(\d+(?:\.\d+)?)\s*(?:kw|kwh)\s*(?:batt|แบต|แบท)", lo):
    batt_kwh = float(m.group(1))
test("10. Thai regex parses battery kWh from spec -> 14.0",
     batt_kwh == 14.0)

# ------------------------------------------------------------------
total = passed + failed
print(f"\n=== Results: {passed}/{total} passed ===")
if failed:
    sys.exit(1)
