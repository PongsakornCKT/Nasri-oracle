/**
 * BOM Request Parser Module (#N2 Round 2)
 * CommonJS module with zero side-effects on require.
 */

function buildAtmoceQuickReply(originalText) {
  var cleanText = String(originalText || '').trim();
  if (!cleanText) cleanText = 'atmoce';

  return {
    type: 'text',
    text: 'กรุณาเลือกอัตราส่วน Micro Inverter ของระบบ ATMOCE ครับ:\n• 2:1 = 1 ไมโครต่อ 2 แผง (แนะนำ)\n• 1:1 = 1 ไมโครต่อ 1 แผง',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '2:1 (แนะนำ)',
            text: cleanText + ' 2:1'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '1:1',
            text: cleanText + ' 1:1'
          }
        }
      ]
    }
  };
}

function buildSigenergyQuickReply(originalText) {
  var cleanText = String(originalText || '').trim();
  if (!cleanText) cleanText = 'sigenergy';

  return {
    type: 'text',
    text: 'กรุณาเลือกระบบ Sigenergy ที่ต้องการคำนวณ BOM ครับ ⚡:\n• 5 in 1 = ระบบ 5 in 1 Resi\n• SigenStor Neo = ระบบ SigenStor Neo\n• Sigenergy C&I = ระบบ C&I ภาคอุตสาหกรรม',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '5 in 1',
            text: cleanText + ' 5in1'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: 'SigenStor Neo',
            text: cleanText + ' neo'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: 'Sigenergy C&I',
            text: cleanText + ' c&i'
          }
        }
      ]
    }
  };
}

function buildSigenergyCiPrompt(originalText) {
  var cleanText = String(originalText || '').trim();
  if (!cleanText) cleanText = 'sigenergy c&i';

  return {
    type: 'text',
    text: 'สำหรับ Sigenergy C&I กรุณาระบุ Backup (มี backup / ไม่มี backup) และ C-rate (0.5C / 1C) ครับ ⚡:\nตัวอย่าง: "' + cleanText + ' backup 1C"',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: 'Backup + 1C',
            text: cleanText + ' backup 1C'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: 'Backup + 0.5C',
            text: cleanText + ' backup 0.5C'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: 'No Backup + 1C',
            text: cleanText + ' no backup 1C'
          }
        }
      ]
    }
  };
}

