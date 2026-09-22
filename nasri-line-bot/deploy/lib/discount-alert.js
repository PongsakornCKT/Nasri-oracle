'use strict';

/**
 * discount-alert.js — T5v2 Discount Alert Engine (#B5)
 * Checks if applied discount (parsed via spec.discount in parse-quotation-spec.js:205)
 * reduces final profit margin below 10% (P'Phong Decision B5).
 * Falls back to T1 margin alert if discount variable is 0.
 *
 * Rules: ALERT ONLY (DO NOT BLOCK), notify sales in reply & notifyAdmin.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createDiscountAlert(opts) {
  opts = opts || {};
  var thresholdPct = opts.thresholdPct || 10.0;
  var notifyAdminFn = typeof opts.notifyAdmin === 'function' ? opts.notifyAdmin : function() { return Promise.resolve(); };

  function checkDiscountImpact(discountAmount, normalProfit, sellingPrice) {
    discountAmount = parseFloat(discountAmount) || 0;
    normalProfit = parseFloat(normalProfit) || 0;
    sellingPrice = parseFloat(sellingPrice) || 0;

    if (discountAmount <= 0 || sellingPrice <= 0) {
      return { isViolation: false, finalMarginPct: 0 };
    }

    var netPrice = sellingPrice;
    var netProfit = normalProfit - discountAmount;
    var finalMarginPct = (netProfit / netPrice) * 100;
    var isViolation = finalMarginPct < thresholdPct;

    if (isViolation) {
      var alertText = '⚠️ [DISCOUNT ALERT] Discount ฿' + discountAmount.toLocaleString() + ' reduces margin to ' + finalMarginPct.toFixed(1) + '% (Threshold: ' + thresholdPct + '%)';
      notifyAdminFn(alertText).catch(function() {});
    }

    return {
      isViolation: isViolation,
      discountAmount: discountAmount,
      finalMarginPct: parseFloat(finalMarginPct.toFixed(1)),
      warningText: isViolation ? ('⚠️ [คำเตือนส่วนลด] ส่วนลด ฿' + discountAmount.toLocaleString() + ' ส่งผลให้มาร์จิ้นเหลือ ' + finalMarginPct.toFixed(1) + '% (ต่ำกว่าเกณฑ์ ' + thresholdPct + '%)') : null
    };
  }

  return { checkDiscountImpact: checkDiscountImpact, thresholdPct: thresholdPct };
};
