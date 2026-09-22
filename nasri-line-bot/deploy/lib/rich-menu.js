'use strict';

// ─── LINE Rich Menu Manager ──────────────────────────────────
// S1 — QSolar v2.2
//
// Creates / links / unlinks Rich Menu via LINE Messaging API.
// No external dependencies — uses built-in fetch.
//
// Usage:
//   var rm = require('./lib/rich-menu')({ getToken: () => LINE_CHANNEL_ACCESS_TOKEN });
//
//   // One-time setup (call from admin endpoint or boot script)
//   var menuId = await rm.createAndLink();
//
//   // Link to a specific user
//   await rm.linkToUser(userId, menuId);
//
//   // Unlink (show default)
//   await rm.unlinkFromUser(userId);
//
// Rich Menu layout (2600×1686, 3 columns × 2 rows = 6 areas):
//
//   [ 📋 ใบเสนอราคาใหม่ ] [ 📦 เช็ค BOM Status ] [ 📊 Pipeline วันนี้ ]
//   [ 🕓 ประวัติการขอ  ] [ 💰 เช็คราคา        ] [ ❓ วิธีใช้          ]
//
//   Tap action → message text → handled by existing app.js intent parser

module.exports = function createRichMenuManager(opts) {
  opts = opts || {};
  var API_BASE = 'https://api.line.me/v2/bot';
  var getToken = opts.getToken || function() { return process.env.LINE_CHANNEL_ACCESS_TOKEN || ''; };

  function _headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + getToken(),
    };
  }

  // ── Rich Menu definition ────────────────────────────────────
  function _buildMenuDef() {
    var W = 2500, H = 1686;
    var cW = Math.floor(W / 3);   // ~833
    var rH = Math.floor(H / 2);   // 843

    function area(col, row, label, text) {
      return {
        bounds: { x: col * cW, y: row * rH, width: cW, height: rH },
        action: { type: 'message', label: label, text: text },
      };
    }

    return {
      size: { width: W, height: H },
      selected: true,
      name: 'QSolar Main Menu',
      chatBarText: '☀️ QSolar Menu',
      areas: [
        // Row 0
        area(0, 0, '📋 ใบเสนอราคาใหม่',  'นัด ขอใบเสนอราคา'),
        area(1, 0, '📦 เช็ค BOM',          'นัด ขอ bom'),
        area(2, 0, '📊 Pipeline วันนี้',   'นัด สรุปวันนี้'),
        // Row 1
        area(0, 1, '🕓 ประวัติ',           'นัด ประวัติของฉัน'),
        area(1, 1, '💰 เช็คราคา',          'นัด ราคา'),
        area(2, 1, '❓ วิธีใช้',            'นัด ช่วย'),
      ],
    };
  }

  // ── Admin Rich Menu definition (3×3 = 9 areas, 2500×2529) ──
  // Used only for users in ADMIN_LINE_USER_IDS whitelist
  //
  //   [ 💰 แก้ราคา    ] [ 📐 แก้ Formula ] [ 📊 แก้ Tier    ]
  //   [ 📈 Analytics  ] [ 🏥 Fleet Health ] [ 📋 Audit Log   ]
  //   [ 🗃️ Retention  ] [ 📦 Export User  ] [ 🗑️ Delete User  ]
  //
  function _buildAdminMenuDef() {
    var W = 2500, H = 2529; // 3-row requires taller image; 843 px per row
    var cW = Math.floor(W / 3);   // 833
    var rH = Math.floor(H / 3);   // 843

    function area(col, row, label, text) {
      return {
        bounds: { x: col * cW, y: row * rH, width: cW, height: rH },
        action: { type: 'message', label: label, text: text },
      };
    }

    return {
      size: { width: W, height: H },
      selected: true,
      name: 'QSolar Admin Menu',
      chatBarText: '🔑 Admin Menu',
      areas: [
        // Row 0 — Price management
        area(0, 0, '💰 แก้ราคา',       'admin price'),
        area(1, 0, '📐 แก้ Formula',    'admin formula'),
        area(2, 0, '📊 แก้ Tier',       'admin tier'),
        // Row 1 — Monitoring
        area(0, 1, '📈 Analytics',       'admin analytics'),
        area(1, 1, '🏥 Fleet Health',    'admin health'),
        area(2, 1, '📋 Audit Log',       'admin audit log'),
        // Row 2 — PDPA / Data
        area(0, 2, '🗃️ Retention',       'admin retention run'),
        area(1, 2, '📦 Export User',     'admin export'),
        area(2, 2, '🗑️ Delete User',     'admin delete user'),
      ],
    };
  }

  // ── API calls ───────────────────────────────────────────────

  async function _call(method, path, body) {
    var url = API_BASE + path;
    var opts = { method: method, headers: _headers() };
    if (body) opts.body = JSON.stringify(body);
    var r = await fetch(url, opts);
    var text = await r.text();
    var json;
    try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }
    if (!r.ok) throw new Error('[rich-menu] ' + method + ' ' + path + ' → ' + r.status + ' ' + text.slice(0, 200));
    return json;
  }

  /** Create rich menu, return richMenuId */
  async function createMenu() {
    var def = _buildMenuDef();
    var res = await _call('POST', '/richmenu', def);
    return res.richMenuId;
  }

  /** Upload menu image (PNG/JPEG Buffer or file path via fs.readFileSync) */
  async function uploadImage(richMenuId, imageBuffer, contentType) {
    contentType = contentType || 'image/png';
    var url = 'https://api-data.line.me/v2/bot/richmenu/' + richMenuId + '/content';
    var r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Authorization: 'Bearer ' + getToken(),
      },
      body: imageBuffer,
    });
    if (!r.ok) {
      var t = await r.text();
      throw new Error('[rich-menu] upload image → ' + r.status + ' ' + t.slice(0, 200));
    }
    return true;
  }

  /** Set as default rich menu (shown to all users without explicit link) */
  async function setDefault(richMenuId) {
    return _call('POST', '/user/all/richmenu/' + richMenuId, null);
  }

  /** Link menu to a specific userId */
  async function linkToUser(userId, richMenuId) {
    return _call('POST', '/richmenu/link', { userId: userId, richMenuId: richMenuId });
  }

  /** Unlink rich menu from userId (returns to default) */
  async function unlinkFromUser(userId) {
    return _call('DELETE', '/richmenu/link/' + userId, null);
  }

  /** List all rich menus */
  async function listMenus() {
    return _call('GET', '/richmenu/list', null);
  }

  /** Delete a rich menu by id */
  async function deleteMenu(richMenuId) {
    return _call('DELETE', '/richmenu/' + richMenuId, null);
  }

  /**
   * Full setup: create menu → set default (no image upload — uses placeholder).
   * Call uploadImage() separately with a real PNG to set the background.
   * Returns richMenuId.
   */
  async function createAndSetDefault() {
    var id = await createMenu();
    await setDefault(id);
    return id;
  }

  /** Create admin rich menu (3×3, 9 shortcuts), return richMenuId */
  async function createAdminMenu() {
    var def = _buildAdminMenuDef();
    var res = await _call('POST', '/richmenu', def);
    return res.richMenuId;
  }

  /**
   * Link admin menu to a specific userId (overrides default).
   * Convenience wrapper: creates admin menu on first call, caches id.
   */
  var _adminMenuId = null;
  async function linkAdminMenu(userId) {
    if (!_adminMenuId) {
      _adminMenuId = await createAdminMenu();
    }
    return linkToUser(userId, _adminMenuId);
  }

  return {
    buildMenuDef: _buildMenuDef,
    buildAdminMenuDef: _buildAdminMenuDef,
    createMenu: createMenu,
    uploadImage: uploadImage,
    setDefault: setDefault,
    createAndSetDefault: createAndSetDefault,
    createAdminMenu: createAdminMenu,
    linkAdminMenu: linkAdminMenu,
    linkToUser: linkToUser,
    unlinkFromUser: unlinkFromUser,
    listMenus: listMenus,
    deleteMenu: deleteMenu,
  };
};
