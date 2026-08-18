'use strict';

/**
 * pdpa-postback-builder.js — V2 PDPA Postback & Quick Reply Builder (#LINE UX v2)
 * Enhances PDPA consent message with LINE Quick Replies & Postback Buttons.
 * Action: "action=consent&qt=<qtId>" and "action=decline&qt=<qtId>"
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

function buildPdpaConsentMessage(customerName, qtId) {
  customerName = customerName || 'ลูกค้า';
  qtId = qtId || '';

  return {
    type: 'text',
    text: '📋 แจ้งนโยบายความเป็นส่วนตัว (PDPA)\n\n' +
      'ระบบจะบันทึกชื่อลูกค้า "' + customerName + '" ลงในฐานข้อมูลเพื่อสร้างใบเสนอราคา\n\n' +
      'กดปุ่ม "ยินยอม" หรือพิมพ์ "ยินยอม" เพื่อดำเนินการต่อ',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: '✅ ยินยอม',
            data: 'action=consent&qt=' + encodeURIComponent(qtId),
            displayText: 'ยินยอม'
          }
        },
        {
          type: 'action',
          action: {
            type: 'postback',
            label: '❌ ไม่ยินยอม',
            data: 'action=decline&qt=' + encodeURIComponent(qtId),
            displayText: 'ไม่ยินยอม'
          }
        }
      ]
    }
  };
}

module.exports = {
  buildPdpaConsentMessage: buildPdpaConsentMessage
};
