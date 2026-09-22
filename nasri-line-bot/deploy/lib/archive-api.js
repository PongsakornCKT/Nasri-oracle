'use strict';

// Archive API — Enervia v2.5 #40
// Serves BOM + Quotation archive with date filters (year/month/day), search, pagination
// and direct PDF streaming. Designed as a CommonJS factory so app.js can mount it.
//
// Source priority:
//   1. SQLite (nasri.sqlite quotations table) if better-sqlite3 available + file exists
//   2. Filesystem scan of document/ as fallback (parse filenames, use mtime)
//
// Factory:
//   var archive = require('./lib/archive-api')({
//     DOC_DIR:   '/path/to/document',
//     DB_PATH:   '/path/to/nasri.sqlite',
//     BASE_URL:  'https://ai.enervia.co.th',
//   });
//
// Mount (inside http.createServer handler):
//   if (archive.handle(req, res)) return;

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

function shortHash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
}

module.exports = function createArchiveApi(opts) {
  opts = opts || {};
  var DOC_DIR = opts.DOC_DIR;
  var DB_PATH = opts.DB_PATH || '';
  var BASE_URL = opts.BASE_URL || '';

  var db = null;
  try {
    if (DB_PATH && fs.existsSync(DB_PATH)) {
      var Database = require('better-sqlite3');
      db = new Database(DB_PATH, { readonly: false, fileMustExist: false });
      db.pragma('journal_mode = WAL');
    }
  } catch (e) {
    db = null;
  }

  // ─── Filename parsers (mirrors backfill-document-metadata.ts) ───────────────
  var QT_RE  = /^QT(\d{4})(\d{2})(\d{2})(\d{3,4})(?:_(.+?))?\.pdf$/i;
  var BOM_RE = /^bom-(.+?)(?:-(\d{13,14}))?\.(?:pdf|xlsx?)$/i;

  function parseFilename(name, mtime) {
    var qt = name.match(QT_RE);
    if (qt) {
      var iso = qt[1] + '-' + qt[2] + '-' + qt[3] + 'T00:00:00.000Z';
      var suffix = qt[5] || '';
      var project = suffix.replace(/_/g, ' ');
      return {
        id: 'QT' + qt[1] + qt[2] + qt[3] + qt[4],
        doc_type: 'quotation',
        issued_at: iso,
        customer_name: project || '(unknown)',
        project_name: project,
        total: null,
        filename: name,
      };
    }
    var bom = name.match(BOM_RE);
    if (bom) {
      var ts = bom[2], isoB, proj = bom[1].replace(/_/g, ' ');
      if (ts && ts.length === 13) isoB = new Date(parseInt(ts, 10)).toISOString();
      else if (ts && ts.length === 14) {
        isoB = ts.slice(0,4)+'-'+ts.slice(4,6)+'-'+ts.slice(6,8)+'T'
             + ts.slice(8,10)+':'+ts.slice(10,12)+':'+ts.slice(12,14)+'.000Z';
      } else isoB = mtime.toISOString();
      return {
        id: 'BOM-' + shortHash(name),
        doc_type: 'bom',
        issued_at: isoB,
        customer_name: proj,
        project_name: proj,
        total: null,
        filename: name,
      };
    }
    // fallback
    var lower = name.toLowerCase();
    var isBom = lower.indexOf('bom') !== -1;
    return {
      id: 'DOC-' + shortHash(name),
      doc_type: isBom ? 'bom' : 'quotation',
      issued_at: mtime.toISOString(),
      customer_name: '(unknown)',
      project_name: '',
      total: null,
      filename: name,
    };
  }

  // ─── Data source: SQLite preferred, filesystem fallback ─────────────────────
  function loadAll() {
    if (db) {
      try {
        var rows = db.prepare(
          'SELECT id, doc_type, COALESCE(pdf_path, \'\') AS pdf_path, ' +
          'issued_at, customer_name, COALESCE(project_name, \'\') AS project_name, ' +
          'COALESCE(total, 0) AS total ' +
          'FROM quotations WHERE pdf_path IS NOT NULL'
        ).all();
        return rows.map(function(r) {
          return {
            id: r.id,
            doc_type: r.doc_type || 'quotation',
            issued_at: r.issued_at,
            customer_name: r.customer_name || '(unknown)',
            project_name: r.project_name || '',
            total: r.total || null,
            filename: path.basename(r.pdf_path),
          };
        });
      } catch (e) { /* fall through to fs */ }
    }
    // Filesystem scan
    if (!fs.existsSync(DOC_DIR)) return [];
    var names = fs.readdirSync(DOC_DIR).filter(function(n) {
      return /\.(pdf|html|json|xlsx?)$/i.test(n) && /\.pdf$/i.test(n);
    });
    return names.map(function(n) {
      var st = fs.statSync(path.join(DOC_DIR, n));
      return parseFilename(n, st.mtime);
    });
  }

  // ─── Filters ────────────────────────────────────────────────────────────────
  function applyFilters(items, q) {
    var year  = q.year ? parseInt(q.year, 10) : null;
    var month = q.month ? parseInt(q.month, 10) : null;
    var day   = q.day ? parseInt(q.day, 10) : null;
    var type  = q.type === 'bom' || q.type === 'quotation' ? q.type : null;
    var needle = q.q ? String(q.q).toLowerCase().trim() : '';

    return items.filter(function(it) {
      if (type && it.doc_type !== type) return false;
      if (year || month || day) {
        var d = new Date(it.issued_at);
        if (year && d.getUTCFullYear() !== year) return false;
        if (month && (d.getUTCMonth() + 1) !== month) return false;
        if (day && d.getUTCDate() !== day) return false;
      }
      if (needle) {
        var hay = (it.id + ' ' + it.customer_name + ' ' + it.project_name + ' ' + it.filename).toLowerCase();
        if (hay.indexOf(needle) === -1) return false;
      }
      return true;
    });
  }

  function sortItems(items, sort) {
    var asc = sort === 'date_asc';
    items.sort(function(a, b) {
      var d = (a.issued_at < b.issued_at) ? -1 : (a.issued_at > b.issued_at ? 1 : 0);
      return asc ? d : -d;
    });
    return items;
  }

  // ─── Request handler ────────────────────────────────────────────────────────
  function handle(req, res) {
    var u = req.url || '';
    var m = req.method || 'GET';
    if (m !== 'GET') return false;

    // GET /api/archive?type=&year=&month=&day=&q=&sort=&limit=&offset=
    var listMatch = u.match(/^\/api\/archive(\?(.*))?$/);
    if (listMatch) {
      var qs = parseQuery(listMatch[2] || '');
      var limit  = clampInt(qs.limit, 50, 1, 200);
      var offset = clampInt(qs.offset, 0, 0, 100000);
      var all = loadAll();
      var filtered = applyFilters(all, qs);
      sortItems(filtered, qs.sort);
      var page = filtered.slice(offset, offset + limit).map(function(it) {
        return {
          id: it.id,
          doc_type: it.doc_type,
          issued_at: it.issued_at,
          customer_name: it.customer_name,
          project_name: it.project_name,
          total: it.total,
          pdf_url: '/api/archive/' + encodeURIComponent(it.id) + '/pdf',
          filename: it.filename,
        };
      });
      json(res, 200, {
        items: page, total: filtered.length, limit: limit, offset: offset,
        source: db ? 'sqlite' : 'filesystem',
      });
      return true;
    }

    // GET /api/archive/:id/pdf
    var pdfMatch = u.match(/^\/api\/archive\/([^\/\?]+)\/pdf(?:\?.*)?$/);
    if (pdfMatch) {
      var id = decodeURIComponent(pdfMatch[1]);
      var all2 = loadAll();
      var found = null;
      for (var i = 0; i < all2.length; i++) { if (all2[i].id === id) { found = all2[i]; break; } }
      if (!found) { json(res, 404, { error: 'not_found', id: id }); return true; }
      var file = path.join(DOC_DIR, found.filename);
      if (!fs.existsSync(file)) { json(res, 404, { error: 'file_missing', path: found.filename }); return true; }
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="' + found.filename + '"',
        'Cache-Control': 'private, max-age=300',
      });
      fs.createReadStream(file).pipe(res);
      return true;
    }

    // GET /api/archive/summary — for dashboard stat cards
    if (u === '/api/archive/summary' || u.indexOf('/api/archive/summary?') === 0) {
      var all3 = loadAll();
      var byType = { bom: 0, quotation: 0 };
      var byMonth = {};
      all3.forEach(function(it) {
        byType[it.doc_type] = (byType[it.doc_type] || 0) + 1;
        var m2 = it.issued_at.slice(0, 7);
        byMonth[m2] = (byMonth[m2] || 0) + 1;
      });
      json(res, 200, { total: all3.length, by_type: byType, by_month: byMonth });
      return true;
    }

    return false;
  }

  return { handle: handle };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
