"""Generate BOM PDF from an SRP calculator result.

Reuses font/style setup from generate_bom_pdf but adds an SRP-specific
summary block (Total Cost / Profit / VAT / Offer Price) below the items table.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image,
)

HERE = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.dirname(HERE)
sys.path.insert(0, PARENT)
sys.path.insert(0, HERE)

from generate_bom_pdf import (  # noqa: E402
    setup_thai_fonts, get_styles, format_currency, format_number,
    truncate_text, COLORS,
)
from srp_calculator import SRPResult  # noqa: E402


FONT_REGULAR, FONT_BOLD = setup_thai_fonts()


def generate_srp_pdf(
    srp_result: SRPResult,
    output_path: str,
    project_name: str = "",
    project_address: str = "",
    company_name: str = "Enervia Group co.,ltd",
    logo_path: str | None = None,
) -> str:
    """Build a BOM PDF for an SRP calculator result.

    Layout:
        Header (logo + title)
        Project info (name, address, date, config, kWp)
        Items table (parts + labor lines)
        SRP summary box (Total Cost / Profit / VAT / Offer Price)
    """
    # Auto-locate logo if caller didn't supply one
    if logo_path is None:
        default_logo = os.path.join(PARENT, "assets", "logo", "enervia.jpg")
        if os.path.exists(default_logo):
            logo_path = default_logo

    doc = SimpleDocTemplate(
        output_path, pagesize=landscape(A4),
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=15*mm, bottomMargin=15*mm,
    )

    styles = get_styles()
    story = []

    # ─── Header ───────────────────────────────────────────────
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image(logo_path, width=50*mm, height=15*mm)
            logo.hAlign = 'LEFT'
        except Exception:
            logo = Paragraph('', styles['ThaiNormal'])
    else:
        logo = Paragraph('', styles['ThaiNormal'])

    title = Paragraph(
        f'BOM Solar ATMOCE — {srp_result.config} ({srp_result.kwp:.2f} kWp)',
        styles['ThaiTitle'],
    )
    header_table = Table([[logo, title]], colWidths=[60*mm, 190*mm])
    header_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8*mm))

    # ─── Project / config info ────────────────────────────────
    order_date = datetime.now().strftime('%d/%m/%y')
    panel_wp = int(round(srp_result.kwp * 1000 / srp_result.panels))

    # Build battery/backup info string
    batt_info_parts = []
    if getattr(srp_result, "battery_kwh", 0) > 0:
        batt_qty = -(-srp_result.battery_kwh // 7)  # ceil
        batt_info_parts.append(f"Battery {srp_result.battery_kwh}kWh ({batt_qty}×MS-7K-U)")
    if getattr(srp_result, "has_backup", False):
        batt_info_parts.append("Backup ✓")
    if getattr(srp_result, "warranty_years", 0) > 0:
        batt_info_parts.append(f"Warranty +{srp_result.warranty_years}yr")
    batt_info = " | ".join(batt_info_parts) if batt_info_parts else "-"

    info_data = [
        [
            Paragraph("<b>ชื่อบริษัท</b>", styles['ThaiNormal']),
            Paragraph(company_name, styles['ThaiNormal']),
            Paragraph("<b>วันที่</b>", styles['ThaiNormal']),
            Paragraph(order_date, styles['ThaiNormal']),
        ],
        [
            Paragraph("<b>โครงการ</b>", styles['ThaiNormal']),
            Paragraph(
                f"{project_name}, {project_address}" if project_address else (project_name or "-"),
                styles['ThaiNormal'],
            ),
            Paragraph("<b>Config</b>", styles['ThaiNormal']),
            Paragraph(srp_result.config, styles['ThaiNormal']),
        ],
        [
            Paragraph("<b>Solar Panel</b>", styles['ThaiNormal']),
            Paragraph(f"{srp_result.panels} แผง × {panel_wp} Wp = {srp_result.kwp:.2f} kWp",
                      styles['ThaiNormal']),
            Paragraph("<b>Inverter</b>", styles['ThaiNormal']),
            Paragraph(f"{srp_result.inverter_count} ตัว", styles['ThaiNormal']),
        ],
        [
            Paragraph("<b>Battery / Backup</b>", styles['ThaiNormal']),
            Paragraph(batt_info, styles['ThaiNormal']),
            Paragraph("", styles['ThaiNormal']),
            Paragraph("", styles['ThaiNormal']),
        ],
    ]
    info_table = Table(info_data, colWidths=[28*mm, 100*mm, 25*mm, 97*mm])
    info_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 6*mm))

    # ─── Items table ──────────────────────────────────────────
    headers = [
        Paragraph('#', styles['TableHeader']),
        Paragraph('Part No.', styles['TableHeader']),
        Paragraph('ชื่ออะไหล่', styles['TableHeader']),
        Paragraph('ผู้ผลิต', styles['TableHeader']),
        Paragraph('หมวดหมู่', styles['TableHeader']),
        Paragraph('จำนวน', styles['TableHeader']),
        Paragraph('หน่วย', styles['TableHeader']),
        Paragraph('ราคา/หน่วย', styles['TableHeader']),
        Paragraph('ราคารวม', styles['TableHeader']),
        Paragraph('หมายเหตุ', styles['TableHeader']),
    ]
    table_data = [headers]

    for idx, line in enumerate(srp_result.lines, 1):
        table_data.append([
            Paragraph(str(idx), styles['TableCellCenter']),
            Paragraph(truncate_text(line.part_number, 20), styles['TableCell']),
            Paragraph(truncate_text(line.part_name, 35), styles['TableCell']),
            Paragraph(truncate_text(line.manufacturer, 15), styles['TableCell']),
            Paragraph(line.category, styles['TableCellCenter']),
            Paragraph(format_number(line.quantity), styles['TableCellCenter']),
            Paragraph(line.unit, styles['TableCellCenter']),
            Paragraph(format_currency(line.unit_cost), styles['TableCellRight']),
            Paragraph(format_currency(line.total_cost), styles['TableCellRight']),
            Paragraph(truncate_text(line.notes, 30), styles['TableCell']),
        ])

    col_widths = [10*mm, 28*mm, 48*mm, 22*mm, 22*mm, 16*mm, 14*mm, 22*mm, 25*mm, 43*mm]
    items_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
        ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
        ('FONTNAME', (0, 0), (-1, 0), FONT_BOLD),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 1), (-1, -1), FONT_REGULAR),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, COLORS['primary']),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ] + [
        ('BACKGROUND', (0, i), (-1, i), COLORS['light_bg'])
        for i in range(2, len(table_data), 2)
    ]))
    story.append(items_table)
    story.append(Spacer(1, 8*mm))

    # ─── SRP summary block ────────────────────────────────────
    label = ParagraphStyle(
        'SRPLabel', fontName=FONT_REGULAR, fontSize=11,
        textColor=COLORS['black'], alignment=TA_LEFT,
    )
    value = ParagraphStyle(
        'SRPValue', fontName=FONT_REGULAR, fontSize=11,
        textColor=COLORS['black'], alignment=TA_RIGHT,
    )
    grand_label = ParagraphStyle(
        'SRPGrand', fontName=FONT_BOLD, fontSize=14,
        textColor=COLORS['primary'], alignment=TA_LEFT,
    )
    grand_value = ParagraphStyle(
        'SRPGrandR', fontName=FONT_BOLD, fontSize=14,
        textColor=COLORS['primary'], alignment=TA_RIGHT,
    )

    summary_rows = [
        [Paragraph('Total Cost (ต้นทุนรวม)', label),
         Paragraph(format_currency(srp_result.total_cost), value)],
        [Paragraph('Profit 30%', label),
         Paragraph(format_currency(srp_result.profit), value)],
        [Paragraph('VAT 7%', label),
         Paragraph(format_currency(srp_result.vat), value)],
        [Paragraph('<b>Offer Price (ราคาเสนอ)</b>', grand_label),
         Paragraph(f"<b>{format_currency(srp_result.offer_price)}</b>", grand_value)],
    ]
    summary_table = Table(summary_rows, colWidths=[180*mm, 70*mm])
    summary_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
        ('LINEABOVE', (0, -1), (-1, -1), 1.5, COLORS['primary']),
        ('BACKGROUND', (0, -1), (-1, -1), COLORS['light_bg']),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(summary_table)

    doc.build(story)
    return output_path


# ─── CLI ──────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse
    from srp_calculator import calculate_srp

    ap = argparse.ArgumentParser(description="Generate ATMOCE SRP BOM PDF")
    ap.add_argument("--config", choices=["1:1-1P", "2:1-1P", "1:1-3P", "2:1-3P"], required=True)
    ap.add_argument("--panels", type=int, required=True)
    ap.add_argument("--out", required=True, help="output PDF path")
    ap.add_argument("--project", default="ATMOCE SRP sample")
    ap.add_argument("--address", default="")
    args = ap.parse_args()

    result = calculate_srp(args.config, args.panels)
    generate_srp_pdf(
        result, args.out,
        project_name=args.project, project_address=args.address,
    )
    print(f"✓ {args.config}: {args.panels} panels → {result.offer_price:,.0f} THB → {args.out}")
