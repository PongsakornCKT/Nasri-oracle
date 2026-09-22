'use strict';

// ─── Thai Input Normalizer ───────────────────────────────────
// Pre-processes user text before regex parse / LLM call.
// - Unicode NFC normalize
// - Thai digits → Arabic
// - Strip zero-width chars
// - Expand "350k" shorthand to 350000 (only near price keywords)
// - Collapse whitespace
function normalizeThaiInput(text) {
  if (!text) return text;
  // Unicode NFC normalize (merges composed/decomposed forms)
  try { text = text.normalize('NFC'); } catch (_) { /* older Node */ }
  // Thai digits ๐-๙ → Arabic 0-9
  text = text.replace(/[\u0E50-\u0E59]/g, function(d) { return String.fromCharCode(d.charCodeAt(0) - 0x0E50 + 48); });
  // Strip zero-width joiners/non-joiners/BOM
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // "350k" near price keywords → 350000 (only when preceded by ขาย/รวม/ราคา within 10 chars)
  text = text.replace(/((?:ขาย|รวม|ราคา)[^\d]{0,10})(\d+(?:\.\d+)?)\s*k\b/gi, function(_, pre, num) {
    return pre + Math.round(parseFloat(num) * 1000);
  });
  // Collapse multiple whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

module.exports = { normalizeThaiInput: normalizeThaiInput };
