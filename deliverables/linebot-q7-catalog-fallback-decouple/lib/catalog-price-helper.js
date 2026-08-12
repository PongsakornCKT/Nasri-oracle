'use strict';

/**
 * catalog-price-helper.js — Q7 Catalog Price Lookup with Hardcoded Last-Resort Fallback (#11)
 * Decouples hardcoded accessory prices (Huawei Smart Dongle, Power Sensors, Sigenergy Gateways).
 * Horus Rules:
 *   - NEVER delete hardcoded fallbacks (prevents crash on catalog/sheets failure)
 *   - Attaches price_source: "catalog" | "fallback" for audit transparency
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

function lookupPriceWithFallback(catalog, sheetName, searchKey, fallbackPrice) {
  if (!catalog || !Array.isArray(catalog[sheetName])) {
    return { price: fallbackPrice, source: 'fallback' };
  }

  try {
    var rows = catalog[sheetName];
    var keyLower = searchKey.toLowerCase();
    var foundRow = rows.find(function(r) {
      return Object.values(r).join(' ').toLowerCase().indexOf(keyLower) >= 0;
    });

    if (foundRow) {
      var extracted = 0;
      Object.keys(foundRow).forEach(function(k) {
        if (/ราคา|price|cost/i.test(k)) {
          var p = parseFloat(foundRow[k]);
          if (!isNaN(p) && p > 0) extracted = p;
        }
      });
      if (extracted > 0) {
        return { price: extracted, source: 'catalog', row: foundRow };
      }
    }
  } catch (e) {
    console.warn('[catalog-price-helper] Lookup error for key ' + searchKey + ':', e.message);
  }

  return { price: fallbackPrice, source: 'fallback' };
}

module.exports = { lookupPriceWithFallback: lookupPriceWithFallback };
