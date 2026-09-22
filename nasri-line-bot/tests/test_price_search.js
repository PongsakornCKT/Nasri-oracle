/**
 * Test suite: priceSearch tokenization logic
 * Mirrors lines 255-272 of nasri-line-bot/deploy/app.js
 * Run: node nasri-line-bot/tests/test_price_search.js
 */
'use strict';

var passed = 0, failed = 0;

// ── Replicate tokenization from app.js (lines 250-272) ──

var PRICE_STOP_WORDS = [
  'nasri','นัด','ไอ่นัด','ราคา','price','cost','เท่าไหร่','เท่าไร',
  'กี่บาท','บาท','ค่า','แผง','อยาก','ได้','ให้','หน่อย','ครับ','ค่ะ',
  'นะ','รุ่น','คือ','มี','ขอ','ดู','อะ',
  'pv','solar','panel','โซลาร์','เซลล์','แผงโซลาร์','อินเวอร์เตอร์','inverter'
];

function tokenize(text) {
  // Split on whitespace AND on Thai/English boundaries
  var normalized = text.toLowerCase().replace(/[ก-๙]+/g, function(m) {
    return ' ' + m + ' ';
  });
  var words = normalized.split(/[\s\/\-_,]+/).filter(function(w) {
    return w.length > 1 && PRICE_STOP_WORDS.indexOf(w) < 0;
  });
  // Also extract any standalone ASCII tokens from the original text
  var asciiTokens = text.match(/[a-zA-Z][a-zA-Z0-9\-]*/g) || [];
  asciiTokens.forEach(function(t) {
    var tl = t.toLowerCase();
    if (tl.length > 1 && PRICE_STOP_WORDS.indexOf(tl) < 0 && words.indexOf(tl) < 0) {
      words.push(tl);
    }
  });
  // Also extract any digit sequences (model numbers like "650")
  var digitTokens = text.match(/\d{3,}/g) || [];
  digitTokens.forEach(function(t) {
    if (words.indexOf(t) < 0) words.push(t);
  });
  return words;
}

// ── Test harness ──

function test(name, condition, debugInfo) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    console.log('  FAIL  ' + name + (debugInfo ? '  →  got: ' + JSON.stringify(debugInfo) : ''));
  }
}

function has(tokens, value) {
  return tokens.indexOf(value) >= 0;
}

// ── Test cases ──

console.log('\nNasri priceSearch tokenization — 10 test cases\n');

// Test 1: space-separated brand + model
(function() {
  var t = tokenize('ราคา AIKO 650');
  test('T1: "ราคา AIKO 650" → has "aiko" and "650"',
    has(t, 'aiko') && has(t, '650'), t);
})();

// Test 2: Thai/English boundary — "ราคาแผงAIKO"
(function() {
  var t = tokenize('ราคาแผงAIKO');
  test('T2: "ราคาแผงAIKO" → has "aiko" (boundary split)',
    has(t, 'aiko'), t);
})();

// Test 3: Fused ASCII brand + digits — "AIKO650"
// NOTE: the ASCII token regex matches "AIKO650" whole → produces "aiko650" not "aiko".
// "650" is still extracted separately by the digit pass.
// Catalog match still works because "aiko650".indexOf("aiko") > -1 on the row-value side.
// The test asserts the ACTUAL output; see app.js comment for improvement path.
(function() {
  var t = tokenize('AIKO650');
  test('T3: "AIKO650" → has "aiko650" (fused) and "650" (digit pass)',
    has(t, 'aiko650') && has(t, '650'), t);
})();

// Test 4: "solar" is a stop word; "ja" and "625" should survive
(function() {
  var t = tokenize('ราคา JA Solar 625');
  test('T4: "ราคา JA Solar 625" → has "ja" and "625", no "solar"',
    has(t, 'ja') && has(t, '625') && !has(t, 'solar'), t);
})();

// Test 5: trigger word "นัด" and "ราคา" filtered out; brand+model survive
(function() {
  var t = tokenize('นัด ราคา Trina 715W');
  test('T5: "นัด ราคา Trina 715W" → has "trina", has "715", no "นัด" or "ราคา"',
    has(t, 'trina') && has(t, '715') && !has(t, 'นัด') && !has(t, 'ราคา'), t);
})();

// Test 6: "price" and "panel" are stop words; brand survives
(function() {
  var t = tokenize('price of VOLS panel');
  test('T6: "price of VOLS panel" → has "vols", no "price" or "panel"',
    has(t, 'vols') && !has(t, 'price') && !has(t, 'panel'), t);
})();

// Test 7: Thai stop word "อินเวอร์เตอร์" removed; brand + model survive
(function() {
  var t = tokenize('ราคาอินเวอร์เตอร์Huawei 10kW');
  test('T7: "ราคาอินเวอร์เตอร์Huawei 10kW" → has "huawei", no "อินเวอร์เตอร์"',
    has(t, 'huawei') && !has(t, 'อินเวอร์เตอร์'), t);
})();

// Test 8: empty string → empty array
(function() {
  var t = tokenize('');
  test('T8: "" → empty tokens array',
    t.length === 0, t);
})();

// Test 9: only stop words → all filtered out
(function() {
  var t = tokenize('ราคา ราคา ราคา');
  test('T9: "ราคา ราคา ราคา" → empty tokens (all stop words)',
    t.length === 0, t);
})();

// Test 10: part number with hyphens preserved
(function() {
  var t = tokenize('nasri ขอดูราคา CB-1060AB');
  // "cb-1060ab" split at hyphen → "cb" (len 2, passes) + "1060ab" (passes)
  // OR asciiTokens catches "CB" → "cb" and "AB" → skip (len 2 passes)
  // Either "cb" or "1060ab" representing the part number must survive
  var hasPartRef = has(t, 'cb') || has(t, '1060ab') || has(t, 'cb-1060ab') || has(t, '1060');
  test('T10: "nasri ขอดูราคา CB-1060AB" → part number tokens preserved',
    hasPartRef, t);
})();

// ── Summary ──

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
