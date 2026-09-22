'use strict';

// Small, dependency-free Thai time parser. All returned timestamps are ISO
// instants representing Asia/Bangkok (UTC+07:00), never server-local time.
var WEEKDAYS = { 'อาทิตย์': 0, 'จันทร์': 1, 'อังคาร': 2, 'พุธ': 3, 'พฤหัสบดี': 4, 'พฤหัส': 4, 'ศุกร์': 5, 'เสาร์': 6 };
function bangkokParts(now) {
  var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now || new Date());
  var p = {}; f.forEach(function(x) { p[x.type] = Number(x.value); }); return p;
}
function iso(y, m, d, h, min) { return new Date(Date.UTC(y, m - 1, d, h - 7, min || 0, 0)).toISOString(); }
function localDate(parts, h, min, dayOffset) {
  var dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (dayOffset || 0), h - 7, min || 0, 0));
  return dt.toISOString();
}
function clock(s) {
  s = String(s || '').replace(/บ่ายสอง/g, '14:00').replace(/บ่ายสาม/g, '15:00').replace(/บ่ายโมง/g, '13:00');
  var m = String(s || '').match(/(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?/);
  if (!m) return null;
  var h = Number(m[1]), min = Number(m[2] || 0); if (h > 23 || min > 59) return null; return { h: h, min: min };
}
function parse(text, now) {
  if (!text || typeof text !== 'string') return null;
  var s = text.trim().replace(/\s+/g, ' '), p = bangkokParts(now), c, out;
  var rel = s.match(/อีก\s*(\d+)\s*(ชม|ชั่วโมง|นาที)/i);
  if (rel) return new Date((now || new Date()).getTime() + Number(rel[1]) * (rel[2].indexOf('นาที') === 0 ? 60000 : 3600000)).toISOString();
  var dm = s.match(/(?:วันที่\s*)?(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\s*(.*)$/);
  var dayOnly = s.match(/^วันที่\s*(\d{1,2})\s*(.*)$/);
  if (dayOnly) {
    c = clock(dayOnly[2]) || { h: 9, min: 0 }; out = iso(p.year, p.month, Number(dayOnly[1]), c.h, c.min);
    if (new Date(out) <= (now || new Date())) out = iso(p.year, p.month, Number(dayOnly[1]), c.h, c.min);
    if (new Date(out) <= (now || new Date())) out = iso(p.year, p.month + 1, Number(dayOnly[1]), c.h, c.min);
    return out;
  }
  if (dm) {
    var year = dm[3] ? Number(dm[3]) : p.year; if (year < 100) year += 2000;
    c = clock(dm[4]) || { h: 9, min: 0 }; out = iso(year, Number(dm[2]), Number(dm[1]), c.h, c.min);
    if (new Date(out) <= (now || new Date())) out = iso(year + (Number(dm[2]) === p.day ? 1 : 0), Number(dm[2]), Number(dm[1]), c.h, c.min);
    return out;
  }
  var wd = s.match(/(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์)(?:นี้)?\s*(.*)/);
  if (wd) {
    var target = WEEKDAYS[wd[1]], delta = (target - new Date((now || new Date()).toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getDay() + 7) % 7;
    c = clock(wd[2]) || { h: 9, min: 0 }; out = localDate(p, c.h, c.min, delta); if (new Date(out) <= (now || new Date())) out = localDate(p, c.h, c.min, delta + 7); return out;
  }
  c = clock(s.replace(/^(พรุ่งนี้|วันนี้)\s*/, '').replace(/โมง|นาฬิกา/g, ''));
  if (/พรุ่งนี้/.test(s)) { c = c || (/บ่าย/.test(s) ? { h: 13, min: 0 } : { h: 9, min: 0 }); if (/บ่าย/.test(s) && c.h < 12) c.h += 12; return localDate(p, c.h, c.min, 1); }
  if (/พรุ่งนี้เช้า/.test(s)) return localDate(p, 9, 0, 1);
  if (/วันนี้เย็น/.test(s)) return localDate(p, 18, 0, 0);
  if (/เช้า/.test(s)) c = c || { h: 9, min: 0 };
  if (/บ่าย/.test(s)) { c = c || { h: 13, min: 0 }; if (c.h < 12) c.h += 12; }
  if (!c) return null;
  out = localDate(p, c.h, c.min, 0); if (new Date(out) <= (now || new Date())) out = localDate(p, c.h, c.min, 1); return out;
}
module.exports = parse;
module.exports.parseThaiTime = parse;
