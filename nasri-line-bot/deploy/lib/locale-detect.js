/**
 * locale-detect.js — LN-LOCALE: CJS mirror of locale-detect.ts
 *
 * Detects LINE user language via /v2/bot/profile/{userId} and maps it to
 * a PDF template locale ('th' | 'en' | 'th-en').
 *
 * Cache: 24h in-memory (process lifetime).
 * Fallback: 'th' on any error (Enervia is Thai-market default).
 *
 * ra ☀️ — AI Engineer | 2026-04-13
 */

'use strict';

var https = require('https');

var CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // 24h
var _cache       = {};  // userId → { locale, ts }

/**
 * Map a LINE language code to PDF template locale.
 * @param {string|null} language — e.g. 'th', 'en', 'ja', 'zh-TW'
 * @returns {'th'|'en'|'th-en'}
 */
function mapLocale(language) {
  if (!language) return 'th';
  var lang = language.toLowerCase().split('-')[0];
  if (lang === 'th') return 'th';
  if (lang === 'en') return 'en';
  return 'th-en';  // other languages → bilingual
}

/**
 * Fetch LINE profile and return the PDF locale.
 * @param {string} userId
 * @param {string} lineAccessToken
 * @param {number} [timeout=5000]
 * @returns {Promise<'th'|'en'|'th-en'>}
 */
function getUserLocale(userId, lineAccessToken, timeout) {
  timeout = timeout || 5000;
  if (!userId || !lineAccessToken) return Promise.resolve('th');

  // Cache hit
  var cached = _cache[userId];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return Promise.resolve(cached.locale);
  }

  return new Promise(function(resolve) {
    var options = {
      hostname: 'api.line.me',
      path: '/v2/bot/profile/' + encodeURIComponent(userId),
      method: 'GET',
      headers: { Authorization: 'Bearer ' + lineAccessToken },
    };

    var timer = setTimeout(function() {
      req.destroy();
      resolve('th');
    }, timeout);

    var req = https.request(options, function(res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        clearTimeout(timer);
        if (res.statusCode !== 200) { resolve('th'); return; }
        try {
          var profile = JSON.parse(body);
          var locale  = mapLocale(profile.language);
          _cache[userId] = { locale: locale, ts: Date.now() };
          resolve(locale);
        } catch(e) {
          resolve('th');
        }
      });
    });

    req.on('error', function() { clearTimeout(timer); resolve('th'); });
    req.end();
  });
}

/**
 * Determine locale from a LINE webhook event source object.
 */
function getLocaleFromEvent(source, lineAccessToken) {
  var userId = source && source.userId;
  if (!userId) return Promise.resolve('th');
  return getUserLocale(userId, lineAccessToken);
}

/** Invalidate cache entry for a user (e.g. after language change). */
function invalidate(userId) {
  delete _cache[userId];
}

/** Clear entire cache. */
function clearCache() {
  _cache = {};
}

module.exports = {
  mapLocale:          mapLocale,
  getUserLocale:      getUserLocale,
  getLocaleFromEvent: getLocaleFromEvent,
  invalidate:         invalidate,
  clearCache:         clearCache,
};
