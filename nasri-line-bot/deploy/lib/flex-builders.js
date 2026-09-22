'use strict';

// ─── LINE Flex Message Builders ──────────────────────────────
// Pure functions — no I/O, no external state. Given a spec or BOM
// data object, return the flex message payload to hand straight to
// lReply / lPush.

function menuFlex() {
  return {
    type: 'flex', altText: 'Nasri Butler',
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🏠 Nasri Butler', weight: 'bold', size: 'lg', color: '#1a1a2e' }], backgroundColor: '#f0e68c', paddingAll: '16px' },
      body: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: 'ว่าไงวัยรุ่น 😎 นัดพร้อมจัดการให้เลย', wrap: true, size: 'sm' },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'สั่งงานได้เลยครับ:', margin: 'md', size: 'sm', weight: 'bold' },
        { type: 'text', text: '• "นัด ขอ bom" — สร้าง BOM', margin: 'sm', size: 'sm', wrap: true },
        { type: 'text', text: '• "นัด atmoce 5kw 1phase แผง JA625" — BOM อัตโนมัติ', margin: 'sm', size: 'sm', wrap: true },
        { type: 'text', text: '• "ขอ pdf" / "สร้าง pdf" — สร้าง PDF', margin: 'sm', size: 'sm', wrap: true },
        { type: 'text', text: '• "นัด ช่วย" — เมนูนี้', margin: 'sm', size: 'sm', wrap: true },
      ], paddingAll: '16px' },
      footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'Enervia Group • Powered by Oracle', size: 'xxs', color: '#888888', align: 'center' }], paddingAll: '8px' },
    },
  };
}

function addItemFlex() {
  return {
    type: 'flex', altText: 'เพิ่มรายการ BOM',
    contents: {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '📦 เพิ่มรายการ BOM', weight: 'bold', size: 'md', color: '#1a1a2e' }], backgroundColor: '#f0e68c', paddingAll: '12px' },
      body: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: 'พิมพ์ระบบที่ต้องการ เช่น:', size: 'sm', weight: 'bold', wrap: true },
        { type: 'text', text: '• atmoce 5kw 1phase แผง JA625 + batt + backup', margin: 'sm', size: 'xs', color: '#888888', wrap: true },
        { type: 'text', text: '• huawei 10kw 3phase', margin: 'sm', size: 'xs', color: '#888888', wrap: true },
        { type: 'text', text: '• solis 10kw แผง aiko', margin: 'sm', size: 'xs', color: '#888888', wrap: true },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'หรือเพิ่มทีละรายการ:', margin: 'md', size: 'sm', weight: 'bold', wrap: true },
        { type: 'text', text: '• Solar Panel, Trina, 220, 2423', margin: 'sm', size: 'xs', color: '#888888', wrap: true },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: '"เสร็จ" → สรุป / "ลบ" → ลบล่าสุด / "ยกเลิก" → ยกเลิก', margin: 'md', size: 'xs', wrap: true },
      ], paddingAll: '12px' },
    },
  };
}

