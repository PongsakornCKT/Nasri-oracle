/**
 * lib/catalog-cache.js — v2.1 P3+I3: Catalog ETag cache + pre-warm worker
 *
 * P3: ETag cache — sends If-None-Match on repeat requests; on 304 returns
 *     the previously parsed data without re-downloading + re-parsing CSV.
 *
 * I3: Pre-warm worker — setInterval that fetches catalog every PRE_WARM_MS
 *     (default 25 min) so the hot-path getCatalog() almost always hits cache.
 *     Runs on a stagger: individual sheets fetched with a small jitter to
 *     spread load and avoid rate-limiting from Google Sheets.
 *
 * Usage:
 *   var catalogCache = require('./lib/catalog-cache')({
 *     sheetId: SHEET_ID,
 *     sheetGids: SHEET_GIDS,  // { 'Solar Panels': gid, ... }
 *     ttlMs: 5 * 60 * 1000,   // in-memory TTL (default 5 min)
 *     catalogLkg: require('./lib/catalog-lkg')({ SQLITE_PATH, notifyAdmin }),  // optional L3 fallback
 *   });
 *
 *   // Drop-in replacement for getCatalog():
 *   var catalog = await catalogCache.get();
 *
 *   // Start background pre-warmer (call once at startup):
 *   catalogCache.startPreWarm();
 *
 *   // Manually invalidate (e.g. after admin price sync):
 *   catalogCache.invalidate();
 *
 * ptah 𓂀 — Backend Architect | v2.1 P3+I3 | 2026-04-13
 * khnum 𓂀 — DevOps | v2.2 P05: LKG L3 fallback | 2026-08-12
 */
'use strict';

var DEFAULT_TTL_MS = 5 * 60 * 1000;    // 5 minutes (up from 30s)
var PRE_WARM_MS    = 25 * 60 * 1000;   // pre-warm 25 min before TTL expires

