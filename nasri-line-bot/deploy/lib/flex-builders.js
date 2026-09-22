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
  var items = d.items || [];
  items.forEach(function(i) { tc += (i.total_cost || 0); tq += (i.quantity || 0); });

  // Extract system spec summary & auto-name details
  var systemKw = 0;
  var inverterBrand = '';
  var panelBrand = '';
  var panelWatt = 0;
  var panelQty = 0;
  var phase = d.phase || '';

  items.forEach(function(i) {
    var cat = (i.category || '').toLowerCase();
    var pname = (i.part_name || '') + ' ' + (i.part_number || '');
    if (cat === '\u0e42\u0e21\u0e14\u0e39\u0e25' || cat === 'module' || cat === 'panel') {
      var wMatch = pname.match(/(\d{3,4})\s*W/i);
      if (wMatch) {
        panelWatt = parseInt(wMatch[1]);
        panelQty += (i.quantity || 0);
        systemKw = Math.round(panelQty * panelWatt / 1000 * 10) / 10;
      }
      if (i.manufacturer && !panelBrand) panelBrand = i.manufacturer;
    } else {
      var mfg = (i.manufacturer || '').trim();
      if (mfg && mfg !== 'Enervia' && mfg !== 'Phelps Dodge' && !mfg.toLowerCase().includes('clavel') && !inverterBrand) {
        inverterBrand = mfg;
      }
    }
  });

  if (!systemKw) {
    var kwMatch = (d.project_name || '').match(/(\d+(?:\.\d+)?)\s*kw/i);
    if (kwMatch) systemKw = parseFloat(kwMatch[1]);
  }
  if (!inverterBrand) {
    var invMatch = (d.project_name || '').match(/(Hauwei|Huawei|Deye|Solis|ATMOCE|Sigenergy|Hoymiles|Sungrow)/i);
    if (invMatch) inverterBrand = invMatch[1];
  }
  if (!phase) {
    var phMatch = (d.project_name || '').match(/(1P|3P|Single-phase|Three-phase)/i);
    if (phMatch) phase = phMatch[1];
  }

  // Requirement B2: Auto-name if project_name is missing, empty, or '(auto)'
  var projectName = d.project_name;
  if (!projectName || projectName === '(auto)' || projectName.indexOf('(auto)') !== -1) {
    var autoNameParts = [];
    if (inverterBrand) autoNameParts.push(inverterBrand);
    if (systemKw) autoNameParts.push(systemKw + 'kW');
    if (phase) autoNameParts.push(phase);
    projectName = autoNameParts.join(' ') || 'Solar Project BOM';
  }

  var topItems = items.slice().sort(function(a, b) { return (b.total_cost || 0) - (a.total_cost || 0); }).slice(0, 5);

  var bodyRows = [];
  // Project Title
  bodyRows.push({ type: 'text', text: projectName, weight: 'bold', size: 'lg', wrap: true, color: '#1a237e' });
  
  // Requirement B3: Summary Spec Line
  var specParts = [];
  if (panelBrand || panelWatt) specParts.push('\u0e41\u0e1c\u0e07: ' + (panelBrand ? panelBrand + ' ' : '') + (panelWatt ? panelWatt + 'W' : '') + (panelQty ? ' \u00d7 ' + panelQty : ''));
  if (inverterBrand || systemKw) specParts.push('Inverter: ' + (inverterBrand ? inverterBrand + ' ' : '') + (systemKw ? systemKw + 'kW' : ''));
  if (phase) specParts.push('Phase: ' + phase);
  
  if (specParts.length > 0) {
    bodyRows.push({ type: 'text', text: specParts.join(' | '), size: 'xs', color: '#555555', margin: 'xs', wrap: true });
  } else if (systemKw > 0) {
    bodyRows.push({ type: 'text', text: '\u0e02\u0e19\u0e32\u0e14\u0e23\u0e30\u0e1a\u0e1a ' + systemKw + ' kWp', size: 'xs', color: '#666666', margin: 'xs' });
  }

  bodyRows.push({ type: 'separator', margin: 'md' });
  bodyRows.push({ type: 'text', text: '\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e40\u0e14\u0e48\u0e19 (Top 5):', size: 'xs', color: '#888888', margin: 'md', weight: 'bold' });
  
  topItems.forEach(function(it) {
    var itemCost = (it.total_cost || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    bodyRows.push({
      type: 'box', layout: 'horizontal', margin: 'sm', contents: [
        { type: 'text', text: (it.part_number || it.part_name || '').slice(0, 24), size: 'xs', flex: 6, wrap: true, color: '#333333' },
        { type: 'text', text: 'x' + it.quantity, size: 'xs', flex: 2, align: 'center', color: '#666666' },
        { type: 'text', text: '\u0e3f' + itemCost, size: 'xs', flex: 4, align: 'end', color: '#1a237e', wrap: true },
      ]
    });
  });

  // Requirement B6: "+ อีก X รายการ" with real postback action button to view full list in LINE
  if (items.length > 5) {
    bodyRows.push({
      type: 'box', layout: 'horizontal', margin: 'md', justifyContent: 'center',
      contents: [
        {
          type: 'button',
          style: 'secondary',
          height: 'sm',
          action: {
            type: 'postback',
            label: '+ อีก ' + (items.length - 5) + ' รายการ (กดดูใน LINE)',
            data: 'action=view_full_bom&qt=' + (d.qt_id || d.id || '') + '&ts=' + Date.now(),
            displayText: 'ดูรายการ BOM ทั้งหมด'
          }
        }
      ]
    });
  }

  bodyRows.push({ type: 'separator', margin: 'md' });

  // Requirement B1 & B4: 2-line Cost Breakdown (Equipment total + Grand total without truncation)
  var isSrpSummary = !!(d.cost_summary && d.cost_summary.srp_config); // SRP grand_total = offer price, not cost
  var eqTotal = d.cost_summary ? (d.cost_summary.equipment_total || tc) : tc;
  var grandTotal = d.cost_summary ? (d.cost_summary.grand_total || tc) : tc;

  var eqStr = '฿' + eqTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  var grandStr = '฿' + grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

  bodyRows.push({
    type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs', contents: [
      {
        type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'ค่าอุปกรณ์ (' + items.length + ' รายการ)', size: 'xs', color: '#666666', flex: 6 },
          { type: 'text', text: eqStr, size: 'xs', align: 'end', weight: 'bold', color: '#333333', flex: 6, wrap: true }
        ]
      },
      {
        type: 'box', layout: 'horizontal', margin: 'xs', contents: [
          { type: 'text', text: isSrpSummary ? 'ต้นทุนรวม (ภายใน)' : 'ต้นทุนรวมทั้งสิ้น (ภายใน)', size: 'sm', weight: 'bold', color: '#1a237e', flex: 6 },
          { type: 'text', text: isSrpSummary ? eqStr : grandStr, size: 'sm', align: 'end', weight: 'bold', color: '#E8941A', flex: 6, wrap: true }
        ]
      }
    ].concat(isSrpSummary ? [{
      type: 'box', layout: 'horizontal', margin: 'xs', contents: [
        { type: 'text', text: 'ราคาเสนอ (+กำไร 30% +VAT)', size: 'xs', color: '#666666', flex: 6 },
        { type: 'text', text: grandStr, size: 'xs', align: 'end', weight: 'bold', color: '#1a7d36', flex: 6, wrap: true }
      ]
    }] : [])
  });

  // Requirement B5: Action Buttons
  return {
    type: 'flex',
    altText: '📦 BOM — ' + projectName + ' • ' + (isSrpSummary ? 'ต้นทุน ' + eqStr : grandStr),
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: '📦 BOM รายการต้นทุนภายใน', weight: 'bold', size: 'md', color: '#ffffff' },
          { type: 'text', text: 'เอกสารภายใน — ห้ามส่งให้ลูกค้า', size: 'xxs', color: '#e0e0e0', margin: 'xs' }
        ],
        backgroundColor: '#1a237e',
        paddingAll: '12px',
      },
      body: { type: 'box', layout: 'vertical', contents: bodyRows, paddingAll: '12px' },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'message', label: '\ud83d\udcc4 \u0e2a\u0e23\u0e49\u0e32\u0e07 PDF (\u0e15\u0e49\u0e19\u0e17\u0e38\u0e19\u0e40\u0e15\u0e4Atm)', text: '\u0e02\u0e2d pdf' }, style: 'primary', color: '#1a237e' },
          {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '\u270f\ufe0f \u0e41\u0e01\u0e49\u0e44\u0e02\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23', text: '\u0e41\u0e01\u0e49\u0e44\u0e02' }, style: 'secondary', flex: 1 },
              { type: 'button', action: { type: 'message', label: '\ud83d\udcdd \u0e15\u0e31\u0e49\u0e07\u0e0a\u0e37\u0e48\u0e2d\u0e42\u0e04\u0e23\u0e07\u0e01\u0e32\u0e23', text: '\u0e0a\u0e37\u0e48\u0e2d ' }, style: 'secondary', flex: 1 },
            ]
          },
          {
            type: 'button', action: { type: 'message', label: '\ud83d\udccb \u0e2a\u0e23\u0e49\u0e32\u0e07\u0e43\u0e1a\u0e40\u0e2a\u0e19\u0e2d\u0e23\u0e32\u0e04\u0e32', text: '\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e43\u0e1a\u0e40\u0e2a\u0e19\u0e2d\u0e23\u0e32\u0e04\u0e32' }, style: 'secondary', height: 'sm'
          }
        ],
        paddingAll: '12px',
      },
    }
  };
}


/**
 * Build Full BOM Detail Flex Card / Carousel (Second Flex Card)
 * Responds to "+ อีก X รายการ" button postback.
 * Shows EVERY item (Name + QTY + Price) with pagination if items > 10 per bubble.
 * Includes "เอกสารภายใน — ห้ามส่งให้ลูกค้า" badge.
 *
 * @param {Object} d - BOM data object (items, project_name, cost_summary, qt_id)
 * @returns {Object} LINE Flex Message object (single bubble or carousel)
 */
