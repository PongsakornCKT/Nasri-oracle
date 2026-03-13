#!/usr/bin/env python3
"""
Solar BOM PDF Generator
สร้าง PDF รายการวัสดุ (Bill of Materials) สำหรับโครงการโซลาร์เซลล์
รูปแบบ: Enervia Group BOM พร้อม Logo
"""

import os
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

# ==================== FONT CONFIGURATION ====================

def setup_thai_fonts():
    """ตั้งค่า font ที่รองรับภาษาไทย"""
    # Project-local fonts directory (highest priority)
    _script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _fonts_dir = os.path.join(_script_dir, 'assets', 'fonts')

    font_paths = [
        # TH Sarabun New (project fonts — preferred)
        (os.path.join(_fonts_dir, 'TH-Sarabun-New-Regular.ttf'), 'THSarabunNew'),
        (os.path.join(_fonts_dir, 'TH-Sarabun-New-Bold.ttf'), 'THSarabunNew-Bold'),
        # Garuda fallback
        ('/usr/share/fonts/truetype/tlwg/Garuda.ttf', 'Garuda'),
        ('/usr/share/fonts/truetype/tlwg/Garuda-Bold.ttf', 'Garuda-Bold'),
        # Norasi fallback
        ('/usr/share/fonts/truetype/tlwg/Norasi.ttf', 'Norasi'),
        ('/usr/share/fonts/truetype/tlwg/Norasi-Bold.ttf', 'Norasi-Bold'),
        # DejaVu Sans last resort
        ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVuSans'),
        ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVuSans-Bold'),
    ]

    registered_fonts = []
    for path, name in font_paths:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                registered_fonts.append(name)
            except Exception as e:
                print(f"Warning: Could not register font {name}: {e}")

    # เลือก font หลัก
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

# ==================== STYLES ====================

