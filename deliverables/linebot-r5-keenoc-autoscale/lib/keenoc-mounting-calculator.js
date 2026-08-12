'use strict';

/**
 * keenoc-mounting-calculator.js — R5 Keenoc Mounting Auto-Scale Calculator (#19)
 * Calculates Keenoc mounting structure items (Rail, End Clamp, Mid Clamp, Roof Hook/L-Feet)
 * from catalog tab "Mounting - Keenoc" (gid 1345585929).
 *
 * Formulas:
 *   - Rail (4200mm): 1 per panel
 *   - End Clamp: panel_qty * 2
 *   - Mid Clamp: max(0, (panel_qty - 1) * 2)
 *   - Roof Anchor / Hook: panel_qty * 2 (metal -> L-Feet, tile -> Tile Hook, ground/carport -> Ground Mount / Connector)
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

function calculateKeenocMounting(catalog, panelQty, roofType) {
  panelQty = parseInt(panelQty, 10) || 0;
  if (panelQty <= 0) return [];
  roofType = (roofType || 'metal').toLowerCase();

  var keenocRows = (catalog && Array.isArray(catalog['Mounting - Keenoc'])) ? catalog['Mounting - Keenoc'] : [];

  function searchKeenoc(keyword, fallbackPrice) {
    var kwLower = keyword.toLowerCase();
    var foundRow = keenocRows.find(function(r) {
      return Object.values(r).join(' ').toLowerCase().indexOf(kwLower) >= 0;
    });

    if (foundRow) {
      var price = 0;
      Object.keys(foundRow).forEach(function(k) {
        if (/ราคา|price|cost/i.test(k)) {
          var p = parseFloat(foundRow[k]);
          if (!isNaN(p) && p > 0) price = p;
        }
      });
      var name = foundRow['รุ่น'] || foundRow['model'] || foundRow['รายการ'] || foundRow['description'] || Object.values(foundRow)[0] || keyword;
      if (price > 0) {
        return { name: String(name), price: price, source: 'catalog', row: foundRow };
      }
    }
    return { name: keyword, price: fallbackPrice, source: 'fallback', row: null };
  }

  var items = [];

  // 1. Rail 4200mm — 1 per panel
  var railInfo = searchKeenoc('4200', 450);
  if (!railInfo.row) railInfo = searchKeenoc('Rail', 450);
  items.push({
    part_number: 'RAIL-4200',
    part_name: railInfo.name || 'Keenoc Aluminum Rail 4200mm',
    manufacturer: 'Keenoc',
    category: 'mounting_rail',
    quantity: panelQty,
    unit_cost: railInfo.price,
    total_cost: panelQty * railInfo.price,
    notes: '1 rail per panel',
    price_source: railInfo.source
  });

  // 2. End Clamp — panelQty * 2
  var ecQty = panelQty * 2;
  var ecInfo = searchKeenoc('End Clamp', 35);
  if (!ecInfo.row) ecInfo = searchKeenoc('End', 35);
  items.push({
    part_number: 'END-CLAMP',
    part_name: ecInfo.name || 'Keenoc End Clamp',
    manufacturer: 'Keenoc',
    category: 'mounting_clamp',
    quantity: ecQty,
    unit_cost: ecInfo.price,
    total_cost: ecQty * ecInfo.price,
    notes: '2 end clamps per row',
    price_source: ecInfo.source
  });

  // 3. Mid Clamp — max(0, (panelQty - 1) * 2)
  var mcQty = Math.max(0, (panelQty - 1) * 2);
  if (mcQty > 0) {
    var mcInfo = searchKeenoc('Mid Clamp', 30);
    if (!mcInfo.row) mcInfo = searchKeenoc('Mid', 30);
    items.push({
      part_number: 'MID-CLAMP',
      part_name: mcInfo.name || 'Keenoc Mid Clamp',
      manufacturer: 'Keenoc',
      category: 'mounting_clamp',
      quantity: mcQty,
      unit_cost: mcInfo.price,
      total_cost: mcQty * mcInfo.price,
      notes: '2 mid clamps per panel junction',
      price_source: mcInfo.source
    });
  }

  // 4. Roof Anchor / Hook — panelQty * 2
  var raQty = panelQty * 2;
  var hookSearchKey = 'L-Feet';
  var fallbackHookPrice = 45;
  var hookPartNum = 'L-FEET-80';

  if (roofType === 'tile' || roofType === 'ซีแพค') {
    hookSearchKey = 'Tile';
    fallbackHookPrice = 120;
    hookPartNum = 'TILE-HOOK';
  } else if (roofType === 'ground' || roofType === 'carport') {
    hookSearchKey = 'Ground';
    fallbackHookPrice = 250;
    hookPartNum = 'GROUND-MOUNT';
  }

  var hookInfo = searchKeenoc(hookSearchKey, fallbackHookPrice);
  items.push({
    part_number: hookPartNum,
    part_name: hookInfo.name || ('Keenoc ' + hookSearchKey + ' Roof Anchor'),
    manufacturer: 'Keenoc',
    category: 'mounting_anchor',
    quantity: raQty,
    unit_cost: hookInfo.price,
    total_cost: raQty * hookInfo.price,
    notes: 'Roof anchor for ' + roofType + ' roof',
    price_source: hookInfo.source
  });

  return items;
}

module.exports = { calculateKeenocMounting: calculateKeenocMounting };
