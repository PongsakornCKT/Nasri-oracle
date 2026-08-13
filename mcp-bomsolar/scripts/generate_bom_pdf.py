#!/usr/bin/env python3
"""
Solar BOM PDF Generator
สร้าง PDF รายการวัสดุ (Bill of Materials) สำหรับโครงการโซลาร์เซลล์
รูปแบบ: Enervia Group BOM พร้อม Logo
"""

import os
import re
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, inch
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, Image, PageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfgen import canvas

# ==================== CATEGORY TRANSLATION MAP ====================

CATEGORY_THAI_MAP = {
    'general': 'ทั่วไป',
    'cable': 'สายไฟและอุปกรณ์เดินสาย',
    'mounting_rail': 'รางยึดโซลาร์',
    'mounting_other': 'อุปกรณ์ยึดจับอื่นๆ',
    'mounting_clamp': 'แคลมป์ยึดแผง',
    'mounting_roof_anchor': 'ขายึดหลังคา',
    'accessory': 'อุปกรณ์เสริม',
    'isolator': 'อุปกรณ์ตัดต่อไฟ',
    'module': 'โมดูล',
    'inverter': 'อินเวอร์เตอร์',
    'battery': 'แบตเตอรี่',
    'structure': 'โครงสร้าง',
}

# ==================== FONT CONFIGURATION ====================

def setup_thai_fonts():
    """ตั้งค่า font ที่รองรับภาษาไทย"""
    _script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    font_search_dirs = [
        os.path.join(_script_dir, 'assets', 'fonts'),
        os.path.join(_script_dir, 'assets', 'font'),
        '/mnt/c/Users/pO-Ch/Nasri-oracle/tmppic/tempagent/quotation-solar/assets/font',
        'C:/Users/pO-Ch/Nasri-oracle/tmppic/tempagent/quotation-solar/assets/font',
        '/usr/share/fonts/truetype/tlwg',
    ]

    font_pairs = [
        ('TH-Sarabun-New-Regular.ttf', 'TH-Sarabun-New-Bold.ttf', 'THSarabunNew', 'THSarabunNew-Bold'),
        ('THSarabunNew.ttf', 'THSarabunNew-Bold.ttf', 'THSarabunNew', 'THSarabunNew-Bold'),
        ('Garuda.ttf', 'Garuda-Bold.ttf', 'Garuda', 'Garuda-Bold'),
        ('Norasi.ttf', 'Norasi-Bold.ttf', 'Norasi', 'Norasi-Bold'),
        ('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans', 'DejaVuSans-Bold'),
    ]

    registered_fonts = []

    for reg_filename, bold_filename, reg_name, bold_name in font_pairs:
        if reg_name in registered_fonts:
            continue
        for d in font_search_dirs:
            reg_path = os.path.join(d, reg_filename)
            bold_path = os.path.join(d, bold_filename)
            if os.path.exists(reg_path) and os.path.exists(bold_path):
                try:
                    pdfmetrics.registerFont(TTFont(reg_name, reg_path))
                    pdfmetrics.registerFont(TTFont(bold_name, bold_path))
                    registered_fonts.append(reg_name)
                    registered_fonts.append(bold_name)
                    break
                except Exception as e:
                    print(f"Warning: Could not register font {reg_name}: {e}")

    if 'THSarabunNew' in registered_fonts:
        return 'THSarabunNew', 'THSarabunNew-Bold'
    elif 'Garuda' in registered_fonts:
        return 'Garuda', 'Garuda-Bold'
    elif 'Norasi' in registered_fonts:
        return 'Norasi', 'Norasi-Bold'
    elif 'DejaVuSans' in registered_fonts:
        return 'DejaVuSans', 'DejaVuSans-Bold'
    else:
        return 'Helvetica', 'Helvetica-Bold'

# ตั้งค่า font
FONT_REGULAR, FONT_BOLD = setup_thai_fonts()

# ==================== COLOR SCHEME ====================

COLORS = {
    'primary': colors.HexColor('#1a237e'),      # น้ำเงินเข้ม (Header)
    'secondary': colors.HexColor('#303f9f'),    # น้ำเงินกลาง
    'light_bg': colors.HexColor('#f5f5f5'),     # พื้นหลังสลับแถว
    'white': colors.white,
    'black': colors.HexColor('#333333'),
    'gray': colors.HexColor('#666666'),
    'light_gray': colors.HexColor('#e0e0e0'),
    'border': colors.HexColor('#cccccc'),
}

