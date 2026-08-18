'use strict';

/**
 * roof-labor-parser.js — T2 Dynamic Labor & Default Roof Parser (#7)
 * Parses roof type from input text.
 * P'Phong Business Decision: Default = "เมทัลชีท" (metal) when unspecified.
 * Attaches human-readable roof description for sales transparency.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

function parseRoofType(text) {
  text = text || '';
  var lo = text.toLowerCase();

  var isExplicit = false;
  var roofType = 'metal';
  var labelTh = 'เมทัลชีท (ค่าเริ่มต้น)';

  if (/ซีแพค|cpac|tile|กระเบื้อง/i.test(lo)) {
    isExplicit = true;
    roofType = 'tile';
    labelTh = /ซีแพค|cpac/i.test(lo) ? 'หลังคาซีแพค' : 'หลังคากระเบื้อง';
  } else if (/hangerbolt|ลอนคู่/i.test(lo)) {
    isExplicit = true;
    roofType = 'hangerbolt';
    labelTh = 'หลังคาลอนคู่ (Hangerbolt)';
  } else if (/kliplock/i.test(lo)) {
    isExplicit = true;
    roofType = 'kliplock';
    labelTh = 'หลังคา Kliplock';
  } else if (/เมทัลชีท|metal\s*sheet|metal/i.test(lo)) {
    isExplicit = true;
    roofType = 'metal';
    labelTh = 'หลังคาเมทัลชีท';
  }

  return {
    roofType: roofType,
    isExplicit: isExplicit,
    labelTh: labelTh,
    displayNote: '🏠 หลังคา: ' + labelTh
  };
}

module.exports = { parseRoofType: parseRoofType };
