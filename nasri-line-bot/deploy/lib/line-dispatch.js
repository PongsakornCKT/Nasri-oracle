'use strict';

/**
 * lib/line-dispatch.js
 * LINE Dispatch Bot Controller (Phase 3).
 *
 * Handles:
 * - Feature flag checks & userId allowlist verification (silent pass-through for non-allowed users).
 * - Fleet command parsing (status, peek, dispatch).
 * - HMAC-signed API dispatch request via dispatchClient.
 * - Callback endpoint handler (POST /internal/dispatch-callback) with HMAC verification & push routing.
 */

var crypto = require('crypto');
var dispatchClient = require('./dispatch-client');
var flexDispatch = require('./flex-dispatch');

// In-memory nonce cache with 600s TTL for anti-replay
var nonceCache = new Map();

function cleanStaleNonces() {
  var now = Date.now();
  for (var entry of nonceCache.entries()) {
    if (entry[1] < now) {
      nonceCache.delete(entry[0]);
    }
  }
}

function isReplayedNonce(nonce) {
  cleanStaleNonces();
  return nonceCache.has(nonce);
}

function recordNonce(nonce, ttlMs) {
  ttlMs = ttlMs || 600000; // 600 seconds
  nonceCache.set(nonce, Date.now() + ttlMs);
}

function isEnabled() {
  return process.env.LINE_DISPATCH_ENABLED === '1';
}

function getAllowlistedUsers() {
  var raw = process.env.LINE_DISPATCH_ALLOWLIST_USERS || process.env.LINE_DISPATCH_PHONG_USER_ID || '';
  return raw.split(',').map(function(u) { return u.trim(); }).filter(Boolean);
}

function isAllowedActor(userId) {
  if (!userId || typeof userId !== 'string') return false;
  var allowed = getAllowlistedUsers();
  if (allowed.length === 0) return false;
  return allowed.includes(userId.trim());
}

/**
 * Parses user message into a fleet dispatch command.
 * Returns null if the message is NOT a fleet command.
 *
 * @param {string} text
 * @returns {Object|null} { action, agent, prompt }
 */
function parseDispatchCommand(text) {
  if (!text || typeof text !== 'string') return null;
  var trimmed = text.trim();
  var lo = trimmed.toLowerCase();

  // 1. Status commands
  if (lo === '/status' || lo === 'status' || lo === 'เช็คสถานะ' || lo === 'ดูสถานะ' || lo === 'สถานะ' || lo === 'สถานะ fleet' || lo === 'fleet status') {
    return { action: 'status' };
  }

  // 2. Peek commands e.g. "/peek pa", "peek wy", "ดู pa", "ดูสถานะ nasri", "เช็ค wy"
  var peekMatch = trimmed.match(/^(?:\/peek|peek|ดูสถานะ|ดู|เช็ค)\s+(pa|wy|nasri|all)$/i);
  if (peekMatch) {
    return { action: 'peek', agent: peekMatch[1].toLowerCase() };
  }

  // Single agent keyword alone e.g. "pa", "wy", "nasri"
  if (/^(pa|wy|nasri)$/i.test(trimmed)) {
    return { action: 'peek', agent: trimmed.toLowerCase() };
  }

  // 3. Dispatch commands
  // Prefix format: "/dispatch pa ...", "สั่ง wy ..."
  var prefixMatch = trimmed.match(/^(?:\/dispatch|สั่ง)\s+(pa|wy|nasri|all)\s+([\s\S]+)$/i);
  if (prefixMatch) {
    return { action: 'dispatch', agent: prefixMatch[1].toLowerCase(), prompt: prefixMatch[2].trim() };
  }

  // Direct target format: "pa สรุป PR ล่าสุด", "wy เช็คราคาสต็อก", "nasri รันเทส"
  var directMatch = trimmed.match(/^(pa|wy|nasri|all)\s+([\s\S]+)$/i);
  if (directMatch) {
    return { action: 'dispatch', agent: directMatch[1].toLowerCase(), prompt: directMatch[2].trim() };
  }

  return null;
}

/**
 * Attempts to handle a text message as a fleet dispatch command.
 *
 * @param {Object} ev LINE event
 * @param {string} text Message text
 * @param {string} replyToken LINE reply token
 * @param {Object} [deps] Dependencies: { rText, lReply, sendDispatch }
 * @returns {Promise<boolean>} True if handled as a dispatch command, false if passed through.
 */
