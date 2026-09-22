'use strict';

// ─── Isolated extractors mirroring app.js logic ──────────────────────────────
// lumpSum   : line 1438  — /รวมราคา/.test(lo)
// grandTotal: lines 1443-1444 — negative-lookbehind regex on original text
// specStr   : line 1606  — strip trigger + quotation keywords

function extract(text) {
  var lo = text.toLowerCase();

  var lumpSum = /รวมราคา/.test(lo);

  var grandTotal = 0;
  var spm = text.match(/(?:ขาย(?:ราคา)?|(?<!รวม)ราคาขาย)\s*([\d,]+)/);
  if (spm) grandTotal = parseFloat(spm[1].replace(/,/g, ''));

  var specStr = text
    .replace(/ใบเสนอราคา|quotation|เสนอราคา|ขอใบเสนอ|ทำใบเสนอราคา|นัด|nasri|ไอ่นัด|เสนอ|ทำ|ขอ|รวมราคา(?:ขาย)?/gi, '')
    .trim();

  return { lumpSum, grandTotal, specStr };
}

// ─── Test runner ──────────────────────────────────────────────────────────────
var passed = 0;
var failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log('  PASS  ' + label);
    passed++;
  } else {
    console.log('  FAIL  ' + label + (detail ? ' — ' + detail : ''));
    failed++;
  }
}

function run(num, input, checks) {
  console.log('\nTC' + num + ': ' + input);
  var r = extract(input);
  console.log('       lumpSum=' + r.lumpSum + '  grandTotal=' + r.grandTotal + '  specStr="' + r.specStr + '"');
  checks(r);
}

// ─── Test Cases ───────────────────────────────────────────────────────────────

// TC1 — "รวมราคาขาย" with no price number
run(1,
  'atmoce 5kw แผงja625w 8แผง +backup + แบต 7kwh x 1ลูก 3phase รวมราคาขาย',
  function(r) {
    assert('TC1 lumpSum=true',      r.lumpSum === true);
    assert('TC1 grandTotal=0',      r.grandTotal === 0);
    assert('TC1 specStr no รวมราคาขาย', !r.specStr.includes('รวมราคาขาย'));
  }
);

// TC2 — Normal "ขาย [price]", no lump-sum flag
run(2,
  'atmoce 5kw 1phase ขาย 185000',
  function(r) {
    assert('TC2 lumpSum=false',     r.lumpSum === false);
    assert('TC2 grandTotal=185000', r.grandTotal === 185000);
  }
);

// TC3 — Both "รวมราคา" AND "ขาย [price]" present
run(3,
  'atmoce 5kw 1phase รวมราคา ขาย 185000',
  function(r) {
    assert('TC3 lumpSum=true',      r.lumpSum === true);
    assert('TC3 grandTotal=185000', r.grandTotal === 185000);
  }
);

// TC4 — "รวมราคาขาย" does NOT consume the subsequent "ขาย 350000"
run(4,
  'sigenergy 10kw รวมราคาขาย ขาย 350000',
  function(r) {
    assert('TC4 lumpSum=true',      r.lumpSum === true);
    assert('TC4 grandTotal=350000', r.grandTotal === 350000);
  }
);

// TC5 — "ราคาขาย" without "รวม" prefix — normal price extraction
run(5,
  'deye 5kw ราคาขาย 200000',
  function(r) {
    assert('TC5 lumpSum=false',     r.lumpSum === false);
    assert('TC5 grandTotal=200000', r.grandTotal === 200000);
  }
);

// TC6 — "รวมราคา" with no number at all
run(6,
  'atmoce 5kw รวมราคา',
  function(r) {
    assert('TC6 lumpSum=true',  r.lumpSum === true);
    assert('TC6 grandTotal=0',  r.grandTotal === 0);
  }
);

// TC7 — No flag, no price
run(7,
  'huawei 10kw',
  function(r) {
    assert('TC7 lumpSum=false', r.lumpSum === false);
    assert('TC7 grandTotal=0',  r.grandTotal === 0);
  }
);

// TC8 — "รวมราคาขาย 500000": the negative lookbehind guards only the "ราคาขาย"
//        arm of the regex.  The bare "ขาย" arm still matches the "ขาย" sub-token
//        inside "รวมราคาขาย" and captures the trailing "500000".
//        Real engine behavior: grandTotal=500000.
//        If the intent is to block this, app.js would need an additional guard.
run(8,
  'atmoce 42kw รวมราคาขาย 500000',
  function(r) {
    assert('TC8 lumpSum=true',  r.lumpSum === true);
    // "ขาย" inside "รวมราคาขาย" is found by the bare-ขาย arm → 500000 is extracted.
    // This documents actual app behavior (potential edge-case to address in app.js).
    assert('TC8 grandTotal=500000 (ขาย arm matches sub-token in รวมราคาขาย)',
      r.grandTotal === 500000,
      'got ' + r.grandTotal
    );
  }
);

// TC9 — "ราคา" alone is NOT "รวมราคา"
run(9,
  'solis 8kw ราคา 150000',
  function(r) {
    assert('TC9 lumpSum=false', r.lumpSum === false);
    // "ราคา" alone matches neither arm of the selling-price regex → grandTotal=0
    assert('TC9 grandTotal=0 (ราคา alone is not a selling-price trigger)',
      r.grandTotal === 0,
      'got ' + r.grandTotal
    );
  }
);

// TC10 — Strip words: specStr must not contain "นัด", "ทำใบเสนอราคา", or "รวมราคา"
run(10,
  'นัด ทำใบเสนอราคา atmoce 5kw รวมราคา',
  function(r) {
    assert('TC10 specStr no "นัด"',          !r.specStr.includes('นัด'));
    assert('TC10 specStr no "ทำใบเสนอราคา"', !r.specStr.includes('ทำใบเสนอราคา'));
    assert('TC10 specStr no "รวมราคา"',      !r.specStr.includes('รวมราคา'));
    assert('TC10 lumpSum=true',               r.lumpSum === true);
  }
);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed out of ' + (passed + failed) + ' assertions');
if (failed > 0) {
  console.log('STATUS: FAIL');
  process.exit(1);
} else {
  console.log('STATUS: ALL PASS');
}