module.exports = function makeCatalogCache(opts) {
  var sheetId  = opts.sheetId;
  var sheetGids = opts.sheetGids;                 // { 'Sheet Name': gid, ... }
  var ttlMs    = opts.ttlMs || DEFAULT_TTL_MS;
  var catalogLkg = opts.catalogLkg || null;        // optional lib/catalog-lkg.js instance

  // ── In-memory cache ─────────────────────────────────────────
  var _data = null;        // { [sheetName]: [rows] }
  var _ts   = 0;           // timestamp of last successful full fetch
  var _etags = {};         // { [gid]: etag_string }
  var _sheetData = {};     // { [gid]: [rows] } — per-sheet data (for 304 handling)

  var _preWarmTimer = null;
  var _fetching = false;   // guard against concurrent fetches

  // ── CSV parser (inlined for self-containment) ────────────────
  function _parseCSV(text) {
    var rows = [], row = [], cell = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"' && text[i+1] === '"') { cell += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else { cell += c; }
      } else {
        if (c === '"') { inQ = true; }
        else if (c === ',') { row.push(cell.trim()); cell = ''; }
        else if (c === '\n' || (c === '\r' && text[i+1] === '\n')) {
          if (c === '\r') i++;
          row.push(cell.trim()); cell = '';
          if (row.some(function(v) { return v; })) rows.push(row);
          row = [];
        } else { cell += c; }
      }
    }
    if (cell || row.length) { row.push(cell.trim()); if (row.some(function(v) { return v; })) rows.push(row); }
    if (!rows.length) return [];
    var headers = rows[0];
    return rows.slice(1).map(function(r) {
      var obj = {};
      headers.forEach(function(h, idx) { obj[h] = (r[idx] || '').trim(); });
      return obj;
    });
  }

  // ── P3: Fetch one sheet with ETag support ───────────────────
  async function _fetchSheet(name, gid) {
    var url = 'https://docs.google.com/spreadsheets/d/' + sheetId +
              '/gviz/tq?tqx=out:csv&gid=' + gid;

    var headers = { 'User-Agent': 'NasriBot/2.1' };
    var prevEtag = _etags[gid];
    if (prevEtag) headers['If-None-Match'] = prevEtag;

    try {
      var r = await fetch(url, { headers: headers });

      // P3: 304 Not Modified → return cached data
      if (r.status === 304) {
        return _sheetData[gid] || [];
      }

      if (!r.ok) {
        console.warn('[catalog-cache] sheet', name, 'returned', r.status, '— using stale data');
        return _sheetData[gid] || [];
      }

      // Store ETag for next request
      var etag = r.headers.get('etag');
      if (etag) _etags[gid] = etag;

      var rows = _parseCSV(await r.text());
      _sheetData[gid] = rows;
      return rows;
    } catch (e) {
      console.error('[catalog-cache] fetch error for sheet', name, ':', e.message);
      return _sheetData[gid] || [];  // stale data on network error
    }
  }

  // ── Full catalog refresh ─────────────────────────────────────
  async function _refresh() {
    if (_fetching) return _data;
    _fetching = true;
    try {
      var names = Object.keys(sheetGids);
      var results = await Promise.all(
        names.map(function(n) { return _fetchSheet(n, sheetGids[n]); })
      );
      var catalog = {};
      names.forEach(function(n, i) { catalog[n] = results[i]; });

      // L3: network + memory both dead (cold start, all sheets empty) →
      // fall back to last-known-good snapshot from SQLite instead of
      // handing the app an all-empty catalog.
      if (catalogLkg && catalogLkg.isDead(catalog)) {
        var lkg = catalogLkg.load();
        if (lkg && !catalogLkg.isDead(lkg.catalog)) {
          console.warn('[catalog-cache] live fetch dead — using LKG snapshot from ' + lkg.fetched_at);
          _data = lkg.catalog;
          _ts   = Date.now();
          return _data;
        }
        console.error('[catalog-cache] live fetch dead AND no usable LKG snapshot — returning empty catalog');
      }

      _data = catalog;
      _ts   = Date.now();
      console.log('[catalog-cache] Refreshed: ' +
        names.map(function(n) { return n + '(' + catalog[n].length + ')'; }).join(', '));

      if (catalogLkg) catalogLkg.save(catalog); // sanity-gated; no-op on a bad/short catalog
      return catalog;
    } catch (e) {
      console.error('[catalog-cache] refresh error:', e.message);
      return _data;  // return stale on error
    } finally {
      _fetching = false;
    }
  }

  // ── Public: get() — main entry point ────────────────────────
  async function get() {
    if (_data && (Date.now() - _ts) < ttlMs) return _data;
    return _refresh();
  }

  // ── I3: Pre-warm background worker ──────────────────────────
  function startPreWarm() {
    if (_preWarmTimer) return;  // already started

    // Kick off immediately on startup
    _refresh().catch(function(e) { console.error('[catalog-cache] startup prefetch:', e.message); });

    _preWarmTimer = setInterval(function() {
      console.log('[catalog-cache] pre-warm tick');
      _refresh().catch(function(e) { console.error('[catalog-cache] pre-warm error:', e.message); });
    }, PRE_WARM_MS);

    // Don't block process exit
    if (_preWarmTimer.unref) _preWarmTimer.unref();
    console.log('[catalog-cache] pre-warm worker started (interval=' + (PRE_WARM_MS / 60000) + 'min)');
  }

  function stopPreWarm() {
    if (_preWarmTimer) { clearInterval(_preWarmTimer); _preWarmTimer = null; }
  }

  /**
   * invalidate() — force next get() to re-fetch. Does NOT clear ETags,
   * so 304 responses are still possible if Sheets data hasn't changed.
   */
  function invalidate() {
    _ts = 0;
  }

  /**
   * stats() — diagnostic info for health checks.
   */
  function stats() {
    return {
      cached: !!_data,
      age_ms: _data ? Date.now() - _ts : null,
      ttl_ms: ttlMs,
      sheets: _data ? Object.keys(_data).length : 0,
      etag_count: Object.keys(_etags).length,
      pre_warm_active: !!_preWarmTimer,
      lkg: catalogLkg ? catalogLkg.stats() : null,
    };
  }

  return { get, startPreWarm, stopPreWarm, invalidate, stats };
};
