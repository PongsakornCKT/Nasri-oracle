'use strict';

/**
 * stock-flex.js — LINE V3 PR-5: Flex builders for warehouse stock lookup.
 *
 * Data comes from the WP read-bridge (`GET /lf/v1/bot/stock`), which runs the
 * inventory query under a non-admin context so `strip_costs()` removes every
 * cost/margin field before it ever leaves WordPress. These builders therefore
 * never reference a cost field — and `assertNoCostFields()` is exported so the
 * test suite can prove it stays that way.
 *
 * pa Oracle — Eye of Ma'at 𓂀 | 2026-08-21
 */

var WAREHOUSE_LABELS = {
  MAIN: 'คลังหลัก',
  SUPPLIER: 'ซัพพลายเออร์',
  CUSTOMER: 'หน้างานลูกค้า',
};

var COST_KEY_RE = /(cost|margin|ทุน|กำไร|purchase_price|buy_price)/i;

/** Defensive: bridge should already strip costs — refuse to render if it did not. */
function assertNoCostFields(payload) {
  var offenders = [];
  (function walk(node, path) {
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach(function(key) {
      var here = path ? path + '.' + key : key;
      if (COST_KEY_RE.test(key)) offenders.push(here);
      walk(node[key], here);
    });
  })(payload, '');
  return offenders;
}

function num(value) {
  var n = Number(value);
  if (!isFinite(n)) return 0;
  return n;
}

function fmt(value) {
  var n = num(value);
  return (Math.round(n * 100) / 100).toLocaleString('en-US');
}

function stockTone(item) {
  var available = num(item && item.available);
  var reorder = num(item && item.reorder_point);
  if (available <= 0) return { color: '#c62828', label: 'หมด' };
  if (reorder > 0 && available <= reorder) return { color: '#ef6c00', label: 'ใกล้หมด' };
  return { color: '#2e7d32', label: 'พร้อมจ่าย' };
}

function warehouseRows(item) {
  var houses = (item && item.warehouses) || {};
  return Object.keys(WAREHOUSE_LABELS).map(function(code) {
    var entry = houses[code] || {};
    var reserved = num(entry.reserved);
    var valueText = fmt(entry.available) + (reserved ? ' (จอง ' + fmt(reserved) + ')' : '');
    return {
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: WAREHOUSE_LABELS[code], size: 'xs', color: '#666666', flex: 5 },
        { type: 'text', text: valueText, size: 'xs', color: '#333333', flex: 4, align: 'end', wrap: true },
      ],
    };
  });
}

function buildStockBubble(item) {
  var tone = stockTone(item);
  var name = String((item && item.item) || 'ไม่ทราบชื่อสินค้า');
  var sku = String((item && item.sku) || '');
  var body = [
    { type: 'text', text: name, weight: 'bold', size: 'sm', wrap: true, color: '#1a1a2e' },
  ];
  if (sku) body.push({ type: 'text', text: 'SKU: ' + sku, size: 'xxs', color: '#888888', margin: 'xs' });
  body.push({ type: 'separator', margin: 'md' });
  body.push({
    type: 'box', layout: 'baseline', margin: 'md',
    contents: [
      { type: 'text', text: 'คงเหลือรวม', size: 'xs', color: '#666666', flex: 4 },
      { type: 'text', text: fmt(item && item.available), size: 'lg', weight: 'bold', color: tone.color, flex: 5, align: 'end' },
    ],
  });
  warehouseRows(item).forEach(function(row) { body.push(row); });

  var reorder = num(item && item.reorder_point);
  if (reorder > 0) {
    body.push({ type: 'text', text: 'จุดสั่งซื้อซ้ำ: ' + fmt(reorder), size: 'xxs', color: '#888888', margin: 'md' });
  }

  return {
    type: 'bubble', size: 'kilo',
    header: {
      type: 'box', layout: 'horizontal', backgroundColor: '#f0e68c', paddingAll: '12px',
      contents: [
        { type: 'text', text: '📦 สต็อก', weight: 'bold', size: 'sm', color: '#1a1a2e', flex: 3 },
        { type: 'text', text: tone.label, size: 'xs', weight: 'bold', color: tone.color, flex: 2, align: 'end' },
      ],
    },
    body: { type: 'box', layout: 'vertical', paddingAll: '14px', contents: body },
  };
}

/**
 * items: array from the bridge. Returns a Flex message, or a plain-text style
 * bubble when nothing matched. Throws only if the payload smuggles cost fields.
 */
function buildStockFlex(items, query) {
  var list = Array.isArray(items) ? items : [];
  var offenders = assertNoCostFields(list);
  if (offenders.length) {
    throw new Error('stock payload contains forbidden cost fields: ' + offenders.join(', '));
  }

  if (!list.length) {
    return {
      type: 'flex', altText: 'ไม่พบสินค้าในคลัง',
      contents: {
        type: 'bubble', size: 'kilo',
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          contents: [
            { type: 'text', text: '📦 ไม่พบสินค้าในคลัง', weight: 'bold', size: 'sm', color: '#1a1a2e' },
            { type: 'text', text: 'ค้นหา: ' + String(query || ''), size: 'xs', color: '#888888', margin: 'sm', wrap: true },
            { type: 'text', text: 'ลองพิมพ์ชื่อสั้นลง หรือใช้รหัส SKU ครับ', size: 'xs', color: '#666666', margin: 'md', wrap: true },
          ],
        },
      },
    };
  }

  // Flex carousels cap at 12 bubbles; the bridge already caps at 10.
  var bubbles = list.slice(0, 10).map(buildStockBubble);
  if (bubbles.length === 1) {
    return { type: 'flex', altText: '📦 สต็อก: ' + String(list[0].item || ''), contents: bubbles[0] };
  }
  return {
    type: 'flex',
    altText: '📦 สต็อก ' + bubbles.length + ' รายการ',
    contents: { type: 'carousel', contents: bubbles },
  };
}

module.exports = {
  buildStockFlex: buildStockFlex,
  buildStockBubble: buildStockBubble,
  assertNoCostFields: assertNoCostFields,
  stockTone: stockTone,
  WAREHOUSE_LABELS: WAREHOUSE_LABELS,
};
