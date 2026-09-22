'use strict';

/**
 * lib/dispatch-client.js
 * HMAC-signed client for communicating with the home dispatch API over Cloudflare Tunnel.
 *
 * Implements CONTRACT.md auth and error handling.
 */

var crypto = require('crypto');
var http = require('http');
var https = require('https');
var URL = require('url').URL;

function getApiUrl() {
  return process.env.DISPATCH_API_URL || 'http://127.0.0.1:4310/dispatch';
}

function getSharedSecret() {
  return process.env.LD_SHARED_SECRET || '';
}

/**
 * Maps error response / status to human-readable Thai message.
 */
function mapErrorToHumanMessage(statusCode, errCode, errDetail, agent) {
  agent = agent || 'fleet';
  if (statusCode === 400) {
    return '⚠️ รูปแบบคำสั่งไม่ถูกต้อง (400 bad_request): ' + (errDetail || 'กรุณาตรวจสอบโครงสร้างคำสั่ง');
  }
  if (statusCode === 401) {
    return '🔒 การยืนยันตัวตนล้มเหลว (401 ' + (errCode || 'bad_signature') + '): ลายเซ็น HMAC/Timestamp/Nonce ไม่ถูกต้อง';
  }
  if (statusCode === 403) {
    if (errCode === 'forbidden_action') {
      return '🚫 ปฏิเสธคำสั่งต้องห้าม: คำสั่งนี้มีคีย์เวิร์ดไม่อนุญาต (ห้าม merge/deploy/git push/force/rm -rf บน LINE) กรุณาสั่งจากหน้าจอโดยตรงครับ';
    }
    if (errCode === 'actor_not_allowed') {
      return '🚫 ปฏิเสธคำสั่ง: คุณไม่มีสิทธิ์สั่งงานระบบ fleet ผ่าน LINE';
    }
    return '🚫 ปฏิเสธคำสั่ง (403 Forbidden): ' + (errDetail || 'คำสั่งไม่ได้รับอนุญาต');
  }
  if (statusCode === 409) {
    return '⚠️ Agent (' + agent + ') ไม่พร้อมทำงานในขณะนี้ (tmux window ปิดอยู่หรือ agent ไม่ตอบสนอง)';
  }
  if (statusCode === 503) {
    return '⚠️ เครื่องบ้าน/WSL ไม่พร้อมทำงาน (tmux หรือ fleet down)';
  }
  return '⚠️ เกิดข้อผิดพลาดจากเครื่องบ้าน (HTTP ' + statusCode + '): ' + (errDetail || errCode || 'unknown error');
}

/**
 * Send a dispatch request to the home dispatch API.
 *
 * @param {Object} opts
 * @param {string} opts.action - 'status' | 'peek' | 'dispatch'
 * @param {string} [opts.agent] - 'wy' | 'nasri' | 'pa' | 'all'
 * @param {string} [opts.prompt] - Command text (max 4000 chars)
 * @param {string} opts.actorUserId - LINE userId of sender
 * @param {string} [opts.apiUrl] - Optional override URL
 * @param {string} [opts.secret] - Optional override secret
 * @returns {Promise<Object>}
 */
function sendDispatch(opts) {
  opts = opts || {};
  return new Promise(function(resolve) {
    var action = opts.action;
    var agent = opts.agent;
    var prompt = opts.prompt;
    var actorUserId = opts.actorUserId || '';
    var targetUrlStr = opts.apiUrl || getApiUrl();
    var secret = opts.secret || getSharedSecret();

    if (!action || !['status', 'peek', 'dispatch'].includes(action)) {
      return resolve({
        success: false,
        statusCode: 400,
        error: 'unsupported_action',
        message: '⚠️ Action ไม่ถูกต้อง ต้องเป็น status, peek หรือ dispatch'
      });
    }

    if ((action === 'peek' || action === 'dispatch') && !agent) {
      return resolve({
        success: false,
        statusCode: 400,
        error: 'bad_request',
        message: '⚠️ กรุณาระบุ agent (pa, wy, nasri, all)'
      });
    }

    if (action === 'dispatch' && (!prompt || typeof prompt !== 'string' || !prompt.trim())) {
      return resolve({
        success: false,
        statusCode: 400,
        error: 'bad_request',
        message: '⚠️ กรุณาระบุข้อความสั่งงาน (prompt)'
      });
    }

    var payload = {
      action: action,
      agent: agent || undefined,
      prompt: prompt ? prompt.trim().slice(0, 4000) : undefined,
      reply_token_ref: actorUserId
    };

    var bodyStr = JSON.stringify(payload);
    var timestamp = Math.floor(Date.now() / 1000).toString();
    var nonce = crypto.randomBytes(16).toString('hex');
    var method = 'POST';

    var parsedUrl;
    try {
      parsedUrl = new URL(targetUrlStr);
    } catch (e) {
      return resolve({
        success: false,
        statusCode: 0,
        error: 'invalid_url',
        message: '⚠️ Dispatch API URL ไม่ถูกต้อง: ' + targetUrlStr
      });
    }

    var path = parsedUrl.pathname || '/dispatch';
    var bodySha256 = crypto.createHash('sha256').update(bodyStr).digest('hex');
    var preImage = timestamp + '.' + nonce + '.' + actorUserId + '.' + method + '.' + path + '.' + bodySha256;
    var signature = crypto.createHmac('sha256', secret).update(preImage).digest('hex');

    var headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      'X-LD-Timestamp': timestamp,
      'X-LD-Nonce': nonce,
      'X-LD-Signature': signature,
      'X-LD-Actor': actorUserId
    };

    var reqModule = parsedUrl.protocol === 'https:' ? https : http;
    var reqOpts = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      method: method,
      headers: headers,
      timeout: 10000
    };

    var req = reqModule.request(reqOpts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var rawRes = Buffer.concat(chunks).toString('utf8');
        var parsedRes = {};
        try {
          parsedRes = JSON.parse(rawRes);
        } catch (e) {
          parsedRes = { raw: rawRes };
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          return resolve({
            success: true,
            statusCode: res.statusCode,
            data: parsedRes
          });
        }

        var errCode = parsedRes.error || (res.statusCode === 403 ? 'forbidden' : 'api_error');
        var errDetail = parsedRes.message || parsedRes.note || parsedRes.raw || '';
        var humanMsg = mapErrorToHumanMessage(res.statusCode, errCode, errDetail, agent);

        return resolve({
          success: false,
          statusCode: res.statusCode,
          error: errCode,
          detail: errDetail,
          data: parsedRes,
          message: humanMsg
        });
      });
    });

    req.on('timeout', function() {
      req.destroy();
      return resolve({
        success: false,
        statusCode: 504,
        error: 'timeout',
        message: '⚠️ การเชื่อมต่อ Dispatch API หมดเวลา (Timeout 10s) — กรุณาตรวจสอบ Cloudflare Tunnel'
      });
    });

    req.on('error', function(err) {
      return resolve({
        success: false,
        statusCode: 0,
        error: err.code || 'network_error',
        message: '⚠️ ไม่สามารถเชื่อมต่อเครื่องบ้านได้ (Cloudflare Tunnel หรือ Server ปิดอยู่): ' + err.message
      });
    });

    req.write(bodyStr);
    req.end();
  });
}

module.exports = {
  sendDispatch: sendDispatch,
  mapErrorToHumanMessage: mapErrorToHumanMessage,
  getApiUrl: getApiUrl,
  getSharedSecret: getSharedSecret
};
