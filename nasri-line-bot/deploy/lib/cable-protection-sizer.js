'use strict';

/**
 * cable-protection-sizer.js — W1 Cable & Protection Sizing Engine (#16)
 * Calculates AC Breaker, AC Cable, DC Cable, DC SPD, Grounding Cable & Voltage Drop
 * based on EIT Standard 022013-22 (วสท. 2565), MEA/PEA Code, & IEC 60364-7-712.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

// Resistance table per km (IEC 60228 Copper Conductors at 75C)
// Resistance in Ohm/km
var CABLE_RESISTANCE_OHM_KM = {
  4.0: 4.95,
  6.0: 3.30,
  10.0: 1.91,
  16.0: 1.21,
  25.0: 0.78,
  35.0: 0.55,
  50.0: 0.39,
  70.0: 0.27,
  95.0: 0.21,
  120.0: 0.16
};

// Standard Breaker Ratings (A)
var STANDARD_BREAKER_SIZES = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];

function calculateSizing(opts) {
  opts = opts || {};
  var kw = parseFloat(opts.inverterKw || opts.size_kw || 5);
  var phase = parseInt(opts.phase || 1);
  var distanceM = parseFloat(opts.distanceMeters || opts.distance || 30);
  var panelIsc = parseFloat(opts.panelIsc || 13.5);

  if (kw <= 0) kw = 5.0;
  if (phase !== 1 && phase !== 3) phase = 1;

  // 1. Calculate Rated Inverter AC Current I_inv
  // Formula: 1P: P_ac / (220 * 0.99), 3P: P_ac / (sqrt(3) * 400 * 0.99)
  // Standards: EIT 022013-22 Sec 12.3.4 (Continuous Duty Factor 1.25)
  var pf = 0.99;
  var iInv = 0;
  if (phase === 1) {
    iInv = (kw * 1000) / (220 * pf);
  } else {
    iInv = (kw * 1000) / (Math.sqrt(3) * 400 * pf);
  }

  // 2. AC Breaker Sizing (I_breaker >= I_inv * 1.25, with Master Matrix minimums)
  var requiredBreakerAmp = iInv * 1.25;

  // Master Matrix Breaker minimum override per EIT Spec Table
  var minBreakerMap1P = { 3.0: 16, 5.0: 32, 6.0: 40, 8.0: 50, 10.0: 63 };
  var minBreakerMap3P = { 5.0: 16, 10.0: 25, 15.0: 32, 20.0: 40, 25.0: 50, 30.0: 63, 50.0: 100, 100.0: 200 };

  var minRequired = (phase === 1 ? minBreakerMap1P[kw] : minBreakerMap3P[kw]) || requiredBreakerAmp;
  if (minRequired > requiredBreakerAmp) requiredBreakerAmp = minRequired;

  var breakerRating = STANDARD_BREAKER_SIZES[0];
  for (var b = 0; b < STANDARD_BREAKER_SIZES.length; b++) {
    if (STANDARD_BREAKER_SIZES[b] >= requiredBreakerAmp) {
      breakerRating = STANDARD_BREAKER_SIZES[b];
      break;
    }
  }
  var breakerType = phase === 1 ? 'MCB 1P' : (breakerRating <= 63 ? 'MCB 3P' : 'MCCB 3P');

  // 3. AC Cable Sizing & Voltage Drop Limit
  // Standard Master Matrix Lookups:
  var acCableSqmm = 4.0;
  var groundSqmm = 6.0;

  if (phase === 1) {
    if (kw <= 3.0) { acCableSqmm = 4.0; groundSqmm = 6.0; }
    else if (kw <= 5.0) { acCableSqmm = 6.0; groundSqmm = 6.0; }
    else if (kw <= 6.0) { acCableSqmm = 10.0; groundSqmm = 10.0; }
    else if (kw <= 8.0) { acCableSqmm = 16.0; groundSqmm = 16.0; }
    else { acCableSqmm = 25.0; groundSqmm = 16.0; }
  } else {
    if (kw <= 5.0) { acCableSqmm = 4.0; groundSqmm = 6.0; }
    else if (kw <= 10.0) { acCableSqmm = 6.0; groundSqmm = 6.0; }
    else if (kw <= 15.0) { acCableSqmm = 10.0; groundSqmm = 10.0; }
    else if (kw <= 20.0) { acCableSqmm = 16.0; groundSqmm = 16.0; }
    else if (kw <= 25.0) { acCableSqmm = 25.0; groundSqmm = 16.0; }
    else if (kw <= 30.0) { acCableSqmm = 25.0; groundSqmm = 16.0; }
    else if (kw <= 50.0) { acCableSqmm = 50.0; groundSqmm = 25.0; }
    else { acCableSqmm = 120.0; groundSqmm = 50.0; }
  }

  // Voltage Drop Calculation: DeltaV % = (2 * L * I_inv * R_cable) / V_system * 100
  var rKm = CABLE_RESISTANCE_OHM_KM[acCableSqmm] || 1.0;
  var rMeter = rKm / 1000.0;
  var vSystem = phase === 1 ? 220 : 400;
  var vDropPct = ((2 * distanceM * iInv * rMeter) / vSystem) * 100.0;
  var isVDropWarning = vDropPct > 2.0;

  // 4. DC Cable Sizing (H1Z2Z2-K / PV1-F)
  // Formula: I_dc_capacity >= I_sc_panel * 1.56
  var dcCableSqmm = (panelIsc * 1.56 > 30 || distanceM > 30) ? 6.0 : 4.0;
  if (kw >= 50.0) dcCableSqmm = 6.0;

  // 5. DC SPD Voltage Rating
  var dcSpdVoltage = (kw >= 50.0) ? '1100V DC' : '1000V DC';

  // 6. Build Standard Output Items Array
  var acCoreCount = phase === 1 ? 2 : 4;
  var items = [
    {
      part_number: breakerType + '-' + breakerRating + 'A',
      part_name: 'AC Circuit Breaker ' + breakerType + ' ' + breakerRating + 'A',
      quantity: 1,
      unit_cost: phase === 1 ? 450 : 1800,
      spec: 'EIT 022013-22 Sec 12.3.4 (1.25 Continuous Factor)'
    },
    {
      part_number: 'CABLE-AC-' + acCoreCount + 'C-' + acCableSqmm,
      part_name: 'สาย AC Power Cable ' + acCoreCount + 'C x ' + acCableSqmm + ' sq.mm',
      quantity: Math.ceil(distanceM),
      unit_cost: acCableSqmm * 18,
      spec: 'EIT 022013-22 / IEC 60228 (Voltage drop: ' + vDropPct.toFixed(2) + '%)'
    },
    {
      part_number: 'CABLE-DC-PV1F-' + dcCableSqmm,
      part_name: 'สาย DC Solar Cable H1Z2Z2-K ' + dcCableSqmm + ' sq.mm (แดง/ดำ)',
      quantity: Math.ceil(distanceM * 2),
      unit_cost: dcCableSqmm * 7.5,
      spec: 'EN 50618 / IEC 62930 1500V DC'
    },
    {
      part_number: 'SPD-DC-TYPE2-' + dcSpdVoltage.replace(' ', ''),
      part_name: 'DC Surge Protection Device (SPD) Type 2 ' + dcSpdVoltage,
      quantity: kw >= 30 ? 2 : 1,
      unit_cost: 1200,
      spec: 'IEC 61643-31 / IEC 60364-7-712'
    },
    {
      part_number: 'CABLE-G-THW-' + groundSqmm,
      part_name: 'สายดิน THW/THW-f ' + groundSqmm + ' sq.mm (เขียว-เหลือง)',
      quantity: Math.ceil(distanceM),
      unit_cost: groundSqmm * 5.5,
      spec: 'EIT 022013-22 Grounding Standard'
    }
  ];

  return {
    inverter_kw: kw,
    phase: phase,
    i_inv_amp: parseFloat(iInv.toFixed(2)),
    ac_breaker: { rating_a: breakerRating, type: breakerType },
    ac_cable: { sqmm: acCableSqmm, cores: acCoreCount },
    dc_cable: { sqmm: dcCableSqmm },
    dc_spd: { voltage: dcSpdVoltage },
    ground_wire: { sqmm: groundSqmm },
    voltage_drop_pct: parseFloat(vDropPct.toFixed(2)),
    is_vdrop_warning: isVDropWarning,
    items: items
  };
}

module.exports = {
  calculateSizing: calculateSizing,
  CABLE_RESISTANCE_OHM_KM: CABLE_RESISTANCE_OHM_KM,
  STANDARD_BREAKER_SIZES: STANDARD_BREAKER_SIZES
};
