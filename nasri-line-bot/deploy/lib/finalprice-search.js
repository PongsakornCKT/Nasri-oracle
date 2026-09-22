'use strict';

/**
 * finalprice-search.js — Q5 Wire Finalprice tab to JS path (#10)
 * Searches system package prices from Finalprice tab before component fallback.
 * Horus Guard: Fail-safe fallback to null if Finalprice is missing/corrupt.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

function searchFinalprice(catalog, text) {
  if (!catalog || !Array.isArray(catalog.Finalprice) || catalog.Finalprice.length === 0) {
    return null; // Horus guard: fallback cleanly to null
  }

  try {
    var lo = text.toLowerCase();

    // Check if query is looking for system package price
    var isPackageQuery = /ระบบ|แพ็กเกจ|แพคเกจ|package|ชุด/i.test(text) ||
                         (/\d+\s*(?:kw|กิโลวัตต์|กิโล)/i.test(text) && !/แผง|อินเวอร์เตอร์|inverter|panel|สาย|แบต/i.test(text));

    // Extract kW size (e.g. 5kW, 5000W, 10kW)
    var kwMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kw|กิโลวัตต์|กิโล)/i);
    var targetKw = kwMatch ? parseFloat(kwMatch[1]) : null;
    if (!targetKw) {
      var wMatch = text.match(/(\d{4,5})\s*w/i);
      if (wMatch) targetKw = parseFloat(wMatch[1]) / 1000;
    }

    // Extract phase (1-Phase / 3-Phase)
    var phaseMatch = text.match(/([13])\s*(?:เฟส|phase|p)/i);
    var targetPhase = phaseMatch ? phaseMatch[1] : null;

    if (!targetKw && !isPackageQuery) return null; // Not a package query -> fallback to component search

    var matches = [];
    catalog.Finalprice.forEach(function(row) {
      var rawKw = row['ขนาด(W)'] || row['size_kw'] || row['kw'] || 0;
      var kwVal = parseFloat(rawKw);
      if (kwVal > 100) kwVal = kwVal / 1000; // 5000 -> 5.0

      var phaseVal = (row['เฟส'] || row['phase'] || '').toString().trim();
      var priceVal = parseFloat(row['ราคาขาย'] || row['selling_price'] || row['price'] || 0);
      var panelCount = row['จำนวนแผง'] || row['panel_count'] || '—';
      var thbPerW = row['THB/W'] || row['thb_per_w'] || '';

      if (priceVal <= 0) return;

      var kwMatches = targetKw ? Math.abs(kwVal - targetKw) < 0.2 : true;
      var phaseMatches = targetPhase ? phaseVal.indexOf(targetPhase) >= 0 : true;

      if (kwMatches && phaseMatches) {
        matches.push({
          phase: phaseVal,
          size_kw: kwVal,
          panel_count: panelCount,
          price: priceVal,
          thb_per_w: thbPerW,
          raw_row: row
        });
      }
    });

    return matches.length > 0 ? matches : null;
  } catch (e) {
    console.error('[finalprice-search] Error (Horus fallback triggered):', e.message);
    return null; // Horus guard: never throw, return null for component fallback
  }
}

module.exports = { searchFinalprice: searchFinalprice };