function buildFullBomDetailFlex(d) {
  var items = d.items || [];
  var projectName = d.project_name || 'BOM Solar';

  var eqTotal = d.cost_summary ? (d.cost_summary.equipment_total || 0) : 0;
  var grandTotal = d.cost_summary ? (d.cost_summary.grand_total || 0) : 0;
  if (!eqTotal || !grandTotal) {
    var tc = 0;
    items.forEach(function(i) { tc += (i.total_cost || 0); });
    eqTotal = eqTotal || tc;
    grandTotal = grandTotal || tc;
  }

  var eqStr = '฿' + eqTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  var grandStr = '฿' + grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

  var ITEMS_PER_BUBBLE = 10;
  var totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_BUBBLE));
  var bubbles = [];

  for (var page = 0; page < totalPages; page++) {
    var startIdx = page * ITEMS_PER_BUBBLE;
    var pageItems = items.slice(startIdx, startIdx + ITEMS_PER_BUBBLE);

    var bodyRows = [];

    // Page Title / Header Info
    bodyRows.push({
      type: 'text',
      text: projectName + (totalPages > 1 ? ' (' + (page + 1) + '/' + totalPages + ')' : ''),
      weight: 'bold',
      size: 'md',
      wrap: true,
      color: '#1a237e'
    });

    bodyRows.push({ type: 'separator', margin: 'sm' });
    bodyRows.push({
      type: 'text',
      text: '📦 รายการอุปกรณ์ทั้งหมด (' + (startIdx + 1) + '-' + (startIdx + pageItems.length) + ' / ' + items.length + '):',
      size: 'xs',
      color: '#888888',
      margin: 'sm',
      weight: 'bold'
    });

    // Item List for this page
    pageItems.forEach(function(it, idx) {
      var itemNum = startIdx + idx + 1;
      var itemCost = (it.total_cost || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      var unitCost = (it.unit_cost || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      var nameStr = itemNum + '. ' + (it.part_name || it.part_number || 'อุปกรณ์');
      var unitStr = (it.unit || 'ชิ้น');

      bodyRows.push({
        type: 'box', layout: 'vertical', margin: 'sm', spacing: 'none',
        contents: [
          {
            type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: nameStr, size: 'xs', flex: 8, wrap: true, weight: 'bold', color: '#222222' },
              { type: 'text', text: '฿' + itemCost, size: 'xs', flex: 4, align: 'end', weight: 'bold', color: '#1a237e', wrap: true },
            ]
          },
          {
            type: 'box', layout: 'horizontal', margin: 'none', contents: [
              { type: 'text', text: '   ' + it.quantity + ' ' + unitStr + ' × ฿' + unitCost + (it.notes ? ' (' + it.notes + ')' : ''), size: 'xxs', color: '#666666', wrap: true, flex: 12 }
            ]
          }
        ]
      });
    });

    // On last page, add Cost Summary
    if (page === totalPages - 1) {
      bodyRows.push({ type: 'separator', margin: 'md' });
      bodyRows.push({
        type: 'box', layout: 'vertical', margin: 'sm', spacing: 'xs', contents: [
          {
            type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: 'รวมค่าอุปกรณ์ (' + items.length + ' รายการ)', size: 'xs', color: '#666666', flex: 7 },
              { type: 'text', text: eqStr, size: 'xs', align: 'end', weight: 'bold', color: '#333333', flex: 5, wrap: true }
            ]
          },
          {
            type: 'box', layout: 'horizontal', margin: 'xs', contents: [
              { type: 'text', text: 'ต้นทุนรวมทั้งสิ้น (ภายใน)', size: 'sm', weight: 'bold', color: '#1a237e', flex: 7 },
              { type: 'text', text: (d.cost_summary && d.cost_summary.srp_config ? eqStr : grandStr), size: 'sm', align: 'end', weight: 'bold', color: '#E8941A', flex: 5, wrap: true }
            ]
          }
        ]
      });
    }

    var bubble = {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: '📦 รายการวัสดุอุปกรณ์ทั้งหมด (Full BOM)', weight: 'bold', size: 'sm', color: '#ffffff' },
          { type: 'text', text: '🔒 เอกสารภายใน — ห้ามส่งให้ลูกค้า ' + (totalPages > 1 ? '(' + (page + 1) + '/' + totalPages + ')' : ''), size: 'xxs', color: '#ffc107', margin: 'xs', weight: 'bold' }
        ],
        backgroundColor: '#1a237e',
        paddingAll: '10px',
      },
      body: { type: 'box', layout: 'vertical', contents: bodyRows, paddingAll: '10px' }
    };

    bubbles.push(bubble);
  }

  if (bubbles.length === 1) {
    return {
      type: 'flex',
      altText: '📦 รายการ BOM ทั้งหมด (' + items.length + ' รายการ) — ' + grandStr,
      contents: bubbles[0]
    };
  }

  return {
    type: 'flex',
    altText: '📦 รายการ BOM ทั้งหมด (' + items.length + ' รายการ) — ' + grandStr,
    contents: {
      type: 'carousel',
      contents: bubbles
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

// Quotation detail card — full breakdown with items + price summary + action buttons
// quotation: { qt_number, brand, size_kw, phase, customer_name, subtotal, labor_cost,
//              bos_cost, grid_fee, permit_fee, vat_amount, grand_total, discount? }
// items: [{ description, quantity, unit, unit_price, total_price }]
function buildQuotationDetailFlex(quotation, items) {
  var qt = quotation || {};
  var itList = Array.isArray(items) ? items : [];

  var headerLabel = '📋 ' + (qt.qt_number || 'QT-XXXX');
  var subLabel = (qt.brand || '') + ' ' + (qt.size_kw || '') + 'kW ' + (qt.phase || '');

  // ── Item rows ─────────────────────────────────────────────────
  var bodyContents = [];

  // System tag line
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'none',
    contents: [
      { type: 'text', text: subLabel.trim(), size: 'sm', weight: 'bold', flex: 7, wrap: true, color: '#1a237e' },
      { type: 'text', text: qt.customer_name || '', size: 'xs', flex: 5, align: 'end', color: '#666666', wrap: true },
    ]
  });
  bodyContents.push({ type: 'separator', margin: 'md' });

  // Column header
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: 'รายการ', size: 'xxs', color: '#aaaaaa', flex: 8 },
      { type: 'text', text: 'จำนวน', size: 'xxs', color: '#aaaaaa', flex: 3, align: 'center' },
      { type: 'text', text: 'รวม (฿)', size: 'xxs', color: '#aaaaaa', flex: 5, align: 'end' },
    ]
  });

  // Item rows (cap at 8 to avoid bubble overflow)
  var showItems = itList.slice(0, 8);
  showItems.forEach(function(it) {
    var name = (it.description || it.part_name || '').slice(0, 22);
    var qty = (it.quantity || 0) + (it.unit ? ' ' + it.unit : '');
    var total = (it.total_price || it.total_cost || 0).toLocaleString();
    bodyContents.push({
      type: 'box', layout: 'horizontal', margin: 'xs',
      contents: [
        { type: 'text', text: name, size: 'xs', flex: 8, wrap: false, color: '#333333' },
        { type: 'text', text: qty, size: 'xs', flex: 3, align: 'center', color: '#555555' },
        { type: 'text', text: total, size: 'xs', flex: 5, align: 'end', color: '#1a237e' },
      ]
    });
  });
  if (itList.length > 8) {
    bodyContents.push({ type: 'text', text: '+ อีก ' + (itList.length - 8) + ' รายการ', size: 'xxs', color: '#aaaaaa', margin: 'xs', align: 'center' });
  }

  bodyContents.push({ type: 'separator', margin: 'md' });

  // Price breakdown rows helper
  function priceRow(label, value, opts) {
    var o = opts || {};
    return {
      type: 'box', layout: 'horizontal', margin: o.margin || 'sm',
      contents: [
        { type: 'text', text: label, size: o.size || 'xs', flex: 7, color: o.labelColor || '#555555' },
        { type: 'text', text: '฿' + (value || 0).toLocaleString(), size: o.size || 'xs', flex: 5, align: 'end',
          weight: o.bold ? 'bold' : 'regular', color: o.valueColor || '#333333' },
      ]
    };
  }

  bodyContents.push(priceRow('ค่าอุปกรณ์ (Subtotal)', qt.subtotal, { margin: 'md' }));
  bodyContents.push(priceRow('ค่าแรงติดตั้ง', qt.labor_cost));
  bodyContents.push(priceRow('BOS / อุปกรณ์เสริม', qt.bos_cost));
  bodyContents.push(priceRow('ค่าขอขนาน (PEA/MEA)', qt.grid_fee));
  bodyContents.push(priceRow('ค่าธรรมเนียม / ใบอนุญาต', qt.permit_fee));
  if (qt.discount) {
    bodyContents.push(priceRow('ส่วนลด', qt.discount, { valueColor: '#27ae60' }));
  }
  bodyContents.push(priceRow('ภาษีมูลค่าเพิ่ม 7%', qt.vat_amount));
  bodyContents.push({ type: 'separator', margin: 'sm' });
  bodyContents.push(priceRow('รวมทั้งสิ้น', qt.grand_total, {
    size: 'sm', bold: true, labelColor: '#1a1a2e', valueColor: '#E8941A', margin: 'sm'
  }));

  return {
    type: 'flex',
    altText: '📋 ' + (qt.qt_number || 'QT') + ' — ' + subLabel.trim() + ' • ฿' + (qt.grand_total || 0).toLocaleString(),
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: headerLabel, weight: 'bold', size: 'md', color: '#ffffff' },
          { type: 'text', text: 'รายละเอียดใบเสนอราคา', size: 'xxs', color: '#ffe0b2', margin: 'xs' },
        ],
        backgroundColor: '#E8941A', paddingAll: '12px',
      },
      body: {
        type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '12px',
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '✅ ยืนยัน', text: 'ยืนยัน ' + (qt.qt_number || '') }, style: 'primary', color: '#E8941A', flex: 1 },
              { type: 'button', action: { type: 'message', label: '✏️ แก้ไข', text: 'แก้ไข ' + (qt.qt_number || '') }, style: 'secondary', flex: 1 },
              { type: 'button', action: { type: 'message', label: '❌ ยกเลิก', text: 'ยกเลิก ' + (qt.qt_number || '') }, style: 'secondary', flex: 1 },
            ]
          },
        ],
      },
    },
  };
}

// Quotation diff card — preview changes before applying (B2 edit/add/remove)
// oldItems / newItems: [{ description, quantity, unit, unit_price, total_price }]
// change: { type: 'add'|'remove'|'edit', description, old_total, new_total }
function buildQuotationDiffFlex(oldItems, newItems, change) {
  var oldTotal = (oldItems || []).reduce(function(s, i) { return s + (i.total_price || i.total_cost || 0); }, 0);
  var newTotal = (newItems || []).reduce(function(s, i) { return s + (i.total_price || i.total_cost || 0); }, 0);
  var diff = newTotal - oldTotal;
  var diffSign = diff >= 0 ? '+' : '';
  var diffColor = diff > 0 ? '#e53935' : diff < 0 ? '#27ae60' : '#888888';
  var ch = change || {};
  var changeTypeLabel = ch.type === 'add' ? '➕ เพิ่มรายการ' : ch.type === 'remove' ? '➖ ลบรายการ' : '✏️ แก้ไขรายการ';
  var headerColor = ch.type === 'remove' ? '#c62828' : ch.type === 'add' ? '#1565c0' : '#6a1b9a';

  var bodyContents = [];

  // Change summary line
  bodyContents.push({ type: 'text', text: changeTypeLabel + (ch.description ? ': ' + ch.description : ''), size: 'sm', weight: 'bold', wrap: true, color: '#1a1a2e' });
  bodyContents.push({ type: 'separator', margin: 'md' });

  // Removed items (red)
  var removed = (oldItems || []).filter(function(o) {
    return !(newItems || []).some(function(n) { return n.description === o.description; });
  });
  // Added items (green)
  var added = (newItems || []).filter(function(n) {
    return !(oldItems || []).some(function(o) { return o.description === n.description; });
  });
  // Changed items
  var changed = (newItems || []).filter(function(n) {
    var old = (oldItems || []).find(function(o) { return o.description === n.description; });
    return old && (old.quantity !== n.quantity || old.unit_price !== n.unit_price);
  });

  function diffRow(icon, name, qty, total, color) {
    return {
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: icon + ' ' + (name || '').slice(0, 20), size: 'xs', flex: 8, wrap: false, color: color },
        { type: 'text', text: qty != null ? String(qty) : '', size: 'xs', flex: 3, align: 'center', color: color },
        { type: 'text', text: total != null ? '฿' + Number(total).toLocaleString() : '', size: 'xs', flex: 5, align: 'end', color: color },
      ]
    };
  }

  removed.forEach(function(it) {
    bodyContents.push(diffRow('➖', it.description, it.quantity, it.total_price || it.total_cost, '#e53935'));
  });
  added.forEach(function(it) {
    bodyContents.push(diffRow('➕', it.description, it.quantity, it.total_price || it.total_cost, '#27ae60'));
  });
  changed.forEach(function(n) {
    var old = (oldItems || []).find(function(o) { return o.description === n.description; });
    bodyContents.push(diffRow('✏️', n.description, old.quantity + '→' + n.quantity, n.total_price || n.total_cost, '#1565c0'));
  });

  if (removed.length === 0 && added.length === 0 && changed.length === 0) {
    bodyContents.push({ type: 'text', text: '(ไม่มีการเปลี่ยนแปลง)', size: 'xs', color: '#aaaaaa', margin: 'sm', align: 'center' });
  }

  bodyContents.push({ type: 'separator', margin: 'md' });

  // Before / After totals
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: 'ก่อน', size: 'xs', flex: 4, color: '#888888' },
      { type: 'text', text: '฿' + oldTotal.toLocaleString(), size: 'xs', flex: 8, align: 'end', color: '#555555' },
    ]
  });
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'xs',
    contents: [
      { type: 'text', text: 'หลัง', size: 'xs', flex: 4, color: '#888888' },
      { type: 'text', text: '฿' + newTotal.toLocaleString(), size: 'xs', flex: 8, align: 'end', color: '#1a237e', weight: 'bold' },
    ]
  });
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'xs',
    contents: [
      { type: 'text', text: 'ผลต่าง', size: 'xs', flex: 4, color: '#888888' },
      { type: 'text', text: diffSign + diff.toLocaleString(), size: 'sm', flex: 8, align: 'end', color: diffColor, weight: 'bold' },
    ]
  });

  return {
    type: 'flex',
    altText: '🔄 ตรวจสอบการแก้ไข — ' + (ch.description || '') + ' ' + diffSign + diff.toLocaleString() + ' บาท',
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: '🔄 ตรวจสอบการแก้ไข', weight: 'bold', size: 'md', color: '#ffffff' },
          { type: 'text', text: 'ยืนยันเพื่อบันทึกการเปลี่ยนแปลง', size: 'xxs', color: '#e0d0ff', margin: 'xs' },
        ],
        backgroundColor: headerColor, paddingAll: '12px',
      },
      body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '12px' },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'message', label: '✅ ยืนยัน', text: 'ยืนยันแก้ไข' }, style: 'primary', color: '#E8941A', flex: 1 },
          { type: 'button', action: { type: 'message', label: '↩️ ยกเลิก', text: 'ยกเลิกแก้ไข' }, style: 'secondary', flex: 1 },
        ],
      },
    },
  };
}