# ==================== NUMBERED CANVAS (PAGE X/Y & INTERNAL LABEL) ====================

class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to compute page numbers (หน้า X จาก Y), printed timestamp, and render internal document label."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_decorations(self, page_count):
        self.saveState()
        page_width, page_height = self._pagesize

        # Footer Bottom-Left: Internal cost document warning
        self.setFont(FONT_REGULAR, 8)
        self.setFillColor(COLORS['gray'])
        self.drawString(20*mm, 8*mm, "เอกสารภายใน — ต้นทุน ห้ามส่งลูกค้า")

        # Footer Bottom-Center: Printed timestamp
        printed_time = datetime.now().strftime("วันที่พิมพ์ %d/%m/%Y %H:%M")
        self.drawCentredString(page_width / 2.0, 8*mm, printed_time)

        # Footer Bottom-Right: Page number X/Y
        page_str = f"หน้า {self._pageNumber} จาก {page_count}"
        self.drawRightString(page_width - 20*mm, 8*mm, page_str)

        self.restoreState()

# ==================== STYLES ====================

def get_styles():
    """สร้าง paragraph styles"""
    styles = getSampleStyleSheet()

    # Title style
    styles.add(ParagraphStyle(
        name='ThaiTitle',
        fontName=FONT_BOLD,
        fontSize=24,
        leading=26,
        textColor=COLORS['primary'],
        alignment=TA_CENTER,
        spaceAfter=5,
    ))

    # Subtitle style
    styles.add(ParagraphStyle(
        name='ThaiSubtitle',
        fontName=FONT_REGULAR,
        fontSize=12,
        textColor=COLORS['gray'],
        alignment=TA_LEFT,
        spaceAfter=5,
    ))

    # Normal Thai
    styles.add(ParagraphStyle(
        name='ThaiNormal',
        fontName=FONT_REGULAR,
        fontSize=10,
        textColor=COLORS['black'],
        alignment=TA_LEFT,
    ))

    # Bold Thai
    styles.add(ParagraphStyle(
        name='ThaiBold',
        fontName=FONT_BOLD,
        fontSize=10,
        textColor=COLORS['black'],
        alignment=TA_LEFT,
    ))

    # Small Thai
    styles.add(ParagraphStyle(
        name='ThaiSmall',
        fontName=FONT_REGULAR,
        fontSize=8,
        textColor=COLORS['gray'],
        alignment=TA_LEFT,
    ))

    # Table header
    styles.add(ParagraphStyle(
        name='TableHeader',
        fontName=FONT_BOLD,
        fontSize=9,
        textColor=COLORS['white'],
        alignment=TA_CENTER,
    ))

    # Table cell
    styles.add(ParagraphStyle(
        name='TableCell',
        fontName=FONT_REGULAR,
        fontSize=8,
        leading=10,
        textColor=COLORS['black'],
        alignment=TA_LEFT,
    ))

    # Table cell center
    styles.add(ParagraphStyle(
        name='TableCellCenter',
        fontName=FONT_REGULAR,
        fontSize=8,
        leading=10,
        textColor=COLORS['black'],
        alignment=TA_CENTER,
    ))

    # Table cell right
    styles.add(ParagraphStyle(
        name='TableCellRight',
        fontName=FONT_REGULAR,
        fontSize=8,
        leading=10,
        textColor=COLORS['black'],
        alignment=TA_RIGHT,
    ))

    return styles

# ==================== HELPER FUNCTIONS ====================

def format_currency(amount, symbol='฿'):
    """จัดรูปแบบราคาเป็นสกุลเงิน"""
    if amount is None:
        return '-'
    try:
        return f"{symbol}{amount:,.2f}"
    except:
        return str(amount)

def format_number(num):
    """จัดรูปแบบตัวเลข"""
    if num is None:
        return '-'
    try:
        if isinstance(num, float) and num.is_integer():
            return f"{int(num):,}"
        return f"{num:,}"
    except:
        return str(num)

def truncate_text(text, max_length=50):
    """ตัดข้อความที่ยาวเกินไป"""
    if text is None:
        return ''
    text = str(text)
    if len(text) > max_length:
        return text[:max_length-3] + '...'
    return text