// BOM result card — summary + buttons to generate PDF or edit
function buildBomResultFlex(d) {
  var tc = 0, tq = 0;
  d.items.forEach(function(i) { tc += (i.total_cost || 0); tq += (i.quantity || 0); });
  var systemKw = 0;
  d.items.forEach(function(i) {
    if (i.category === '\u0e42\u0e21\u0e14\u0e39\u0e25') {
      var wMatch = (i.part_name || '').match(/(\d{3,4})\s*W/i);
      if (wMatch) systemKw = Math.round(i.quantity * parseInt(wMatch[1]) / 1000);
    }
  });
  if (!systemKw) {
    var kwMatch = (d.project_name || '').match(/(\d+(?:\.\d+)?)\s*kw/i);
    if (kwMatch) systemKw = parseFloat(kwMatch[1]);
  }

  var topItems = d.items.slice().sort(function(a, b) { return (b.total_cost || 0) - (a.total_cost || 0); }).slice(0, 5);

  var bodyRows = [];
  bodyRows.push({ type: 'text', text: d.project_name || 'BOM', weight: 'bold', size: 'lg', wrap: true });
  if (systemKw > 0) {
    bodyRows.push({ type: 'text', text: 'ขนาดระบบ ' + systemKw + ' kWp', size: 'sm', color: '#666666', margin: 'xs' });
  }
  bodyRows.push({ type: 'separator', margin: 'md' });
  bodyRows.push({ type: 'text', text: 'รายการเด่น (top 5):', size: 'xs', color: '#888888', margin: 'md' });
  topItems.forEach(function(it) {
    bodyRows.push({
      type: 'box', layout: 'horizontal', margin: 'sm', contents: [
        { type: 'text', text: (it.part_number || it.part_name || '').slice(0, 18), size: 'xs', flex: 5, wrap: false },
        { type: 'text', text: 'x' + it.quantity, size: 'xs', flex: 2, align: 'center', color: '#666666' },
        { type: 'text', text: '\u0e3f' + (it.total_cost || 0).toLocaleString(), size: 'xs', flex: 4, align: 'end', color: '#1a237e' },
      ]
    });
  });
  if (d.items.length > 5) {
    bodyRows.push({ type: 'text', text: '+ อีก ' + (d.items.length - 5) + ' รายการ', size: 'xs', color: '#888888', margin: 'sm', align: 'center' });
  }
  bodyRows.push({ type: 'separator', margin: 'md' });
  bodyRows.push({
    type: 'box', layout: 'horizontal', margin: 'md', contents: [
      { type: 'text', text: 'รวมทั้งหมด', size: 'sm', flex: 5, weight: 'bold' },
      { type: 'text', text: d.items.length + ' รายการ', size: 'xs', flex: 3, align: 'center', color: '#666666' },
      { type: 'text', text: '\u0e3f' + tc.toLocaleString(), size: 'sm', flex: 4, align: 'end', weight: 'bold', color: '#E8941A' },
    ]
  });

  return {
    type: 'flex',
    altText: '📦 BOM — ' + (d.project_name || 'ไม่มีชื่อ') + ' • ฿' + tc.toLocaleString(),
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'text', text: '\ud83d\udce6 BOM พร้อมแล้ว', weight: 'bold', size: 'md', color: '#1a1a2e' }],
        backgroundColor: '#f0e68c',
        paddingAll: '12px',
      },
      body: { type: 'box', layout: 'vertical', contents: bodyRows, paddingAll: '12px' },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'message', label: '\ud83d\udcc4 สร้าง PDF', text: 'ขอ pdf' }, style: 'primary', color: '#1a237e' },
          {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '\u270f\ufe0f แก้ไข', text: 'แก้ไข' }, style: 'secondary', flex: 1 },
              { type: 'button', action: { type: 'message', label: '\ud83d\udcdd ตั้งชื่อ', text: 'ชื่อ ' }, style: 'secondary', flex: 1 },
            ]
          },
        ],
        paddingAll: '12px',
      },
    }
  };
}

