'use strict';

/**
 * keenoc-mounting-wire.js — S2 Wire Keenoc Calculator to BOM Call-site (#19)
 * Integrates calculateKeenocMounting into app.js BOM generation.
 * Horus Pattern: Fail-closed fallback to legacy keenocSearch if calculator returns null/throws/catalog missing.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

var calculateKeenocMounting;
try {
  calculateKeenocMounting = require('./keenoc-mounting-calculator').calculateKeenocMounting;
} catch (e) {
  try {
    calculateKeenocMounting = require('../../linebot-r5-keenoc-autoscale/lib/keenoc-mounting-calculator').calculateKeenocMounting;
  } catch (e2) {}
}

function wireKeenocMounting(catalog, panelQty, roofType, legacyFallbackFn) {
  try {
    if (catalog && Array.isArray(catalog['Mounting - Keenoc']) && typeof calculateKeenocMounting === 'function') {
      var calcItems = calculateKeenocMounting(catalog, panelQty, roofType);
      if (Array.isArray(calcItems) && calcItems.length > 0) {
        return calcItems;
      }
    }
  } catch (e) {
    console.error('[keenoc-wire] Calculator error, triggering legacy fallback:', e.message);
  }

  // Fail-closed fallback to legacy code
  if (typeof legacyFallbackFn === 'function') {
    return legacyFallbackFn();
  }
  return [];
}

module.exports = { wireKeenocMounting: wireKeenocMounting };