// ── Adapter: normalize DB v2 row OR legacy JSON shape → canonical shape ──
// DB v2:     { id, customer_name, brand, system_size_kw, total, created_at, status, version }
// Legacy JSON:{ quote_number, customer_name?, brand, size_kw, grand_total, ts, pdf_url }
// Canonical: { qt_number, customer_name, brand, size_kw, grand_total, status, created_at }
function _normalizeQuotation(qt) {
  if (!qt) return {};
  var isV2 = qt.id != null && qt.system_size_kw != null;
  if (isV2) {
    return {
      qt_number:     qt.qt_number || ('QT-' + String(qt.id).padStart(6, '0')),
      customer_name: qt.customer_name || '-',
      brand:         qt.brand || '-',
      size_kw:       qt.system_size_kw,
      grand_total:   qt.total || 0,
      status:        qt.status || 'draft',
      created_at:    qt.created_at || '',
      version:       qt.version || 1,
      phase:         qt.phase || '',
    };
  }
  return {
    qt_number:     qt.quote_number || qt.qt_number || '-',
    customer_name: qt.customer_name || '-',
    brand:         qt.brand || '-',
    size_kw:       qt.size_kw || qt.system_size_kw || 0,
    grand_total:   qt.grand_total || qt.total || 0,
    status:        qt.status || 'draft',
    created_at:    qt.ts || qt.created_at || '',
    version:       qt.version || 1,
    phase:         qt.phase || '',
  };
}

// ── Gap 1c — Search Results Flex Carousel ─────────────────────
// results: array of quotation objects (DB v2 or legacy JSON shape, max 10)
// customerQuery: original search string shown in alt text
function buildQuotationSearchResultFlex(results, customerQuery) {
  var list = Array.isArray(results) ? results.slice(0, 10) : [];
  var query = customerQuery || 'ค้นหา';

  var statusColor = { draft: '#888888', sent: '#1565c0', confirmed: '#27ae60', cancelled: '#e53935' };
  var statusLabel = { draft: 'ร่าง', sent: 'ส่งแล้ว', confirmed: 'ยืนยัน', cancelled: 'ยกเลิก' };

  var bubbles = list.map(function(raw) {
    var qt     = _normalizeQuotation(raw);
    var sColor = statusColor[qt.status] || '#888888';
    var sLabel = statusLabel[qt.status] || qt.status || '-';
    var dateStr = qt.created_at ? String(qt.created_at).slice(0, 10) : '-';
    var kw      = qt.size_kw != null ? qt.size_kw + ' kW' : '-';
    var total   = '฿' + Number(qt.grand_total || 0).toLocaleString();
    var qtNum   = qt.qt_number || '-';

    return {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'horizontal', paddingAll: '12px',
        backgroundColor: sColor,
        contents: [
          { type: 'text', text: qtNum, weight: 'bold', size: 'md', color: '#ffffff', flex: 7 },
          { type: 'text', text: sLabel, size: 'xs', color: '#ffffff', flex: 3, align: 'end' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'text', text: qt.customer_name, weight: 'bold', size: 'sm', wrap: true, color: '#1a237e' },
          { type: 'text', text: qt.brand + ' ' + kw, size: 'xs', color: '#555555', margin: 'xs' },
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'horizontal', margin: 'md',
            contents: [
              { type: 'text', text: 'ราคารวม', size: 'xs', flex: 4, color: '#888888' },
              { type: 'text', text: total, size: 'sm', flex: 8, align: 'end', weight: 'bold', color: '#E8941A' },
            ],
          },
          { type: 'text', text: dateStr, size: 'xxs', color: '#aaaaaa', margin: 'sm', align: 'end' },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '10px',
        contents: [
          {
            type: 'button', style: 'primary', color: '#E8941A', flex: 1,
            action: { type: 'postback', label: '📋 ดูรายละเอียด', data: 'action=view&qt=' + qtNum },
          },
          {
            type: 'button', style: 'secondary', flex: 1,
            action: { type: 'postback', label: '✏️ แก้ใบนี้', data: 'action=edit&qt=' + qtNum },
          },
        ],
      },
    };
  });

  if (bubbles.length === 0) {
    bubbles.push({
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '20px',
        contents: [
          { type: 'text', text: 'ไม่พบใบเสนอราคา', size: 'sm', color: '#aaaaaa', align: 'center', weight: 'bold' },
          { type: 'text', text: '"' + query + '"', size: 'xs', color: '#cccccc', align: 'center', margin: 'sm' },
        ],
      },
    });
  }

  return {
    type: 'flex',
    altText: '🔍 ผลค้นหา "' + query + '" (' + list.length + ' รายการ)',
    contents: { type: 'carousel', contents: bubbles },
  };
}

// Quotation history carousel — list of past quotations (B6)
// quotations: [{ qt_number, brand, size_kw, phase, customer_name, grand_total, status, created_at }]
// Accepts both DB v2 and legacy JSON shapes via _normalizeQuotation adapter
function buildQuotationHistoryFlex(quotations) {
  var list = Array.isArray(quotations) ? quotations.slice(0, 10) : [];

  var statusColor = { 'draft': '#888888', 'sent': '#1565c0', 'confirmed': '#27ae60', 'cancelled': '#e53935' };
  var statusLabel = { 'draft': 'ร่าง', 'sent': 'ส่งแล้ว', 'confirmed': 'ยืนยัน', 'cancelled': 'ยกเลิก' };

  var bubbles = list.map(function(raw) {
    var qt     = _normalizeQuotation(raw);
    var sColor = statusColor[qt.status] || '#888888';
    var sLabel = statusLabel[qt.status] || qt.status || '-';
    var dateStr = qt.created_at ? String(qt.created_at).slice(0, 10) : '';
    var qtNum  = qt.qt_number || '-';

    return {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'horizontal',
        contents: [
          { type: 'text', text: qtNum, weight: 'bold', size: 'md', color: '#ffffff', flex: 7 },
          { type: 'text', text: sLabel, size: 'xs', color: '#ffffff', flex: 3, align: 'end' },
        ],
        backgroundColor: sColor, paddingAll: '12px',
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'text', text: (qt.brand || '') + ' ' + (qt.size_kw || '') + 'kW ' + (qt.phase || ''), weight: 'bold', size: 'sm', wrap: true, color: '#1a237e' },
          { type: 'text', text: qt.customer_name || '-', size: 'xs', color: '#666666', margin: 'xs' },
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'horizontal', margin: 'md',
            contents: [
              { type: 'text', text: 'ราคารวม', size: 'xs', flex: 4, color: '#888888' },
              { type: 'text', text: '฿' + Number(qt.grand_total || 0).toLocaleString(), size: 'sm', flex: 8, align: 'end', weight: 'bold', color: '#E8941A' },
            ],
          },
          { type: 'text', text: dateStr, size: 'xxs', color: '#aaaaaa', margin: 'sm', align: 'end' },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'postback', label: '📋 ดูรายละเอียด', data: 'action=view&qt=' + qtNum }, style: 'primary', color: '#E8941A', flex: 1 },
          { type: 'button', action: { type: 'postback', label: '📄 PDF', data: 'action=pdf&qt=' + qtNum }, style: 'secondary', flex: 1 },
        ],
      },
    };
  });

  if (bubbles.length === 0) {
    bubbles.push({
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '20px',
        contents: [{ type: 'text', text: 'ยังไม่มีใบเสนอราคา', size: 'sm', color: '#aaaaaa', align: 'center' }],
      },
    });
  }

  return {
    type: 'flex',
    altText: '📋 ประวัติใบเสนอราคา (' + list.length + ' รายการ)',
    contents: { type: 'carousel', contents: bubbles },
  };
}

// Version history flex — show v1 → v2 → v3 diff timeline (B8)
// versions: [{ version, created_at, created_by, changes: string[], grand_total, status }]
function buildVersionHistoryFlex(versions) {
  var list = Array.isArray(versions) ? versions : [];

  var bodyContents = [];

  if (list.length === 0) {
    bodyContents.push({ type: 'text', text: 'ยังไม่มีประวัติการแก้ไข', size: 'sm', color: '#aaaaaa', align: 'center' });
  }

  list.forEach(function(ver, idx) {
    var isLast = idx === list.length - 1;
    var verLabel = 'v' + (ver.version || (idx + 1));
    var dateStr = ver.created_at ? String(ver.created_at).slice(0, 10) : '';
    var byStr = ver.created_by ? ' • ' + ver.created_by : '';
    var totalStr = ver.grand_total != null ? '฿' + Number(ver.grand_total).toLocaleString() : '';
    var dotColor = isLast ? '#E8941A' : '#aaaaaa';

    // Version row
    bodyContents.push({
      type: 'box', layout: 'horizontal', margin: idx === 0 ? 'none' : 'lg',
      contents: [
        // Timeline dot column
        {
          type: 'box', layout: 'vertical', flex: 1, alignItems: 'center',
          contents: [
            { type: 'box', layout: 'vertical', width: '12px', height: '12px', cornerRadius: '6px',
              backgroundColor: dotColor, contents: [] },
            idx < list.length - 1
              ? { type: 'box', layout: 'vertical', width: '2px', height: '36px',
                  backgroundColor: '#dddddd', margin: 'xs', contents: [] }
              : { type: 'filler' },
          ]
        },
        // Content column
        {
          type: 'box', layout: 'vertical', flex: 11, paddingStart: '8px',
          contents: [
            {
              type: 'box', layout: 'horizontal',
              contents: [
                { type: 'text', text: verLabel, size: 'sm', weight: 'bold', flex: 2, color: isLast ? '#E8941A' : '#1a237e' },
                { type: 'text', text: totalStr, size: 'xs', flex: 5, align: 'end', weight: isLast ? 'bold' : 'regular', color: isLast ? '#E8941A' : '#555555' },
              ]
            },
            { type: 'text', text: dateStr + byStr, size: 'xxs', color: '#aaaaaa', margin: 'xs' },
          ].concat(
            (ver.changes || []).slice(0, 3).map(function(c) {
              return { type: 'text', text: '• ' + c, size: 'xxs', color: '#555555', margin: 'xs', wrap: true };
            })
          ).concat(
            ver.changes && ver.changes.length > 3
              ? [{ type: 'text', text: '+ อีก ' + (ver.changes.length - 3) + ' การเปลี่ยนแปลง', size: 'xxs', color: '#aaaaaa', margin: 'xs' }]
              : []
          ),
        },
      ]
    });
  });

  var latestVer = list[list.length - 1];
  var footerContents = latestVer ? [
    {
      type: 'box', layout: 'horizontal', spacing: 'sm',
      contents: [
        { type: 'button', action: { type: 'message', label: '📋 ดู ' + 'v' + (latestVer.version || list.length), text: 'ดูใบเสนอ v' + (latestVer.version || list.length) }, style: 'primary', color: '#E8941A', flex: 1 },
        { type: 'button', action: { type: 'message', label: '↩️ ย้อนกลับ', text: 'ย้อนกลับ v' + (list.length > 1 ? (latestVer.version || list.length) - 1 : 1) }, style: 'secondary', flex: 1 },
      ]
    }
  ] : [];

  return {
    type: 'flex',
    altText: '🕓 ประวัติการแก้ไข ' + list.length + ' เวอร์ชัน',
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: '🕓 ประวัติการแก้ไข', weight: 'bold', size: 'md', color: '#ffffff' },
          { type: 'text', text: list.length + ' เวอร์ชัน', size: 'xxs', color: '#e0e0e0', margin: 'xs' },
        ],
        backgroundColor: '#37474f', paddingAll: '12px',
      },
      body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '14px' },
      footer: footerContents.length > 0 ? { type: 'box', layout: 'vertical', contents: footerContents, paddingAll: '12px' } : undefined,
    },
  };
}