// Preview card (Carousel: Quotation + BOM) shown before PDF generation
function buildPreviewFlex(spec) {
  // Default: AIKO 670W for all inverter brands (matches DEFAULT_PANEL in generate_pdf.py)
  var panelWatt = spec.panel_watt || 670;
  var panelBrand = spec.panel_brand || 'AIKO';
  var panelQty = spec.panel_count || (spec.size_kw > 0 ? Math.ceil(spec.size_kw * 1000 / panelWatt) : 0);

  // ── Bubble 1: Quotation ──────────────────────────────────────
  var qtRows = [];
  qtRows.push({ type: 'box', layout: 'horizontal', contents: [
    { type: 'text', text: 'อินเวอร์เตอร์', size: 'sm', color: '#888888', flex: 3 },
    { type: 'text', text: spec.brand + ' ' + spec.size_kw + ' kW ' + spec.phase, size: 'sm', weight: 'bold', flex: 5, wrap: true },
  ]});
  qtRows.push({ type: 'box', layout: 'horizontal', margin: 'sm', contents: [
    { type: 'text', text: 'แผงโซลาร์', size: 'sm', color: '#888888', flex: 3 },
    { type: 'text', text: panelBrand + ' ' + panelWatt + 'W × ' + panelQty + ' แผ่น', size: 'sm', weight: 'bold', flex: 5, wrap: true },
  ]});
  if (spec.has_battery) {
    var battText = spec.battery_kwh ? spec.battery_kwh + ' kWh' : 'ตาม spec';
    if (spec.has_backup) battText += ' + Backup';
    qtRows.push({ type: 'box', layout: 'horizontal', margin: 'sm', contents: [
      { type: 'text', text: 'แบตเตอรี่', size: 'sm', color: '#888888', flex: 3 },
      { type: 'text', text: battText, size: 'sm', weight: 'bold', flex: 5, wrap: true },
    ]});
  }
  qtRows.push({ type: 'separator', margin: 'md' });
  if (spec.customer_name) {
    qtRows.push({ type: 'box', layout: 'horizontal', margin: 'sm', contents: [
      { type: 'text', text: 'ลูกค้า', size: 'sm', color: '#888888', flex: 3 },
      { type: 'text', text: spec.customer_name, size: 'sm', weight: 'bold', flex: 5, wrap: true },
    ]});
  }
  if (spec.grand_total) {
    var priceStr = '฿' + spec.grand_total.toLocaleString();
    if (spec.discount) priceStr += ' (ลด ฿' + spec.discount.toLocaleString() + ')';
    if (spec.full_price) priceStr += '\nจากราคาเต็ม ฿' + spec.full_price.toLocaleString();
    qtRows.push({ type: 'box', layout: 'horizontal', margin: 'sm', contents: [
      { type: 'text', text: 'ราคาขาย', size: 'sm', color: '#888888', flex: 3 },
      { type: 'text', text: priceStr, size: 'sm', weight: 'bold', color: '#E8941A', flex: 5, wrap: true },
    ]});
  }
  if (spec.remarks) {
    spec.remarks.split('|').filter(Boolean).forEach(function(r) {
      qtRows.push({ type: 'text', text: '• ' + r, size: 'xs', color: '#27ae60', margin: 'sm', wrap: true });
    });
  }

  var bubble1 = {
    type: 'bubble', size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      contents: [
        { type: 'text', text: '📋 ใบเสนอราคา', weight: 'bold', size: 'md', color: '#ffffff' },
        { type: 'text', text: 'กด ยืนยัน เพื่อสร้าง PDF', size: 'xs', color: '#ffe0b2', margin: 'xs' },
      ],
      backgroundColor: '#E8941A', paddingAll: '12px',
    },
    body: { type: 'box', layout: 'vertical', contents: qtRows, paddingAll: '14px' },
    footer: {
      type: 'box', layout: 'horizontal', spacing: 'sm',
      contents: [
        { type: 'button', action: { type: 'message', label: '✅ ยืนยัน', text: 'ยืนยัน' }, style: 'primary', color: '#E8941A', flex: 1 },
        { type: 'button', action: { type: 'message', label: '✏️ แก้ไข', text: 'ยกเลิก' }, style: 'secondary', flex: 1 },
      ],
      paddingAll: '12px',
    },
  };

  // ── Bubble 2: BOM Overview ───────────────────────────────────
  var bomRows = [];
  bomRows.push({ type: 'box', layout: 'horizontal', contents: [
    { type: 'text', text: 'อินเวอร์เตอร์', size: 'sm', color: '#888888', flex: 3 },
    { type: 'text', text: spec.brand + ' ' + spec.size_kw + 'kW × 1 ชุด', size: 'sm', weight: 'bold', flex: 5, wrap: true },
  ]});
  bomRows.push({ type: 'box', layout: 'horizontal', margin: 'sm', contents: [
    { type: 'text', text: 'แผงโซลาร์', size: 'sm', color: '#888888', flex: 3 },
    { type: 'text', text: panelBrand + ' ' + panelWatt + 'W × ' + panelQty + ' แผ่น', size: 'sm', weight: 'bold', flex: 5, wrap: true },
  ]});
  if (spec.has_battery) {
    var battBom = (spec.battery_kwh ? spec.battery_kwh + 'kWh' : 'ตาม spec') + (spec.has_backup ? ' + Backup' : '');
    bomRows.push({ type: 'box', layout: 'horizontal', margin: 'sm', contents: [
      { type: 'text', text: 'แบตเตอรี่', size: 'sm', color: '#888888', flex: 3 },
      { type: 'text', text: battBom, size: 'sm', weight: 'bold', flex: 5, wrap: true },
    ]});
  }
  bomRows.push({ type: 'separator', margin: 'md' });
  bomRows.push({ type: 'text', text: 'สายไฟ · ฐานรับแรงดัน · อุปกรณ์เพิ่มเติม', size: 'xs', color: '#aaaaaa', margin: 'sm', wrap: true });
  bomRows.push({ type: 'text', text: 'กด ขอรายการ BOM เพื่อดูอุปกรณ์ครบทุกรายการจาก catalog', size: 'xs', color: '#2E86AB', margin: 'sm', wrap: true });

  var bubble2 = {
    type: 'bubble', size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      contents: [
        { type: 'text', text: '📦 รายการ BOM', weight: 'bold', size: 'md', color: '#ffffff' },
        { type: 'text', text: 'อุปกรณ์ทั้งหมดจาก catalog', size: 'xs', color: '#d0eaf8', margin: 'xs' },
      ],
      backgroundColor: '#2E86AB', paddingAll: '12px',
    },
    body: { type: 'box', layout: 'vertical', contents: bomRows, paddingAll: '14px' },
    footer: {
      type: 'box', layout: 'vertical',
      contents: [
        { type: 'button', action: { type: 'message', label: '📋 ขอรายการ BOM', text: 'ขอรายการ BOM' }, style: 'primary', color: '#2E86AB' },
      ],
      paddingAll: '12px',
    },
  };

  return {
    type: 'flex',
    altText: '📋 ตรวจสอบรายละเอียด — ' + spec.brand + ' ' + spec.size_kw + 'kW',
    contents: { type: 'carousel', contents: [bubble1, bubble2] },
  };
}