async function tryHandleDispatchCommand(ev, text, replyToken, deps) {
  deps = deps || {};
  var rText = deps.rText;
  var lReply = deps.lReply;
  var sendDispatchFn = deps.sendDispatch || dispatchClient.sendDispatch;

  if (!isEnabled()) return false;

  var userId = ev.source && ev.source.userId;
  if (!isAllowedActor(userId)) {
    // Non-allowed users fall through silently to normal bot without knowing command mode exists
    return false;
  }

  var parsedCmd = parseDispatchCommand(text);
  if (!parsedCmd) {
    // Not a dispatch command -> fall through to normal bot flow (RAG/quote)
    return false;
  }

  // Execute dispatch API call
  var result = await sendDispatchFn({
    action: parsedCmd.action,
    agent: parsedCmd.agent,
    prompt: parsedCmd.prompt,
    actorUserId: userId
  });

  if (result.success) {
    var note = (result.data && result.data.note) || 'รับคำสั่งแล้ว';
    var jobId = (result.data && result.data.job_id) || 'ld_' + Math.random().toString(16).slice(2, 10);
    var flexPayload = flexDispatch.buildDispatchAckFlex({
      jobId: jobId,
      action: parsedCmd.action,
      agent: parsedCmd.agent || 'fleet',
      prompt: parsedCmd.prompt,
      note: note
    });

    if (lReply && replyToken) {
      await lReply(replyToken, [flexPayload]);
    }
  } else {
    // Report human error message back to P'Phong
    var errorMsg = result.message || '⚠️ เกิดข้อผิดพลาดในการส่งคำสั่ง';
    if (rText && replyToken) {
      await rText(replyToken, errorMsg);
    }
  }

  return true;
}

/**
 * Express / HTTP request handler for POST /internal/dispatch-callback
 *
 * @param {Object} req Node HTTP Request
 * @param {Object} res Node HTTP Response
 * @param {Object} [deps] Dependencies: { lPush }
 */
function handleCallbackRequest(req, res, deps) {
  deps = deps || {};
  var lPush = deps.lPush;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'method_not_allowed' }));
  }

  var chunks = [];
  req.on('data', function(c) { chunks.push(c); });
  req.on('end', async function() {
    var rawBody = Buffer.concat(chunks).toString('utf8');

    // 1. Check feature flag
    if (!isEnabled()) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'dispatch_disabled' }));
    }

    // 2. Auth headers
    var timestamp = req.headers['x-ld-timestamp'];
    var nonce = req.headers['x-ld-nonce'];
    var sig = req.headers['x-ld-signature'];
    var actor = req.headers['x-ld-actor'];
    var secret = process.env.LD_SHARED_SECRET || '';

    if (!secret || !sig || !timestamp || !nonce) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'bad_signature', message: 'Missing auth headers or secret' }));
    }

    // Timestamp skew check (<= 300s)
    var nowSec = Math.floor(Date.now() / 1000);
    var tsNum = parseInt(timestamp, 10);
    if (isNaN(tsNum) || Math.abs(nowSec - tsNum) > 300) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'stale_timestamp', message: 'Timestamp skew > 300s' }));
    }

    // Compute expected signature (including actor in preImage)
    var bodySha256 = crypto.createHash('sha256').update(rawBody).digest('hex');
    var path = '/internal/dispatch-callback';
    var preImage = timestamp + '.' + nonce + '.' + (actor || '') + '.POST.' + path + '.' + bodySha256;
    var expectedSig = crypto.createHmac('sha256', secret).update(preImage).digest('hex');

    try {
      var sigBuf = Buffer.from(sig, 'hex');
      var expBuf = Buffer.from(expectedSig, 'hex');
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'bad_signature', message: 'Invalid HMAC signature' }));
      }
    } catch (e) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'bad_signature', message: 'HMAC calculation error' }));
    }

    // Parse payload
    var payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'bad_request', message: 'Invalid JSON body' }));
    }

    var targetActor = actor || payload.actor_user_id || payload.actor;
    if (!targetActor) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'bad_request', message: 'Missing target actor LINE userId' }));
    }

    // Enforce actor allowlist for callback push recipient
    if (!isAllowedActor(targetActor)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'actor_not_allowed', message: 'Recipient not allowed' }));
    }

    // Replay check & record nonce (AFTER signature & allowlist verification)
    if (isReplayedNonce(nonce)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'replayed_nonce', message: 'Replayed nonce' }));
    }
    recordNonce(nonce);

    // Build Flex result & Push back to actor
    if (lPush) {
      var resultFlex = flexDispatch.buildDispatchResultFlex(payload);
      try {
        await lPush(targetActor, [resultFlex], 'dispatch');
      } catch (e) {
        console.error('[line-dispatch callback push error]', e.message);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, job_id: payload.job_id || payload.jobId }));
  });
}

module.exports = {
  isEnabled: isEnabled,
  getAllowlistedUsers: getAllowlistedUsers,
  isAllowedActor: isAllowedActor,
  parseDispatchCommand: parseDispatchCommand,
  tryHandleDispatchCommand: tryHandleDispatchCommand,
  handleCallbackRequest: handleCallbackRequest,
  isReplayedNonce: isReplayedNonce,
  recordNonce: recordNonce
};
