'use strict';

/**
 * multibrand-flex.js — Q6 Multi-Brand Comparison Flex Carousel (#6)
 * Detects "เทียบราคา / ยี่ห้อไหนดี" queries, searches catalog across inverter brands,
 * sorts cheap -> expensive, assigns tier badges, and builds Flex Carousel.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

function isCompareQuery(text) {
  return /เทียบราคา|ยี่ห้อไหนดี|อันไหนดี|แบรนด์ไหนดี|แนะนำยี่ห้อ|compare/i.test(text) ||
         (/\d+\s*(?:kw|กิโลวัตต์|กิโล)/i.test(text) && /เทียบ|ยี่ห้อ|แบรนด์/i.test(text));
}

function buildMultiBrandCompareFlex(catalog, text) {
  if (!catalog) return null;

  var kwMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kw|กิโลวัตต์|กิโล)/i);
  var targetKw = kwMatch ? parseFloat(kwMatch[1]) : 5; // Default 5kW if unspecified

  var phaseMatch = text.match(/([13])\s*(?:เฟส|phase|p)/i);
  var targetPhase = phaseMatch ? phaseMatch[1] : null;

  // Inverter sheets to scan
  var brandSheets = [
    { brand: 'ATMOCE', sheet: 'Inverters - ATMOCE' },
    { brand: 'Huawei', sheet: 'Inverters - Huawei' },
    { brand: 'Solis', sheet: 'Inverters - Solis' },
    { brand: 'Sigenergy', sheet: 'Inverters - Sigenergy' },
    { brand: 'Deye', sheet: 'Inverters - Deye' },
    { brand: 'Hoymiles', sheet: 'Inverters - Hoymiles' }
  ];

  var brandResults = [];

  brandSheets.forEach(function(bs) {
    var rows = catalog[bs.sheet] || [];
    var matchedRow = null;
    var minPrice = Infinity;

    rows.forEach(function(row) {
      var rawVals = Object.values(row).join(' ').toLowerCase();
      var kwInRow = rawVals.match(/(\d+(?:\.\d+)?)\s*kw/i);
      var rowKw = kwInRow ? parseFloat(kwInRow[1]) : null;

      if (!rowKw) {
        var modelKw = rawVals.match(/(\d{1,2})(?:k|kw)/i);
        if (modelKw) rowKw = parseFloat(modelKw[1]);
      }

      var price = 0;
      Object.keys(row).forEach(function(k) {
        if (/ราคา|price|cost/i.test(k)) {
          var p = parseFloat(row[k]);
          if (!isNaN(p) && p > 0) price = p;
        }
      });

      if (price <= 0) return;

      var kwMatches = rowKw ? Math.abs(rowKw - targetKw) <= 2.5 : true;

      var phaseMatches = true;
      if (targetPhase === '1') {
        var hasPhase3 = /3p|3phase|3\s*เฟส|3-phase/i.test(rawVals);
        phaseMatches = !hasPhase3; // Accept unless explicitly 3-phase
      } else if (targetPhase === '3') {
        var hasPhase1 = /1p|1phase|1\s*เฟส|1-phase/i.test(rawVals);
        phaseMatches = !hasPhase1; // Accept unless explicitly 1-phase
      }

      if (kwMatches && phaseMatches && price < minPrice) {
        minPrice = price;
        var modelName = '';
        Object.keys(row).forEach(function(k) {
          if (!modelName && /รุ่น|model|item/i.test(k)) modelName = String(row[k]);
        });
        if (!modelName) modelName = String(Object.values(row)[1] || Object.values(row)[0] || '');
        matchedRow = { brand: bs.brand, model: modelName, price: price, sheet: bs.sheet };
      }
    });

    if (matchedRow) brandResults.push(matchedRow);
  });

  // Fallback: If catalog inverter sheets yield no matches, check Finalprice tab
  if (brandResults.length === 0 && catalog.Finalprice) {
    var fpBrands = ['ATMOCE', 'Huawei', 'Solis'];
    fpBrands.forEach(function(b) {
      var fpRow = catalog.Finalprice.find(function(r) {
        var raw = Object.values(r).join(' ').toLowerCase();
        return raw.indexOf(b.toLowerCase()) >= 0;
      });
      if (fpRow) {
        var p = parseFloat(fpRow['ราคาขาย'] || fpRow['selling_price'] || 0);
        if (p > 0) brandResults.push({ brand: b, model: 'ระบบโซลาร์ ' + targetKw + 'kW', price: p, sheet: 'Finalprice' });
      }
    });
  }

  if (brandResults.length === 0) return null;

  // Sort cheap -> expensive
  brandResults.sort(function(a, b) { return a.price - b.price; });

  // Assign Tier Badges
  var bubbles = brandResults.map(function(item, idx) {
    var tierLabel = '🟢 Economy';
    var tierColor = '#27ae60';
    if (idx === 1) {
      tierLabel = '🔵 Standard / Value';
      tierColor = '#2980b9';
    } else if (idx >= 2) {
      tierLabel = '⭐ Premium';
      tierColor = '#8e44ad';
    }

    var fmtPrice = '฿' + item.price.toLocaleString('en-US');

    return {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: tierColor, paddingAll: '12px',
        contents: [
          { type: 'text', text: tierLabel, color: '#ffffff', size: 'xs', weight: 'bold' },
          { type: 'text', text: item.brand, color: '#ffffff', size: 'lg', weight: 'bold', margin: 'xs' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'text', text: 'รุ่น: ' + item.model.slice(0, 30), size: 'sm', weight: 'bold', wrap: true },
          { type: 'text', text: 'ราคาประมาณ: ' + fmtPrice, size: 'md', color: '#e67e22', weight: 'bold', margin: 'md' },
          { type: 'text', text: 'ขนาดระบบ: ' + targetKw + ' kW' + (targetPhase ? ' (' + targetPhase + ' เฟส)' : ''), size: 'xs', color: '#7f8c8d', margin: 'xs' }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          {
            type: 'button',
            action: {
              type: 'message',
              label: '📝 ขอใบเสนอราคา ' + item.brand,
              text: 'ขอ bom ' + item.brand + ' ' + targetKw + 'kw' + (targetPhase ? ' ' + targetPhase + 'phase' : '')
            },
            style: 'primary',
            color: tierColor,
            height: 'sm'
          }
        ]
      }
    };
  });

  return {
    type: 'flex',
    altText: '⚡ เปรียบเทียบราคาโซลาร์ ' + targetKw + 'kW (' + brandResults.length + ' แบรนด์)',
    contents: {
      type: 'carousel',
      contents: bubbles
    }
  };
}

module.exports = {
  isCompareQuery: isCompareQuery,
  buildMultiBrandCompareFlex: buildMultiBrandCompareFlex
};
