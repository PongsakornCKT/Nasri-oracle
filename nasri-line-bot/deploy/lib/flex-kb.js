'use strict';

function fileName(source) {
  var value = String(source || '').replace(/\\/g, '/');
  return value.slice(value.lastIndexOf('/') + 1) || value;
}

function buildKbAnswerFlex(data) {
  data = data || {};
  var answer = String(data.answer || 'ไม่มีข้อมูลเรื่องนี้ในเอกสาร');
  var sources = (data.sources || []).map(fileName).filter(Boolean);
  var sourceText = sources.length ? sources.join(', ') : 'ไม่มีไฟล์อ้างอิง';
  var dateText = data.snapshot_date ? String(data.snapshot_date).slice(0, 10) : 'ไม่ทราบวันที่';
  return {
    type: 'flex',
    altText: '📚 ตอบจากเอกสาร',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#1a237e',
        contents: [{ type: 'text', text: '📚 ตอบจากเอกสาร', weight: 'bold', size: 'md', color: '#ffffff' }],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px',
        contents: [{ type: 'text', text: answer, wrap: true, size: 'sm', color: '#333333' }],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px', spacing: 'xs',
        contents: [
          { type: 'text', text: 'แหล่งอ้างอิง: ' + sourceText, wrap: true, size: 'xxs', color: '#666666' },
          { type: 'text', text: 'ข้อมูล ณ ' + dateText, size: 'xxs', color: '#888888' },
        ],
      },
    },
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: 'ถามเพิ่ม', text: 'ถามเพิ่ม' } },
        { type: 'action', action: { type: 'message', label: 'ลูกค้า', text: 'ลูกค้า' } },
        { type: 'action', action: { type: 'message', label: 'สต็อก', text: 'สต็อก' } },
      ],
    },
  };
}

module.exports = { buildKbAnswerFlex: buildKbAnswerFlex, fileName: fileName };