// Price update diff — show list of price changes before applying (Phase C)
// changes: [{ brand, model, old_price, new_price }]
function buildPriceUpdateDiffFlex(changes, oldTotal, newTotal) {
  var list = Array.isArray(changes) ? changes : [];
  var diff = (newTotal || 0) - (oldTotal || 0);
  var diffSign = diff >= 0 ? '+' : '';
  var diffColor = diff > 0 ? '#e53935' : diff < 0 ? '#27ae60' : '#888888';

  var bodyContents = [];
  bodyContents.push({ type: 'text', text: list.length + ' รายการราคาที่เปลี่ยน', size: 'sm', weight: 'bold', color: '#1a1a2e' });
  bodyContents.push({ type: 'separator', margin: 'md' });

  // Column header
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: 'รุ่น', size: 'xxs', color: '#aaaaaa', flex: 6 },
      { type: 'text', text: 'เดิม', size: 'xxs', color: '#aaaaaa', flex: 4, align: 'center' },
      { type: 'text', text: 'ใหม่', size: 'xxs', color: '#aaaaaa', flex: 4, align: 'end' },
    ]
  });

  list.slice(0, 8).forEach(function(c) {
    var itemDiff = (c.new_price || 0) - (c.old_price || 0);
    var itemColor = itemDiff > 0 ? '#e53935' : itemDiff < 0 ? '#27ae60' : '#555555';
    var modelLabel = ((c.brand || '') + ' ' + (c.model || '')).trim().slice(0, 18);
    bodyContents.push({
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: modelLabel, size: 'xs', flex: 6, wrap: false, color: '#333333' },
        { type: 'text', text: '฿' + Number(c.old_price || 0).toLocaleString(), size: 'xs', flex: 4, align: 'center', color: '#888888', decoration: 'line-through' },
        { type: 'text', text: '฿' + Number(c.new_price || 0).toLocaleString(), size: 'xs', flex: 4, align: 'end', weight: 'bold', color: itemColor },
      ]
    });
  });

  if (list.length > 8) {
    bodyContents.push({ type: 'text', text: '+ อีก ' + (list.length - 8) + ' รายการ', size: 'xxs', color: '#aaaaaa', margin: 'xs', align: 'center' });
  }

  if (oldTotal != null && newTotal != null) {
    bodyContents.push({ type: 'separator', margin: 'md' });
    bodyContents.push({
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        { type: 'text', text: 'ผลต่างรวม', size: 'sm', flex: 6, weight: 'bold', color: '#1a1a2e' },
        { type: 'text', text: diffSign + diff.toLocaleString() + ' บาท', size: 'sm', flex: 6, align: 'end', weight: 'bold', color: diffColor },
      ]
    });
  }

  return {
    type: 'flex',
    altText: '💰 อัพเดทราคา ' + list.length + ' รายการ',
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: '💰 ตรวจสอบการอัพเดทราคา', weight: 'bold', size: 'md', color: '#ffffff' },
          { type: 'text', text: 'ราคาจะมีผลกับใบเสนอราคาใหม่ทันที', size: 'xxs', color: '#ffe0b2', margin: 'xs' },
        ],
        backgroundColor: '#e65100', paddingAll: '12px',
      },
      body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '12px' },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'message', label: '✅ อัพเดท', text: 'ยืนยันอัพเดทราคา' }, style: 'primary', color: '#e65100', flex: 1 },
          { type: 'button', action: { type: 'message', label: '↩️ ใช้ราคาเดิม', text: 'ยกเลิกอัพเดทราคา' }, style: 'secondary', flex: 1 },
        ],
      },
    },
  };
}

// Single product price edit confirm (Phase C)
// brand, model: string | oldPrice, newPrice: number
function buildProductPriceEditFlex(brand, model, oldPrice, newPrice) {
  var diff = (newPrice || 0) - (oldPrice || 0);
  var diffSign = diff >= 0 ? '+' : '';
  var diffColor = diff > 0 ? '#e53935' : diff < 0 ? '#27ae60' : '#888888';
  var productLabel = ((brand || '') + ' ' + (model || '')).trim();

  var bodyContents = [
    { type: 'text', text: productLabel, weight: 'bold', size: 'lg', wrap: true, color: '#1a237e' },
    { type: 'separator', margin: 'md' },
    {
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        { type: 'text', text: 'ราคาเดิม', size: 'sm', flex: 4, color: '#888888' },
        { type: 'text', text: '฿' + Number(oldPrice || 0).toLocaleString(), size: 'sm', flex: 8, align: 'end', color: '#555555', decoration: 'line-through' },
      ]
    },
    {
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: 'ราคาใหม่', size: 'sm', flex: 4, color: '#888888' },
        { type: 'text', text: '฿' + Number(newPrice || 0).toLocaleString(), size: 'sm', flex: 8, align: 'end', weight: 'bold', color: '#e65100' },
      ]
    },
    {
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: 'ผลต่าง', size: 'xs', flex: 4, color: '#aaaaaa' },
        { type: 'text', text: diffSign + diff.toLocaleString() + ' บาท', size: 'xs', flex: 8, align: 'end', color: diffColor },
      ]
    },
    { type: 'separator', margin: 'md' },
    { type: 'text', text: '⚠️ Sync Sheets จะอัพเดทราคาใน Google Sheets ทันที', size: 'xxs', color: '#888888', margin: 'md', wrap: true },
  ];

  return {
    type: 'flex',
    altText: '💾 แก้ราคา ' + productLabel + ' → ฿' + Number(newPrice || 0).toLocaleString(),
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: '💾 แก้ไขราคาสินค้า', weight: 'bold', size: 'md', color: '#ffffff' },
          { type: 'text', text: 'เลือก: บันทึกอย่างเดียว หรือ sync Google Sheets ด้วย', size: 'xxs', color: '#ffe0b2', margin: 'xs' },
        ],
        backgroundColor: '#1565c0', paddingAll: '12px',
      },
      body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '14px' },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'message', label: '✅ อัพเดท+Sync Sheets', text: 'อัพเดทราคา ' + productLabel + ' ' + newPrice + ' sync' }, style: 'primary', color: '#1565c0' },
          { type: 'button', action: { type: 'message', label: '💾 อัพเดทอย่างเดียว', text: 'อัพเดทราคา ' + productLabel + ' ' + newPrice }, style: 'secondary' },
        ],
      },
    },
  };
}

// Formula / rate edit confirm (Phase C)
// formulaName: e.g. "ค่าแรง" | oldValue, newValue: number | unit: e.g. "บาท/วัตต์"
// affectedCount: number of quotations that will be affected (optional)
function buildFormulaEditFlex(formulaName, oldValue, newValue, unit, affectedCount) {
  var diff = (newValue || 0) - (oldValue || 0);
  var diffSign = diff >= 0 ? '+' : '';
  var diffColor = diff > 0 ? '#e53935' : diff < 0 ? '#27ae60' : '#888888';
  var unitStr = unit ? ' ' + unit : '';

  var bodyContents = [
    { type: 'text', text: formulaName || 'สูตรคำนวณ', weight: 'bold', size: 'lg', color: '#1a1a2e' },
    { type: 'separator', margin: 'md' },
    {
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        { type: 'text', text: 'ค่าเดิม', size: 'sm', flex: 4, color: '#888888' },
        { type: 'text', text: String(oldValue || 0) + unitStr, size: 'sm', flex: 8, align: 'end', color: '#555555', decoration: 'line-through' },
      ]
    },
    {
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: 'ค่าใหม่', size: 'sm', flex: 4, color: '#888888' },
        { type: 'text', text: String(newValue || 0) + unitStr, size: 'sm', flex: 8, align: 'end', weight: 'bold', color: '#6a1b9a' },
      ]
    },
    {
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: 'ผลต่าง', size: 'xs', flex: 4, color: '#aaaaaa' },
        { type: 'text', text: diffSign + diff + unitStr, size: 'xs', flex: 8, align: 'end', color: diffColor },
      ]
    },
  ];

  if (affectedCount != null) {
    bodyContents.push({ type: 'separator', margin: 'md' });
    bodyContents.push({
      type: 'text',
      text: '⚠️ ใบเสนอราคาที่จะคำนวณใหม่: ' + affectedCount + ' ใบ',
      size: 'xs', color: '#e65100', margin: 'md', wrap: true,
    });
  }

  bodyContents.push({
    type: 'text',
    text: 'การเปลี่ยนแปลงจะมีผลกับ quotation ใหม่ทุกใบที่สร้างหลังจากนี้',
    size: 'xxs', color: '#888888', margin: 'sm', wrap: true,
  });

  return {
    type: 'flex',
    altText: '⚙️ แก้ ' + (formulaName || 'สูตร') + ': ' + String(oldValue) + ' → ' + String(newValue) + unitStr,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: '⚙️ แก้ไขสูตรคำนวณ', weight: 'bold', size: 'md', color: '#ffffff' },
          { type: 'text', text: 'การเปลี่ยนแปลงนี้จะกระทบราคาทุกใบที่สร้างใหม่', size: 'xxs', color: '#e1bee7', margin: 'xs' },
        ],
        backgroundColor: '#6a1b9a', paddingAll: '12px',
      },
      body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '14px' },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'message', label: '✅ ยืนยัน', text: 'ยืนยันแก้สูตร ' + (formulaName || '') + ' ' + newValue }, style: 'primary', color: '#6a1b9a', flex: 1 },
          { type: 'button', action: { type: 'message', label: '↩️ ยกเลิก', text: 'ยกเลิกแก้สูตร' }, style: 'secondary', flex: 1 },
        ],
      },
    },
  };
}

