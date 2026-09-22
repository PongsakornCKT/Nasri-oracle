'use strict';

// Extracted verbatim from app.js (was a top-level function there) so it can
// be unit-tested via `require()` without loading app.js's server bootstrap
// (HTTP listener, sqlite, archive timers) as an import side effect.
// Behavior unchanged — same body, only the enclosing module differs.

var normalizeThaiInput = require('./thai-normalize').normalizeThaiInput;

function parseQuotationSpec(text) {
  text = normalizeThaiInput(text);
  var lo = text.toLowerCase();
  var brand = 'ATMOCE';
  if (/sig(?:energy)?/.test(lo)) brand = 'Sigenergy';
  else if (/huawei/.test(lo)) brand = 'Huawei';
  else if (/deye/.test(lo)) brand = 'Deye';
  else if (/hoymiles|hoy/.test(lo)) brand = 'Hoymiles';
  else if (/sol[io]s/.test(lo)) brand = 'Solis';
  else if (/atmoce/.test(lo)) brand = 'ATMOCE';

  var isCI = /c\s*(?:&|and)?\s*i/i.test(lo);
  var ciMi500Requested = isCI && /mi-?500/i.test(lo);
  var ciNotice = ciMi500Requested ? 'งาน C&I ใช้ MI-1250 เท่านั้น (ปรับปรุงจาก MI-500 เป็น MI-1250 อัตโนมัติตามกติกา C&I)' : '';

  // ATMOCE 2:1 micro-inverter variant — MI-1250 with 2 panels per micro
  // Trigger: "atmoce 2:1 <N>kw <1เฟส|3เฟส>" (kW + phase still parsed below)
  // When detected: panel default = AIKO 670W, micro qty = ceil(panels/2),
  // panel count forced even, micro warranty = 25 ปี.
  var microInverter2to1 = /atmoce\s*2\s*:\s*1/i.test(lo) || isCI;
  if (microInverter2to1 || isCI) brand = 'ATMOCE';

  // Panel brand + watt — dynamic, supports any brand from catalog
  var panelBrand = '', panelWatt = 0;
  var pm;
  // Match: "brand + watt" patterns (e.g. "aiko650", "trina solar 715w", "longi 650w", "ja625")
  if ((pm = lo.match(/trina\s*(?:solar\s*)?(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'Trina Solar'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  else if ((pm = lo.match(/ja\s*(?:solar\s*)?(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'JA Solar'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  else if ((pm = lo.match(/aiko\s*(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'AIKO'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  else if ((pm = lo.match(/longi\s*(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'LONGi'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  else if ((pm = lo.match(/jinko\s*(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'JINKO'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  else if ((pm = lo.match(/vols\s*(\d{3,4})?(?:\s*w)?/))) { panelBrand = 'VOLS'; panelWatt = pm[1] ? parseInt(pm[1]) : 0; }
  // Fallback: "แผง [watt]w" without brand name
  else if ((pm = lo.match(/แผง\s*(\d{3,4})\s*(?:w|วัตต์)?/))) { panelWatt = parseInt(pm[1]); }
  // Only set defaults if NO panel was specified at all — let Python/catalog decide
  // Empty panel_brand + panel_watt=0 means "use default for this inverter brand"

  // Panel count — match "32แผง", "32 PV", "38pv", "32 panels"
  var panelCount = 0;
  var pcm = text.match(/(\d+)\s*(?:แผ[งง่]|pv|panels?)/i);
  if (pcm) {
    var pcVal = parseInt(pcm[1]);
    if (pcVal > 0 && pcVal < 400) panelCount = pcVal; // sanity: not a watt value
  }

  // kW detection — if user states kW explicitly, trust it; otherwise fall back
  // to panel_count × panel_watt. Snap logic in Layer B enforces model constraints
  var kwMatch = lo.match(/([\d.]+)\s*kw(?!h)/);
  var sizeKw = kwMatch ? parseFloat(kwMatch[1]) : 5.0;

  // Set ATMOCE default panel to AIKO 670W if not specified
  if (brand === 'ATMOCE') {
    if (!panelWatt) panelWatt = 670;
    if (!panelBrand) panelBrand = 'AIKO';

    if (panelCount <= 0 && sizeKw > 0) {
      var _pcEst = Math.ceil(sizeKw * 1000 / panelWatt);
      if (_pcEst % 2) _pcEst += 1; // force even for 2-panel microinverter pairing
      panelCount = _pcEst;
    } else if (microInverter2to1 && (panelCount % 2)) {
      panelCount += 1; // force even when user gave odd count
    }
  }

  if (panelCount > 0 && !kwMatch) {
    var pw = panelWatt || (brand === 'ATMOCE' ? 670 : 625);
    sizeKw = Math.round(panelCount * pw / 10) / 100; // round to 2 decimals
  }

  var phase = /3\s*(?:phase|เฟส|p\b)/.test(lo) ? '3P' : '1P';
  var hasBattery = /batt|battery|แบต|แบท/.test(lo);
  var hasBackup = /backup|สำรอง|back\s*up/.test(lo);
  if (hasBackup) hasBattery = true;

  // ATMOCE: battery default includes backup (110k/130k), not batt-only (99k)
  // User must explicitly say "no backup" or "batt only" to get batt-only
  if (brand === 'ATMOCE' && hasBattery && !hasBackup) {
    var noBackup = /ไม่.*backup|no\s*backup|batt\s*only|เฉพาะ.*แบต|เฉพาะ.*batt/i.test(lo);
    if (!noBackup) hasBackup = true;
  }

  // Battery kWh — only treat as kWh if explicitly followed by "kw"/"kwh"
  var battKwh = 0;
  var bm = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s*(\d+(?:\.\d+)?)\s*(?:kw|kwh)/);
  if (bm) battKwh = parseFloat(bm[1]);
  else { bm = lo.match(/(\d+(?:\.\d+)?)\s*(?:kw|kwh)\s*(?:batt|แบต|แบท)/); if (bm) battKwh = parseFloat(bm[1]); }

  // Battery quantity — "batt 4", "batt 7 *2", "x6ลูก", "4ลูก", "batt7kw 4ลูก"
  var battQty = 1;
  var battQtyExplicit = false;
  var bqm = text.match(/batt(?:ery)?\s*\d+\s*(?:kw|kwh)?\s*[*x×]\s*(\d+)/i)
    || text.match(/[*x×]\s*(\d+)\s*ลูก/)
    || text.match(/batt(?:ery)?\s*\d+\s*(?:kw|kwh)?\s+(\d+)\s*ลูก/i)
    || text.match(/(\d+)\s*ลูก/);
  if (bqm) { battQty = parseInt(bqm[1]); battQtyExplicit = true; }

  // "batt N" — ATMOCE: N >= 7 means kWh (up to 50), N < 7 means qty; others: N ≤ 20 = qty
  if (battQty <= 1 && !bm) {
    var bnm = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s+(\d+)(?:\s|$|\+)/);
    if (bnm) {
      var bnv = parseInt(bnm[1]);
      if (brand === 'ATMOCE' && bnv >= 7 && bnv <= 50) {
        battKwh = bnv;
      } else if (bnv >= 1 && bnv <= 20) {
        battQty = bnv;
      }
    }
  }

  if (battKwh > 0 && battQty > 1) battKwh = battKwh * battQty;

  // Customer name — highest priority: explicit bracket syntax "ชื่อลูกค้า[คุณ นก]" / "ลูกค้า[John Doe]"
  // Captures everything inside the brackets verbatim (keeps "คุณ" politeness prefix).
  // Falls back to one-shot keyword pattern, then to "คุณ[name]" tail capture.
  // `customerNameExplicit` is set true when ANY parser branch below extracts a
  // non-empty name. It is later re-exported in the spec so the AI-merge step in
  // startQuotation() refuses to overwrite an explicit user-supplied name with
  // LLM hallucinations (e.g. underscore strings that produce "-______" suffix).
  var customerName = '';
  var customerNameExplicit = false;
  var bracketMatch = text.match(/(?:ชื่อ\s*ลูกค้า|ลูกค้า)\s*[\[【]\s*([^\]】]+?)\s*[\]】]/);
  if (bracketMatch) {
    customerName = bracketMatch[1].trim().replace(/\s+/g, ' ');
    if (customerName) customerNameExplicit = true;
  }
  if (!customerName) {
    var nameMatch = text.match(/(?:คุณ|ลูกค้า|ให้|ใบเสนอ(?:ราคา)?|ทำ\s*QT)\s+([ก-๙A-Za-z][ก-๙A-Za-z\s]{1,40}?)(?=\s+(?:ATMOCE|Sigenergy|Huawei|Solis|Deye|Hoymiles|\d+\s*(?:kw|แผง|pv|1p|3p|phase|เฟส)))/i);
    if (nameMatch) {
      // Strip leading "คุณ"/"ลูกค้า" captured when prefix is "ใบเสนอ"/"ทำ QT"
      customerName = nameMatch[1].trim().replace(/^(?:คุณ|ลูกค้า)\s*/i, '').trim();
      if (customerName) customerNameExplicit = true;
    } else {
      // Fallback: original "คุณ[name]" pattern
      var cnm = text.match(/คุณ\s*([^\s,]+(?:\s+[^\s,]+)?)/);
      if (cnm) {
        customerName = cnm[1].replace(/\s*(atmoce|sigenergy|huawei|deye|solis|hoymiles|inverter|phase|kw|แผง|batt|backup|ขาย|ราคา|ส่วนลด|ฟรี|ติดตั้ง|เฟส)/gi, '').trim();
        if (customerName) customerNameExplicit = true;
      }
    }
  }

  // Always prepend "คุณ " for politeness unless already prefixed.
  // Skip when name is empty/falsy so the downstream fallback path
  // (yields "ใบเสนอราคา_Enervia") remains intact. The explicit flag is
  // preserved — we are normalizing what was found, not inventing a name.
  if (customerName && !/^(คุณ|ลูกค้า)/i.test(customerName)) {
    customerName = 'คุณ ' + customerName;
  }

  // Optimizer detection
  var hasOptimizer = /optim/i.test(lo);

  // Battery-only quotation detection — no panels, no inverter section in PDF.
  // Trigger: explicit "batt only / battery only / เฉพาะแบต / เฉพาะ batt /
  // ไม่มีแผง / no panel(s)" AND battery is present. Upstream (Python) requires
  // grand_total > 0 and accepts size_kw=0 when battery_only=true.
  var batteryOnly = false;
  if (hasBattery && /batt\s*only|battery\s*only|เฉพาะ\s*(?:แบต|แบท|batt)|ไม่มี\s*แผง|no\s*panels?/i.test(lo)) {
    batteryOnly = true;
    sizeKw = 0;
    panelCount = 0;
    panelWatt = 0;
    hasBackup = false;
  }

  // Lump sum — parse number with optional suffix (k/พัน=×1000, หมื่น=×10000, แสน=×100000)
  var lumpSumValue = 0;
  // Compound forms (รวมราคา / ราคารวม / ราคา รวม) must come BEFORE the bare
  // "รวม" alternative — otherwise the engine matches "รวม" then chokes on the
  // following "ราคา" before reaching the digits and bails out without trying
  // a longer alternative at the same position.
  var lumpMatch = text.match(/(?:รวม\s*ราคา|ราคา\s*รวม|lump\s*sum|รวม|=)\s*฿?\s*([\d,]+(?:\.\d+)?)\s*(k|พัน|หมื่น|แสน)?/i);
  if (lumpMatch) {
    var lv = parseFloat(lumpMatch[1].replace(/,/g, ''));
    var lsuffix = (lumpMatch[2] || '').toLowerCase();
    if (lsuffix === 'k') lv *= 1000;
    else if (lsuffix === 'พัน') lv *= 1000;
    else if (lsuffix === 'หมื่น') lv *= 10000;
    else if (lsuffix === 'แสน') lv *= 100000;
    lumpSumValue = lv;
  }
  // Fallback: standalone large number (≥5000) at end of message = implied lump sum
  if (!lumpSumValue) {
    var trailMatch = text.match(/\s([\d,]{5,})\s*(?:บาท)?\s*$/);
    if (trailMatch) {
      var tv = parseFloat(trailMatch[1].replace(/,/g, ''));
      if (tv >= 5000) lumpSumValue = tv;
    }
  }
  var lumpSum = lumpSumValue > 0;

  // Selling price — lump sum takes priority; fallback "ขาย [number]" / "ราคาขาย [number]"
  var grandTotal = lumpSumValue > 0 ? lumpSumValue : 0;
  if (!grandTotal) {
    var spm = text.match(/(?:ขาย(?:ราคา)?|(?<!รวม)ราคาขาย)\s*([\d,]+)/);
    if (spm) grandTotal = parseFloat(spm[1].replace(/,/g, ''));
  }

  // Discount — "ส่วนลด/ลดราคา/ลด [number]"
  var discount = 0;
  var dm = text.match(/(?:ส่วนลด|ลดราคา(?:พิเศษ)?|ลด)\s*([\d,]+)/);
  if (dm) discount = parseFloat(dm[1].replace(/,/g, ''));

  // Remarks — collect promo phrases
  var remarks = [];
  if (/ฟรี.*กันนก|ฟรี.*ตะแกรง/.test(text)) remarks.push('ฟรีติดตั้งตะแกรงกันนก');
  var monthMatch = text.match(/ติดตั้ง\s*ภายใน(?:เดือน)?\s*(\S+)/);
  if (monthMatch) remarks.push('*** ราคาติดตั้งภายในเดือน' + monthMatch[1] + ' ***');
  var touMatch = text.match(/ฟรี.*(?:ค่าธรรมเนียม|TOU).*?(\d[\d,]*)\s*บาท/);
  if (touMatch) remarks.push('ฟรี ค่าธรรมเนียมขอมิเตอร์ TOU จากการไฟฟ้า มูลค่า ' + touMatch[1] + ' บาท');
  var cleanMatch = text.match(/ล้างแผง\s*(\d+)\s*ครั้ง\s*(\d+)\s*ปี/);
  if (cleanMatch) remarks.push('ล้างแผงฟรี ' + cleanMatch[1] + ' ครั้ง ภายในระยะเวลา ' + cleanMatch[2] + ' ปี');
  // Free-form remark: "เพิ่มหมายเหตุ [text]" or "หมายเหตุ [text]" / "หมายเหตุ: [text]"
  // Tail after the keyword is split on natural remark starters so that a single
  // "หมายเหตุ ฟรีX ฟรีY รวมประกัน Z" produces 3 separate lines instead of one blob.
  var freeRemarkParts = text.split(/(?:เพิ่ม\s*หมายเหตุ|หมายเหตุ)\s*[:：]?\s+/);
  for (var _ri = 1; _ri < freeRemarkParts.length; _ri++) {
    var _rt = freeRemarkParts[_ri].trim();
    if (!_rt) continue;
    var _subs = _rt.split(/\s+(?=ฟรี|รวม\s*ประกัน|\*\*\*)/);
    for (var _sj = 0; _sj < _subs.length; _sj++) {
      var _s = _subs[_sj].trim();
      if (!_s) continue;
      // Dedup: if this sub-remark matches an already-pushed auto-detected one
      // (ตะแกรงกันนก, TOU, ล้างแผง), skip it.
      var dup = false;
      for (var _di = 0; _di < remarks.length; _di++) {
        var r = remarks[_di];
        if ((/ตะแกรง|กันนก/.test(_s) && /ตะแกรง|กันนก/.test(r)) ||
            (/TOU|ค่าธรรมเนียม/i.test(_s) && /TOU|ค่าธรรมเนียม/i.test(r)) ||
            (/ล้างแผง/.test(_s) && /ล้างแผง/.test(r))) {
          dup = true; break;
        }
      }
      if (!dup) remarks.push('- ' + _s);
    }
  }
  // Check for "จากราคาเต็ม [amount]"
  var fullPriceMatch = text.match(/จากราคาเต็ม\s*([\d,]+)/);

  // Payment rounds — default 2 (60/40), override to 3 (30/30/40) when user says
  // "แบ่ง 3 รอบ" / "3 รอบ" / "3 งวด" / "3 installments".
  var paymentRounds = 2;
  if (/แบ่ง\s*3\s*(?:รอบ|งวด)|3\s*(?:รอบ|งวด)|3\s*installments?/i.test(lo)) {
    paymentRounds = 3;
  }

  return {
    brand: brand,
    size_kw: sizeKw,
    phase: phase,
    has_battery: hasBattery,
    has_backup: hasBackup,
    customer_name: customerName,
    customer_name_explicit: customerNameExplicit,
    grand_total: grandTotal,
    discount: discount,
    panel_brand: panelBrand,
    panel_watt: panelWatt,
    panel_count: panelCount,
    battery_kwh: battKwh,
    remarks: remarks.join('|'),
    full_price: fullPriceMatch ? parseFloat(fullPriceMatch[1].replace(/,/g, '')) : 0,
    lump_sum: lumpSum,
    has_optimizer: hasOptimizer,
    battery_only: batteryOnly,
    micro_2to1: microInverter2to1,
    payment_rounds: paymentRounds,
    battery_qty: battQty > 1 ? battQty : 0,
    battery_qty_explicit: battQtyExplicit,
    user_explicit_kw: !!kwMatch,
    is_ci: isCI,
    ci_mi500_requested: ciMi500Requested,
    ci_notice: ciNotice,
  };
  console.log('[parseQuotationSpec] panel_brand=' + panelBrand + ' panel_watt=' + panelWatt + ' size_kw=' + sizeKw + ' panelCount=' + panelCount + ' battery_only=' + batteryOnly);
}

module.exports = { parseQuotationSpec: parseQuotationSpec };