# ==================== PDF GENERATOR ====================

def generate_bom_pdf(bom_data, output_path, logo_path=None):
    """
    สร้าง PDF รายการวัสดุ (BOM)
    """

    # ตรวจสอบ logo path
    if logo_path is None:
        skill_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        default_logo = os.path.join(skill_dir, 'assets', 'logo', 'enervia.jpg')
        if os.path.exists(default_logo):
            logo_path = default_logo

    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(A4),
        leftMargin=20*mm,
        rightMargin=20*mm,
        topMargin=15*mm,
        bottomMargin=15*mm,
    )

    styles = get_styles()
    story = []

    # ==================== HEADER SECTION ====================

    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image(logo_path, width=50*mm, height=15*mm)
            logo.hAlign = 'LEFT'
        except:
            logo = Paragraph('', styles['ThaiNormal'])
    else:
        logo = Paragraph('', styles['ThaiNormal'])

    title = Paragraph('รายการวัสดุ ENERVIA GROUP', styles['ThaiTitle'])

    header_table = Table(
        [[logo, title]],
        colWidths=[60*mm, 190*mm]
    )
    header_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 4*mm))

    # Brand Accent Bar Line
    accent_bar = Table([['']], colWidths=[250*mm], rowHeights=[2.5*mm])
    accent_bar.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLORS['primary']),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(accent_bar)
    story.append(Spacer(1, 6*mm))

    # ==================== PROJECT INFO SECTION ====================

    company_name = bom_data.get('company_name', 'Enervia Group co.,ltd')
    project_name = bom_data.get('project_name', '')
    project_address = bom_data.get('project_address', '')

    order_date = str(bom_data.get('order_date', '')).strip()
    if not order_date or order_date in ['17/4/26', '17/04/26', '17/4/2026', '17/04/2026']:
        order_date = datetime.now().strftime('%d/%m/%y')

    notes = str(bom_data.get('notes', '')).strip()
    notes_display = notes if notes else '-'

    info_data = [
        [
            Paragraph(f"<b>ชื่อบริษัท</b>", styles['ThaiNormal']),
            Paragraph(company_name, styles['ThaiNormal']),
            Paragraph('', styles['ThaiNormal']),
            Paragraph('', styles['ThaiNormal']),
        ],
        [
            Paragraph(f"<b>ที่อยู่โครงการ</b>", styles['ThaiNormal']),
            Paragraph(f"{project_name}, {project_address}" if project_address else project_name, styles['ThaiNormal']),
            Paragraph(f"<b>บันทึก</b>", styles['ThaiNormal']),
            Paragraph(notes_display, styles['ThaiNormal']),
        ],
        [
            Paragraph(f"<b>วันที่คำสั่งซื้อ</b>", styles['ThaiNormal']),
            Paragraph(order_date, styles['ThaiNormal']),
            Paragraph('', styles['ThaiNormal']),
            Paragraph('', styles['ThaiNormal']),
        ],
    ]

    info_table = Table(
        info_data,
        colWidths=[35*mm, 90*mm, 25*mm, 100*mm]
    )
    info_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 8*mm))

    # ==================== BOM TABLE ====================

    items = bom_data.get('items', [])
    has_item_notes = any(str(item.get('notes', '')).strip() for item in items)

    headers = [
        Paragraph('แถว', styles['TableHeader']),
        Paragraph('หมายเลขอะไหล่', styles['TableHeader']),
        Paragraph('ชื่ออะไหล่', styles['TableHeader']),
        Paragraph('ผู้ผลิต', styles['TableHeader']),
        Paragraph('หมวดหมู่', styles['TableHeader']),
        Paragraph('ปริมาณ', styles['TableHeader']),
        Paragraph('ต้นทุน/<br/>หน่วย', styles['TableHeader']),
        Paragraph('ต้นทุน<br/>ทั้งหมด', styles['TableHeader']),
    ]
    if has_item_notes:
        headers.append(Paragraph('หมายเหตุ', styles['TableHeader']))

    table_data = [headers]
    total_qty = 0
    total_cost = 0

    for idx, item in enumerate(items, 1):
        qty = item.get('quantity', 0)
        unit_cost = item.get('unit_cost', 0)
        item_total = item.get('total_cost', qty * unit_cost if qty and unit_cost else 0)

        total_qty += qty if qty else 0
        total_cost += item_total if item_total else 0

        cat_raw = str(item.get('category', '')).strip()
        cat_display = CATEGORY_THAI_MAP.get(cat_raw.lower(), cat_raw)

        # Wrap long item details cleanly onto new lines without truncation
        part_number = str(item.get('part_number', ''))
        part_name = str(item.get('part_name', ''))
        manufacturer = str(item.get('manufacturer', ''))
        item_notes = str(item.get('notes', ''))

        row = [
            Paragraph(str(idx), styles['TableCellCenter']),
            Paragraph(part_number, styles['TableCell']),
            Paragraph(part_name, styles['TableCell']),
            Paragraph(manufacturer, styles['TableCell']),
            Paragraph(cat_display, styles['TableCellCenter']),
            Paragraph(format_number(qty), styles['TableCellCenter']),
            Paragraph(format_currency(unit_cost), styles['TableCellRight']),
            Paragraph(format_currency(item_total), styles['TableCellRight']),
        ]
        if has_item_notes:
            row.append(Paragraph(item_notes, styles['TableCell']))

        table_data.append(row)

    total_row = [
        Paragraph('', styles['TableCell']),
        Paragraph('', styles['TableCell']),
        Paragraph('', styles['TableCell']),
        Paragraph('', styles['TableCell']),
        Paragraph('<b>ยอดรวม</b>', styles['TableCellCenter']),
        Paragraph(f"<b>{format_number(total_qty)}</b>", styles['TableCellCenter']),
        Paragraph('', styles['TableCell']),
        Paragraph(f"<b>{format_currency(total_cost)}</b>", styles['TableCellRight']),
    ]
    if has_item_notes:
        total_row.append(Paragraph('', styles['TableCell']))

    table_data.append(total_row)

    if has_item_notes:
        col_widths = [10*mm, 35*mm, 55*mm, 28*mm, 32*mm, 16*mm, 25*mm, 28*mm, 28*mm]
    else:
        col_widths = [10*mm, 42*mm, 76*mm, 28*mm, 34*mm, 16*mm, 25*mm, 26*mm]

    bom_table = Table(table_data, colWidths=col_widths, repeatRows=1)

    table_style = [
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
        ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
        ('FONTNAME', (0, 0), (-1, 0), FONT_BOLD),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),

        ('FONTNAME', (0, 1), (-1, -1), FONT_REGULAR),
        ('FONTSIZE', (0, 1), (-1, -1), 8),

        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, COLORS['primary']),

        ('BACKGROUND', (0, -1), (-1, -1), COLORS['light_bg']),
        ('FONTNAME', (0, -1), (-1, -1), FONT_BOLD),
        ('LINEABOVE', (0, -1), (-1, -1), 1.5, COLORS['primary']),

        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ]

    for i in range(1, len(table_data) - 1):
        if i % 2 == 0:
            table_style.append(('BACKGROUND', (0, i), (-1, i), COLORS['light_bg']))

    bom_table.setStyle(TableStyle(table_style))
    story.append(bom_table)

    # ==================== COST SUMMARY SECTION ====================

    cost_summary = bom_data.get('cost_summary')
    if cost_summary:
        story.append(Spacer(1, 10*mm))

        # Thai Title for Cost Summary
        cost_title = Paragraph('<b>สรุปต้นทุน</b>', ParagraphStyle(
            'CostTitle', parent=styles['ThaiTitle'], fontSize=16, alignment=TA_LEFT,
        ))
        story.append(cost_title)
        story.append(Spacer(1, 3*mm))

        actual_wp = cost_summary.get('actual_wp', 0)
        if not actual_wp:
            for item in items:
                cat = str(item.get('category', '')).lower()
                if cat in ['โมดูล', 'panel', 'module']:
                    qty = item.get('quantity', 0)
                    pname = str(item.get('part_name', '')) + ' ' + str(item.get('part_number', ''))
                    w_match = re.search(r'(\d+)\s*w', pname, re.IGNORECASE)
                    if w_match:
                        watts = float(w_match.group(1))
                        actual_wp += qty * watts
            if not actual_wp:
                proj = bom_data.get('project_name', '')
                kw_match = re.search(r'(\d+(?:\.\d+)?)\s*kw', proj, re.IGNORECASE)
                if kw_match:
                    actual_wp = float(kw_match.group(1)) * 1000

        actual_kw_str = f"{actual_wp/1000:.2f}kW" if actual_wp else ""

        labor_val = cost_summary.get('labor', 0)
        labor_rate = cost_summary.get('labor_rate_per_wp', 0)
        if not labor_rate and actual_wp and labor_val:
            labor_rate = labor_val / actual_wp

        bos_val = cost_summary.get('bos', 0)
        bos_rate = cost_summary.get('bos_rate_per_wp', 0)
        if not bos_rate and actual_wp and bos_val:
            bos_rate = bos_val / actual_wp

        error_val = cost_summary.get('error_cost', 0)
        error_rate = cost_summary.get('error_rate_per_wp', 0)
        if not error_rate and actual_wp and error_val:
            error_rate = error_val / actual_wp

        labor_rate_str = f"{labor_rate:g}" if labor_rate else "0"
        bos_rate_str = f"{bos_rate:g}" if bos_rate else "0"
        error_rate_str = f"{error_rate:g}" if error_rate else "0"

        cost_rows = [
            [
                Paragraph('<b>รายการ</b>', ParagraphStyle('CSHeader', fontName=FONT_BOLD, fontSize=10, textColor=COLORS['white'], alignment=TA_LEFT)),
                Paragraph('<b>ราคา</b>', ParagraphStyle('CSHeaderR', fontName=FONT_BOLD, fontSize=10, textColor=COLORS['white'], alignment=TA_RIGHT)),
            ],
            [
                Paragraph('รวมค่าอุปกรณ์', styles['ThaiNormal']),
                Paragraph(format_currency(cost_summary.get('equipment_total', total_cost)), ParagraphStyle('CSRight', fontName=FONT_REGULAR, fontSize=10, textColor=COLORS['black'], alignment=TA_RIGHT)),
            ],
            [
                Paragraph('VAT 7% (จากค่าอุปกรณ์)', styles['ThaiNormal']),
                Paragraph(format_currency(cost_summary.get('vat_7pct', 0)), ParagraphStyle('CSRight2', fontName=FONT_REGULAR, fontSize=10, textColor=COLORS['black'], alignment=TA_RIGHT)),
            ],
            [
                Paragraph(f"ค่าแรง ({actual_kw_str} × ฿{labor_rate_str}/Wp)" if actual_kw_str else "ค่าแรง", styles['ThaiNormal']),
                Paragraph(format_currency(labor_val), ParagraphStyle('CSRight3', fontName=FONT_REGULAR, fontSize=10, textColor=COLORS['black'], alignment=TA_RIGHT)),
            ],
            [
                Paragraph(f"BOS ({actual_kw_str} × ฿{bos_rate_str}/Wp)" if actual_kw_str else "BOS", styles['ThaiNormal']),
                Paragraph(format_currency(bos_val), ParagraphStyle('CSRight4', fontName=FONT_REGULAR, fontSize=10, textColor=COLORS['black'], alignment=TA_RIGHT)),
            ],
            [
                Paragraph(f"เผื่อเหลือเผื่อขาด ({actual_kw_str} × ฿{error_rate_str}/Wp)" if actual_kw_str else "เผื่อเหลือเผื่อขาด", styles['ThaiNormal']),
                Paragraph(format_currency(error_val), ParagraphStyle('CSRight5', fontName=FONT_REGULAR, fontSize=10, textColor=COLORS['black'], alignment=TA_RIGHT)),
            ],
        ]

        crane = cost_summary.get('crane', 0)
        if crane > 0:
            cost_rows.append([
                Paragraph('ค่าเครน', styles['ThaiNormal']),
                Paragraph(format_currency(crane), ParagraphStyle('CSRight6', fontName=FONT_REGULAR, fontSize=10, textColor=COLORS['black'], alignment=TA_RIGHT)),
            ])

        cost_rows.append([
            Paragraph('ค่าขอขนาน PEA/MEA', styles['ThaiNormal']),
            Paragraph(format_currency(cost_summary.get('pea_mea_fee', 0)), ParagraphStyle('CSRight7', fontName=FONT_REGULAR, fontSize=10, textColor=COLORS['black'], alignment=TA_RIGHT)),
        ])

        # Grand Total row (Thai)
        cost_rows.append([
            Paragraph('<b>รวมทั้งสิ้น</b>', ParagraphStyle('CSGrand', fontName=FONT_BOLD, fontSize=12, textColor=COLORS['primary'], alignment=TA_LEFT)),
            Paragraph(f"<b>{format_currency(cost_summary.get('grand_total', 0))}</b>", ParagraphStyle('CSGrandR', fontName=FONT_BOLD, fontSize=12, textColor=COLORS['primary'], alignment=TA_RIGHT)),
        ])

        cost_table = Table(cost_rows, colWidths=[160*mm, 60*mm])

        cs_style = [
            ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
            ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
            ('LINEABOVE', (0, -1), (-1, -1), 1.5, COLORS['primary']),
            ('BACKGROUND', (0, -1), (-1, -1), COLORS['light_bg']),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]

        for i in range(1, len(cost_rows) - 1):
            if i % 2 == 0:
                cs_style.append(('BACKGROUND', (0, i), (-1, i), COLORS['light_bg']))

        cost_table.setStyle(TableStyle(cs_style))
        story.append(cost_table)

    # Build PDF with two-pass NumberedCanvas for page X/Y and internal doc label
    doc.build(story, canvasmaker=NumberedCanvas)

    return output_path