// Monthly summary dashboard card (Phase D)
// summary: { month, year, total_quotes, total_revenue, avg_size_kw, close_rate,
//            top_brands: [{brand, count, revenue}], prev_revenue?, prev_quotes? }
function buildMonthlySummaryFlex(summary) {
  var s = summary || {};
  var monthLabel = (s.month || '') + (s.year ? '/' + s.year : '');
  var closeRate = s.close_rate != null ? (s.close_rate * 100).toFixed(1) : '—';
  var revGrowth = (s.prev_revenue && s.total_revenue != null)
    ? ((s.total_revenue - s.prev_revenue) / s.prev_revenue * 100).toFixed(1)
    : null;
  var revGrowthSign = revGrowth != null && parseFloat(revGrowth) >= 0 ? '+' : '';
  var revGrowthColor = revGrowth != null ? (parseFloat(revGrowth) >= 0 ? '#27ae60' : '#e53935') : '#888888';

  var topBrands = Array.isArray(s.top_brands) ? s.top_brands.slice(0, 3) : [];
  var brandIcons = ['🥇', '🥈', '🥉'];

  // ── KPI grid ─────────────────────────────────────────────────
  function kpiBox(icon, label, value, valueColor) {
    return {
      type: 'box', layout: 'vertical', flex: 1,
      backgroundColor: 'rgba(255,255,255,0.05)',
      cornerRadius: '8px', paddingAll: '10px',
      contents: [
        { type: 'text', text: icon, size: 'lg', align: 'center' },
        { type: 'text', text: value, size: 'md', weight: 'bold', align: 'center', color: valueColor || '#ffffff', margin: 'xs' },
        { type: 'text', text: label, size: 'xxs', align: 'center', color: '#cccccc', wrap: true },
      ]
    };
  }

  var bodyContents = [];

  // KPI row 1
  bodyContents.push({
    type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'none',
    contents: [
      kpiBox('📋', 'ใบเสนอราคา', String(s.total_quotes || 0), '#ffe082'),
      kpiBox('💰', 'ยอดรวม', '฿' + ((s.total_revenue || 0) / 1e6).toFixed(2) + 'M', '#80cbc4'),
    ]
  });
  // KPI row 2
  bodyContents.push({
    type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm',
    contents: [
      kpiBox('⚡', 'ขนาดเฉลี่ย', (s.avg_size_kw || 0).toFixed(1) + ' kW', '#ce93d8'),
      kpiBox('🎯', 'Close Rate', closeRate + '%', parseFloat(closeRate) >= 50 ? '#a5d6a7' : '#ef9a9a'),
    ]
  });

  // Growth badge
  if (revGrowth != null) {
    bodyContents.push({
      type: 'box', layout: 'horizontal', margin: 'md', justifyContent: 'center',
      contents: [{
        type: 'box', layout: 'horizontal', paddingAll: '6px', paddingStart: '12px', paddingEnd: '12px',
        backgroundColor: parseFloat(revGrowth) >= 0 ? 'rgba(39,174,96,0.15)' : 'rgba(229,57,53,0.15)',
        cornerRadius: '20px', spacing: 'sm',
        contents: [
          { type: 'text', text: parseFloat(revGrowth) >= 0 ? '📈' : '📉', size: 'xs' },
          { type: 'text', text: revGrowthSign + revGrowth + '% vs เดือนก่อน', size: 'xs', color: revGrowthColor, weight: 'bold' },
        ]
      }]
    });
  }

  // Top brands
  if (topBrands.length > 0) {
    bodyContents.push({ type: 'separator', margin: 'lg' });
    bodyContents.push({ type: 'text', text: '🏆 Brand ขายดี', size: 'sm', weight: 'bold', color: '#ffe082', margin: 'md' });
    topBrands.forEach(function(b, i) {
      var share = s.total_quotes > 0 ? ((b.count / s.total_quotes) * 100).toFixed(0) : '0';
      bodyContents.push({
        type: 'box', layout: 'horizontal', margin: 'sm',
        contents: [
          { type: 'text', text: brandIcons[i] + ' ' + (b.brand || ''), size: 'sm', flex: 5, color: '#ffffff' },
          { type: 'text', text: b.count + ' ใบ', size: 'xs', flex: 3, align: 'center', color: '#cccccc' },
          { type: 'text', text: share + '%', size: 'xs', flex: 2, align: 'end', weight: 'bold', color: '#ffe082' },
        ]
      });
    });
  }

  return {
    type: 'flex',
    altText: '📊 สรุปเดือน ' + monthLabel + ' — ฿' + ((s.total_revenue || 0) / 1e6).toFixed(2) + 'M',
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '14px',
        backgroundColor: '#1a237e',
        contents: [
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '📊 สรุปประจำเดือน', weight: 'bold', size: 'md', color: '#ffffff', flex: 7 },
            { type: 'text', text: monthLabel, size: 'xs', color: '#ffe082', flex: 3, align: 'end' },
          ]},
          { type: 'text', text: 'QSolar Sales Analytics', size: 'xxs', color: '#9fa8da', margin: 'xs' },
        ],
      },
      body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '12px', backgroundColor: '#1e2a5e' },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '10px', backgroundColor: '#1a237e',
        contents: [
          { type: 'button', action: { type: 'message', label: '📋 ดูรายการ', text: 'รายการเดือน ' + monthLabel }, style: 'primary', color: '#E8941A', flex: 1, height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📦 Top Products', text: 'top products ' + monthLabel }, style: 'secondary', flex: 1, height: 'sm' },
        ],
      },
    },
  };
}

// Top products list (Phase D)
// products: [{ rank, name, brand, count, revenue, share }] (share = 0-100)
// period: string e.g. "เมษายน 2026"
function buildTopProductsFlex(products, period) {
  var list = Array.isArray(products) ? products.slice(0, 10) : [];
  var barColors = ['#E8941A', '#ff7043', '#ffa726', '#ffcc02', '#66bb6a',
                   '#26c6da', '#42a5f5', '#ab47bc', '#ef5350', '#8d6e63'];

  var bodyContents = [];
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'none',
    contents: [
      { type: 'text', text: 'รุ่น', size: 'xxs', color: '#aaaaaa', flex: 7 },
      { type: 'text', text: 'ใบ', size: 'xxs', color: '#aaaaaa', flex: 2, align: 'center' },
      { type: 'text', text: '% share', size: 'xxs', color: '#aaaaaa', flex: 3, align: 'end' },
    ]
  });
  bodyContents.push({ type: 'separator', margin: 'sm' });

  list.forEach(function(p, idx) {
    var share = p.share != null ? p.share : 0;
    var barColor = barColors[idx % barColors.length];
    var rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : String(p.rank || idx + 1) + '.';
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: idx === 0 ? 'sm' : 'md',
      contents: [
        {
          type: 'box', layout: 'horizontal',
          contents: [
            { type: 'text', text: rankIcon + ' ' + ((p.brand || '') + ' ' + (p.name || '')).trim().slice(0, 18),
              size: 'xs', flex: 7, wrap: false, color: '#333333' },
            { type: 'text', text: String(p.count || 0), size: 'xs', flex: 2, align: 'center', color: '#555555' },
            { type: 'text', text: share.toFixed(1) + '%', size: 'xs', flex: 3, align: 'end', weight: 'bold', color: barColor },
          ]
        },
        // Progress bar
        {
          type: 'box', layout: 'horizontal', margin: 'xs', height: '4px',
          backgroundColor: '#eeeeee', cornerRadius: '2px',
          contents: [{
            type: 'box', layout: 'vertical', flex: Math.round(share),
            backgroundColor: barColor, cornerRadius: '2px', contents: [],
          }, {
            type: 'filler',
          }]
        },
      ]
    });
  });

  if (list.length === 0) {
    bodyContents.push({ type: 'text', text: 'ไม่มีข้อมูล', size: 'sm', color: '#aaaaaa', align: 'center', margin: 'lg' });
  }

  return {
    type: 'flex',
    altText: '🏆 Top Products ' + (period || '') + ' — ' + list.length + ' รุ่น',
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'horizontal', paddingAll: '12px', backgroundColor: '#212121',
        contents: [
          { type: 'text', text: '🏆 Top Products', weight: 'bold', size: 'md', color: '#ffe082', flex: 7 },
          { type: 'text', text: period || '', size: 'xs', color: '#aaaaaa', flex: 5, align: 'end' },
        ],
      },
      body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '12px' },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'button', action: { type: 'message', label: '📊 ดูสรุปเดือน', text: 'สรุปเดือน ' + (period || '') }, style: 'secondary', height: 'sm' },
        ],
      },
    },
  };
}

// Sales funnel visualizer (Phase D)
// funnel: { draft, sent, accepted, rejected, total }
function buildSalesFunnelFlex(funnel) {
  var f = funnel || {};
  var total = f.total || f.draft || 1;

  function funnelRow(label, count, color, icon) {
    var pct = total > 0 ? Math.min(100, Math.round((count || 0) / total * 100)) : 0;
    var barFlex = Math.max(1, pct);
    return {
      type: 'box', layout: 'vertical', margin: 'md',
      contents: [
        {
          type: 'box', layout: 'horizontal',
          contents: [
            { type: 'text', text: icon + ' ' + label, size: 'sm', flex: 6, color: '#333333' },
            { type: 'text', text: String(count || 0) + ' ใบ', size: 'xs', flex: 3, align: 'center', color: '#555555' },
            { type: 'text', text: pct + '%', size: 'sm', flex: 3, align: 'end', weight: 'bold', color: color },
          ]
        },
        {
          type: 'box', layout: 'horizontal', margin: 'xs', height: '8px',
          backgroundColor: '#eeeeee', cornerRadius: '4px',
          contents: [
            { type: 'box', layout: 'vertical', flex: barFlex, backgroundColor: color, cornerRadius: '4px', contents: [] },
            { type: 'filler' },
          ]
        },
      ]
    };
  }

  // Conversion rates
  var sentRate  = f.draft  > 0 ? ((f.sent     || 0) / f.draft  * 100).toFixed(0) : '—';
  var closeRate = f.sent   > 0 ? ((f.accepted || 0) / f.sent   * 100).toFixed(0) : '—';
  var dropRate  = f.sent   > 0 ? ((f.rejected || 0) / f.sent   * 100).toFixed(0) : '—';

  var bodyContents = [];
  bodyContents.push(funnelRow('Draft',    f.draft,    '#90a4ae', '📝'));
  bodyContents.push(funnelRow('Sent',     f.sent,     '#42a5f5', '📤'));
  bodyContents.push(funnelRow('Accepted', f.accepted, '#66bb6a', '✅'));
  bodyContents.push(funnelRow('Rejected', f.rejected, '#ef5350', '❌'));

  bodyContents.push({ type: 'separator', margin: 'lg' });
  bodyContents.push({ type: 'text', text: 'Conversion Rates', size: 'xs', weight: 'bold', color: '#888888', margin: 'md' });
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'box', layout: 'vertical', flex: 1, alignItems: 'center', contents: [
        { type: 'text', text: sentRate + '%', size: 'md', weight: 'bold', color: '#42a5f5', align: 'center' },
        { type: 'text', text: 'Draft→Sent', size: 'xxs', color: '#888888', align: 'center' },
      ]},
      { type: 'separator' },
      { type: 'box', layout: 'vertical', flex: 1, alignItems: 'center', contents: [
        { type: 'text', text: closeRate + '%', size: 'md', weight: 'bold', color: '#66bb6a', align: 'center' },
        { type: 'text', text: 'Close Rate', size: 'xxs', color: '#888888', align: 'center' },
      ]},
      { type: 'separator' },
      { type: 'box', layout: 'vertical', flex: 1, alignItems: 'center', contents: [
        { type: 'text', text: dropRate + '%', size: 'md', weight: 'bold', color: '#ef5350', align: 'center' },
        { type: 'text', text: 'Drop Rate', size: 'xxs', color: '#888888', align: 'center' },
      ]},
    ]
  });

  return {
    type: 'flex',
    altText: '🔻 Sales Funnel — Close Rate ' + closeRate + '%',
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#263238',
        contents: [
          { type: 'text', text: '🔻 Sales Funnel', weight: 'bold', size: 'md', color: '#ffffff' },
          { type: 'text', text: 'Draft → Sent → Accepted', size: 'xxs', color: '#90a4ae', margin: 'xs' },
        ],
      },
      body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '14px' },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '10px',
        contents: [
          { type: 'button', action: { type: 'message', label: '📊 สรุปเดือน', text: 'สรุปเดือนนี้' }, style: 'secondary', flex: 1, height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📋 ดู Rejected', text: 'รายการ rejected' }, style: 'secondary', flex: 1, height: 'sm' },
        ],
      },
    },
  };
}

