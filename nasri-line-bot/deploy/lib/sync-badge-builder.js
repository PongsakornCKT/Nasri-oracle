'use strict';

/**
 * sync-badge-builder.js — U4 Dashboard Sync Badge Builder (#B6)
 * Generates status line badges for Flex cards & updates status on flush.
 * Initial status: "⏳ รอขึ้น dashboard"
 * Post-flush status: "✓ ขึ้น dashboard แล้ว (lead #<id>)"
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

function getPendingBadgeText() {
  return '⏳ รอขึ้น dashboard';
}

function getSyncedBadgeText(leadId) {
  if (leadId) {
    return '✓ ขึ้น dashboard แล้ว (lead #' + leadId + ')';
  }
  return '✓ ขึ้น dashboard แล้ว';
}

function createSyncUpdateMessage(qtNo, leadId) {
  return {
    type: 'text',
    text: '✓ [Dashboard Sync] ใบเสนอราคา ' + qtNo + ' ขึ้น dashboard เรียบร้อยแล้ว' + (leadId ? ' (Lead #' + leadId + ')' : '')
  };
}

module.exports = {
  getPendingBadgeText: getPendingBadgeText,
  getSyncedBadgeText: getSyncedBadgeText,
  createSyncUpdateMessage: createSyncUpdateMessage
};