# ==================== MAIN / EXAMPLE ====================

if __name__ == '__main__':
    # ตัวอย่างข้อมูล BOM
    example_bom = {
        "company_name": "Enervia Group co.,ltd",
        "project_name": "Klonkij Intertrade Co.,Ltd. 250kw 3.5-4",
        "project_address": "กรุงเทพ, กรุงเทพมหานคร 10520",
        "order_date": "02/10/26",
        "notes": "",
        "items": [
            {
                "part_number": "3Phase 4C AC 30 Terminal",
                "part_name": "AC Terminal",
                "manufacturer": "ATMOCE",
                "category": "cable",
                "quantity": 5,
                "unit_cost": 21850.00,
                "total_cost": 109250.00,
                "notes": ""
            },
            {
                "part_number": "MC100-Wye-8in1",
                "part_name": "MC100-Wye-8in1",
                "manufacturer": "ATMOCE",
                "category": "isolator",
                "quantity": 2,
                "unit_cost": 29500.00,
                "total_cost": 59000.00,
                "notes": ""
            },
            {
                "part_number": "WIRE ROPE SUS304",
                "part_name": "สลิงสแตนเลส 304 กันสนิม",
                "manufacturer": "JET STEEL & SERVICES",
                "category": "general",
                "quantity": 200,
                "unit_cost": 30.00,
                "total_cost": 6000.00,
                "notes": ""
            },
            {
                "part_number": "Walkway S300 HDG",
                "part_name": "Walkway S300 HDG",
                "manufacturer": "JET STEEL & SERVICES",
                "category": "general",
                "quantity": 50,
                "unit_cost": 1030.00,
                "total_cost": 51500.00,
                "notes": ""
            },
            {
                "part_number": "Cable Ladder หนา 1.6 mm",
                "part_name": "Cable Ladder 3000 mm",
                "manufacturer": "JET STEEL & SERVICES",
                "category": "general",
                "quantity": 40,
                "unit_cost": 1190.00,
                "total_cost": 47600.00,
                "notes": ""
            },
            {
                "part_number": "Life Line",
                "part_name": "Life Line",
                "manufacturer": "JET STEEL & SERVICES",
                "category": "general",
                "quantity": 50,
                "unit_cost": 800.00,
                "total_cost": 40000.00,
                "notes": ""
            },
            {
                "part_number": "TSM-NEG21C.20",
                "part_name": "Solar Panel",
                "manufacturer": "Trina Solar Co., Ltd.",
                "category": "โมดูล",
                "quantity": 220,
                "unit_cost": 2423.00,
                "total_cost": 533060.00,
                "notes": ""
            },
            {
                "part_number": "MI-1250",
                "part_name": "Micro Inverter",
                "manufacturer": "ATMOCE",
                "category": "อินเวอร์เตอร์",
                "quantity": 110,
                "unit_cost": 5630.00,
                "total_cost": 619300.00,
                "notes": ""
            },
        ]
    }

    # สร้าง PDF
    output_file = '/tmp/bom-improved.pdf'
    result = generate_bom_pdf(example_bom, output_file)
    print(f"PDF created: {result}")
