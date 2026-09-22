'use strict';

// Catalog API — Enervia v2.5 #41
// Exposes solar product catalog (Huawei / Solis / Sigenergy / Deye / ATMOCE)
// with a 5-minute in-memory cache. Production spawns solar_catalog/ Python
// module; when unavailable (local dev, or Python not installed) falls back
// to bundled mock data so the UI preview always has something to render.
//
// Factory:
//   var catalog = require('./lib/catalog-api')({
//     PYTHON_BIN: 'python3',
//     CATALOG_DIR: '/path/to/solar_catalog',
//     CACHE_TTL_MS: 300000,
//   });
//
// Mount:
//   if (catalog.handle(req, res)) return;

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

module.exports = function createCatalogApi(opts) {
  opts = opts || {};
  var PYTHON_BIN   = opts.PYTHON_BIN || 'python3';
  var CATALOG_DIR  = opts.CATALOG_DIR || '';
  var CACHE_TTL_MS = opts.CACHE_TTL_MS || 5 * 60 * 1000;

  var cache = new Map();  // key → { data, expires }

  // ─── Mock fallback ──────────────────────────────────────────────────────────
  // Equipment-only catalog (อุปกรณ์หลัก): inverter | battery | panel.
  // Shape matches production Python solar_catalog (part_no, description,
  // brand, category, kw, phase, price, updated_at).
  // Categories outside the allowed set are filtered at serve time.
  var EQUIPMENT_CATEGORIES = ['inverter', 'battery', 'panel'];
  var MOCK = {
    Huawei: [
      { part_no: 'SUN2000-3KTL-L1',  description: 'Huawei SUN2000 3kW 1P',    brand: 'Huawei', category: 'inverter', kw: 3,  phase: '1P', price: 26500 },
      { part_no: 'SUN2000-5KTL-L1',  description: 'Huawei SUN2000 5kW 1P',    brand: 'Huawei', category: 'inverter', kw: 5,  phase: '1P', price: 34500 },
      { part_no: 'SUN2000-10KTL-M1', description: 'Huawei SUN2000 10kW 3P',   brand: 'Huawei', category: 'inverter', kw: 10, phase: '3P', price: 62000 },
      { part_no: 'SUN2000-15KTL-M2', description: 'Huawei SUN2000 15kW 3P',   brand: 'Huawei', category: 'inverter', kw: 15, phase: '3P', price: 78000 },
      { part_no: 'SUN2000-20KTL-M2', description: 'Huawei SUN2000 20kW 3P',   brand: 'Huawei', category: 'inverter', kw: 20, phase: '3P', price: 98000 },
      { part_no: 'LUNA2000-5-S0',    description: 'Huawei LUNA Battery 5kWh',  brand: 'Huawei', category: 'battery',  kw: 5,  price: 82000 },
      { part_no: 'LUNA2000-10-S0',   description: 'Huawei LUNA Battery 10kWh', brand: 'Huawei', category: 'battery',  kw: 10, price: 158000 },
      { part_no: 'LUNA2000-15-S0',   description: 'Huawei LUNA Battery 15kWh', brand: 'Huawei', category: 'battery',  kw: 15, price: 230000 },
    ],
    Solis: [
      { part_no: 'S6-GR1P3K',      description: 'Solis S6 Mini 3kW 1P',       brand: 'Solis', category: 'inverter', kw: 3,  phase: '1P', price: 22500 },
      { part_no: 'S6-GR1P5K-M',    description: 'Solis S6 Mini 5kW 1P',       brand: 'Solis', category: 'inverter', kw: 5,  phase: '1P', price: 28000 },
      { part_no: 'S6-GR3P10K',     description: 'Solis S6 10kW 3P',           brand: 'Solis', category: 'inverter', kw: 10, phase: '3P', price: 48000 },
      { part_no: 'S6-GR3P15K',     description: 'Solis S6 15kW 3P',           brand: 'Solis', category: 'inverter', kw: 15, phase: '3P', price: 62000 },
      { part_no: 'S6-GR3P20K',     description: 'Solis S6 20kW 3P',           brand: 'Solis', category: 'inverter', kw: 20, phase: '3P', price: 78000 },
      { part_no: 'S6-EH3P10K-H',   description: 'Solis Hybrid 10kW 3P',        brand: 'Solis', category: 'inverter', kw: 10, phase: '3P', price: 72000 },
    ],
    Sigenergy: [
      { part_no: 'SE-5.0-SPC-EU',  description: 'SigenStor 5kW Hybrid 1P',     brand: 'Sigenergy', category: 'inverter', kw: 5,  phase: '1P', price: 58000 },
      { part_no: 'SE-10.0-SPC-EU', description: 'SigenStor 10kW Hybrid 3P',    brand: 'Sigenergy', category: 'inverter', kw: 10, phase: '3P', price: 95000 },
      { part_no: 'SE-15.0-SPC-EU', description: 'SigenStor 15kW Hybrid 3P',    brand: 'Sigenergy', category: 'inverter', kw: 15, phase: '3P', price: 135000 },
      { part_no: 'SE-BAT-5.0',     description: 'Sigenergy Battery 5kWh LFP',  brand: 'Sigenergy', category: 'battery',  kw: 5,  price: 78000 },
      { part_no: 'SE-BAT-10.0',    description: 'Sigenergy Battery 10kWh LFP', brand: 'Sigenergy', category: 'battery',  kw: 10, price: 148000 },
    ],
    Deye: [
      { part_no: 'SUN-5K-SG03LP1-EU',   description: 'Deye 5kW Hybrid 1P',         brand: 'Deye', category: 'inverter', kw: 5,  phase: '1P', price: 32000 },
      { part_no: 'SUN-8K-SG01LP1-EU',   description: 'Deye 8kW Hybrid 1P',         brand: 'Deye', category: 'inverter', kw: 8,  phase: '1P', price: 44000 },
      { part_no: 'SUN-12K-SG04LP3-EU',  description: 'Deye 12kW Hybrid 3P',        brand: 'Deye', category: 'inverter', kw: 12, phase: '3P', price: 68000 },
      { part_no: 'SUN-15K-SG04LP3-EU',  description: 'Deye 15kW Hybrid 3P',        brand: 'Deye', category: 'inverter', kw: 15, phase: '3P', price: 82000 },
      { part_no: 'BOS-G-5.12kWh',        description: 'Deye Battery 5.12kWh LFP',   brand: 'Deye', category: 'battery',  kw: 5.12, price: 75000 },
    ],
    ATMOCE: [
      { part_no: 'ATM-3K-1P',   description: 'ATMOCE 3kW Hybrid 1P',           brand: 'ATMOCE', category: 'inverter', kw: 3,  phase: '1P', price: 21000 },
      { part_no: 'ATM-5K-1P',   description: 'ATMOCE 5kW Hybrid 1P + Backup',  brand: 'ATMOCE', category: 'inverter', kw: 5,  phase: '1P', price: 28500 },
      { part_no: 'ATM-7K-3P',   description: 'ATMOCE 7kW Hybrid 3P + Backup',  brand: 'ATMOCE', category: 'inverter', kw: 7,  phase: '3P', price: 42000 },
      { part_no: 'ATM-10K-3P',  description: 'ATMOCE 10kW Hybrid 3P + Backup', brand: 'ATMOCE', category: 'inverter', kw: 10, phase: '3P', price: 58000 },
      { part_no: 'ATM-15K-3P',  description: 'ATMOCE 15kW Hybrid 3P + Backup', brand: 'ATMOCE', category: 'inverter', kw: 15, phase: '3P', price: 78000 },
      { part_no: 'ATM-BAT-5',   description: 'ATMOCE Battery 5kWh LFP',        brand: 'ATMOCE', category: 'battery',  kw: 5,  price: 68000 },
      { part_no: 'ATM-BAT-10',  description: 'ATMOCE Battery 10kWh LFP',       brand: 'ATMOCE', category: 'battery',  kw: 10, price: 128000 },
    ],
  };

  function now() { return Date.now(); }
  function stamp() { return new Date().toISOString(); }

  function cacheGet(key) {
    var v = cache.get(key);
    if (!v) return null;
    if (v.expires < now()) { cache.delete(key); return null; }
    return v;
  }
  function cacheSet(key, data) {
    cache.set(key, { data: data, expires: now() + CACHE_TTL_MS, created: now() });
  }

  // ─── Data source: Python module or mock ─────────────────────────────────────
  function fetchBrand(brand, cb) {
    var key = 'brand:' + brand;
    var hit = cacheGet(key);
    if (hit) return cb(null, hit.data, now() - hit.created);

    // Try Python bridge
    if (CATALOG_DIR && fs.existsSync(CATALOG_DIR)) {
      var script = path.join(CATALOG_DIR, 'product_lookup.py');
      if (fs.existsSync(script)) {
        cp.execFile(PYTHON_BIN, [script, '--brand', brand, '--json'],
          { timeout: 15000, cwd: CATALOG_DIR },
          function(err, stdout) {
            if (err || !stdout) return fallback();
            try {
              var parsed = JSON.parse(stdout);
              var items = parsed.items || [];
              items.forEach(function(it) { it.updated_at = stamp(); });
              cacheSet(key, items);
              cb(null, items, 0);
            } catch (e) { fallback(); }
          });
        return;
      }
    }
    fallback();
    function fallback() {
      var items = (MOCK[brand] || []).map(function(it) {
        return Object.assign({}, it, { updated_at: stamp(), source: 'mock' });
      });
      cacheSet(key, items);
      cb(null, items, 0);
    }
  }

  // ─── Request handler ────────────────────────────────────────────────────────
  function handle(req, res) {
    var u = req.url || '';
    var m = req.method || 'GET';

    // GET /api/v2/catalog/brands
    if (m === 'GET' && (u === '/api/v2/catalog/brands' || u.indexOf('/api/v2/catalog/brands?') === 0)) {
      var brands = Object.keys(MOCK);
      json(res, 200, { brands: brands, categories: EQUIPMENT_CATEGORIES });
      return true;
    }

    // GET /api/v2/catalog/categories — for UI filter dropdown
    if (m === 'GET' && u === '/api/v2/catalog/categories') {
      json(res, 200, { categories: EQUIPMENT_CATEGORIES });
      return true;
    }

    // POST /api/v2/catalog/refresh
    if (m === 'POST' && u === '/api/v2/catalog/refresh') {
      var n = cache.size;
      cache.clear();
      json(res, 200, { ok: true, cleared: n });
      return true;
    }

    // GET /api/v2/catalog?brand=&category=&q=&limit=&offset=
    var listMatch = u.match(/^\/api\/v2\/catalog(\?(.*))?$/);
    if (m === 'GET' && listMatch) {
      var qs = parseQuery(listMatch[2] || '');
      var brand = qs.brand || 'Huawei';
      if (!MOCK[brand] && !cacheGet('brand:' + brand)) {
        // unknown brand → still return empty list rather than 404
      }
      fetchBrand(brand, function(err, items, cacheAge) {
        if (err) { json(res, 500, { error: err.message || 'fetch_failed' }); return; }
        // Equipment-only: drop accessory / logger / misc categories
        var filtered = items.filter(function(i) {
          return EQUIPMENT_CATEGORIES.indexOf(i.category) !== -1;
        });
        if (qs.category && EQUIPMENT_CATEGORIES.indexOf(qs.category) !== -1) {
          filtered = filtered.filter(function(i) { return i.category === qs.category; });
        }
        if (qs.q) {
          var needle = qs.q.toLowerCase();
          filtered = filtered.filter(function(i) {
            return (i.part_no + ' ' + i.description).toLowerCase().indexOf(needle) !== -1;
          });
        }
        var limit  = clampInt(qs.limit, 50, 1, 200);
        var offset = clampInt(qs.offset, 0, 0, 10000);
        json(res, 200, {
          items: filtered.slice(offset, offset + limit),
          total: filtered.length,
          limit: limit, offset: offset,
          brand: brand,
          cache_age_sec: Math.floor(cacheAge / 1000),
          cache_ttl_sec: Math.floor(CACHE_TTL_MS / 1000),
          source: cacheAge > 0 ? 'cache' : (CATALOG_DIR ? 'python' : 'mock'),
        });
      });
      return true;
    }

    return false;
  }

  return { handle: handle, clearCache: function() { cache.clear(); } };
};

function parseQuery(s) {
  var out = {};
  if (!s) return out;
  s.split('&').forEach(function(p) {
    if (!p) return;
    var eq = p.indexOf('=');
    var k = eq >= 0 ? p.slice(0, eq) : p;
    var v = eq >= 0 ? decodeURIComponent(p.slice(eq + 1).replace(/\+/g, ' ')) : '';
    out[decodeURIComponent(k)] = v;
  });
  return out;
}
function clampInt(v, def, lo, hi) {
  var n = parseInt(v, 10);
  if (isNaN(n)) return def;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