// Paginated quotation list (Phase D)
// quotations: [{ qt_number, customer_name, brand, size_kw, grand_total, status, created_at }]
// total: total count (across all pages) | page: current page (1-based)
function buildQuotationListFlex(quotations, total, page) {
  var list = Array.isArray(quotations) ? quotations : [];
  var currentPage = page || 1;
  var pageSize = list.length;
  var totalPages = pageSize > 0 ? Math.ceil((total || pageSize) / pageSize) : 1;

  var statusDot = { 'draft': '⬜', 'sent': '🟦', 'confirmed': '🟩', 'cancelled': '🟥' };

  var bodyContents = [];

  // Column header
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'none',
    contents: [
      { type: 'text', text: 'เลขที่', size: 'xxs', color: '#aaaaaa', flex: 4 },
      { type: 'text', text: 'ลูกค้า', size: 'xxs', color: '#aaaaaa', flex: 5 },
      { type: 'text', text: 'ราคา', size: 'xxs', color: '#aaaaaa', flex: 5, align: 'end' },
    ]
  });
  bodyContents.push({ type: 'separator', margin: 'sm' });

  list.forEach(function(qt) {
    var dot = statusDot[qt.status] || '⬜';
    var dateStr = qt.created_at ? String(qt.created_at).slice(5, 10) : '';
    bodyContents.push({
      type: 'box', layout: 'horizontal', margin: 'sm',
      action: { type: 'message', text: 'ดูใบเสนอ ' + (qt.qt_number || '') },
      contents: [
        {
          type: 'box', layout: 'vertical', flex: 4,
          contents: [
            { type: 'text', text: dot + ' ' + (qt.qt_number || '—'), size: 'xs', color: '#1a237e', weight: 'bold' },
            { type: 'text', text: (qt.brand || '') + ' ' + (qt.size_kw || '') + 'kW', size: 'xxs', color: '#888888' },
          ]
        },
        {
          type: 'box', layout: 'vertical', flex: 5,
          contents: [
            { type: 'text', text: (qt.customer_name || '—').slice(0, 14), size: 'xs', color: '#333333', wrap: false },
            { type: 'text', text: dateStr, size: 'xxs', color: '#aaaaaa' },
          ]
        },
        { type: 'text', text: '฿' + ((qt.grand_total || 0) / 1000).toFixed(0) + 'k',
          size: 'xs', flex: 3, align: 'end', weight: 'bold', color: '#E8941A' },
      ]
    });
  });

  if (list.length === 0) {
    bodyContents.push({ type: 'text', text: 'ไม่มีรายการ', size: 'sm', color: '#aaaaaa', align: 'center', margin: 'lg' });
  }

  // Pagination footer
  var pageInfo = 'หน้า ' + currentPage + '/' + totalPages + ' (' + (total || list.length) + ' รายการ)';
  var footerContents = [
    { type: 'text', text: pageInfo, size: 'xxs', color: '#aaaaaa', align: 'center', margin: 'none' },
    {
      type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm',
      contents: [
        currentPage > 1
          ? { type: 'button', action: { type: 'message', label: '◀ ก่อนหน้า', text: 'รายการหน้า ' + (currentPage - 1) }, style: 'secondary', flex: 1, height: 'sm' }
          : { type: 'filler', flex: 1 },
        { type: 'button', action: { type: 'message', label: '🔍 กรอง', text: 'กรองรายการ' }, style: 'secondary', flex: 1, height: 'sm' },
        currentPage < totalPages
          ? { type: 'button', action: { type: 'message', label: 'ถัดไป ▶', text: 'รายการหน้า ' + (currentPage + 1) }, style: 'primary', color: '#E8941A', flex: 1, height: 'sm' }
          : { type: 'filler', flex: 1 },
      ]
    }
  ];

  return {
    type: 'flex',
    altText: '📋 รายการใบเสนอราคา หน้า ' + currentPage + '/' + totalPages,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'horizontal', paddingAll: '12px', backgroundColor: '#37474f',
        contents: [
          { type: 'text', text: '📋 รายการใบเสนอราคา', weight: 'bold', size: 'md', color: '#ffffff', flex: 8 },
          { type: 'text', text: pageInfo, size: 'xxs', color: '#90a4ae', flex: 4, align: 'end', wrap: true },
        ],
      },
      body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '12px' },
      footer: { type: 'box', layout: 'vertical', contents: footerContents, paddingAll: '10px' },
    },
  };
}

// PDF preview card with thumbnail — S4 (v2.2)
// Shown immediately after PDF generation, before user downloads.
//
// result: { qt_number, brand, size_kw, phase, customer_name, grand_total,
//           has_battery?, has_backup?, page_count? }
// pdfUrl: full public URL to download PDF
// thumbnailUrl: optional — URL to a PNG thumbnail of page 1 (generated server-side)
//               If omitted, shows a styled placeholder card instead of hero image.
function buildPdfPreviewFlex(result, pdfUrl, thumbnailUrl) {
  var r = result || {};
  var systemLabel = (r.brand || '').toUpperCase() + ' ' + (r.size_kw || '') + 'kW ' + (r.phase || '');
  var systemType  = r.has_battery ? ('Battery' + (r.has_backup ? ' + Backup' : '')) : 'On-Grid';
  var priceStr    = r.grand_total != null ? '฿' + Number(r.grand_total).toLocaleString() : '';
  var pageLabel   = r.page_count ? r.page_count + ' หน้า' : 'PDF';
  var qtLabel     = r.qt_number ? '📋 ' + r.qt_number : '📋 ใบเสนอราคา';

  // ── Hero image (thumbnail) or styled placeholder ─────────
  var heroBlock;
  if (thumbnailUrl) {
    heroBlock = {
      type: 'image',
      url: thumbnailUrl,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
      action: { type: 'uri', label: 'เปิด PDF', uri: pdfUrl },
    };
  } else {
    // Placeholder hero drawn as a box with centered text
    heroBlock = {
      type: 'box',
      layout: 'vertical',
      height: '130px',
      backgroundColor: '#fff8e1',
      justifyContent: 'center',
      alignItems: 'center',
      action: { type: 'uri', label: 'เปิด PDF', uri: pdfUrl },
      contents: [
        { type: 'text', text: '📄', size: 'xxl', align: 'center' },
        { type: 'text', text: pageLabel, size: 'xs', color: '#888888', align: 'center', margin: 'xs' },
        { type: 'text', text: 'กดเพื่อเปิด PDF', size: 'xxs', color: '#aaaaaa', align: 'center' },
      ],
    };
  }

  var bodyContents = [
    { type: 'text', text: qtLabel, weight: 'bold', size: 'md', color: '#1a237e', wrap: true },
    { type: 'text', text: systemLabel.trim(), size: 'sm', color: '#E8941A', margin: 'xs', weight: 'bold' },
    { type: 'text', text: systemType + (r.customer_name ? ' • ' + r.customer_name : ''), size: 'xs', color: '#666666', margin: 'xs' },
    { type: 'separator', margin: 'md' },
    {
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        { type: 'text', text: 'ราคารวม', size: 'xs', flex: 4, color: '#888888' },
        { type: 'text', text: priceStr, size: 'md', flex: 8, align: 'end', weight: 'bold', color: '#E8941A' },
      ],
    },
  ];

  return {
    type: 'flex',
    altText: qtLabel + ' — ' + systemLabel.trim() + (priceStr ? ' • ' + priceStr : '') + ' — กดเพื่อดาวน์โหลด PDF',
    contents: {
      type: 'bubble',
      size: 'kilo',
      hero: heroBlock,
      body: {
        type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '14px',
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          {
            type: 'button',
            action: { type: 'uri', label: '📥 ดาวน์โหลด PDF', uri: pdfUrl },
            style: 'primary', color: '#E8941A',
          },
          {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '✏️ แก้ไข', text: 'แก้ไข ' + (r.qt_number || '') }, style: 'secondary', flex: 1 },
              { type: 'button', action: { type: 'message', label: '📤 ส่งลูกค้า', text: 'ส่ง ' + (r.qt_number || '') + ' ให้ลูกค้า' }, style: 'secondary', flex: 1 },
            ],
          },
        ],
      },
    },
  };
}

// ══════════════════════════════════════════════════════════════
//  ADMIN LINE COMMANDS — v3.0 (9 builders)
// ══════════════════════════════════════════════════════════════

// ── Shared admin header helper ───────────────────────────────
function _adminHeader(icon, title, sub, bgColor) {
  return {
    type: 'box', layout: 'vertical', paddingAll: '12px',
    backgroundColor: bgColor || '#1a237e',
    contents: [
      { type: 'text', text: icon + ' ' + title, weight: 'bold', size: 'md', color: '#ffffff' },
      sub ? { type: 'text', text: sub, size: 'xxs', color: 'rgba(255,255,255,0.65)', margin: 'xs' } : { type: 'filler' },
    ],
  };
}

function _adminFooter(buttons) {
  return {
    type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '10px',
    contents: buttons,
  };
}

function _adminRow(label, value, valueColor) {
  return {
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: label, size: 'xs', flex: 5, color: '#555555' },
      { type: 'text', text: String(value != null ? value : '—'), size: 'xs', flex: 7, align: 'end',
        weight: 'bold', color: valueColor || '#1a237e', wrap: true },
    ],
  };
}

function _adminBtn(label, text, color, style) {
  return { type: 'button', action: { type: 'message', label: label, text: text },
           style: style || 'primary', color: color || '#1a237e', height: 'sm' };
}

// ── 1. buildAdminPriceEditFlex ────────────────────────────────
// Confirm bulk price update for a brand across all models.
// changes: [{ model, old_price, new_price }]
function buildAdminPriceEditFlex(brand, changes, source) {
  var list = Array.isArray(changes) ? changes : [];
  var body = [];
  body.push({ type: 'text', text: (brand || '').toUpperCase() + ' — ' + list.length + ' รายการ',
              weight: 'bold', size: 'sm', color: '#1a237e' });
  body.push({ type: 'separator', margin: 'md' });
  body.push({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: 'รุ่น', size: 'xxs', color: '#aaaaaa', flex: 5 },
      { type: 'text', text: 'เดิม', size: 'xxs', color: '#aaaaaa', flex: 4, align: 'center' },
      { type: 'text', text: 'ใหม่', size: 'xxs', color: '#aaaaaa', flex: 4, align: 'end' },
    ]
  });
  list.slice(0, 6).forEach(function(c) {
    var diff = (c.new_price || 0) - (c.old_price || 0);
    var vc = diff > 0 ? '#e53935' : diff < 0 ? '#27ae60' : '#555555';
    body.push({
      type: 'box', layout: 'horizontal', margin: 'xs',
      contents: [
        { type: 'text', text: String(c.model || '').slice(0, 16), size: 'xs', flex: 5, color: '#333333' },
        { type: 'text', text: '฿' + Number(c.old_price || 0).toLocaleString(), size: 'xs', flex: 4, align: 'center', color: '#aaaaaa', decoration: 'line-through' },
        { type: 'text', text: '฿' + Number(c.new_price || 0).toLocaleString(), size: 'xs', flex: 4, align: 'end', weight: 'bold', color: vc },
      ],
    });
  });
  if (list.length > 6) body.push({ type: 'text', text: '+ อีก ' + (list.length - 6) + ' รุ่น', size: 'xxs', color: '#aaaaaa', margin: 'xs', align: 'center' });
  if (source) { body.push({ type: 'separator', margin: 'md' }); body.push({ type: 'text', text: 'แหล่งข้อมูล: ' + source, size: 'xxs', color: '#aaaaaa', margin: 'sm' }); }

  return {
    type: 'flex', altText: '🔑 แก้ราคา ' + (brand || '') + ' ' + list.length + ' รุ่น',
    contents: {
      type: 'bubble', size: 'kilo',
      header: _adminHeader('🔑', 'Admin: แก้ราคา ' + (brand || '').toUpperCase(), 'ตรวจสอบก่อนยืนยัน', '#b71c1c'),
      body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '12px' },
      footer: _adminFooter([
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          _adminBtn('✅ อัพเดท+Sync', 'admin ยืนยันราคา ' + (brand || '') + ' sync', '#b71c1c'),
          _adminBtn('💾 อัพเดทอย่างเดียว', 'admin ยืนยันราคา ' + (brand || ''), '#555555', 'secondary'),
        ]},
        _adminBtn('↩️ ยกเลิก', 'admin ยกเลิกราคา', '#888888', 'secondary'),
      ]),
    },
  };
}

