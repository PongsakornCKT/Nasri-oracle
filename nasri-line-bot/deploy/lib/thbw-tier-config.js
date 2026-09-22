'use strict';

/**
 * thbw-tier-config.js — T3 THB/W Tier Tag Configurator (#5)
 * Classifies THB/W ratio into Economy / Standard / Premium tiers.
 * Configurable thresholds as per P'Phong Decision A4 ("รอพี่พงเคาะเกณฑ์จริง").
 *
 * Default Config:
 *   1-5 kW:   < 28 = Economy, 28-35 = Standard, > 35 = Premium
 *   10-20 kW: < 20 = Economy, 20-25 = Standard, > 25 = Premium
 *   > 20 kW:  < 18 = Economy, 18-22 = Standard, > 22 = Premium
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

var defaultTierConfig = {
  // Configurable thresholds by kW range (awaiting P'Phong final decision)
  small:  { maxKw: 5.0,  econMax: 28.0, stdMax: 35.0 },
  medium: { maxKw: 20.0, econMax: 20.0, stdMax: 25.0 },
  large:  { maxKw: 999., econMax: 18.0, stdMax: 22.0 }
};

function getThbPerWTier(thbPerW, systemKw, config) {
  thbPerW = parseFloat(thbPerW) || 0;
  systemKw = parseFloat(systemKw) || 5.0;
  config = config || defaultTierConfig;

  if (thbPerW <= 0) return { tier: 'Standard', badge: '🔵 Standard', color: '#2980b9' };

  var rules = config.large;
  if (systemKw <= config.small.maxKw) rules = config.small;
  else if (systemKw <= config.medium.maxKw) rules = config.medium;

  if (thbPerW <= rules.econMax) {
    return { tier: 'Economy', badge: '🟢 Economy', color: '#27ae60', thb_per_w: thbPerW };
  } else if (thbPerW <= rules.stdMax) {
    return { tier: 'Standard', badge: '🔵 Standard', color: '#2980b9', thb_per_w: thbPerW };
  } else {
    return { tier: 'Premium', badge: '⭐ Premium', color: '#8e44ad', thb_per_w: thbPerW };
  }
}

module.exports = {
  getThbPerWTier: getThbPerWTier,
  defaultTierConfig: defaultTierConfig
};
