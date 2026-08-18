'use strict';

/**
 * sale-identity-payload.js — U3 Sale Identity & Payload Builder (#B1)
 * Normalizes phone numbers (strips dashes/spaces, converts +66 -> 0).
 * Attaches sale_line_user_id = ev.source.userId for WordPress dashboard mapping.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

function normalizePhone(phone) {
  if (!phone) return '';
  phone = String(phone).trim();
  // Strip spaces, dashes, parentheses
  phone = phone.replace(/[\s\-\(\)]/g, '');
  // Convert +66 or 66 at start to 0
  if (phone.indexOf('+66') === 0) {
    phone = '0' + phone.slice(3);
  } else if (phone.indexOf('66') === 0 && phone.length === 11) {
    phone = '0' + phone.slice(2);
  }
  return phone;
}

function buildSyncPayload(spec, quoteResult, lineUserId) {
  spec = spec || {};
  quoteResult = quoteResult || {};

  return {
    quote_number: quoteResult.quote_number || '',
    sale_line_user_id: String(lineUserId || '').trim(),
    customer_name: spec.customer_name || '',
    customer_phone: normalizePhone(spec.phone || spec.customer_phone || ''),
    customer_address: spec.customer_address || spec.project_address || '',
    brand: quoteResult.brand || spec.brand || '',
    size_kw: quoteResult.size_kw || spec.size_kw || 0,
    phase: quoteResult.phase || spec.phase || '',
    selling_price: quoteResult.grand_total || quoteResult.price || 0,
    items: quoteResult.items || [],
    created_at: Date.now()
  };
}

module.exports = {
  normalizePhone: normalizePhone,
  buildSyncPayload: buildSyncPayload
};
