'use strict';

/**
 * line-qt-prefix.js — U1 LINE QT Prefix Engine (#B2)
 * Ensures all quotations created via LINE bot use "LINE-" prefix (e.g. "LINE-QT-2026-0812-001").
 * Normalizes input QT IDs for searches so both legacy "QT-..." and "LINE-QT-..." match cleanly.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

function ensureLinePrefix(qtNo) {
  if (!qtNo) return qtNo;
  qtNo = String(qtNo).trim();
  if (/^line-/i.test(qtNo)) return qtNo;
  return 'LINE-' + qtNo;
}

function normalizeQtQuery(query) {
  if (!query) return '';
  query = String(query).trim();
  // Strips leading LINE- if present, returning base QT number for flexible lookup
  return query.replace(/^line-/i, '');
}

function getQtRegexPattern() {
  // Regex pattern supporting both legacy QT-... and LINE-QT-...
  return /(?:LINE-)?QT-[A-Za-z0-9_-]+/gi;
}

module.exports = {
  ensureLinePrefix: ensureLinePrefix,
  normalizeQtQuery: normalizeQtQuery,
  getQtRegexPattern: getQtRegexPattern
};
