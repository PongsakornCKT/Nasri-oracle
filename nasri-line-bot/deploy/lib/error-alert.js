'use strict';

// ─── Error Alert: throttled admin LINE push on silent errors ──
// Bug this fixes: catalogCache/_userRole ReferenceErrors in the webhook
// path only ever hit console.error — nobody saw them until a customer
// complained the bot went silent, weeks later. Wire alertAdminError()
// into every catch{} in the webhook path so admin gets pushed on the
// FIRST occurrence, then throttled (repeat of the same error within
// windowMs just increments a counter folded into the next alert).
//
// Usage:
//   var _errorAlert = require('./lib/error-alert')({ notifyAdmin: notifyAdmin });
//   ...
//   catch (e) {
//     console.error('[ev]', e);
//     _errorAlert.alertAdminError('webhook-text', e);
//   }

module.exports = function createErrorAlert(opts) {
  opts = opts || {};
  var notifyAdminFn = typeof opts.notifyAdmin === 'function' ? opts.notifyAdmin : function() { return Promise.resolve(); };
  var windowMs = typeof opts.windowMs === 'number' ? opts.windowMs : 10 * 60 * 1000; // 10 min
  var clock = typeof opts.now === 'function' ? opts.now : function() { return Date.now(); };
  var state = new Map(); // key -> { count, lastSentAt }

  function alertAdminError(category, err) {
    var msg = (err && err.message) || String(err);
    var key = category + ':' + msg.slice(0, 100);
    var now = clock();
    var entry = state.get(key);
    if (!entry) {
      entry = { count: 0, lastSentAt: 0 };
      state.set(key, entry);
    }
    entry.count++;
    if (now - entry.lastSentAt >= windowMs) {
      var repeatSuffix = entry.count > 1 ? ' (×' + entry.count + ' since last alert)' : '';
      var text = '🚨 [' + category + '] ' + msg.slice(0, 200) + repeatSuffix;
      entry.lastSentAt = now;
      entry.count = 0;
      notifyAdminFn(text).catch(function(e) { console.error('[error-alert] notify failed:', e.message); });
    }
  }

  return { alertAdminError: alertAdminError, _state: state };
};
