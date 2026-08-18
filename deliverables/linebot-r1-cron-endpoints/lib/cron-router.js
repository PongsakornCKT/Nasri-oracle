'use strict';

/**
 * cron-router.js — R1 External Cron Endpoints (#R1)
 * Serves GET /api/cron/<job> for external crontab execution.
 * Fail-closed authentication using CRON_TOKEN (scoped separately from ADMIN_API_TOKEN).
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createCronRouter(opts) {
  opts = opts || {};
  var cronToken = opts.cronToken || process.env.CRON_TOKEN || '';
  var catalogCache = opts.catalogCache;
  var freshnessMonitor = opts.freshnessMonitor;
  var auditLog = opts.auditLog || function() {};

  function handleCronRequest(req, res) {
    var url = req.url || '';
    if (url.indexOf('/api/cron/') !== 0) return false;

    var authHeader = req.headers['authorization'] || '';
    var token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    // Allow token in query parameter for simple cURL / Wget crontabs: ?token=CRON_TOKEN
    if (!token) {
      try {
        var uObj = new URL(url, 'http://localhost');
        token = uObj.searchParams.get('token') || '';
      } catch (e) {}
    }

    // Fail-closed: if CRON_TOKEN not set or token mismatch -> 401 Unauthorized
    if (!cronToken || !token || token !== cronToken) {
      auditLog('cron_auth_fail', '', req.url + ' ip=' + (req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : ''));
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing CRON_TOKEN' }));
      return true;
    }

    var jobName = url.replace('/api/cron/', '').split('?')[0].trim();
    var t0 = Date.now();

    if (jobName === 'prewarm') {
      if (catalogCache && typeof catalogCache.invalidate === 'function') {
        catalogCache.invalidate();
        if (typeof catalogCache.get === 'function') {
          catalogCache.get().then(function() {
            auditLog('cron_job_success', '', 'cron job prewarm completed in ' + (Date.now() - t0) + 'ms');
          }).catch(function(e) {
            console.error('[cron-router] prewarm error:', e.message);
          });
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, job: 'prewarm', status: 'triggered', triggered_at: new Date().toISOString() }));
      return true;
    }

    if (jobName === 'freshness') {
      if (catalogCache && typeof catalogCache.get === 'function') {
        catalogCache.get().then(function(data) {
          if (freshnessMonitor && typeof freshnessMonitor.checkFreshness === 'function') {
            freshnessMonitor.checkFreshness(data, catalogCache.stats());
          }
          auditLog('cron_job_success', '', 'cron job freshness completed in ' + (Date.now() - t0) + 'ms');
        }).catch(function(e) {
          console.error('[cron-router] freshness error:', e.message);
        });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, job: 'freshness', status: 'triggered', triggered_at: new Date().toISOString() }));
      return true;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown cron job: ' + jobName }));
    return true;
  }

  return { handleCronRequest: handleCronRequest };
};
