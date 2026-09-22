'use strict';

/**
 * lib/flex-dispatch.js
 * Flex Message builders for LINE Dispatch ACK & Callback Results.
 */

/**
 * Build Flex Message for Dispatch Request ACK.
 *
 * @param {Object} data
 * @param {string} data.jobId - e.g. 'ld_a1b2c3d4e5f6'
 * @param {string} data.action - 'status' | 'peek' | 'dispatch'
 * @param {string} [data.agent] - 'pa' | 'wy' | 'nasri' | 'all'
 * @param {string} [data.prompt] - Command text
 * @param {string} [data.note] - Note from dispatch API e.g. 'ส่งเข้า tmux แล้ว'
 * @returns {Object} LINE Flex Message payload
 */
function buildDispatchAckFlex(data) {
  data = data || {};
  var jobId = String(data.jobId || 'ld_pending');
  var action = String(data.action || 'dispatch');
  var agent = String(data.agent || 'fleet').toUpperCase();
  var prompt = String(data.prompt || 'เช็คสถานะระบบ').trim();
  var note = String(data.note || 'รับคำสั่งแล้ว').trim();

  var title = action === 'status' ? '📊 Fleet Status' : (action === 'peek' ? '👀 Peek Agent — ' + agent : '🚀 Dispatch Command — ' + agent);
  var headerBg = action === 'status' ? '#37474f' : (action === 'peek' ? '#00695c' : '#1565c0');

  var bodyContents = [
    {
      type: 'box', layout: 'baseline', spacing: 'sm',
      contents: [
        { type: 'text', text: 'Job ID', color: '#888888', size: 'xs', flex: 2 },
        { type: 'text', text: jobId, weight: 'bold', size: 'xs', color: '#333333', flex: 5 }
      ]
    },
    {
      type: 'box', layout: 'baseline', spacing: 'sm',
      contents: [
        { type: 'text', text: 'Agent', color: '#888888', size: 'xs', flex: 2 },
        { type: 'text', text: agent, weight: 'bold', size: 'xs', color: '#1565c0', flex: 5 }
      ]
    }
  ];

  if (action === 'dispatch' && prompt) {
    bodyContents.push({
      type: 'box', layout: 'vertical', marginTop: 'md', spacing: 'xs',
      contents: [
        { type: 'text', text: 'คำสั่ง:', color: '#888888', size: 'xs' },
        { type: 'text', text: prompt.length > 200 ? prompt.slice(0, 200) + '…' : prompt, wrap: true, size: 'sm', color: '#333333' }
      ]
    });
  }

  bodyContents.push({
    type: 'box', layout: 'vertical', marginTop: 'md', paddingAll: '8px', backgroundColor: '#f5f5f5', cornerRadius: '6px',
    contents: [
      { type: 'text', text: '📌 สถานะ: ' + note, wrap: true, size: 'xs', color: '#2e7d32', weight: 'bold' }
    ]
  });

  return {
    type: 'flex',
    altText: title + ' (' + jobId + ')',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: headerBg,
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'md', color: '#ffffff' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
        contents: bodyContents
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px', spacing: 'xs',
        contents: [
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'message', label: '📊 เช็คสถานะ fleet', text: '/status' }
          }
        ]
      }
    },
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '📊 เช็คสถานะ', text: '/status' } },
        { type: 'action', action: { type: 'message', label: '👀 ดู pa', text: 'ดู pa' } },
        { type: 'action', action: { type: 'message', label: '👀 ดู wy', text: 'ดู wy' } },
        { type: 'action', action: { type: 'message', label: '👀 ดู nasri', text: 'ดู nasri' } }
      ]
    }
  };
}

/**
 * Build Flex Message for Dispatch Result Callback.
 *
 * @param {Object} data
 * @param {string} data.job_id - Job ID
 * @param {string} [data.state] - 'done' | 'failed' | 'running'
 * @param {string} [data.summary] - Execution summary
 * @param {string} [data.detail_url] - URL for details (e.g. GitHub PR)
 * @param {string} [data.agent] - Agent name
 * @returns {Object} LINE Flex Message payload
 */
function buildDispatchResultFlex(data) {
  data = data || {};
  var jobId = String(data.job_id || data.jobId || 'ld_unknown');
  var state = String(data.state || 'done').toLowerCase();
  var agent = String(data.agent || 'fleet').toUpperCase();
  var summary = String(data.summary || 'ดำเนินการเรียบร้อยแล้ว').trim();
  var detailUrl = data.detail_url || data.detailUrl || null;

  var isSuccess = state === 'done';
  var title = (isSuccess ? '✅ งานเสร็จสิ้น — ' : '❌ งานล้มเหลว — ') + agent;
  var headerBg = isSuccess ? '#2e7d32' : '#c62828';

  var footerContents = [];
  if (detailUrl && typeof detailUrl === 'string' && /^https?:\/\//.test(detailUrl)) {
    footerContents.push({
      type: 'button', style: 'primary', color: '#1565c0', height: 'sm',
      action: { type: 'uri', label: '🔗 ดูรายละเอียด / PR', uri: detailUrl }
    });
  }

  footerContents.push({
    type: 'button', style: 'secondary', height: 'sm',
    action: { type: 'message', label: '📊 เช็คสถานะ fleet', text: '/status' }
  });

  return {
    type: 'flex',
    altText: title + ' (' + jobId + ')',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: headerBg,
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'md', color: '#ffffff' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
        contents: [
          {
            type: 'box', layout: 'baseline', spacing: 'sm',
            contents: [
              { type: 'text', text: 'Job ID', color: '#888888', size: 'xs', flex: 2 },
              { type: 'text', text: jobId, weight: 'bold', size: 'xs', color: '#333333', flex: 5 }
            ]
          },
          {
            type: 'box', layout: 'baseline', spacing: 'sm',
            contents: [
              { type: 'text', text: 'สถานะ', color: '#888888', size: 'xs', flex: 2 },
              { type: 'text', text: state.toUpperCase(), weight: 'bold', size: 'xs', color: isSuccess ? '#2e7d32' : '#c62828', flex: 5 }
            ]
          },
          {
            type: 'box', layout: 'vertical', marginTop: 'md', spacing: 'xs',
            contents: [
              { type: 'text', text: 'สรุปผลงาน:', color: '#888888', size: 'xs' },
              { type: 'text', text: summary.length > 500 ? summary.slice(0, 500) + '…' : summary, wrap: true, size: 'sm', color: '#333333' }
            ]
          }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px', spacing: 'xs',
        contents: footerContents
      }
    }
  };
}

module.exports = {
  buildDispatchAckFlex: buildDispatchAckFlex,
  buildDispatchResultFlex: buildDispatchResultFlex
};