def get_styles():
    """สร้าง paragraph styles"""
    styles = getSampleStyleSheet()
    
    # Title style
    styles.add(ParagraphStyle(
        name='ThaiTitle',
        fontName=FONT_BOLD,
        fontSize=24,
        textColor=COLORS['primary'],
        alignment=TA_CENTER,
        spaceAfter=10,
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
        textColor=COLORS['black'],
        alignment=TA_LEFT,
    ))
    
    # Table cell center
    styles.add(ParagraphStyle(
        name='TableCellCenter',
        fontName=FONT_REGULAR,
        fontSize=8,
        textColor=COLORS['black'],
        alignment=TA_CENTER,
    ))
    
    # Table cell right
    styles.add(ParagraphStyle(
        name='TableCellRight',
        fontName=FONT_REGULAR,
        fontSize=8,
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
    
    Args:
        bom_data: dict containing:
            - company_name: ชื่อบริษัท
            - project_name: ชื่อโครงการ
            - project_address: ที่อยู่โครงการ
            - order_date: วันที่สั่งซื้อ
            - notes: บันทึก (optional)
            - items: list of dicts with:
                - part_number: รหัสสินค้า
                - part_name: ชื่อสินค้า
                - manufacturer: ผู้ผลิต
                - category: หมวดหมู่
                - quantity: จำนวน
                - unit_cost: ราคาต่อหน่วย
                - total_cost: ราคารวม
                - notes: หมายเหตุ (optional)
        output_path: path to save PDF
        logo_path: path to logo image (optional)
    
    Returns:
        str: path to generated PDF
    """
    
    # ตรวจสอบ logo path
    if logo_path is None:
        # ค้นหา logo ใน skill directory
        skill_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        default_logo = os.path.join(skill_dir, 'assets', 'logo', 'enervia.jpg')
        if os.path.exists(default_logo):
            logo_path = default_logo
    
    # สร้าง document
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
    
    # Logo และ Title
    header_data = []
    
    # Logo (ถ้ามี)
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image(logo_path, width=50*mm, height=15*mm)
            logo.hAlign = 'LEFT'
        except:
            logo = Paragraph('', styles['ThaiNormal'])
    else:
        logo = Paragraph('', styles['ThaiNormal'])
    
    # Title
    title = Paragraph('รายการวัสดุของ Enervia group', styles['ThaiTitle'])
    
    # Header table (Logo + Title)
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
    story.append(Spacer(1, 10*mm))
    
    # ==================== PROJECT INFO SECTION ====================
    
    company_name = bom_data.get('company_name', 'Enervia Group co.,ltd')
    project_name = bom_data.get('project_name', '')
    project_address = bom_data.get('project_address', '')
    order_date = bom_data.get('order_date', datetime.now().strftime('%d/%m/%y'))
    notes = bom_data.get('notes', '')
    
    # Info table
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
            Paragraph(notes, styles['ThaiNormal']),
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
    
    # Table headers
    headers = [
        Paragraph('แถว', styles['TableHeader']),
        Paragraph('หมายเลขอะไหล่', styles['TableHeader']),
        Paragraph('ชื่ออะไหล่', styles['TableHeader']),
        Paragraph('ผู้ผลิต', styles['TableHeader']),
        Paragraph('หมวดหมู่', styles['TableHeader']),
        Paragraph('ปริมาณ', styles['TableHeader']),
        Paragraph('ต้นทุน/<br/>หน่วย', styles['TableHeader']),
        Paragraph('ต้นทุน<br/>ทั้งหมด', styles['TableHeader']),
        Paragraph('Notes', styles['TableHeader']),
    ]
    
    # Table data
    table_data = [headers]
    total_qty = 0
    total_cost = 0
    
    items = bom_data.get('items', [])
    for idx, item in enumerate(items, 1):
        qty = item.get('quantity', 0)
        unit_cost = item.get('unit_cost', 0)
        item_total = item.get('total_cost', qty * unit_cost if qty and unit_cost else 0)
        
        total_qty += qty if qty else 0
        total_cost += item_total if item_total else 0
        
        row = [
            Paragraph(str(idx), styles['TableCellCenter']),
            Paragraph(truncate_text(item.get('part_number', ''), 30), styles['TableCell']),
            Paragraph(truncate_text(item.get('part_name', ''), 40), styles['TableCell']),
            Paragraph(truncate_text(item.get('manufacturer', ''), 20), styles['TableCell']),
            Paragraph(item.get('category', ''), styles['TableCellCenter']),
            Paragraph(format_number(qty), styles['TableCellCenter']),
            Paragraph(format_currency(unit_cost), styles['TableCellRight']),
            Paragraph(format_currency(item_total), styles['TableCellRight']),
            Paragraph(truncate_text(item.get('notes', ''), 25), styles['TableCell']),
        ]
        table_data.append(row)
    
    # Total row
    total_row = [
        Paragraph('', styles['TableCell']),
        Paragraph('', styles['TableCell']),
        Paragraph('', styles['TableCell']),
        Paragraph('', styles['TableCell']),
        Paragraph('<b>ยอดรวม</b>', styles['TableCellCenter']),
        Paragraph(f"<b>{format_number(total_qty)}</b>", styles['TableCellCenter']),
        Paragraph('', styles['TableCell']),
        Paragraph(f"<b>{format_currency(total_cost)}</b>", styles['TableCellRight']),
        Paragraph('', styles['TableCell']),
    ]
    table_data.append(total_row)
    
    # Column widths (adjusted for A4 landscape)
    col_widths = [12*mm, 40*mm, 50*mm, 30*mm, 35*mm, 20*mm, 25*mm, 28*mm, 30*mm]
    
    # Create table
    bom_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    # Table styles
    table_style = [
        # Header style
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
        ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
        ('FONTNAME', (0, 0), (-1, 0), FONT_BOLD),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        
        # Data rows
        ('FONTNAME', (0, 1), (-1, -1), FONT_REGULAR),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        
        # Grid
        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, COLORS['primary']),
        
        # Total row
        ('BACKGROUND', (0, -1), (-1, -1), COLORS['light_bg']),
        ('FONTNAME', (0, -1), (-1, -1), FONT_BOLD),
        ('LINEABOVE', (0, -1), (-1, -1), 1.5, COLORS['primary']),
        
        # Padding
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ]
    
    # Alternate row colors
    for i in range(1, len(table_data) - 1):
        if i % 2 == 0:
            table_style.append(('BACKGROUND', (0, i), (-1, i), COLORS['light_bg']))
    
    bom_table.setStyle(TableStyle(table_style))
    story.append(bom_table)
    
    # Build PDF
    doc.build(story)
    
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
    output_file = '/home/claude/BOM_example.pdf'
    result = generate_bom_pdf(example_bom, output_file)
    print(f"PDF created: {result}")