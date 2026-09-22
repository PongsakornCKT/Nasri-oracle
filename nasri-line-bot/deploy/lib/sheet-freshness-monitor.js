'use strict';

/**
 * sheet-freshness-monitor.js — Q3 Sheet Freshness & Price Spike Monitor (#8)
 * Checks L2 cache age (>4h -> background refresh + admin notify)
 * Checks Finalprice tab price changes (>10% -> throttled admin alert)
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createFreshnessMonitor(opts) {
  opts = opts || {};
  var catalogCache = opts.catalogCache;
  var notifyAdminFn = typeof opts.notifyAdmin === 'function' ? opts.notifyAdmin : function() { return Promise.resolve(); };
  var alertAdminErrorFn = typeof opts.alertAdminError === 'function' ? opts.alertAdminError : function() {};
  var staleThresholdMs = typeof opts.staleThresholdMs === 'number' ? opts.staleThresholdMs : (4 * 60 * 60 * 1000); // 4 hours
  var priceSpikeRatio = typeof opts.priceSpikeRatio === 'number' ? opts.priceSpikeRatio : 0.10; // 10%

  var _prevPrices = new Map(); // packageKey -> price

  function checkFreshness(catalogData, cacheStats) {
    // 1. Check Stale Cache (> 4h)
    if (cacheStats && cacheStats.age_ms && cacheStats.age_ms > staleThresholdMs) {
      var ageHours = (cacheStats.age_ms / 3600000).toFixed(1);
      notifyAdminFn('⚠️ [catalog-cache] แคชราคากลางหมดอายุ (เก่า ' + ageHours + ' ชม.) — กำลังดึงข้อมูลใหม่...').catch(function() {});
      if (catalogCache && typeof catalogCache.invalidate === 'function') {
        catalogCache.invalidate();
      }
    }

    // 2. Check Price Spikes (> 10% in Finalprice)
    if (catalogData && Array.isArray(catalogData.Finalprice)) {
      catalogData.Finalprice.forEach(function(row) {
        var kw = row['ขนาด(W)'] || row['size_kw'] || row['kw'] || '';
        var phase = row['เฟส'] || row['phase'] || '';
        var key = (kw + '_' + phase).trim();
        var price = parseFloat(row['ราคาขาย'] || row['selling_price'] || row['price'] || 0);
        if (!key || !price) return;

        if (_prevPrices.has(key)) {
          var oldPrice = _prevPrices.get(key);
          var diff = Math.abs(price - oldPrice);
          var ratio = diff / oldPrice;
          if (ratio > priceSpikeRatio) {
            var pct = (ratio * 100).toFixed(1);
            var dir = price > oldPrice ? 'เพิ่มขึ้น' : 'ลดลง';
            alertAdminErrorFn('price-spike', 'ราคาแพ็กเกจ ' + key + ' ' + dir + ' ' + pct + '% (จาก ฿' + oldPrice.toLocaleString() + ' เป็น ฿' + price.toLocaleString() + ')');
          }
        }
        _prevPrices.set(key, price);
      });
    }
  }

  return { checkFreshness: checkFreshness, _prevPrices: _prevPrices };
};
