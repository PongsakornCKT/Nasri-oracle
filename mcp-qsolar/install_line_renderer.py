"""
Generic renderer for install-line specs.

Reads an INSTALL_LINE_SPECS entry and produces the same
(font, size, text) tuples as the old inline code.

v1.3 2026-04-12 — extracted from _inverter_section_lines().
"""
import math
import os as _os
import sys as _sys
_HERE = _os.path.dirname(_os.path.abspath(__file__))
_PARENT = _os.path.dirname(_HERE)
if _PARENT not in _sys.path:
    _sys.path.insert(0, _PARENT)
from solar_catalog.product_lookup import sigenergy_snap_size  # noqa: E402


def render_install_lines(spec, brand, phase, size_kw, model, panels,
                         F, FB, DEFAULT_PANEL, panel_brand='', panel_watt=0):
    """
    Generic renderer that reads a spec dict and produces output lines
    identical to the old inline _inverter_section_lines() code.

    Parameters match the old function signature plus F/FB font references
    and DEFAULT_PANEL dict (passed from generate_pdf module scope).

    Returns list of (font, size, text) tuples.
    """
    phase_label = '1 Phase' if phase == '1P' else '3 Phase'
    phase_thai = '1 phase' if phase == '1P' else '3 phase'

    sld_line = (F, 11, f'รวม การขออนุญาตพร้อมแบบ SLD ติดตั้งโซลาร์เซลล์ {phase_thai} สำหรับบ้านอยู่อาศัย รวมค่าธรรมเนียมขออนุญาต การไฟฟ้า MEA/PEA')

    spec_type = spec['type']

    if spec_type == 'atmoce_ci':
        return _render_atmoce_ci(spec, size_kw, phase_label, panels, F, FB, sld_line)
    elif spec_type == 'atmoce_micro':
        return _render_atmoce_micro(spec, size_kw, phase_label, panels, F, FB, sld_line)
    elif spec_type == 'sigenergy':
        return _render_sigenergy(spec, brand, phase, size_kw, phase_label, model, panels, F, FB, sld_line)
    elif spec_type == 'hybrid_standard':
        return _render_hybrid_standard(spec, brand, phase, size_kw, phase_label, model, F, FB, sld_line)
    else:
        raise ValueError(f'Unknown spec type: {spec_type}')


def _render_atmoce_ci(spec, size_kw, phase_label, panels, F, FB, sld_line):
    """ATMOCE 3P C&I (>=30kW): MI-1250 2:1"""
    mi_qty = max(1, math.ceil(panels / 2))
    header = spec['header'].format(size_kw=size_kw, phase_label=phase_label)
    inv_text = spec['inverter_line'].format(mi_qty=mi_qty, panels=panels)

    # Fixed numbering: mounting is n+1 after grid_wire
    lines = [
        (FB, 13, header),
        (F, 11, inv_text),
        (F, 11, spec['combiner_line']),
        (F, 11, spec['pv_cable_line']),
        (F, 11, spec['grid_wire_line']),
    ]
    n = 5
    mounting_text = f'{n}.อุปกรณ์ Mounting ยึดเกาะหลังคา ระบบโซล่าเซลชุดราง อุปกรณ์เม้าติ้ง (Mounting) สำหรับยึดแผงโซล่าเซลล์ ตามหน้างาน อุปกรณ์รางเก็บสายไฟ+สายร้อยท่อ 1 ชุดตามหน้างาน'
    ground_text = f'{n+1}.ชุดสายกราวด์ IEC01 สายไฟ THW YAZAKI {spec["ground_size"]}'
    lines += [
        (F, 11, mounting_text),
        (F, 11, ground_text),
        (F, 11, ''),
        sld_line,
    ]
    return lines