// ── 2. buildAdminFormulaEditFlex ──────────────────────────────
// formulas: [{ name, old_val, new_val, unit, scope }]
function buildAdminFormulaEditFlex(formulas, affectedQuotations) {
  var list = Array.isArray(formulas) ? formulas : [];
  var body = [];
  body.push({ type: 'text', text: list.length + ' สูตรที่จะเปลี่ยน', weight: 'bold', size: 'sm', color: '#4a148c' });
  body.push({ type: 'separator', margin: 'md' });
  list.forEach(function(f) {
    var diff = (f.new_val || 0) - (f.old_val || 0);
    var sign = diff >= 0 ? '+' : '';
    var vc = diff > 0 ? '#e53935' : diff < 0 ? '#27ae60' : '#555555';
    body.push({ type: 'box', layout: 'vertical', margin: 'md', contents: [
      { type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: f.name || '—', size: 'sm', weight: 'bold', flex: 7, color: '#4a148c' },
        { type: 'text', text: sign + diff + (f.unit || ''), size: 'xs', flex: 5, align: 'end', color: vc, weight: 'bold' },
      ]},
      { type: 'box', layout: 'horizontal', margin: 'xs', contents: [
        { type: 'text', text: String(f.old_val || 0) + (f.unit || ''), size: 'xs', flex: 5, color: '#aaaaaa', decoration: 'line-through' },
        { type: 'text', text: '→ ' + String(f.new_val || 0) + (f.unit || ''), size: 'xs', flex: 7, align: 'end', color: '#333333' },
      ]},
      f.scope ? { type: 'text', text: 'ผล: ' + f.scope, size: 'xxs', color: '#888888', margin: 'xs' } : { type: 'filler' },
    ]});
  });
  if (affectedQuotations != null) {
    body.push({ type: 'separator', margin: 'md' });
    body.push({ type: 'text', text: '⚠️ ใบเสนอราคาที่จะคำนวณใหม่: ' + affectedQuotations + ' ใบ', size: 'xs', color: '#e65100', margin: 'md', wrap: true });
  }
  return {
    type: 'flex', altText: '⚙️ Admin: แก้สูตรคำนวณ ' + list.length + ' รายการ',
    contents: {
      type: 'bubble', size: 'kilo',
      header: _adminHeader('⚙️', 'Admin: แก้สูตรคำนวณ', 'ผลต่อ quotation ทุกใบใหม่', '#4a148c'),
      body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '12px' },
      footer: _adminFooter([
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          _adminBtn('✅ ยืนยัน', 'admin ยืนยันสูตร', '#4a148c'),
          _adminBtn('↩️ ยกเลิก', 'admin ยกเลิกสูตร', '#888888', 'secondary'),
        ]},
      ]),
    },
  };
}

// ── 3. buildAdminTierEditFlex ─────────────────────────────────
// tiers: [{ label, min_kw, max_kw, labor_rate, old_labor_rate }]
function buildAdminTierEditFlex(tiers, tierType) {
  var list = Array.isArray(tiers) ? tiers : [];
  var body = [];
  body.push({ type: 'text', text: (tierType || 'ค่าแรง') + ' Tier (' + list.length + ' ช่วง)', weight: 'bold', size: 'sm', color: '#004d40' });
  body.push({ type: 'separator', margin: 'md' });
  body.push({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: 'ช่วง kW', size: 'xxs', color: '#aaaaaa', flex: 4 },
      { type: 'text', text: 'เดิม', size: 'xxs', color: '#aaaaaa', flex: 4, align: 'center' },
      { type: 'text', text: 'ใหม่', size: 'xxs', color: '#aaaaaa', flex: 4, align: 'end' },
    ]
  });
  list.forEach(function(t) {
    var changed = t.old_labor_rate != null && t.old_labor_rate !== t.labor_rate;
    var vc = changed ? '#e65100' : '#333333';
    body.push({
      type: 'box', layout: 'horizontal', margin: 'xs',
      contents: [
        { type: 'text', text: (t.min_kw || 0) + '–' + (t.max_kw || '∞') + ' kW', size: 'xs', flex: 4, color: '#555555' },
        { type: 'text', text: t.old_labor_rate != null ? String(t.old_labor_rate) : '—', size: 'xs', flex: 4, align: 'center', color: '#aaaaaa', decoration: changed ? 'line-through' : 'none' },
        { type: 'text', text: String(t.labor_rate || 0), size: 'xs', flex: 4, align: 'end', weight: 'bold', color: vc },
      ],
    });
  });
  return {
    type: 'flex', altText: '📊 Admin: แก้ Tier ' + (tierType || 'ค่าแรง'),
    contents: {
      type: 'bubble', size: 'kilo',
      header: _adminHeader('📊', 'Admin: แก้ Tier ' + (tierType || 'ค่าแรง'), 'ราคาต่อหน่วย แบ่งตามขนาดระบบ', '#004d40'),
      body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '12px' },
      footer: _adminFooter([
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          _adminBtn('✅ ยืนยัน', 'admin ยืนยัน tier ' + (tierType || ''), '#004d40'),
          _adminBtn('↩️ ยกเลิก', 'admin ยกเลิก tier', '#888888', 'secondary'),
        ]},
      ]),
    },
  };
}

// ── 4. buildAdminAnalyticsFlex ────────────────────────────────
// Compact analytics snapshot for admin: revenue, quotes, top brand, close rate, MoM growth.
// stats: { period, total_quotes, total_revenue, prev_revenue, close_rate, avg_size_kw,
//          top_brand, top_brand_count, funnel: {draft,sent,accepted,rejected} }
function buildAdminAnalyticsFlex(stats) {
  var s = stats || {};
  var growth = s.prev_revenue > 0 ? ((s.total_revenue - s.prev_revenue) / s.prev_revenue * 100).toFixed(1) : null;
  var growthSign = growth != null && parseFloat(growth) >= 0 ? '+' : '';
  var growthColor = growth != null ? (parseFloat(growth) >= 0 ? '#27ae60' : '#e53935') : '#888888';
  var closeRate = s.close_rate != null ? (s.close_rate * 100).toFixed(1) + '%' : '—';
  var body = [
    _adminRow('ช่วงเวลา', s.period || '—'),
    _adminRow('ใบเสนอราคา', s.total_quotes || 0),
    _adminRow('ยอดรวม', s.total_revenue ? '฿' + Number(s.total_revenue).toLocaleString() : '—', '#E8941A'),
    growth != null ? _adminRow('เติบโต MoM', growthSign + growth + '%', growthColor) : null,
    _adminRow('ขนาดเฉลี่ย', s.avg_size_kw ? s.avg_size_kw.toFixed(1) + ' kW' : '—'),
    _adminRow('Close Rate', closeRate, parseFloat(closeRate) >= 50 ? '#27ae60' : '#e53935'),
    _adminRow('Brand ขายดี', s.top_brand ? s.top_brand + ' (' + s.top_brand_count + ')' : '—'),
  ].filter(Boolean);

  if (s.funnel) {
    var f = s.funnel;
    body.push({ type: 'separator', margin: 'md' });
    body.push({ type: 'text', text: 'Funnel', size: 'xs', weight: 'bold', color: '#555555', margin: 'md' });
    var tot = f.draft || 1;
    [['Draft', f.draft, '#90a4ae'], ['Sent', f.sent, '#42a5f5'], ['Accepted', f.accepted, '#66bb6a'], ['Rejected', f.rejected, '#ef5350']].forEach(function(row) {
      var pct = Math.round((row[1] || 0) / tot * 100);
      body.push({ type: 'box', layout: 'horizontal', margin: 'xs', contents: [
        { type: 'text', text: row[0], size: 'xxs', flex: 4, color: '#555555' },
        { type: 'box', layout: 'horizontal', flex: 8, height: '6px', backgroundColor: '#eeeeee', cornerRadius: '3px',
          contents: [{ type: 'box', layout: 'vertical', flex: Math.max(1, pct), backgroundColor: row[2], cornerRadius: '3px', contents: [] }, { type: 'filler' }] },
        { type: 'text', text: pct + '%', size: 'xxs', flex: 2, align: 'end', color: row[2] },
      ]});
    });
  }

  return {
    type: 'flex', altText: '📈 Admin Analytics — ' + (s.period || '') + ' ฿' + Number(s.total_revenue || 0).toLocaleString(),
    contents: {
      type: 'bubble', size: 'kilo',
      header: _adminHeader('📈', 'Admin: Analytics', s.period || '', '#0d47a1'),
      body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '12px' },
      footer: _adminFooter([
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          _adminBtn('📋 รายการ', 'admin รายการทั้งหมด', '#0d47a1'),
          _adminBtn('📦 Top Products', 'top products', '#1565c0', 'secondary'),
          _adminBtn('🔻 Funnel', 'admin funnel', '#1565c0', 'secondary'),
        ]},
      ]),
    },
  };
}

// ── 5. buildAdminHealthFlex ────────────────────────────────────
// Fleet + service health status card.
// health: { timestamp, services: [{name, status, latency_ms?, error?}],
//           fleet: {total, alive, dead, unknown} }
function buildAdminHealthFlex(health) {
  var h = health || {};
  var svc = Array.isArray(h.services) ? h.services : [];
  var fleet = h.fleet || {};
  var statusIcon = { ok: '🟢', warn: '🟡', crit: '🔴', unknown: '⚪' };
  var ts = h.timestamp ? String(h.timestamp).slice(0, 19).replace('T', ' ') : '';

  var body = [];

  // Fleet row
  if (fleet.total != null) {
    body.push({ type: 'text', text: 'Fleet', size: 'xs', weight: 'bold', color: '#555555' });
    body.push({
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: '🟢 ' + (fleet.alive || 0) + ' alive', size: 'xs', flex: 3, color: '#27ae60' },
        { type: 'text', text: '🔴 ' + (fleet.dead || 0) + ' dead', size: 'xs', flex: 3, align: 'center', color: (fleet.dead || 0) > 0 ? '#e53935' : '#aaaaaa' },
        { type: 'text', text: '⚪ ' + (fleet.unknown || 0), size: 'xs', flex: 2, align: 'end', color: '#888888' },
        { type: 'text', text: '/' + (fleet.total || 0) + ' total', size: 'xs', flex: 3, align: 'end', color: '#555555' },
      ],
    });
    if (svc.length > 0) body.push({ type: 'separator', margin: 'md' });
  }

  // Service rows
  if (svc.length > 0) {
    body.push({ type: 'text', text: 'Services', size: 'xs', weight: 'bold', color: '#555555', margin: fleet.total != null ? 'md' : 'none' });
    svc.forEach(function(s) {
      var icon = statusIcon[s.status] || '⚪';
      var latency = s.latency_ms != null ? ' (' + s.latency_ms + 'ms)' : '';
      var errTxt = s.error ? ' — ' + String(s.error).slice(0, 30) : '';
      body.push({
        type: 'box', layout: 'horizontal', margin: 'sm',
        contents: [
          { type: 'text', text: icon + ' ' + (s.name || '—'), size: 'xs', flex: 7, color: s.status === 'crit' ? '#e53935' : '#333333' },
          { type: 'text', text: latency + errTxt, size: 'xxs', flex: 5, align: 'end', color: '#888888', wrap: false },
        ],
      });
    });
  }

  if (!body.length) {
    body.push({ type: 'text', text: 'ไม่มีข้อมูล health', size: 'sm', color: '#aaaaaa', align: 'center' });
  }

  var overallCrit = svc.some(function(s) { return s.status === 'crit'; }) || (fleet.dead || 0) > 0;
  var bgColor = overallCrit ? '#b71c1c' : '#1b5e20';

  return {
    type: 'flex', altText: (overallCrit ? '🔴' : '🟢') + ' Admin Health — ' + (ts || 'now'),
    contents: {
      type: 'bubble', size: 'kilo',
      header: _adminHeader(overallCrit ? '🔴' : '🟢', 'Admin: System Health', ts, bgColor),
      body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '12px' },
      footer: _adminFooter([
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          _adminBtn('🔄 Refresh', 'admin health', bgColor),
          _adminBtn('📋 Audit Log', 'admin audit log', '#555555', 'secondary'),
          _adminBtn('📊 Analytics', 'admin analytics', '#555555', 'secondary'),
        ]},
      ]),
    },
  };
}

