'use strict';

/**
 * lib/daily-summary.js — Group Secretary Daily Summary Generator (PR-6)
 *
 * Summarizes daily group chat conversations using Claude Haiku into 4 key sections:
 *   1. ประเด็นหลัก
 *   2. การตัดสินใจ
 *   3. งานค้าง + ผู้รับผิดชอบ
 *   4. นัดหมาย
 *
 * Pushes Flex Message bubble directly into the LINE group.
 * Category for push quota ledger: 'summary'
 *
 * Nasri Oracle 𓂀 Right Hand of Ma'at
 */

module.exports = function createDailySummary(opts) {
  opts = opts || {};
  var persistence = opts.persistence;
  var askClaudeFn = typeof opts.askClaude === 'function' ? opts.askClaude : null;
  var lPushFn = typeof opts.lPush === 'function' ? opts.lPush : function() { return Promise.resolve(); };
  var ledger = opts.ledger || null;

  function formatFlexMessage(summaryData) {
    var dateStr = summaryData.dateStr || new Date().toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return {
      type: 'flex',
      altText: '📋 สรุปประเด็นประจำวัน',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#00B900',
          paddingAll: '16px',
          contents: [
            { type: 'text', text: '📋 สรุปประเด็นประจำวัน', weight: 'bold', size: 'lg', color: '#FFFFFF' },
            { type: 'text', text: dateStr, size: 'xs', color: '#E0F7FA', margin: 'xs' }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          spacing: 'md',
          contents: [
            {
              type: 'box', layout: 'vertical', spacing: 'xs', contents: [
                { type: 'text', text: '📌 ประเด็นหลัก', weight: 'bold', size: 'sm', color: '#111111' },
                { type: 'text', text: summaryData.mainPoints || '—', size: 'sm', color: '#555555', wrap: true }
              ]
            },
            { type: 'separator' },
            {
              type: 'box', layout: 'vertical', spacing: 'xs', contents: [
                { type: 'text', text: '✅ การตัดสินใจ', weight: 'bold', size: 'sm', color: '#111111' },
                { type: 'text', text: summaryData.decisions || '—', size: 'sm', color: '#555555', wrap: true }
              ]
            },
            { type: 'separator' },
            {
              type: 'box', layout: 'vertical', spacing: 'xs', contents: [
                { type: 'text', text: '⏳ งานค้าง + ผู้รับผิดชอบ', weight: 'bold', size: 'sm', color: '#111111' },
                { type: 'text', text: summaryData.pendingTasks || '—', size: 'sm', color: '#555555', wrap: true }
              ]
            },
            { type: 'separator' },
            {
              type: 'box', layout: 'vertical', spacing: 'xs', contents: [
                { type: 'text', text: '📅 นัดหมาย', weight: 'bold', size: 'sm', color: '#111111' },
                { type: 'text', text: summaryData.appointments || '—', size: 'sm', color: '#555555', wrap: true }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '12px',
          contents: (summaryData.truncated ? [
            // Be honest when the day was too busy to summarise in full.
            {
              type: 'text',
              text: 'สรุปจาก ' + summaryData.messageCount + ' ข้อความล่าสุด (ทั้งวันมี ' + summaryData.totalToday + ' ข้อความ)',
              size: 'xxs', color: '#B26A00', align: 'center', wrap: true
            }
          ] : []).concat([
            { type: 'text', text: 'เก็บข้อมูลเพื่อใช้ภายในทีมเท่านั้น • Nasri Secretary', size: 'xxs', color: '#888888', align: 'center' }
          ])
        }
      }
    };
  }

  async function summarizeGroupMessages(groupId) {
    if (!persistence) throw new Error('Persistence module not provided');
    var messages = persistence.getGroupMessagesToday(groupId);
    if (!messages || messages.length === 0) {
      return null;
    }

    // A very busy group is summarised from its most recent messages only (the
    // store caps how many it returns). Report that instead of presenting a
    // partial summary as though it covered the whole day.
    var totalToday = messages.length;
    if (typeof persistence.countGroupMessagesToday === 'function') {
      totalToday = persistence.countGroupMessagesToday(groupId) || messages.length;
    }
    var truncated = totalToday > messages.length;

    var transcriptLines = messages.map(function(m) {
      var name = m.display_name || 'สมาชิกกลุ่ม';
      var time = m.ts ? m.ts.split(' ')[1] || '' : '';
      return (time ? '[' + time.slice(0, 5) + '] ' : '') + name + ': ' + m.text;
    });

    var transcriptText = transcriptLines.join('\n');

    var systemPrompt =
      'คุณเป็นเลขาผู้ช่วยสรุปการประชุมประจำวันในกลุ่ม LINE ของทีมงาน Enervia Group\n' +
      'กรุณาสรุปบทสนทนาในกลุ่มออกเป็น 4 หัวข้อหลัก:\n' +
      '1. ประเด็นหลัก\n' +
      '2. การตัดสินใจ\n' +
      '3. งานค้าง+ผู้รับผิดชอบ\n' +
      '4. นัดหมาย\n\n' +
      'กฎข้อบังคับ:\n' +
      '- ตอบเฉพาะภาษาไทยเท่านั้น\n' +
      '- สรุปให้ตรงประเด็นและกระชับ\n' +
      '- หากหัวข้อใดไม่มีข้อมูลในบทสนทนา ให้เขียนว่า "—" เท่านั้น ห้ามแต่งเติมหรือคาดเดาข้อมูลเองเด็ดขาด\n' +
      '- ส่งผลลัพธ์กลับในรูปแบบ JSON Object เดียวที่มี key ดังนี้เท่านั้น:\n' +
      '  {\n' +
      '    "main_points": "...",\n' +
      '    "decisions": "...",\n' +
      '    "pending_tasks": "...",\n' +
      '    "appointments": "..."\n' +
      '  }';

    var rawResponse = '';
    if (askClaudeFn) {
      rawResponse = await askClaudeFn(transcriptText, systemPrompt);
    } else {
      rawResponse = await callClaudeDirect(transcriptText, systemPrompt);
    }

    var parsed = parseSummaryResult(rawResponse);
    return {
      groupId: groupId,
      messageCount: messages.length,
      totalToday: totalToday,
      truncated: truncated,
      mainPoints: parsed.main_points || '—',
      decisions: parsed.decisions || '—',
      pendingTasks: parsed.pending_tasks || '—',
      appointments: parsed.appointments || '—',
    };
  }

  function parseSummaryResult(rawText) {
    if (!rawText) return { main_points: '—', decisions: '—', pending_tasks: '—', appointments: '—' };
    try {
      var jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        var obj = JSON.parse(jsonMatch[0]);
        return {
          main_points: obj.main_points || obj.mainPoints || '—',
          decisions: obj.decisions || '—',
          pending_tasks: obj.pending_tasks || obj.pendingTasks || '—',
          appointments: obj.appointments || '—'
        };
      }
    } catch (e) {}

    return {
      main_points: rawText.slice(0, 300),
      decisions: '—',
      pending_tasks: '—',
      appointments: '—'
    };
  }

  function callClaudeDirect(prompt, system) {
    return new Promise(function(resolve) {
      var apiKey = process.env.ANTHROPIC_API_KEY || '';
      if (!apiKey) {
        resolve(JSON.stringify({
          main_points: '—',
          decisions: '—',
          pending_tasks: '—',
          appointments: '—'
        }));
        return;
      }

      var body = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: system,
        messages: [{ role: 'user', content: prompt }]
      });

      var https = require('https');
      var options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      var req = https.request(options, function(res) {
        var chunks = [];
        res.on('data', function(c) { chunks.push(c); });
        res.on('end', function() {
          try {
            if (res.statusCode && res.statusCode >= 400) return resolve('');
            var parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            var text = (parsed.content && parsed.content[0] && parsed.content[0].text) || '';
            resolve(text);
          } catch (e) {
            resolve('');
          }
        });
      });
      req.on('error', function() { resolve(''); });
      req.write(body);
      req.end();
    });
  }

  async function runDailySummary(opts) {
    opts = opts || {};
    var forceGroupId = opts.forceGroupId || null;
    var results = [];

    var activeGroups = [];
    if (forceGroupId) {
      activeGroups = [{ group_id: forceGroupId, message_count: 5 }];
    } else if (persistence && typeof persistence.getActiveGroupsForSummary === 'function') {
      activeGroups = persistence.getActiveGroupsForSummary();
    }

    for (var i = 0; i < activeGroups.length; i++) {
      var g = activeGroups[i];
      var groupId = g.group_id;
      try {
        var summaryData = await summarizeGroupMessages(groupId);
        if (!summaryData) continue;

        var flexPayload = formatFlexMessage(summaryData);

        // Check push quota ledger with category 'summary'
        if (ledger && typeof ledger.recordAndCheckPush === 'function') {
          var ledgerCheck = ledger.recordAndCheckPush('summary', groupId, flexPayload);
          if (!ledgerCheck.allowed) {
            console.warn('[daily-summary] Push quota limit reached for group ' + groupId + ', queued.');
            results.push({ groupId: groupId, status: 'queued', summaryData: summaryData });
            continue;
          }
        }

        // Push Flex Message to the group
        await lPushFn(groupId, flexPayload);
        results.push({ groupId: groupId, status: 'pushed', summaryData: summaryData, flexPayload: flexPayload });
      } catch (err) {
        console.error('[daily-summary] Error processing group ' + groupId + ':', err.message);
        results.push({ groupId: groupId, status: 'error', error: err.message });
      }
    }

    return {
      processedCount: results.length,
      groups: results
    };
  }

  return {
    formatFlexMessage: formatFlexMessage,
    summarizeGroupMessages: summarizeGroupMessages,
    runDailySummary: runDailySummary,
  };
};