function parseBomRequest(text) {
  var rawText = String(text || '').trim();
  var lo = rawText.toLowerCase();

  // Detect system size (kW)
  var kwMatch = lo.match(/(\d+(?:\.\d+)?)\s*kw/);
  var systemKw = kwMatch ? parseFloat(kwMatch[1]) : 0;

  // Detect panel count
  var panelCount = 0;
  var pcm = text.match(/(\d+)\s*แผ[งง่]/);
  if (pcm) {
    panelCount = parseInt(pcm[1]);
  } else if (systemKw > 0) {
    panelCount = Math.ceil((systemKw * 1000) / 650);
  }

  // Calculate effective kW if panelCount given
  var effectiveKw = systemKw > 0 ? systemKw : (panelCount > 0 ? (panelCount * 650) / 1000 : 5);

  // Detect phase
  var phase = '1P';
  if (/3\s*(?:phase|เฟส|p\b)/i.test(text)) phase = '3P';
  else if (/1\s*(?:phase|เฟส|p\b)/i.test(text)) phase = '1P';
  else if (effectiveKw >= 15) phase = '3P';

  // Detect brand
  var invBrand = '';
  if (/atmoce/i.test(lo)) invBrand = 'ATMOCE';
  else if (/sig(?:energy)?/i.test(lo)) invBrand = 'Sigenergy';

  // Want battery?
  var wantBatt = /batt|แบต|แบท/i.test(lo);
  var battKwh = 0;
  var battMatch = lo.match(/(?:batt(?:ery)?|แบต|แบท)\s*(\d+)/i);
  if (battMatch) battKwh = parseInt(battMatch[1]);
  else if (wantBatt && /7kwh|7\s*kw/i.test(lo)) battKwh = 7;
  else if (wantBatt) battKwh = 7;

  // Want backup?
  var wantBackup = /backup|สำรอง/i.test(lo) && !/no\s*backup|ไม่\s*สำรอง/i.test(lo);

  // Detect warranty
  var warr = '';
  if (/ประกัน\s*20|p5/i.test(lo)) warr = 'p5';
  else if (/ประกัน\s*25|p10/i.test(lo)) warr = 'p10';

  // Roof type
  var roofType = 'metal';
  if (/tile|กระเบื้อง/i.test(lo)) roofType = 'tile';
  else if (/hangerbolt|ลอนคู่/i.test(lo)) roofType = 'hangerbolt';
  else if (/kliplock/i.test(lo)) roofType = 'kliplock';

  // --- ATMOCE ---
  if (invBrand === 'ATMOCE') {
    // Detect C&I: ≥30kW or explicit C&I keyword
    var isCI = effectiveKw >= 30 || /c&i|c\si|commercial|โรงงาน/i.test(lo);

    if (isCI) {
      if (panelCount <= 0 && systemKw <= 0) panelCount = 46;
      return {
        action: 'bom_n2',
        system: 'atmoce21',
        isCI: true,
        panels: panelCount,
        kw: effectiveKw,
        phase: phase || '3P',
        ratio: '2:1',
        roof_type: roofType,
        trunk_cable_length: /1\.3\s*m|1\.3/i.test(lo) ? '1.3' : '2.5',
        battery_kwh: battKwh,
        backup: wantBackup,
        melv16: wantBatt || battKwh > 0,
        warr: warr
      };
    }

    var isRatioSpecified = /1:1|2:1|mi-500|mi-1250/i.test(lo);
    if (!isRatioSpecified) {
      return { isAtmoceQuickReply: true, quickReplyMsg: buildAtmoceQuickReply(rawText) };
    }

    var ratio = /1:1|mi-500/i.test(lo) ? '1:1' : '2:1';
    if (panelCount <= 0) panelCount = 10;

    return {
      action: 'atmoce_n1',
      system: ratio === '1:1' ? 'atmoce11' : 'atmoce21',
      isCI: false,
      panels: panelCount,
      kw: effectiveKw,
      ratio: ratio,
      phase: phase,
      roof_type: roofType,
      trunk_cable_length: /1\.3\s*m|1\.3/i.test(lo) ? '1.3' : '2.5',
      battery_kwh: battKwh,
      backup: wantBackup,
      warr: warr
    };
  }

  // --- SIGENERGY ---
  if (invBrand === 'Sigenergy') {
    var isSigSubtypeSpecified = /5in1|5\s*in\s*1|neo|c&i|ci\b/i.test(lo);
    if (!isSigSubtypeSpecified) {
      return { isSigenergyQuickReply: true, quickReplyMsg: buildSigenergyQuickReply(rawText) };
    }

    var sysSubtype = 'sigenergy5in1';
    if (/neo/i.test(lo)) sysSubtype = 'sigenneo';
    else if (/c&i|ci\b/i.test(lo)) sysSubtype = 'sigenci';

    if (sysSubtype === 'sigenci') {
      var hasBackupChoice = /backup|สำรอง/i.test(lo);
      var hasCRate = /0\.5c|1c/i.test(lo);
      if (!hasBackupChoice || !hasCRate) {
        return { isSigenergyCiPrompt: true, promptMsg: buildSigenergyCiPrompt(rawText) };
      }
      var cRate = /0\.5c/i.test(lo) ? '0.5C' : '1C';
      return {
        action: 'bom_n2',
        system: 'sigenci',
        kw: systemKw > 0 ? systemKw : 50,
        panels: panelCount,
        phase: phase || '3P',
        roof_type: roofType,
        battery_kwh: battKwh > 0 ? battKwh : 100,
        backup: wantBackup,
        c_rate: cRate
      };
    }

    if (panelCount <= 0) panelCount = 16;
    return {
      action: 'bom_n2',
      system: sysSubtype,
      panels: panelCount,
      kw: effectiveKw,
      phase: phase,
      roof_type: roofType,
      battery_kwh: battKwh,
      backup: wantBackup
    };
  }

  return { action: 'unknown', text: rawText };
}

module.exports = {
  buildAtmoceQuickReply: buildAtmoceQuickReply,
  buildSigenergyQuickReply: buildSigenergyQuickReply,
  buildSigenergyCiPrompt: buildSigenergyCiPrompt,
  parseBomRequest: parseBomRequest
};