// BOM PDF download card (shown after generateBomPdf completes)
function buildBomPdfDownloadFlex(savedData, pdfUrl) {
  var tc = 0;
  savedData.items.forEach(function(i) { tc += i.total_cost; });
  return {
    type: 'flex',
    altText: 'BOM PDF: ' + (savedData.project_name || 'BOM'),
    contents: {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '\ud83d\udcc4 BOM Document', weight: 'bold', size: 'lg', color: '#1a1a2e' }], backgroundColor: '#f0e68c', paddingAll: '12px' },
      body: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: savedData.project_name || 'BOM', weight: 'bold', size: 'md', wrap: true },
        { type: 'text', text: savedData.items.length + ' \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23 \u2022 \u0e3f' + tc.toLocaleString(), size: 'sm', color: '#666666', margin: 'sm' },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: '\u0e01\u0e14\u0e1b\u0e38\u0e48\u0e21\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e40\u0e1b\u0e34\u0e14 BOM \u0e41\u0e25\u0e49\u0e27\u0e01\u0e14 Save as PDF', size: 'xs', color: '#888888', margin: 'md', wrap: true },
      ], paddingAll: '12px' },
      footer: { type: 'box', layout: 'vertical', contents: [
        { type: 'button', action: { type: 'uri', label: '\ud83d\udcc4 \u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14 PDF', uri: pdfUrl }, style: 'primary', color: '#1a237e' },
      ], paddingAll: '12px' },
    },
  };
}

// Quotation PDF result card (shown after generateQuotationPdf completes)
function buildQuotationPdfFlex(result, pdfUrl) {
  var priceText = '\u0e3f' + result.grand_total.toLocaleString();
  return {
    type: 'flex',
    altText: 'ใบเสนอราคา ' + result.brand + ' ' + result.size_kw + 'kW',
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'text', text: '\u{1F4C4} ใบเสนอราคา Solar', weight: 'bold', size: 'lg', color: '#ffffff' }],
        backgroundColor: '#E8941A', paddingAll: '12px',
      },
      body: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: result.brand + ' ' + result.size_kw + 'kW ' + result.phase, weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: (result.has_battery ? '+ Battery' : 'On-Grid') + (result.has_backup ? ' + Backup' : ''), size: 'sm', color: '#666666', margin: 'sm' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'ราคารวม: ' + priceText, size: 'md', weight: 'bold', color: '#E8941A', margin: 'md' },
          { type: 'text', text: 'เลขที่: ' + result.quote_number, size: 'xs', color: '#888888', margin: 'sm' },
        ],
        paddingAll: '12px',
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'button', action: { type: 'uri', label: '\u{1F4E5} ดาวน์โหลด PDF', uri: pdfUrl }, style: 'primary', color: '#E8941A' },
        ],
        paddingAll: '12px',
      },
    },
  };
}

// Existing BOM viewer flex (for "ดู [name]" command)
function buildBomViewFlex(vwMatch, vwUrl) {
  return {
    type: 'flex', altText: 'BOM: ' + (vwMatch.project_name || 'BOM'),
    contents: {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '\ud83d\udcc4 ' + (vwMatch.project_name || 'BOM'), weight: 'bold', size: 'md', color: '#1a1a2e', wrap: true }], backgroundColor: '#f0e68c', paddingAll: '12px' },
      body: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: vwMatch.item_count + ' \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23 \u2022 \u0e3f' + (vwMatch.total_cost || 0).toLocaleString(), size: 'sm', color: '#666666' },
        { type: 'text', text: '\u0e2a\u0e23\u0e49\u0e32\u0e07: ' + (vwMatch.created || '').slice(0,10) + (vwMatch.updated !== vwMatch.created ? ' \u2022 \u0e41\u0e01\u0e49\u0e44\u0e02: ' + (vwMatch.updated || '').slice(0,10) : ''), size: 'xs', color: '#888888', margin: 'sm', wrap: true },
      ], paddingAll: '12px' },
      footer: { type: 'box', layout: 'vertical', contents: [
        { type: 'button', action: { type: 'uri', label: '\ud83d\udcc4 \u0e40\u0e1b\u0e34\u0e14 BOM', uri: vwUrl }, style: 'primary', color: '#1a237e' },
      ], paddingAll: '12px' },
    },
  };
}

module.exports = {
  menuFlex: menuFlex,
  addItemFlex: addItemFlex,
  buildBomResultFlex: buildBomResultFlex,
  buildPreviewFlex: buildPreviewFlex,
  buildBomPdfDownloadFlex: buildBomPdfDownloadFlex,
  buildQuotationPdfFlex: buildQuotationPdfFlex,
  buildBomViewFlex: buildBomViewFlex,
};
