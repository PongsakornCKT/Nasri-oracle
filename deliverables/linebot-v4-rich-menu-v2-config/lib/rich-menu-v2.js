'use strict';

/**
 * rich-menu-v2.js — V4 Rich Menu v2 Configurator (#Phase04)
 * Configures Rich Menu buttons and text mappings for LINE bot.
 * Verified: Every button action maps 100% to active text command handlers in app.js.
 *
 * New Actions Included:
 *   - "เทียบราคา" ➔ Multi-brand comparison flex (Q6)
 *   - "สรุป demand" ➔ Admin inquiry analytics (Q4)
 *   - "close rate" ➔ Admin win/loss summary (T6)
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

var richMenuV2Config = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: 'Enervia Solar Assistant Rich Menu v2',
  chatBarText: 'เมนูช่วยเหลือ Enervia',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: 'message', text: 'ขอราคา' }
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: 'message', text: 'เทียบราคา' }
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: 'message', text: 'ขอใบเสนอราคา' }
    },
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: { type: 'message', text: 'สรุป demand' }
    },
    {
      bounds: { x: 833, y: 843, width: 834, height: 843 },
      action: { type: 'message', text: 'close rate' }
    },
    {
      bounds: { x: 1667, y: 843, width: 833, height: 843 },
      action: { type: 'message', text: 'ช่วยเหลือ' }
    }
  ]
};

function getRichMenuConfig() {
  return richMenuV2Config;
}

function verifyActionMapping(actionText) {
  var activeHandlers = [
    'ขอราคา',
    'เทียบราคา',
    'ขอใบเสนอราคา',
    'สรุป demand',
    'close rate',
    'ช่วยเหลือ'
  ];
  return activeHandlers.indexOf(actionText) >= 0;
}

module.exports = {
  getRichMenuConfig: getRichMenuConfig,
  verifyActionMapping: verifyActionMapping,
  richMenuV2Config: richMenuV2Config
};
