"""
Golden-output regression test for _inverter_section_lines.

Freezes the current line-for-line output of the install-lines section
for the 14 key brand × phase × size tiers. If someone refactors the
inline branches inside _inverter_section_lines, this test will fail
loudly for any drift — even a single-character change.

Usage:
    python -m pytest test_install_lines_golden.py -q
    # or
    python test_install_lines_golden.py        # runs as __main__

To regenerate fixtures (only when you intentionally changed the output):
    python test_install_lines_golden.py --write-fixtures

Fixtures live next to this file as .golden.json files in test_fixtures/.

Each test case captures the (font, size, text) triple for every line
emitted by _inverter_section_lines for one scenario.

History:
    Added 2026-04-11 after the team review (task #21). The Code Reviewer
    recommended this harness before attempting a data-driven
    INSTALL_LINE_SPECS refactor. With this in place, future refactors
    can claim "byte-identical output" credibly.
"""
import json
import os
import sys

# Ensure local package is importable
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)

import generate_pdf  # noqa: E402

FIXTURES_DIR = os.path.join(_DIR, 'test_fixtures', 'install_lines')

# ─── Test cases ────────────────────────────────────────────────
# (name, brand, phase, size_kw, panels, model, has_optimizer, panel_brand, panel_watt)
CASES = [
    # ATMOCE 1P
    ('atmoce_1p_5kw_10p',     'ATMOCE',    '1P',  5.0,  10, 'MI-500',     False, '', 0),
    ('atmoce_1p_7kw_14p',     'ATMOCE',    '1P',  7.0,  14, 'MI-500',     False, '', 0),   # >12 panels → MC100
    ('atmoce_1p_11kw_22p',    'ATMOCE',    '1P', 11.0,  22, 'MI-500',     False, '', 0),   # >10 panels → MT-04002 + >12 → MC100
    # ATMOCE 3P residential
    ('atmoce_3p_7kw_14p',     'ATMOCE',    '3P',  7.0,  14, 'MI-500',     False, '', 0),
    # ATMOCE 3P C&I (≥30 kW)
    ('atmoce_3p_ci_30kw_60p', 'ATMOCE',    '3P', 30.0,  60, 'MI-1250',    False, '', 0),
    # Sigenergy 1P
    ('sig_1p_5kw_10p',        'Sigenergy', '1P',  5.0,  10, 'SigenStor EC 5.0 SP',   False, '', 0),
    ('sig_1p_10kw_20p',       'Sigenergy', '1P', 10.0,  20, 'SigenStor EC 10.0 SP',  False, '', 0),
    # Sigenergy 3P — three gateway tiers
    ('sig_3p_10kw_20p',       'Sigenergy', '3P', 10.0,  20, 'SigenStor EC 10.0 TP',  False, '', 0),   # Home TP 30K
    ('sig_3p_15kw_30p',       'Sigenergy', '3P', 15.0,  30, 'SigenStor EC 15.0 TP',  False, '', 0),   # gap 11-19kW (currently Home TP 30K)
    ('sig_3p_20kw_40p',       'Sigenergy', '3P', 20.0,  40, 'SigenStor EC 20.0 TP',  False, '', 0),   # C60-2
    ('sig_3p_25kw_50p',       'Sigenergy', '3P', 25.0,  50, 'SigenStor EC 25.0 TP',  False, '', 0),   # C60-2
    # String inverter brands
    ('huawei_1p_5kw',         'Huawei',    '1P',  5.0,  10, 'SUN2000-5KTL-L1',       False, '', 0),
    ('huawei_3p_10kw',        'Huawei',    '3P', 10.0,  16, 'SUN2000-10KTL-M1',      False, '', 0),
    ('deye_1p_5kw',           'Deye',      '1P',  5.0,  10, 'SUN-5K-SG04LP1',        False, '', 0),
    ('deye_3p_10kw',          'Deye',      '3P', 10.0,  16, 'SUN-10K-SG04LP3',       False, '', 0),
    ('solis_3p_10kw',         'Solis',     '3P', 10.0,  16, 'S5-GR3P10K',            False, '', 0),
    ('hoymiles_1p_5kw',       'Hoymiles',  '1P',  5.0,  10, 'HMS2000D-4T',           False, '', 0),
]


def serialize_lines(lines):
    """Convert list of (font_obj, size, text) triples to JSON-safe list."""
    out = []
    for item in lines:
        if isinstance(item, tuple) and len(item) >= 3:
            font_obj, size, text = item[0], item[1], item[2]
            font_name = getattr(font_obj, '__name__', None) or str(font_obj)
            # The font constants F/FB are module-level references; stringify robustly
            if hasattr(generate_pdf, 'FB') and font_obj is generate_pdf.FB:
                font_name = 'FB'
            elif hasattr(generate_pdf, 'F') and font_obj is generate_pdf.F:
                font_name = 'F'
            out.append({'font': font_name, 'size': size, 'text': text})
        else:
            out.append({'raw': repr(item)})
    return out


def fixture_path(name):
    return os.path.join(FIXTURES_DIR, f'{name}.golden.json')


def render_case(case):
    name, brand, phase, size_kw, panels, model, has_optimizer, panel_brand, panel_watt = case
    lines = generate_pdf._inverter_section_lines(
        brand=brand,
        phase=phase,
        size_kw=size_kw,
        model=model,
        panels=panels,
        has_optimizer=has_optimizer,
        panel_brand=panel_brand,
        panel_watt=panel_watt,
    )
    return serialize_lines(lines)


def write_fixtures():
    os.makedirs(FIXTURES_DIR, exist_ok=True)
    written = 0
    for case in CASES:
        name = case[0]
        rendered = render_case(case)
        with open(fixture_path(name), 'w', encoding='utf-8') as f:
            json.dump(rendered, f, ensure_ascii=False, indent=2)
        written += 1
    print(f'✓ wrote {written} golden fixtures to {FIXTURES_DIR}')


def run_tests():
    """Compare each case's current output against its pinned fixture."""
    if not os.path.isdir(FIXTURES_DIR):
        print(f'⚠ fixtures dir not found: {FIXTURES_DIR}')
        print('  run: python test_install_lines_golden.py --write-fixtures')
        return 1

    failures = []
    passed = 0
    for case in CASES:
        name = case[0]
        fp = fixture_path(name)
        if not os.path.exists(fp):
            failures.append((name, 'fixture missing'))
            continue
        with open(fp, 'r', encoding='utf-8') as f:
            expected = json.load(f)
        actual = render_case(case)
        if actual == expected:
            passed += 1
        else:
            failures.append((name, _diff_summary(expected, actual)))

    total = len(CASES)
    print(f'{passed}/{total} golden checks passed')
    for name, diff in failures:
        print(f'  ✗ {name}')
        print(f'    {diff}')
    return 0 if not failures else 1


def _diff_summary(expected, actual):
    """Return a compact description of the first difference."""
    el = len(expected)
    al = len(actual)
    if el != al:
        return f'line count {al} vs expected {el}'
    for i, (e, a) in enumerate(zip(expected, actual)):
        if e != a:
            return f'line {i} differs: expected={e}, actual={a}'
    return 'unknown diff'


# ─── pytest integration (optional) ─────────────────────────────
def test_all_golden():
    """Single pytest entry point that runs every case."""
    rc = run_tests()
    assert rc == 0, 'golden output drift — see stdout'


if __name__ == '__main__':
    if '--write-fixtures' in sys.argv:
        write_fixtures()
        sys.exit(0)
    rc = run_tests()
    sys.exit(rc)
