'use strict';

// ─── LLM Output Validator ────────────────────────────────────
// Guards against LLM hallucinations before merging into spec.
// Returns null if any field is invalid (brand unknown, numbers out of range).
function validateSolarSpec(r) {
  if (!r || typeof r !== 'object') return null;
  var VALID_BRANDS = ['ATMOCE','Sigenergy','Huawei','Deye','Solis','Hoymiles'];
  // Required: brand + size_kw
  if (!r.brand || r.size_kw == null) {
    console.error('[llm-reject] missing required field (brand or size_kw):', JSON.stringify(r).slice(0, 200));
    return null;
  }
  // brand: case-insensitive enum match → canonical capitalization
  var brandStr = String(r.brand).toLowerCase().trim();
  var matched = VALID_BRANDS.find(function(b) { return b.toLowerCase() === brandStr; });
  if (!matched) {
    console.error('[llm-reject] unknown brand:', r.brand);
    return null;
  }
  r.brand = matched;
  // size_kw: hard clamp [0.5, 500] → reject if outside
  var sz = parseFloat(r.size_kw);
  if (isNaN(sz) || sz < 0.5 || sz > 500) {
    console.error('[llm-reject] size_kw out of range:', r.size_kw);
    return null;
  }
  r.size_kw = sz;
  // phase: optional but must be 1P/3P if present
  if (r.phase && r.phase !== '1P' && r.phase !== '3P') {
    console.error('[llm-reject] phase:', r.phase);
    return null;
  }
  // Soft clamps: out-of-range → set to 0 and warn, don't reject
  var softClamp = function(field, min, max) {
    if (r[field] == null) return;
    var v = parseFloat(r[field]);
    if (isNaN(v) || v < min || v > max) {
      console.warn('[llm-warn] ' + field + ' out of range [' + min + ',' + max + ']:', r[field], '→ 0');
      r[field] = 0;
    } else {
      r[field] = v;
    }
  };
  softClamp('battery_kwh', 0, 200);
  softClamp('panel_watt', 300, 800);
  softClamp('panel_count', 1, 400);
  softClamp('grand_total', 10000, 50000000);
  if (r.panel_count && r.panel_count > 0) r.panel_count = Math.round(r.panel_count);
  return r;
}

module.exports = { validateSolarSpec: validateSolarSpec };
