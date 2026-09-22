'use strict';
function textBubble(title, body, buttons) {
  var rows = [{ type: 'text', text: title, weight: 'bold', size: 'md' }, { type: 'text', text: body || 'ไม่มีบันทึกค้างอยู่ครับ', wrap: true, margin: 'md' }];
  (buttons || []).forEach(function(b) { rows.push({ type: 'button', style: b.style || 'secondary', action: { type: 'postback', label: b.label, data: b.data } }); });
  return { type: 'flex', altText: title, contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: rows } } };
}
function confirm(note) { return textBubble('✅ จดบันทึกแล้ว', note.text + (note.due_ts ? '\nเตือน: ' + note.due_ts.replace('T', ' ').slice(0, 16) : '')); }
function list(notes) {
  var buttons = []; (notes || []).slice(0, 12).forEach(function(n) { buttons.push({ label: 'เสร็จ #' + n.id, data: 'action=note_done&id=' + n.id }); buttons.push({ label: 'ลบ #' + n.id, data: 'action=note_del&id=' + n.id }); });
  var body = (notes || []).map(function(n) { return '#' + n.id + ' ' + n.text + (n.due_ts ? ' (' + n.due_ts.replace('T', ' ').slice(0, 16) + ')' : ''); }).join('\n');
  return textBubble('📝 บันทึกของคุณ', body, buttons);
}
module.exports = { confirm: confirm, list: list, textBubble: textBubble };
