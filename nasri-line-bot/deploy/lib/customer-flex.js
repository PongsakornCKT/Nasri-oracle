'use strict';

function truncate(value, max) {
  var chars = Array.from(String(value == null || value === '' ? '—' : value));
  var out = '';
  for (var i = 0; i < chars.length; i++) {
    if (out.length + chars[i].length > max - 1) return out + '…';
    out += chars[i];
  }
  return out;
}
function text(value, extra) { return Object.assign({ type: 'text', text: truncate(value, 2000), size: 'sm', wrap: true }, extra || {}); }
function postback(label, data, enabled) {
  if (!enabled) return { type: 'button', action: { type: 'message', label: label, text: 'ไม่มี' + label + 'ในระบบ' }, style: 'secondary', color: '#bdbdbd', margin: 'sm' };
  return { type: 'button', action: { type: 'postback', label: label, data: data, displayText: label }, style: 'secondary', margin: 'sm' };
}
function docQuickReplies(lead) {
  var id = encodeURIComponent(String(lead.lead_id || lead.id || ''));
  var defs = [['สัญญา', 'contract', !!lead.has_contract], ['รายงานสำรวจ', 'survey', !!lead.survey_id], ['รีวิว', 'review', !!lead.has_review], ['ใบรับมอบ', 'handover', !!lead.has_handover], ['ใบเสนอราคา', 'quote', Array.isArray(lead.quotes) && lead.quotes.length > 0]];
  return defs.map(function (d) {
    if (!d[2]) return { type: 'action', action: { type: 'message', label: d[0] + ' (ไม่มี)', text: 'ยังไม่มี' + d[0] + 'ในระบบครับ' } };
    return { type: 'action', action: { type: 'postback', label: d[0], data: 'action=lead_doc&id=' + id + '&type=' + d[1], displayText: d[0] } };
  });
}
function buildLeadProfileFlex(lead) {
  var latest = Array.isArray(lead.quotes) && lead.quotes[0];
  var bubble = { type: 'bubble', size: 'kilo', header: { type: 'box', layout: 'vertical', backgroundColor: '#1464a5', paddingAll: '14px', contents: [text('👤 ข้อมูลลูกค้า', { color: '#ffffff', weight: 'bold', size: 'lg' })] }, body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [text(lead.name, { weight: 'bold', size: 'md' }), text('☎ ' + (lead.phone || '—')), text('สถานะ: ' + (lead.status || '—')), text('เจ้าของ: ' + (lead.sale_name || '—')), text('งานติดตั้ง: ' + (lead.has_handover ? 'มีใบรับมอบ' : 'ยังไม่มีใบรับมอบ'))] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [text(latest ? 'ใบล่าสุด: ' + latest.qt_no + ' • ฿' + Number(latest.total || 0).toLocaleString('th-TH') : 'ยังไม่มีใบเสนอราคา', { size: 'xs', color: '#666666' })] } };
  return { type: 'flex', altText: truncate('ข้อมูลลูกค้า: ' + (lead.name || '—'), 400), contents: bubble, quickReply: { items: docQuickReplies(lead) } };
}
function buildLeadChooserFlex(leads) {
  var bubbles = (leads || []).slice(0, 10).map(function (lead) { return { type: 'bubble', size: 'micro', body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [text(lead.name, { weight: 'bold' }), text(lead.phone || '—', { size: 'xs' }), { type: 'button', action: { type: 'postback', label: 'เลือก', data: 'action=lead_pick&id=' + encodeURIComponent(String(lead.lead_id)) + '&q=' + encodeURIComponent(String(lead.phone || lead.name || '')), displayText: 'เลือก ' + (lead.name || '') }, style: 'primary', color: '#1464a5' }] } }; });
  return { type: 'flex', altText: 'พบลูกค้า ' + bubbles.length + ' ราย', contents: { type: 'carousel', contents: bubbles } };
}
function buildLeadDocFlex(doc) {
  var docs = Array.isArray(doc && doc.documents) ? doc.documents : [];
  var contents = [text(doc && doc.type ? 'เอกสาร: ' + doc.type : 'เอกสาร', { weight: 'bold', size: 'md' })];
  docs.slice(0, 12).forEach(function (d) { contents.push(text(d.qt_no || d.survey_no || d.drive_id || 'เอกสาร', { margin: 'md' })); if (d.url && /^https:\/\//i.test(d.url)) contents.push({ type: 'button', action: { type: 'uri', label: 'เปิดเอกสาร', uri: d.url }, style: 'primary', color: '#1464a5', margin: 'sm' }); else if (d.thumbnail_url && /^https:\/\//i.test(d.thumbnail_url)) contents.push({ type: 'button', action: { type: 'uri', label: 'เปิดรูป', uri: d.thumbnail_url }, style: 'secondary', margin: 'sm' }); });
  if (!docs.length) contents.push(text('ยังไม่มีเอกสารนี้ครับ', { color: '#777777', margin: 'md' }));
  return { type: 'flex', altText: docs.length ? 'เอกสาร' : 'ยังไม่มีเอกสาร', contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: contents } } };
}
function buildReviewCarouselFlex(review) {
  var docs = Array.isArray(review && review.documents) ? review.documents : [];
  var bubbles = docs.slice(0, 12).filter(function (d) { return d.thumbnail_url && /^https:\/\//i.test(d.thumbnail_url); }).map(function (d) { return { type: 'bubble', hero: { type: 'image', url: d.thumbnail_url, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' }, body: { type: 'box', layout: 'vertical', contents: [text('รูปรีวิว', { size: 'sm' })] } }; });
  if (!bubbles.length) return buildLeadDocFlex({ type: 'review', documents: [] });
  return { type: 'flex', altText: 'รูปรีวิวลูกค้า', contents: { type: 'carousel', contents: bubbles } };
}
module.exports = { buildLeadProfileFlex: buildLeadProfileFlex, buildLeadChooserFlex: buildLeadChooserFlex, buildLeadDocFlex: buildLeadDocFlex, buildReviewCarouselFlex: buildReviewCarouselFlex, normalizePhone: function (s) { return String(s || '').replace(/[\s\-().]/g, '').replace(/^\+?66/, '0'); } };
