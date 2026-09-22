'use strict';

/**
 * decouple-phase2.js — S1 Decouple Remaining Hardcoded Prices Phase 2 (#11)
 * Decouples ATMOCE MI-500/1250 and Sigenergy accessories (Gateway, Sensor, Kit, ADCU, Switch, Battery).
 * Uses lookupPriceWithFallback pattern to prefer catalog prices while retaining last-resort fallbacks.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

var lookupPriceWithFallback;
try {
  lookupPriceWithFallback = require('./catalog-price-helper').lookupPriceWithFallback;
} catch (e) {
  // Standalone fallback for test suite execution
  lookupPriceWithFallback = function(catalog, sheetName, searchKey, fallbackPrice) {
    if (!catalog || !Array.isArray(catalog[sheetName])) return { price: fallbackPrice, source: 'fallback' };
    var foundRow = catalog[sheetName].find(function(r) {
      return Object.values(r).join(' ').toLowerCase().indexOf(searchKey.toLowerCase()) >= 0;
    });
    if (foundRow) {
      var price = 0;
      Object.keys(foundRow).forEach(function(k) {
        if (/ราคา|price|cost/i.test(k)) {
          var p = parseFloat(foundRow[k]);
          if (!isNaN(p) && p > 0) price = p;
        }
      });
      if (price > 0) return { price: price, source: 'catalog', row: foundRow };
    }
    return { price: fallbackPrice, source: 'fallback' };
  };
}

function resolveAtmoceMiPrice(catalog, miModel, fallbackPrice) {
  var res = lookupPriceWithFallback(catalog, 'Inverters - ATMOCE', miModel, fallbackPrice);
  return { price: res.price, source: res.source };
}

function resolveSigenergyAccessory(catalog, searchKey, fallbackName, fallbackPrice) {
  var res = lookupPriceWithFallback(catalog, 'Inverters - Sigenergy', searchKey, fallbackPrice);
  return {
    name: res.row ? (res.row['รุ่น (Model)'] || res.row['รุ่น'] || res.row['model'] || fallbackName) : fallbackName,
    price: res.price,
    source: res.source
  };
}

module.exports = {
  resolveAtmoceMiPrice: resolveAtmoceMiPrice,
  resolveSigenergyAccessory: resolveSigenergyAccessory
};
