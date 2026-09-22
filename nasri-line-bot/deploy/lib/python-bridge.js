'use strict';

// ─── Python subprocess bridge ───────────────────────────────
// Encapsulates the mcp-qsolar / mcp-bomsolar subprocess spawns.
// The Node → Python handoff protocol (stdin = {"catalog": ...})
// is preserved byte-for-byte from the original monolith.
//
//   var bridge = require('./lib/python-bridge')({
//     __dirname: __dirname,
//     getCatalog: getCatalog,
//     QSOLAR_SCRIPT, BOMSOLAR_SCRIPT, // optional override
//   });
//   var pdf = await bridge.generateQuotationPdf(spec, customer, project);

var path = require('path');

module.exports = function createPythonBridge(opts) {
  opts = opts || {};
  var appRoot = opts.__dirname || process.cwd();
  var getCatalog = typeof opts.getCatalog === 'function' ? opts.getCatalog : function() { return Promise.resolve({}); };
  var QSOLAR_SCRIPT = opts.QSOLAR_SCRIPT || path.join(appRoot, 'mcp-qsolar', 'server.py');
  var BOMSOLAR_SCRIPT = opts.BOMSOLAR_SCRIPT || path.join(appRoot, 'mcp-bomsolar', 'server.py');

  // ── SRP Calculator CLI — ATMOCE only ────────────────────────
  // Spawns srp_calc_cli.py to compute exact SRP BOM + pricing.
  // Returns promise<SRPResult.as_dict()> or rejects on error.
  function srpCalcBom(config, panels, batteryKwh, backup, warrantyYears) {
    return new Promise(function(resolve, reject) {
      var cp = require('child_process');
      var cliScript = path.join(path.dirname(BOMSOLAR_SCRIPT), 'srp_calc_cli.py');
      var args = JSON.stringify({
        config: config,
        panels: panels,
        battery_kwh: batteryKwh || 0,
        backup: !!backup,
        warranty_years: warrantyYears || 0,
      });
      var env = Object.assign({}, process.env, {
        PYTHONIOENCODING: 'utf-8',
        PYTHONUSERBASE: '/var/www/vhosts/enervia.co.th/.local',
        PYTHONPATH: '/var/www/vhosts/enervia.co.th/.local/lib/python3.11/site-packages',
      });
      var child = cp.spawn('python3', [cliScript, args], { env: env, timeout: 15000 });
      var outChunks = [], errChunks = [];
      child.stdout.on('data', function(c) { outChunks.push(c); });
      child.stderr.on('data', function(c) { errChunks.push(c); });
      child.on('error', function(e) { reject(e); });
      child.on('close', function(code) {
        var stdout = Buffer.concat(outChunks).toString('utf8').trim();
        var stderr = Buffer.concat(errChunks).toString('utf8').trim();
        if (code !== 0) return reject(new Error('srp_calc_cli exited ' + code + (stderr ? ': ' + stderr : '')));
        try {
          var result = JSON.parse(stdout);
          if (result.error) return reject(new Error(result.error));
          resolve(result);
        } catch (e) {
          reject(new Error('srp_calc_cli JSON error: ' + stdout.slice(0, 200)));
        }
      });
    });
  }

  function generateBomPdf(data) {
    return new Promise(function(resolve, reject) {
      var cp = require('child_process');
      // ATMOCE SRP path: cost_summary already has correct SRP pricing — pass through.
      // Non-ATMOCE path: reconstruct cost_summary from generic formulas.
      var srpPassthrough = data.cost_summary && data.cost_summary.srp_config;

      // Build cost_summary (generic path only)
      var tc = 0;
      data.items.forEach(function(i) { tc += i.total_cost; });
      var systemKw = 0;
      data.items.forEach(function(i) {
        if (i.category === '\u0e42\u0e21\u0e14\u0e39\u0e25') {
          var wMatch = i.part_name.match(/(\d{3,4})\s*W/i);
          if (wMatch) systemKw = Math.round(i.quantity * parseInt(wMatch[1]) / 1000);
        }
      });
      if (!systemKw) {
        var kwMatch = (data.project_name || '').match(/(\d+)\s*kw/i);
        systemKw = kwMatch ? parseInt(kwMatch[1]) : 5;
      }
      var systemWp = systemKw * 1000;
      var labor = systemWp * 4.5;
      var bos = systemWp * 0.7;
      var errorCost = systemWp * 1.0;
      var crane = systemKw >= 30 ? 15000 : 0;
      var vat = tc * 0.07;
      var peaTable = [[10,6000],[20,8500],[30,12500],[40,15500],[100,21500],[200,24000],[500,36000],[1000,46000]];
      var peaFee = 0;
      for (var pi = 0; pi < peaTable.length; pi++) {
        if (systemKw <= peaTable[pi][0]) { peaFee = peaTable[pi][1]; break; }
      }
      var grandTotal = tc + vat + labor + bos + errorCost + crane + peaFee;

      var now = new Date();
      var dateStr = data.order_date || (now.getDate() + '/' + (now.getMonth()+1) + '/' + (now.getFullYear() % 100));
      var outFile = 'bom-' + (data.project_name || 'project').replace(/[^a-zA-Z0-9\u0e00-\u0e7f]/g, '_').slice(0, 40) + '-' + Date.now() + '.pdf';
      var outPath = path.join(appRoot, 'boms', outFile);

      var payload = JSON.stringify({
        tool: 'bomsolar_generate_pdf',
        project_name: data.project_name || '',
        project_address: data.project_address || '',
        order_date: dateStr,
        items: data.items,
        output_path: outPath,
        notes: data.notes || '',
        cost_summary: srpPassthrough ? data.cost_summary : {
          equipment_total: tc,
          vat_7pct: Math.round(vat),
          labor: labor,
          bos: bos,
          error_cost: errorCost,
          crane: crane,
          pea_mea_fee: peaFee,
          grand_total: Math.round(grandTotal),
          actual_wp: systemWp,
        },
      });

      var env = Object.assign({}, process.env, {
        ORACLE_REPO_ROOT: path.join(appRoot, '..', '..'),
        BOMSOLAR_OUTPUT_DIR: path.join(appRoot, 'boms'),
        BOMSOLAR_ASSET_DIR: path.join(appRoot, 'mcp-bomsolar', 'assets'),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUSERBASE: '/var/www/vhosts/enervia.co.th/.local',
        PYTHONPATH: '/var/www/vhosts/enervia.co.th/.local/lib/python3.11/site-packages',
      });

      // Spawn Python with catalog handed off via stdin (protocol with Agent A).
      (async function() {
        var catalogJson = '';
        try {
          var catalogData = await getCatalog();
          catalogJson = JSON.stringify({ catalog: catalogData || {} });
        } catch (e) {
          console.error('[bomsolar-catalog-handoff]', e.message);
          catalogJson = JSON.stringify({ catalog: {} });
        }
        var child = cp.spawn('python3', [BOMSOLAR_SCRIPT, payload], { env: env, timeout: 60000 });
        var outChunks = [], errChunks = [];
        var finished = false;
        child.stdout.on('data', function(c) { outChunks.push(c); });
        child.stderr.on('data', function(c) { errChunks.push(c); });
        child.on('error', function(e) {
          if (finished) return; finished = true;
          reject(new Error(e.message));
        });
        child.on('close', function(code) {
          if (finished) return; finished = true;
          var stdout = Buffer.concat(outChunks).toString('utf8');
          var stderr = Buffer.concat(errChunks).toString('utf8');
          if (code !== 0) {
            return reject(new Error(stderr || ('bomsolar exited ' + code)));
          }
          try {
            var lines = stdout.trim().split('\n');
            var jsonLine = '';
            for (var i = lines.length - 1; i >= 0; i--) {
              if (lines[i].charAt(0) === '{') { jsonLine = lines[i]; break; }
            }
            if (!jsonLine) throw new Error('No JSON in output: ' + stdout.slice(0, 200));
            var result = JSON.parse(jsonLine);
            if (!result.success) return reject(new Error(result.error || 'bomsolar failed'));
            result.filename = outFile;
            resolve(result);
          } catch (e) { reject(new Error('JSON parse error: ' + stdout.slice(0, 200))); }
        });
        try {
          child.stdin.write(catalogJson);
          child.stdin.end();
        } catch (e) {
          console.error('[bomsolar-stdin]', e.message);
        }
      })();
    });
  }

  function generateQuotationPdf(spec, customerName, projectName) {
    return new Promise(function(resolve, reject) {
      var cp = require('child_process');
      // Pass structured spec to qsolar_generate to avoid lossy re-parsing in Python.
      var payload;
      if (spec && typeof spec === 'object' && spec.brand) {
        payload = JSON.stringify({
          tool: 'qsolar_generate',
          brand: spec.brand,
          size_kw: spec.size_kw,
          phase: spec.phase,
          has_battery: spec.has_battery || false,
          has_backup: spec.has_backup || false,
          customer_name: customerName || spec.customer_name || 'ลูกค้า',
          project_name: projectName || '',
          grand_total: spec.grand_total || 0,
          discount: spec.discount || 0,
          panel_brand: spec.panel_brand || '',
          panel_watt: spec.panel_watt || 0,
          panel_count: spec.panel_count || 0,
          battery_kwh: spec.battery_kwh || 0,
          remarks: spec.remarks || '',
          lump_sum: spec.lump_sum || false,
          has_optimizer: spec.has_optimizer || false,
        });
        console.log('[qsolar-payload] panel_brand=' + (spec.panel_brand || '') + ' panel_watt=' + (spec.panel_watt || 0) + ' panel_count=' + (spec.panel_count || 0) + ' size_kw=' + (spec.size_kw || 0) + ' optimizer=' + (spec.has_optimizer || false));
      } else {
        // Fallback: raw string spec (legacy path)
        payload = JSON.stringify({
          tool: 'qsolar_from_spec',
          spec: spec,
          customer_name: customerName || 'ลูกค้า',
          project_name: projectName || '',
        });
      }
      var env = Object.assign({}, process.env, {
        ORACLE_REPO_ROOT: path.join(appRoot, '..', '..'),
        QSOLAR_OUTPUT_DIR: path.join(appRoot, 'boms'),
        QSOLAR_ASSET_DIR: path.join(appRoot, 'assets'),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUSERBASE: '/var/www/vhosts/enervia.co.th/.local',
        PYTHONPATH: '/var/www/vhosts/enervia.co.th/.local/lib/python3.11/site-packages',
      });
      // Spawn Python with catalog handed off via stdin (protocol with Agent A):
      // stdin = {"catalog": {...}} — Python reads it before processing argv[1].
      (async function() {
        var catalogJson = '';
        try {
          var catalogData = await getCatalog();
          catalogJson = JSON.stringify({ catalog: catalogData || {} });
        } catch (e) {
          console.error('[qsolar-catalog-handoff]', e.message);
          catalogJson = JSON.stringify({ catalog: {} });
        }
        var child = cp.spawn('python3', [QSOLAR_SCRIPT, payload], { env: env, timeout: 60000 });
        var outChunks = [], errChunks = [];
        var finished = false;
        child.stdout.on('data', function(c) { outChunks.push(c); });
        child.stderr.on('data', function(c) { errChunks.push(c); });
        child.on('error', function(e) {
          if (finished) return; finished = true;
          reject(new Error(e.message));
        });
        child.on('close', function(code) {
          if (finished) return; finished = true;
          var stdout = Buffer.concat(outChunks).toString('utf8');
          var stderr = Buffer.concat(errChunks).toString('utf8');
          if (code !== 0) {
            return reject(new Error(stderr || ('qsolar exited ' + code)));
          }
          try {
            var lines = stdout.trim().split('\n');
            var jsonLine = '';
            for (var i = lines.length - 1; i >= 0; i--) {
              if (lines[i].charAt(0) === '{') { jsonLine = lines[i]; break; }
            }
            if (!jsonLine) throw new Error('No JSON in output: ' + stdout.slice(0, 200));
            var result = JSON.parse(jsonLine);
            if (!result.success) return reject(new Error(result.error || 'qsolar failed'));
            resolve(result);
          } catch (e) { reject(new Error('JSON parse error: ' + stdout.slice(0, 200))); }
        });
        try {
          child.stdin.write(catalogJson);
          child.stdin.end();
        } catch (e) {
          // Pipe already closed — Python probably didn't read stdin; non-fatal.
          console.error('[qsolar-stdin]', e.message);
        }
      })();
    });
  }

  return {
    QSOLAR_SCRIPT: QSOLAR_SCRIPT,
    BOMSOLAR_SCRIPT: BOMSOLAR_SCRIPT,
    generateBomPdf: generateBomPdf,
    generateQuotationPdf: generateQuotationPdf,
    srpCalcBom: srpCalcBom,
  };
};
