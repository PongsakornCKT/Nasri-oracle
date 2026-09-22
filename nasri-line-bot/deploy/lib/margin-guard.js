'use strict';

/**
 * margin-guard.js — T1 Margin Guard Engine (#4)
 * Calculates profit margin % = (profit / selling_price) * 100.
 * Alerts sales & admin if margin < 10% (P'Phong business decision).
 * Rules: ALERT ONLY (DO NOT BLOCK), NEVER leak cost/profit figures to non-admin users.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createMarginGuard(opts) {
  opts = opts || {};
  var thresholdPct = opts.thresholdPct || 10.0; // P'Phong decision: 10%
  var notifyAdminFn = typeof opts.notifyAdmin === 'function' ? opts.notifyAdmin : function() { return Promise.resolve(); };

  function checkMargin(profit, sellingPrice) {
    profit = parseFloat(profit) || 0;
    sellingPrice = parseFloat(sellingPrice) || 0;

    if (sellingPrice <= 0) return { isLowMargin: false, marginPct: 0 };

    var marginPct = (profit / sellingPrice) * 100;
    var isLowMargin = marginPct < thresholdPct;

    if (isLowMargin) {
      var alertText = '⚠️ [MARGIN GUARD ALERT] Margin low: ' + marginPct.toFixed(1) + '% (Threshold: ' + thresholdPct + '%, Selling: ฿' + sellingPrice.toLocaleString() + ')';
      notifyAdminFn(alertText).catch(function() {});
    }

    return {
      isLowMargin: isLowMargin,
      marginPct: parseFloat(marginPct.toFixed(1)),
      thresholdPct: thresholdPct,
      warningText: isLowMargin ? ('⚠️ [คำเตือน Sales] มาร์จิ้นต่ำกว่าเกณฑ์ ' + thresholdPct + '% (ปัจจุบัน ' + marginPct.toFixed(1) + '%)') : null
    };
  }

  return { checkMargin: checkMargin, thresholdPct: thresholdPct };
};
