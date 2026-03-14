/**
 * Test suite: Quotation spec parsing for Nasri LINE bot
 * Run: node nasri-line-bot/tests/test_quotation_parsing.js
 */
'use strict';

var passed = 0, failed = 0;

function test(name, condition, detail) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    console.log('  FAIL  ' + name + (detail ? '  ' + detail : ''));
  }
}

// ── Replicate parseQuotationSpec from app.js ──
function parseQuotationSpec(text) {
  var lo = text.toLowerCase();
  var brand = 'ATMOCE';
  if (/sig(?:energy)?/.test(lo)) brand = 'Sigenergy';
  else if (/huawei/.test(lo)) brand = 'Huawei';
  else if (/deye/.test(lo)) brand = 'Deye';
  else if (/hoymiles|hoy/.test(lo)) brand = 'Hoymiles';
  else if (/sol[io]s/.test(lo)) brand = 'Solis';
  else if (/atmoce/.test(lo)) brand = 'ATMOCE';

  var panelBrand = '', panelWatt = 0;
  var pm;
  if (pm = lo.match(/ja\s*(?:solar\s*)?(\d{3})?/)) { panelBrand = 'JA Solar'; panelWatt = pm[1] ? parseInt(pm[1]) : 625; }
  else if (pm = lo.match(/aiko\s*(\d{3})?/)) { panelBrand = 'AIKO'; panelWatt = pm[1] ? parseInt(pm[1]) : 650; }
  if (!panelWatt) panelWatt = brand === 'Sigenergy' ? 650 : 625;
  if (!panelBrand) panelBrand = brand === 'Sigenergy' ? 'AIKO' : 'JA Solar';

  var panelCount = 0;
  var pcm = text.match(/(\d+)\s*แผ[งง่]/);
  if (pcm) panelCount = parseInt(pcm[1]);

  var kwMatch = lo.match(/([\d.]+)\s*kw/);
  var sizeKw = kwMatch ? parseFloat(kwMatch[1]) : 5.0;
  if (panelCount > 0) {
    sizeKw = panelCount * panelWatt / 1000;
  }

  var phase = /3\s*(?:phase|เฟส|p\b)/.test(lo) ? '3P' : '1P';
  var hasBattery = /batt|battery|แบต|แบท/.test(lo);
  var hasBackup = /backup|สำรอง|back\s*up/.test(lo);
  if (hasBackup) hasBattery = true;

  var battKwh = 0;
  var bm = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s*(\d+(?:\.\d+)?)\s*(?:kw|kwh)?/);
  if (bm) battKwh = parseFloat(bm[1]);
  else { bm = lo.match(/(\d+(?:\.\d+)?)\s*(?:kw|kwh)\s*(?:batt|แบต|แบท)/); if (bm) battKwh = parseFloat(bm[1]); }

  var battQty = 1;
  var bqm = text.match(/batt(?:ery)?\s*\d+\s*\*\s*(\d+)/i) || text.match(/batt(?:ery)?\s*\d+\s+(\d+)\s*ลูก/i);
  if (bqm) battQty = parseInt(bqm[1]);
  if (battKwh > 0 && battQty > 1) battKwh = battKwh * battQty;

  var customerName = '';
  var cnm = text.match(/คุณ\s*([^\s,]+(?:\s+[^\s,]+)?)/);
  if (cnm) customerName = cnm[1].replace(/\s*(atmoce|sigenergy|huawei|deye|solis|hoymiles|inverter|phase|kw|แผง|batt|backup|ขาย|ราคา|ส่วนลด|ฟรี|ติดตั้ง|เฟส)/gi, '').trim();

  var grandTotal = 0;
  var spm = text.match(/(?:ขาย(?:ราคา)?|ราคาขาย)\s*([\d,]+)/);
  if (spm) grandTotal = parseFloat(spm[1].replace(/,/g, ''));

  var discount = 0;
  var dm = text.match(/(?:ส่วนลด|ลดราคา(?:พิเศษ)?|ลด)\s*([\d,]+)/);
  if (dm) discount = parseFloat(dm[1].replace(/,/g, ''));

  var remarks = [];
  if (/ฟรี.*กันนก|ฟรี.*ตะแกรง/.test(text)) remarks.push('bird');
  var monthMatch = text.match(/ติดตั้ง\s*ภายใน(?:เดือน)?\s*(\S+)/);
  if (monthMatch) remarks.push('month');

  return {
    brand: brand, size_kw: sizeKw, phase: phase,
    has_battery: hasBattery, has_backup: hasBackup,
    customer_name: customerName, grand_total: grandTotal,
    discount: discount, panel_brand: panelBrand,
    panel_watt: panelWatt, panel_count: panelCount,
    battery_kwh: battKwh, remarks: remarks.join('|'),
  };
}

console.log('=== Quotation Parsing Tests ===\n');

// Test 1: Full spec — all fields
var t1 = parseQuotationSpec('ทำใบเสนอราคา คุณวัลลภ atmoce 1phase JA625 15แผง + batt 7 + backup ขาย 420,000 ฟรีกันนก ติดตั้งภายในเดือนมีนาคม');
test('1. Customer name parsed', t1.customer_name === 'วัลลภ', 'got: ' + t1.customer_name);
test('2. Panel count -> kW', Math.abs(t1.size_kw - 9.375) < 0.01, 'got: ' + t1.size_kw);
test('3. Selling price', t1.grand_total === 420000, 'got: ' + t1.grand_total);
test('4. Remarks (bird + month)', t1.remarks.indexOf('bird') >= 0 && t1.remarks.indexOf('month') >= 0, 'got: ' + t1.remarks);
test('5. Battery + backup', t1.has_battery && t1.has_backup, 'batt=' + t1.has_battery + ' backup=' + t1.has_backup);

// Test 6: Discount
var t6 = parseQuotationSpec('ทำใบเสนอราคา atmoce 5kw 1phase ขาย 378000 ส่วนลด 9,000');
test('6. Discount parsed', t6.discount === 9000, 'got: ' + t6.discount);

// Test 7: Battery x2
var t7 = parseQuotationSpec('atmoce 5kw 1phase batt 7 *2 + backup');
test('7. Battery *2 = 14kWh', t7.battery_kwh === 14, 'got: ' + t7.battery_kwh);

// Test 8: AIKO panel auto-detect
var t8 = parseQuotationSpec('atmoce 5kw 3phase AIKO 12แผง');
test('8. AIKO panel brand', t8.panel_brand === 'AIKO' && t8.panel_watt === 650, 'got: ' + t8.panel_brand + ' ' + t8.panel_watt);

// Test 9: Deye with dyness
var t9 = parseQuotationSpec('deye 10kw 1p + batt dyness 10kwh +ats ขาย 285,000');
test('9. Deye brand + price', t9.brand === 'Deye' && t9.grand_total === 285000, 'got: ' + t9.brand + ' ' + t9.grand_total);

// Test 10: Solis with no extras
var t10 = parseQuotationSpec('solis 6kw 1phase');
test('10. Simple spec defaults', t10.brand === 'Solis' && t10.size_kw === 6 && t10.phase === '1P', 'got: ' + t10.brand + ' ' + t10.size_kw + ' ' + t10.phase);

console.log('\n=== Results: ' + passed + '/' + (passed + failed) + ' passed ===');
if (failed) process.exit(1);
