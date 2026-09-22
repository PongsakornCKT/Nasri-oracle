'use strict';

/**
 * degraded-guard.js — R3 Degraded Mode Fail-Loud Guard (#R3)
 * Alerts admin immediately when SQLite DB fails and falls back to legacy JSON.
 * Exposes degraded_mode status for /health and /api/admin/health endpoints.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

module.exports = function createDegradedGuard(opts) {
  opts = opts || {};
  var notifyAdminFn = typeof opts.notifyAdmin === 'function' ? opts.notifyAdmin : function() { return Promise.resolve(); };

  var _degradedMode = false;
  var _degradedReason = '';
  var _alertSent = false;

  function markDegraded(reason) {
    if (!_degradedMode) {
      _degradedMode = true;
      _degradedReason = String(reason || 'SQLite storage unavailable');
    }

    if (!_alertSent) {
      _alertSent = true;
      var alertText = '🚨 [DEGRADED MODE ALERT] SQLite DB failed — System falling back to legacy JSON storage!\nReason: ' + _degradedReason.slice(0, 200);
      console.error('[degraded-guard]', alertText);
      notifyAdminFn(alertText).catch(function(e) {
        console.error('[degraded-guard] Admin alert failed:', e.message);
      });
    }
  }

  function getHealthStatus(baseHealth) {
    baseHealth = baseHealth || {};
    return Object.assign({}, baseHealth, {
      degraded_mode: _degradedMode,
      storage_engine: _degradedMode ? 'legacy_json' : 'sqlite_wal',
      degraded_reason: _degradedMode ? _degradedReason : null
    });
  }

  return {
    markDegraded: markDegraded,
    getHealthStatus: getHealthStatus,
    isDegraded: function() { return _degradedMode; }
  };
};
