'use strict';

// Basic Auth middleware — Enervia v2.5 #42
// - HTTP Basic Auth against ENERVIA_AUTH_USER + ENERVIA_AUTH_PASS_HASH (bcrypt)
// - Sliding-window rate limit: 5 failed attempts / minute / IP → 429 for 5 min
// - Audit log: success + failures (no passwords), IP + timestamp → AUTH_LOG
// - Whitelist (public paths) bypass: /, /health, /webhook, /assets/*
//
// Factory:
//   var auth = require('./lib/basic-auth')({
//     USER:       process.env.ENERVIA_AUTH_USER,
//     PASS_HASH:  process.env.ENERVIA_AUTH_PASS_HASH,  // bcrypt hash
//     PASS_PLAIN: process.env.ENERVIA_AUTH_PASS,      // dev/preview fallback
//     REALM:      'Enervia Archive',
//     PROTECTED:  ['/api/archive', '/api/catalog', '/archive.html'],
//     AUDIT_LOG:  '/path/to/auth.log',
//   });
//
// Mount (BEFORE route handlers):
//   if (!auth.gate(req, res)) return;   // gate() returns false + writes 401/429

var fs = require('fs');
var crypto = require('crypto');

module.exports = function createBasicAuth(opts) {
  opts = opts || {};
  var USER       = opts.USER       || '';
  var PASS_HASH  = opts.PASS_HASH  || '';
  var PASS_PLAIN = opts.PASS_PLAIN || '';   // dev/preview only; do NOT set in prod
  var REALM      = opts.REALM      || 'Enervia Archive';
  var PROTECTED  = opts.PROTECTED  || ['/api/archive', '/api/v2/catalog'];
  var AUDIT_LOG  = opts.AUDIT_LOG  || '';
  var WINDOW_MS  = opts.WINDOW_MS  || 60 * 1000;     // 1 min
  var MAX_FAIL   = opts.MAX_FAIL   || 5;             // 5 fails/min
  var LOCKOUT_MS = opts.LOCKOUT_MS || 5 * 60 * 1000; // 5 min

  var attempts = new Map();  // ip → [ts, ts, ...]
  var lockouts = new Map();  // ip → expires

  // Lazy bcrypt — falls back to plain compare for dev preview.
  var bcrypt = null;
  try { bcrypt = require('bcrypt'); } catch (e) { /* dev */ }

  function now() { return Date.now(); }
  function clientIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
      .split(',')[0].trim();
  }

  function audit(line) {
    var entry = '[' + new Date().toISOString() + '] ' + line + '\n';
    if (AUDIT_LOG) { try { fs.appendFileSync(AUDIT_LOG, entry); } catch (e) {} }
    else { process.stderr.write('[auth] ' + entry); }
  }

  function isProtected(url) {
    for (var i = 0; i < PROTECTED.length; i++) {
      if (url === PROTECTED[i] || url.indexOf(PROTECTED[i] + '?') === 0 ||
          url.indexOf(PROTECTED[i] + '/') === 0) return true;
    }
    return false;
  }

  function verifyPassword(plain) {
    if (!plain) return false;
    if (PASS_HASH && bcrypt) {
      try { return bcrypt.compareSync(plain, PASS_HASH); } catch (e) { return false; }
    }
    if (PASS_PLAIN) {
      // Constant-time compare — avoids timing oracle
      var a = Buffer.from(plain);
      var b = Buffer.from(PASS_PLAIN);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    }
    return false;
  }

  function recordFail(ip) {
    var arr = attempts.get(ip) || [];
    var cutoff = now() - WINDOW_MS;
    arr = arr.filter(function(t) { return t >= cutoff; });
    arr.push(now());
    attempts.set(ip, arr);
    if (arr.length >= MAX_FAIL) {
      lockouts.set(ip, now() + LOCKOUT_MS);
      audit('LOCKOUT ip=' + ip + ' fails=' + arr.length + ' ttl=' + LOCKOUT_MS + 'ms');
      attempts.delete(ip);
    }
  }

  function isLocked(ip) {
    var exp = lockouts.get(ip);
    if (!exp) return false;
    if (exp < now()) { lockouts.delete(ip); return false; }
    return true;
  }

  function reject401(res) {
    res.writeHead(401, {
      'Content-Type': 'application/json; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="' + REALM + '", charset="UTF-8"',
    });
    res.end(JSON.stringify({ error: 'unauthorized', realm: REALM }));
  }
  function reject429(res, retryAfterSec) {
    res.writeHead(429, {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': String(retryAfterSec),
    });
    res.end(JSON.stringify({ error: 'too_many_attempts', retry_after_sec: retryAfterSec }));
  }

  function gate(req, res) {
    var url = req.url || '';
    if (!isProtected(url)) return true;       // public path → pass

    // Auth not configured → open (dev/preview bypass, log warning)
    if (!USER || (!PASS_HASH && !PASS_PLAIN)) {
      audit('BYPASS url=' + url + ' (auth not configured)');
      return true;
    }

    var ip = clientIp(req);
    if (isLocked(ip)) {
      var ttl = Math.ceil((lockouts.get(ip) - now()) / 1000);
      audit('BLOCK ip=' + ip + ' url=' + url + ' (locked, ' + ttl + 's remaining)');
      reject429(res, ttl);
      return false;
    }

    var hdr = req.headers['authorization'] || '';
    if (hdr.indexOf('Basic ') !== 0) {
      audit('CHALLENGE ip=' + ip + ' url=' + url);
      reject401(res);
      return false;
    }

    var decoded;
    try {
      decoded = Buffer.from(hdr.slice(6), 'base64').toString('utf8');
    } catch (e) {
      recordFail(ip); audit('FAIL ip=' + ip + ' decode_error'); reject401(res); return false;
    }
    var colon = decoded.indexOf(':');
    if (colon < 0) {
      recordFail(ip); audit('FAIL ip=' + ip + ' malformed'); reject401(res); return false;
    }
    var user = decoded.slice(0, colon);
    var pass = decoded.slice(colon + 1);

    if (user !== USER || !verifyPassword(pass)) {
      recordFail(ip);
      audit('FAIL ip=' + ip + ' user=' + user + ' url=' + url);
      reject401(res);
      return false;
    }

    audit('OK ip=' + ip + ' user=' + user + ' url=' + url);
    req._authedUser = user;
    return true;
  }

  return { gate: gate };
};