// ── 6. buildAdminAuditLogFlex ─────────────────────────────────
// logs: [{ ts, action, userId, detail }]
// filter: e.g. { userId: 'Uxxxx' } or { action: 'qt_create' }
function buildAdminAuditLogFlex(logs, filter, totalCount) {
  var list = Array.isArray(logs) ? logs.slice(0, 10) : [];
  var filterLabel = filter && filter.userId ? 'user: ' + filter.userId.slice(0, 10) + '...'
    : filter && filter.action ? 'action: ' + filter.action : 'ล่าสุด';

  var actionColor = {
    qt_create: '#27ae60', qt_view: '#42a5f5', bom_create: '#1565c0',
    admin_auth_fail: '#e53935', rate_limit: '#ff6f00', price_update: '#6a1b9a',
  };

  var body = [];
  body.push({ type: 'text', text: filterLabel + (totalCount != null ? ' (' + totalCount + ' รายการ)' : ''), size: 'xs', color: '#555555' });
  body.push({ type: 'separator', margin: 'sm' });

  list.forEach(function(log) {
    var timeStr = log.ts ? String(log.ts).slice(11, 19) : '';
    var color = actionColor[log.action] || '#555555';
    body.push({
      type: 'box', layout: 'vertical', margin: 'sm',
      contents: [
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: log.action || '—', size: 'xs', flex: 7, weight: 'bold', color: color },
          { type: 'text', text: timeStr, size: 'xxs', flex: 3, align: 'end', color: '#aaaaaa' },
        ]},
        { type: 'text', text: (log.userId ? log.userId.slice(0, 12) + '… ' : '') + String(log.detail || '').slice(0, 40),
          size: 'xxs', color: '#888888', margin: 'xs', wrap: true },
      ],
    });
  });

  if (!list.length) {
    body.push({ type: 'text', text: 'ไม่มี log', size: 'sm', color: '#aaaaaa', align: 'center', margin: 'md' });
  }

  return {
    type: 'flex', altText: '📋 Admin Audit Log — ' + filterLabel,
    contents: {
      type: 'bubble', size: 'kilo',
      header: _adminHeader('📋', 'Admin: Audit Log', filterLabel, '#37474f'),
      body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '12px' },
      footer: _adminFooter([
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          _adminBtn('🔍 กรอง user', 'admin audit user ', '#37474f'),
          _adminBtn('⚠️ Auth fails', 'admin audit action admin_auth_fail', '#b71c1c', 'secondary'),
        ]},
      ]),
    },
  };
}

// ── 7. buildAdminRetentionFlex ────────────────────────────────
// preview: { run_date, target_users: [{userId, last_quote_date, days_since, qt_count}],
//            message_preview: string, total_eligible: number }
function buildAdminRetentionFlex(preview) {
  var p = preview || {};
  var targets = Array.isArray(p.target_users) ? p.target_users.slice(0, 6) : [];
  var body = [];

  body.push({ type: 'box', layout: 'horizontal', contents: [
    { type: 'text', text: 'ส่งให้', size: 'xs', flex: 4, color: '#555555' },
    { type: 'text', text: String(p.total_eligible || targets.length) + ' users', size: 'sm', flex: 8, align: 'end', weight: 'bold', color: '#1565c0' },
  ]});
  body.push({ type: 'separator', margin: 'md' });

  targets.forEach(function(u) {
    body.push({
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: (u.userId || '').slice(1, 9) + '…', size: 'xs', flex: 5, color: '#333333', wrap: false },
        { type: 'text', text: u.days_since + 'd ago', size: 'xxs', flex: 3, align: 'center', color: '#888888' },
        { type: 'text', text: u.qt_count + ' ใบ', size: 'xxs', flex: 4, align: 'end', color: '#555555' },
      ],
    });
  });
  if ((p.total_eligible || 0) > 6) {
    body.push({ type: 'text', text: '+ อีก ' + ((p.total_eligible || 0) - 6) + ' users', size: 'xxs', color: '#aaaaaa', margin: 'xs', align: 'center' });
  }

  if (p.message_preview) {
    body.push({ type: 'separator', margin: 'md' });
    body.push({ type: 'text', text: 'ข้อความ:', size: 'xxs', weight: 'bold', color: '#555555', margin: 'md' });
    body.push({ type: 'text', text: p.message_preview.slice(0, 80) + (p.message_preview.length > 80 ? '…' : ''),
                size: 'xxs', color: '#555555', wrap: true, margin: 'xs' });
  }

  var runLabel = p.run_date ? p.run_date.slice(0, 10) : 'ทันที';

  return {
    type: 'flex', altText: '📣 Admin Retention — ส่ง ' + (p.total_eligible || 0) + ' users ' + runLabel,
    contents: {
      type: 'bubble', size: 'kilo',
      header: _adminHeader('📣', 'Admin: Retention Push', 'ส่ง LINE notify หา inactive users', '#e65100'),
      body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '12px' },
      footer: _adminFooter([
        _adminBtn('🚀 ส่งเดี๋ยวนี้ (' + (p.total_eligible || 0) + ' คน)', 'admin retention run', '#e65100'),
        _adminBtn('↩️ ยกเลิก', 'admin retention cancel', '#888888', 'secondary'),
      ]),
    },
  };
}

// ── 8. buildAdminExportFlex ───────────────────────────────────
// exports: [{ label, type, description, record_count?, last_exported? }]
// type: 'qt-csv' | 'bom-csv' | 'audit-csv' | 'db-backup'
function buildAdminExportFlex(exports, requestedBy) {
  var list = Array.isArray(exports) ? exports : [
    { label: '📋 QT CSV', type: 'qt-csv',    description: 'ใบเสนอราคาทั้งหมด' },
    { label: '📦 BOM CSV', type: 'bom-csv',   description: 'BOM ทั้งหมด' },
    { label: '🔍 Audit CSV', type: 'audit-csv', description: 'Audit log ทั้งหมด' },
    { label: '💾 DB Backup', type: 'db-backup', description: 'SQLite .db file' },
  ];

  var body = [];
  body.push({ type: 'text', text: 'Export ' + list.length + ' รูปแบบ' + (requestedBy ? ' — req: ' + requestedBy.slice(0, 10) : ''), size: 'xs', color: '#555555' });
  body.push({ type: 'separator', margin: 'md' });

  list.forEach(function(ex) {
    body.push({
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        { type: 'box', layout: 'vertical', flex: 7, contents: [
          { type: 'text', text: ex.label, size: 'sm', weight: 'bold', color: '#1a237e' },
          { type: 'text', text: ex.description + (ex.record_count != null ? ' (' + ex.record_count + ')' : ''), size: 'xxs', color: '#888888' },
          ex.last_exported ? { type: 'text', text: 'Last: ' + String(ex.last_exported).slice(0, 10), size: 'xxs', color: '#aaaaaa' } : { type: 'filler' },
        ]},
        { type: 'button', action: { type: 'message', label: 'Export', text: 'admin export ' + ex.type },
          style: 'secondary', flex: 3, height: 'sm' },
      ],
    });
  });

  return {
    type: 'flex', altText: '💾 Admin Export — ' + list.length + ' รูปแบบ',
    contents: {
      type: 'bubble', size: 'kilo',
      header: _adminHeader('💾', 'Admin: Export Data', 'ข้อมูลเป็น CSV / DB backup', '#1a237e'),
      body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '12px' },
      footer: _adminFooter([
        _adminBtn('📥 Export ทั้งหมด', 'admin export all', '#1a237e'),
        _adminBtn('↩️ กลับ', 'admin menu', '#888888', 'secondary'),
      ]),
    },
  };
}

// ── 9. buildAdminDeleteUserFlex ───────────────────────────────
// user: { userId, display_name?, qt_count, bom_count, last_active }
function buildAdminDeleteUserFlex(user) {
  var u = user || {};
  var displayId = (u.userId || '—').slice(0, 14) + '…';
  var body = [
    { type: 'text', text: '⚠️ การลบนี้ไม่สามารถยกเลิกได้', size: 'xs', weight: 'bold', color: '#b71c1c', wrap: true },
    { type: 'separator', margin: 'md' },
    _adminRow('User ID', displayId),
    u.display_name ? _adminRow('ชื่อ', u.display_name) : null,
    _adminRow('ใบเสนอราคา', u.qt_count != null ? u.qt_count + ' ใบ' : '—', (u.qt_count || 0) > 0 ? '#e53935' : '#555555'),
    _adminRow('BOM', u.bom_count != null ? u.bom_count + ' รายการ' : '—'),
    _adminRow('ใช้งานล่าสุด', u.last_active ? String(u.last_active).slice(0, 10) : '—'),
    { type: 'separator', margin: 'md' },
    { type: 'text', text: 'ข้อมูลทั้งหมดของ user นี้จะถูกลบออกจาก DB ถาวร', size: 'xxs', color: '#e53935', margin: 'md', wrap: true },
  ].filter(Boolean);

  return {
    type: 'flex', altText: '🗑️ Admin: ยืนยันลบ user ' + displayId,
    contents: {
      type: 'bubble', size: 'kilo',
      header: _adminHeader('🗑️', 'Admin: ลบ User Data', 'IRREVERSIBLE — ตรวจสอบให้ดีก่อน', '#b71c1c'),
      body: { type: 'box', layout: 'vertical', contents: body, paddingAll: '12px' },
      footer: _adminFooter([
        _adminBtn('🗑️ ยืนยันลบ', 'admin delete user ' + (u.userId || ''), '#b71c1c'),
        _adminBtn('↩️ ยกเลิก', 'admin delete cancel', '#555555', 'secondary'),
      ]),
    },
  };
}

module.exports = {
  menuFlex: menuFlex,
  addItemFlex: addItemFlex,
  buildBomResultFlex: buildBomResultFlex,
  buildFullBomDetailFlex: buildFullBomDetailFlex,
  buildPreviewFlex: buildPreviewFlex,
  buildBomPdfDownloadFlex: buildBomPdfDownloadFlex,
  buildQuotationPdfFlex: buildQuotationPdfFlex,
  buildBomViewFlex: buildBomViewFlex,
  buildQuotationDetailFlex: buildQuotationDetailFlex,
  buildQuotationDiffFlex: buildQuotationDiffFlex,
  buildQuotationSearchResultFlex: buildQuotationSearchResultFlex,
  buildQuotationHistoryFlex: buildQuotationHistoryFlex,
  buildVersionHistoryFlex: buildVersionHistoryFlex,
  buildPriceUpdateDiffFlex: buildPriceUpdateDiffFlex,
  buildProductPriceEditFlex: buildProductPriceEditFlex,
  buildFormulaEditFlex: buildFormulaEditFlex,
  buildMonthlySummaryFlex: buildMonthlySummaryFlex,
  buildTopProductsFlex: buildTopProductsFlex,
  buildSalesFunnelFlex: buildSalesFunnelFlex,
  buildQuotationListFlex: buildQuotationListFlex,
  buildPdfPreviewFlex: buildPdfPreviewFlex,
  buildAdminPriceEditFlex: buildAdminPriceEditFlex,
  buildAdminFormulaEditFlex: buildAdminFormulaEditFlex,
  buildAdminTierEditFlex: buildAdminTierEditFlex,
  buildAdminAnalyticsFlex: buildAdminAnalyticsFlex,
  buildAdminHealthFlex: buildAdminHealthFlex,
  buildAdminAuditLogFlex: buildAdminAuditLogFlex,
  buildAdminRetentionFlex: buildAdminRetentionFlex,
  buildAdminExportFlex: buildAdminExportFlex,
  buildAdminDeleteUserFlex: buildAdminDeleteUserFlex,
};
