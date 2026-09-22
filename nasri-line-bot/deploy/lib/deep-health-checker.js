'use strict';

/**
 * deep-health-checker.js — V3 Deep Health & Build Info Checker (#Phase04)
 * Aggregates system sub-checks for /health and provides /__build endpoint data.
 * Sub-checks: sqlite_ok, catalog_lkg_age, outbox_pending_count, followup_last_run, push_quota_usage.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-12
 */

function getDeepHealthStatus(db, opts) {
  opts = opts || {};
  var sqliteOk = false;

  if (db && typeof db.prepare === 'function') {
    try {
      db.prepare('SELECT 1').get();
      sqliteOk = true;
    } catch (e) {
      sqliteOk = false;
    }
  }

  var outboxPendingCount = 0;
  if (sqliteOk) {
    try {
      var row = db.prepare('SELECT COUNT(*) as cnt FROM sync_outbox WHERE status = "pending"').get();
      outboxPendingCount = row ? row.cnt : 0;
    } catch (e) {
      outboxPendingCount = 0;
    }
  }

  return {
    sqlite_ok: sqliteOk,
    catalog_lkg_age_sec: opts.catalogLkgAgeSec || 0,
    outbox_pending_count: outboxPendingCount,
    followup_last_run: opts.followupLastRun || 'never',
    push_quota_usage_pct: opts.pushQuotaUsagePct || 0.0
  };
}

function getBuildInfo() {
  return {
    git_sha: process.env.DEPLOY_SHA || 'dev-local',
    deploy_at: process.env.DEPLOY_AT || 'local-build',
    node_version: process.version,
    service: 'ai.enervia.co.th'
  };
}

module.exports = {
  getDeepHealthStatus: getDeepHealthStatus,
  getBuildInfo: getBuildInfo
};