def _render_atmoce_micro(spec, size_kw, phase_label, panels, F, FB, sld_line):
    """ATMOCE 1P or 3P residential (MI-500 micro inverter)."""
    mi_qty = panels or max(1, int(size_kw * 2))

    # Combiner SKU
    if spec['combiner_sku_rule'] == 'mc100l_or_mc100':
        combiner_sku = 'MC100L' if mi_qty <= 12 else 'MC100'
    elif spec['combiner_sku_rule'] == 'mc100t':
        combiner_sku = 'MC100T'
    else:
        combiner_sku = spec['combiner_sku_rule']

    mw20_qty = max(1, (mi_qty + 7) // 8)  # ceil(panels/8)
    grid_wire = '4 Sqmm' if size_kw <= 7 else '6 Sqmm'

    header = spec['header'].format(size_kw=size_kw, phase_label=phase_label)
    inv_text = spec['inverter_line'].format(mi_qty=mi_qty)

    lines = [
        (FB, 13, header),
        (F, 11, inv_text),
        (F, 11, f'2.{combiner_sku} M-Combiner {spec["combiner_phase"]} 1 ชุด'),
        (F, 11, f'3.MW-025013-A สาย DC Extension {mi_qty} เส้น'),
        (F, 11, f'4.MW-025020-B0 สาย AC Trunk {mw20_qty} เส้น'),
    ]

    n_line = 5
    if mi_qty > spec['t_connector_threshold']:
        lines.append((F, 11, f'{n_line}.MT-04002-2in1 T-Connector 1 ชุด'))
        n_line += 1

    pv_cable = spec['pv_cable']
    lines += [
        (F, 11, f'{n_line}.สายไฟ AC-Bangkok cable FR-CV VCT {pv_cable} Sqmm. 1ชุด (PV to Combiner box)'),
        (F, 11, f'{n_line+1}.สายไฟ IEC01(THW) {grid_wire} 1ชุด (Combiner box to Grid)'),
        (F, 11, f'{n_line+2}.อุปกรณ์ Mounting ยึดเกาะหลังคา ระบบโซล่าเซลชุดราง อุปกรณ์เม้าติ้ง (Mounting) สำหรับยึดแผงโซล่าเซลล์ ตามหน้างาน อุปกรณ์รางเก็บสายไฟ+สายร้อยท่อ 1 ชุดตามหน้างาน'),
        (F, 11, f'{n_line+3}.ชุดสายกราวด์ IEC01 สายไฟ THW YAZAKI {spec["ground_size"]}'),
        (F, 11, ''),
        sld_line,
    ]
    return lines


def _render_sigenergy(spec, brand, phase, size_kw, phase_label, model, panels, F, FB, sld_line):
    """Sigenergy — 5-in-1 hybrid with gateway + optimizer."""
    # Gateway selection
    gw_rules = spec['gateway_rules']
    if phase == '1P':
        gateway = gw_rules['1P']
    elif size_kw >= 20:
        gateway = gw_rules['3P_gte20']
    else:
        gateway = gw_rules['3P_lt20']

    # DC/AC-aware snap via shared helper
    snapped = sigenergy_snap_size(size_kw, phase)
    suffix = 'SP' if phase == '1P' else 'TP'
    sig_model_fallback = f'SigenStor EC {snapped:.1f} {suffix}'
    sig_model = model or sig_model_fallback

    # Optimizer qty: 2:1 ratio
    opt_qty = max(1, math.ceil((panels or 0) / 2))

    header = spec['header'].format(size_kw=size_kw, phase_label=phase_label)
    inv_text = spec['inverter_line'].format(sig_model=sig_model, phase_label=phase_label)

    lines = [
        (FB, 13, header),
        (F, 11, inv_text),
        (F, 11, f'2.{gateway}'),
    ]

    # Fixed lines from spec (items 3, 5, 6, 7, 8, 9) with optimizer at 4
    lines.append((F, 11, spec['fixed_lines'][0]))  # 3.Mounting
    lines.append((F, 11, f'4.Optimizer 1200-1500 2:1 [{opt_qty} ตัว]'))
    for fl in spec['fixed_lines'][1:]:  # 5.ADCU, 6.Emergency, 7-9 wires
        lines.append((F, 11, fl))

    # Mounting + ground (numbered 10, 11)
    lines += [
        (F, 11, '10.อุปกรณ์ Mounting ยึดเกาะหลังคา ระบบโซล่าเซลชุดราง อุปกรณ์เม้าติ้ง (Mounting) สำหรับยึดแผงโซล่าเซลล์ ตามหน้างาน อุปกรณ์รางเก็บสายไฟ+สายร้อยท่อ 1 ชุดตามหน้างาน'),
        (F, 11, f'11.ชุดสายกราวด์ IEC01 สายไฟ THW YAZAKI {spec["ground_size"]}'),
        (F, 11, ''),
        sld_line,
    ]
    return lines


def _render_hybrid_standard(spec, brand, phase, size_kw, phase_label, model, F, FB, sld_line):
    """Hoymiles, Huawei, Deye, Solis — standard hybrid inverter layout."""
    # VCT size
    if 'vct_size' in spec:
        vct_size = spec['vct_size']
    elif spec.get('vct_size_rule') == 'by_phase':
        vct_size = '2C*4' if phase == '1P' else '2C*6'
    else:
        vct_size = '2C*4'

    # Model display
    model_fallback = spec['model_fallback'].format(brand=brand, size_kw=size_kw)
    model_display = model or model_fallback

    header = spec['header'].format(brand=brand, size_kw=size_kw, phase_label=phase_label)
    inv_text = spec['inverter_line'].format(model_display=model_display, phase_label=phase_label)

    lines = [
        (FB, 13, header),
        (F, 11, inv_text),
    ]

    # Extra lines (smart meter, combiner, etc.) — already numbered in spec
    for el in spec['extra_lines']:
        lines.append((F, 11, el))

    # Wire lines (THW, VCT, red/black) — numbered from wire_start_num
    n = spec['wire_start_num']
    lines += [
        (F, 11, f'{n}.สายไฟ THW 35 Sqmm. 1ชุด'),
        (F, 11, f'{n+1}.สายไฟ VCT {vct_size} Sqmm. 1ชุด'),
        (F, 11, f'{n+2}.สายไฟ red/black Link 6 Sqmm 1ชุด'),
    ]

    # Mounting + ground
    mn = n + 3  # mounting line number
    lines += [
        (F, 11, f'{mn}.อุปกรณ์ Mounting ยึดเกาะหลังคา ระบบโซล่าเซลชุดราง อุปกรณ์เม้าติ้ง (Mounting) สำหรับยึดแผงโซล่าเซลล์ ตามหน้างาน อุปกรณ์รางเก็บสายไฟ+สายร้อยท่อ 1 ชุดตามหน้างาน'),
        (F, 11, f'{mn+1}.ชุดสายกราวด์ IEC01 สายไฟ THW YAZAKI {spec["ground_size"]}'),
        (F, 11, ''),
        sld_line,
    ]
    return lines
