#!/bin/bash
# Deploy nasri-line-bot to ai.enervia.co.th
# Usage: bash nasri-line-bot/deploy.sh [--dry-run]
#   --dry-run          preflight + backup + print upload plan, no upload, no restart
#   DEPLOY_EXPECT_LIVE  commit live is expected to be at (default: live/ai-enervia-2026-09-22)
#   DEPLOY_ALLOW_DRIFT=1  skip the hard-stop when live != DEPLOY_EXPECT_LIVE (real run only)
set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
  esac
done

# ── Load secrets from env file (never committed) ──────────────
SECRETS_FILE="${NASRI_SECRETS_FILE:-/home/po-ch/.nasri-deploy-secrets}"
if [ ! -f "$SECRETS_FILE" ]; then
  echo "❌ Secrets file not found: $SECRETS_FILE" >&2
  echo "   See nasri-line-bot/deploy/README.md for setup." >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$SECRETS_FILE"

REQUIRED_KEYS=(NASRI_FTP_URL NASRI_FTP_USER NASRI_FTP_PASS PLESK_URL PLESK_USER PLESK_PASS)
for key in "${REQUIRED_KEYS[@]}"; do
  if [ -z "${!key:-}" ]; then
    echo "❌ Missing required secret: $key" >&2
    exit 1
  fi
done

FTP_HOST="${NASRI_FTP_URL#ftp://}"; FTP_HOST="${FTP_HOST#ftps://}"; FTP_HOST="${FTP_HOST%/}"
FTP="ftp://${FTP_HOST}"
CURLF=(curl -s --user "${NASRI_FTP_USER}:${NASRI_FTP_PASS}")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_DIR="${DEPLOY_DIR:-$SCRIPT_DIR/deploy}"
COOKIES="/tmp/plesk_cookies"

DEPLOY_EXPECT_LIVE="${DEPLOY_EXPECT_LIVE:-live/ai-enervia-2026-09-22}"
BACKUP_DIR="$HOME/.oracle/backups/nasri-bot/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
: > "$BACKUP_DIR/not-on-live.txt"
MANIFEST="$BACKUP_DIR/MANIFEST.md"
{
  echo "# Backup manifest — $(date -Iseconds)"
  echo ""
  echo "Rollback: for each file below, re-upload it with:"
  echo '  "${CURLF[@]}" -T "'"$BACKUP_DIR"'/<path>" "$FTP/ai.enervia.co.th/<path>"'
  echo ""
  echo "| repo-relative path | remote path | sha1 (live copy) |"
  echo "|---|---|---|"
} > "$MANIFEST"

DRIFT=()

# backup_file <local_path> <remote_url> <repo_relpath>
# Downloads whatever is currently live for this file into BACKUP_DIR before
# we ever overwrite it. Missing-on-live is not an error — it means the file
# is new — logged to not-on-live.txt instead of MANIFEST.
backup_file() {
  local local_path="$1" remote_url="$2" rel="$3"
  [ -f "$local_path" ] || return 0
  local dest="$BACKUP_DIR/$rel"
  mkdir -p "$(dirname "$dest")"
  if "${CURLF[@]}" -o "$dest" "$remote_url" 2>/dev/null && [ -s "$dest" ]; then
    local sha; sha=$(sha1sum "$dest" | cut -d' ' -f1)
    echo "| $rel | ai.enervia.co.th/${remote_url#*ai.enervia.co.th/} | $sha |" >> "$MANIFEST"
    echo "  📥 backed up: $rel"
  else
    rm -f "$dest"
    echo "$rel" >> "$BACKUP_DIR/not-on-live.txt"
    echo "  ℹ️  not on live (new file): $rel"
  fi
}

# preflight_check <repo_relpath> <remote_url>
# Compares the live copy's sha1 against git's copy of that file at
# DEPLOY_EXPECT_LIVE. Any mismatch is recorded in DRIFT — a file that isn't
# in that commit at all (e.g. bom-parser.js, added after the snapshot) is
# also drift, just an expected one.
preflight_check() {
  local rel="$1" remote_url="$2"
  local tmp; tmp=$(mktemp)
  local live_sha expect_sha
  if "${CURLF[@]}" -o "$tmp" "$remote_url" 2>/dev/null && [ -s "$tmp" ]; then
    live_sha=$(sha1sum "$tmp" | cut -d' ' -f1)
  else
    live_sha="MISSING"
  fi
  rm -f "$tmp"
  if expect_sha=$(git -C "$REPO_ROOT" show "${DEPLOY_EXPECT_LIVE}:${rel}" 2>/dev/null | sha1sum | cut -d' ' -f1); then
    :
  else
    expect_sha="NOT_IN_COMMIT"
  fi
  if [ "$live_sha" != "$expect_sha" ]; then
    DRIFT+=("$rel  live=$live_sha  expect(${DEPLOY_EXPECT_LIVE})=$expect_sha")
  fi
}

echo "🔎 Preflight: comparing live vs ${DEPLOY_EXPECT_LIVE}..."
preflight_check "nasri-line-bot/deploy/app.js"           "$FTP/ai.enervia.co.th/app.js"
preflight_check "nasri-line-bot/deploy/bom-parser.js"    "$FTP/ai.enervia.co.th/bom-parser.js"
preflight_check "mcp-bomsolar/srp_calculator.py"          "$FTP/ai.enervia.co.th/mcp-bomsolar/srp_calculator.py"
preflight_check "mcp-bomsolar/srp_calc_cli.py"             "$FTP/ai.enervia.co.th/mcp-bomsolar/srp_calc_cli.py"
preflight_check "mcp-qsolar/server.py"                     "$FTP/ai.enervia.co.th/mcp-qsolar/server.py"

if [ "${#DRIFT[@]}" -gt 0 ]; then
  echo "⚠️  Drift vs ${DEPLOY_EXPECT_LIVE}:"
  for d in "${DRIFT[@]}"; do echo "  - $d"; done
  if [ "$DRY_RUN" -ne 1 ] && [ "${DEPLOY_ALLOW_DRIFT:-0}" != "1" ]; then
    echo "❌ live doesn't match ${DEPLOY_EXPECT_LIVE} — stopping before any upload." >&2
    echo "   Set DEPLOY_ALLOW_DRIFT=1 to override (only after confirming the drift is expected)." >&2
    exit 1
  fi
else
  echo "  ✓ live matches ${DEPLOY_EXPECT_LIVE} on all preflight files"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "🧪 --dry-run: backing up current live files, no upload, no restart"
fi

# ── 1. Core app files ──────────────────────────────────────────
# ทุกไฟล์ในลิสต์นี้ "ต้องมี" เสมอ (ไม่ใช่ของเสริมที่ข้ามได้แบบ assets) — เช็คให้ครบ
# ก่อนเริ่มอัปสักไฟล์เดียว กัน set -e ตายกลางทางหลังอัป app.js ไปแล้วแต่ไฟล์ถัดมาหาย
# (live ค้างครึ่งเดียว — พี่พงเจอ 2026-09-22)
echo "📦 Checking core app files..."
CORE_FILES=("$DEPLOY_DIR/app.js" "$DEPLOY_DIR/bom-parser.js" "$DEPLOY_DIR/package.json" "$DEPLOY_DIR/public/index.html")
for f in "${CORE_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "❌ Core app file missing: $f — aborting before any upload." >&2
    exit 1
  fi
done

echo "📦 Backing up + uploading app files..."
backup_file "$DEPLOY_DIR/app.js"            "$FTP/ai.enervia.co.th/app.js"            "nasri-line-bot/deploy/app.js"
backup_file "$DEPLOY_DIR/bom-parser.js"     "$FTP/ai.enervia.co.th/bom-parser.js"     "nasri-line-bot/deploy/bom-parser.js"
backup_file "$DEPLOY_DIR/package.json"      "$FTP/ai.enervia.co.th/package.json"      "nasri-line-bot/deploy/package.json"
backup_file "$DEPLOY_DIR/public/index.html" "$FTP/ai.enervia.co.th/public/index.html" "nasri-line-bot/deploy/public/index.html"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "  (dry-run) would upload: app.js bom-parser.js package.json public/index.html"
else
  "${CURLF[@]}" -T "$DEPLOY_DIR/app.js"              "$FTP/ai.enervia.co.th/app.js"
  "${CURLF[@]}" -T "$DEPLOY_DIR/bom-parser.js"       "$FTP/ai.enervia.co.th/bom-parser.js"
  "${CURLF[@]}" -T "$DEPLOY_DIR/package.json"        "$FTP/ai.enervia.co.th/package.json"
  "${CURLF[@]}" -T "$DEPLOY_DIR/public/index.html"   "$FTP/ai.enervia.co.th/public/index.html"
  echo "  ✓ App files uploaded"
fi

# ── 2. mcp-qsolar Python scripts ──────────────────────────────
# ── 1b. lib/ — only upload files whose sha1 differs from live ──
# Missed in the first cut: python-bridge.js (and any other lib/*.js) was
# never in the upload list, so a git-side fix could sit on live forever
# while app.js moved on and called into the old bridge (2026-09-22 17:50
# incident — ATMOCE/Sigenergy BOM lines broke on a healthy /health).
echo "📚 Checking nasri-line-bot/deploy/lib/*.js against live..."
LIB_DIR="$DEPLOY_DIR/lib"
LIB_DEST="$FTP/ai.enervia.co.th/lib"
LIB_SAME=0
LIB_CHANGED=()
if [ -d "$LIB_DIR" ]; then
  for f in "$LIB_DIR"/*.js; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    local_sha=$(sha1sum "$f" | cut -d' ' -f1)
    tmp=$(mktemp)
    if "${CURLF[@]}" -o "$tmp" "$LIB_DEST/$name" 2>/dev/null && [ -s "$tmp" ]; then
      live_sha=$(sha1sum "$tmp" | cut -d' ' -f1)
    else
      live_sha="MISSING"
    fi
    rm -f "$tmp"
    if [ "$local_sha" = "$live_sha" ]; then
      LIB_SAME=$((LIB_SAME + 1))
    else
      LIB_CHANGED+=("$name")
    fi
  done
fi
if [ "${#LIB_CHANGED[@]}" -eq 0 ]; then
  echo "  ✓ lib/: $LIB_SAME file(s) already match live, nothing to upload"
else
  echo "  lib/: $LIB_SAME file(s) match live, ${#LIB_CHANGED[@]} differ: ${LIB_CHANGED[*]}"
  for name in "${LIB_CHANGED[@]}"; do
    backup_file "$LIB_DIR/$name" "$LIB_DEST/$name" "nasri-line-bot/deploy/lib/$name"
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "  (dry-run) would upload: lib/$name"
    else
      "${CURLF[@]}" --ftp-create-dirs -T "$LIB_DIR/$name" "$LIB_DEST/$name" && echo "  ✓ lib/$name"
    fi
  done
fi

echo "🐍 Backing up + uploading mcp-qsolar..."
QSOLAR_SRC="$REPO_ROOT/mcp-qsolar"
QSOLAR_DEST="$FTP/ai.enervia.co.th/mcp-qsolar"
for f in server.py generate_pdf.py sheet_prices.py sheets.py thai_baht.py __init__.py; do
  [ -f "$QSOLAR_SRC/$f" ] || continue
  backup_file "$QSOLAR_SRC/$f" "$QSOLAR_DEST/$f" "mcp-qsolar/$f"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  (dry-run) would upload: mcp-qsolar/$f"
  else
    "${CURLF[@]}" -T "$QSOLAR_SRC/$f" "$QSOLAR_DEST/$f" && echo "  ✓ $f"
  fi
done
echo "  ✓ mcp-qsolar done"

# ── 2b. mcp-bomsolar Python scripts ─────────────────────────
echo "🐍 Backing up + uploading mcp-bomsolar..."
BOMSOLAR_SRC="$REPO_ROOT/mcp-bomsolar"
BOMSOLAR_DEST="$FTP/ai.enervia.co.th/mcp-bomsolar"
for f in server.py sheets.py survey_catalog.py srp_calculator.py srp_calc_cli.py; do
  [ -f "$BOMSOLAR_SRC/$f" ] || continue
  backup_file "$BOMSOLAR_SRC/$f" "$BOMSOLAR_DEST/$f" "mcp-bomsolar/$f"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  (dry-run) would upload: mcp-bomsolar/$f"
  else
    "${CURLF[@]}" --ftp-create-dirs -T "$BOMSOLAR_SRC/$f" "$BOMSOLAR_DEST/$f" && echo "  ✓ $f"
  fi
done
# scripts/ subdirectory
BOMSOLAR_SCRIPTS_DEST="$FTP/ai.enervia.co.th/mcp-bomsolar/scripts"
for f in generate_bom_pdf.py __init__.py; do
  [ -f "$BOMSOLAR_SRC/scripts/$f" ] || continue
  backup_file "$BOMSOLAR_SRC/scripts/$f" "$BOMSOLAR_SCRIPTS_DEST/$f" "mcp-bomsolar/scripts/$f"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  (dry-run) would upload: mcp-bomsolar/scripts/$f"
  else
    "${CURLF[@]}" --ftp-create-dirs -T "$BOMSOLAR_SRC/scripts/$f" "$BOMSOLAR_SCRIPTS_DEST/$f" && echo "  ✓ scripts/$f"
  fi
done
# fixtures/ subdirectory
BOMSOLAR_FIXTURES_DEST="$FTP/ai.enervia.co.th/mcp-bomsolar/fixtures"
for f in pricelist_fixture.json qpkg_fixture.json; do
  [ -f "$BOMSOLAR_SRC/fixtures/$f" ] || continue
  backup_file "$BOMSOLAR_SRC/fixtures/$f" "$BOMSOLAR_FIXTURES_DEST/$f" "mcp-bomsolar/fixtures/$f"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  (dry-run) would upload: mcp-bomsolar/fixtures/$f"
  else
    "${CURLF[@]}" --ftp-create-dirs -T "$BOMSOLAR_SRC/fixtures/$f" "$BOMSOLAR_FIXTURES_DEST/$f" && echo "  ✓ fixtures/$f"
  fi
done
echo "  ✓ mcp-bomsolar done"

if [ "$DRY_RUN" -eq 1 ]; then
  echo ""
  echo "🧪 --dry-run complete — no files uploaded, no restart."
  echo "   Backups: $BACKUP_DIR"
  echo "   Manifest: $MANIFEST"
  if [ -s "$BACKUP_DIR/not-on-live.txt" ]; then
    echo "   New (not currently on live): $(paste -sd, "$BACKUP_DIR/not-on-live.txt")"
  fi
  if [ "${#DRIFT[@]}" -gt 0 ]; then
    echo "   Drift vs ${DEPLOY_EXPECT_LIVE}: ${#DRIFT[@]} file(s), see above"
  fi
  exit 0
fi

# ── 2c. Assets for bomsolar (fonts + logo) ───────────────────
echo "🔤 Uploading bomsolar assets..."
BOMSOLAR_ASSETS="$BOMSOLAR_SRC/assets"
BOMSOLAR_ASSETS_DEST="$FTP/ai.enervia.co.th/mcp-bomsolar/assets"
# Fonts
[ -f "$BOMSOLAR_ASSETS/fonts/TH-Sarabun-New-Regular.ttf" ] && "${CURLF[@]}" --ftp-create-dirs -T "$BOMSOLAR_ASSETS/fonts/TH-Sarabun-New-Regular.ttf" "$BOMSOLAR_ASSETS_DEST/fonts/TH-Sarabun-New-Regular.ttf" || true
[ -f "$BOMSOLAR_ASSETS/fonts/TH-Sarabun-New-Bold.ttf" ]    && "${CURLF[@]}" --ftp-create-dirs -T "$BOMSOLAR_ASSETS/fonts/TH-Sarabun-New-Bold.ttf"    "$BOMSOLAR_ASSETS_DEST/fonts/TH-Sarabun-New-Bold.ttf"    || true
# Logo
[ -f "$BOMSOLAR_ASSETS/logo/enervia.jpg" ] && "${CURLF[@]}" --ftp-create-dirs -T "$BOMSOLAR_ASSETS/logo/enervia.jpg" "$BOMSOLAR_ASSETS_DEST/logo/enervia.jpg" || true
echo "  ✓ Bomsolar assets uploaded"

# ── 3. Assets: fonts ──────────────────────────────────────────
# tmppic/ ไม่ได้ถูก track ในทุก worktree — ไฟล์นี้หายได้ (พี่พงเจอ 2026-09-22:
# worktree ที่ไม่มี tmppic/ ทำให้ curl -T ไฟล์ไม่มี พัง set -e กลางทาง หลังอัป
# app.js ไปแล้ว ค้างครึ่งเดียว) ใส่ guard แบบเดียวกับลูปรูปภาพด้านล่าง
echo "🔤 Uploading fonts..."
FONT_SRC="$REPO_ROOT/tmppic/tempagent/quotation-solar/assets/font"
FONT_DEST="$FTP/ai.enervia.co.th/assets/font"
[ -f "$FONT_SRC/TH-Sarabun-New-Regular.ttf" ] && "${CURLF[@]}" -T "$FONT_SRC/TH-Sarabun-New-Regular.ttf" "$FONT_DEST/TH-Sarabun-New-Regular.ttf" || true
[ -f "$FONT_SRC/TH-Sarabun-New-Bold.ttf" ]    && "${CURLF[@]}" -T "$FONT_SRC/TH-Sarabun-New-Bold.ttf"    "$FONT_DEST/TH-Sarabun-New-Bold.ttf"    || true
echo "  ✓ Fonts uploaded"

# ── 4. Assets: images ─────────────────────────────────────────
echo "🖼️  Uploading images..."
PIC_SRC="$REPO_ROOT/tmppic/tempagent/quotation-solar/assets/picture ref use"
PIC_DEST="$FTP/ai.enervia.co.th/assets/picture ref use"
for f in \
  "logo enervia.jpg" \
  "BBL.jfif" "SCB.jfif" \
  "1Phase-Atmoce.jpg" "1Phase-batt-Atmoce.jpg" "1Phase-batt-Atmoce-full system.jpg" \
  "3Phase-Atmoce.jpg" "3Phase-batt-Atmoce.jpg" "3Phase-batt-Atmoce-full system.jpg" \
  "Atmoce 1 phase.jpg" "Atmoce 1 phase with batt.jpg" \
  "Atmoce 1 phase with backup and batt 7kw.jpg" \
  "Atmoce 3 phase.jpg" "Atmoce 3 phase with batt 7kw.jpg" \
  "Atmoce 3 phase with backup and batt 7kw.jpg" \
  "Sigenergy present1.png" "Sigenergy present2.png" \
  "Sigenergy present3.png" "Sigenergy present4.png" \
  "huawei.png" "huawei present.png" \
  "ตัวอย่างการติดตั้งบนหลังคา.jpg"; do
  [ -f "$PIC_SRC/$f" ] && "${CURLF[@]}" --ftp-create-dirs -T "$PIC_SRC/$f" "$PIC_DEST/$f" || true
done
echo "  ✓ Images uploaded"

# ── 4a. Verify core app files (sha1 match) ───────────────────
echo "🔍 Verifying core app files..."
VERIFY_FAIL=0
verify_file() {
  local local_path="$1" remote_url="$2" label="$3"
  [ -f "$local_path" ] || return 0
  local local_sha remote_sha tmp
  local_sha=$(sha1sum "$local_path" | cut -d' ' -f1)
  tmp=$(mktemp)
  if "${CURLF[@]}" -o "$tmp" "$remote_url" 2>/dev/null; then
    remote_sha=$(sha1sum "$tmp" | cut -d' ' -f1)
  else
    remote_sha="DOWNLOAD_FAILED"
  fi
  rm -f "$tmp"
  if [ "$local_sha" = "$remote_sha" ]; then
    echo "  ✓ $label  $local_sha"
  else
    echo "  ✗ $label  local=$local_sha remote=$remote_sha" >&2
    VERIFY_FAIL=1
  fi
}
verify_file "$DEPLOY_DIR/bom-parser.js" "$FTP/ai.enervia.co.th/bom-parser.js" "bom-parser.js"

# ── 4a2. Verify lib/ uploads (only the ones we actually pushed) ──
if [ -d "$LIB_DIR" ] && [ "${#LIB_CHANGED[@]}" -gt 0 ]; then
  echo "🔍 Verifying lib/ uploads..."
  for name in "${LIB_CHANGED[@]}"; do
    verify_file "$LIB_DIR/$name" "$LIB_DEST/$name" "lib/$name"
  done
fi

# ── 4b. Verify mcp-bomsolar uploads (sha1 match) ─────────────
echo "🔍 Verifying mcp-bomsolar uploads..."
BOMSOLAR_REMOTE="$FTP/ai.enervia.co.th/mcp-bomsolar"
for f in server.py sheets.py survey_catalog.py srp_calculator.py srp_calc_cli.py; do
  verify_file "$BOMSOLAR_SRC/$f" "$BOMSOLAR_REMOTE/$f" "$f"
done
for f in generate_bom_pdf.py __init__.py; do
  verify_file "$BOMSOLAR_SRC/scripts/$f" "$BOMSOLAR_REMOTE/scripts/$f" "scripts/$f"
done
for f in pricelist_fixture.json qpkg_fixture.json; do
  verify_file "$BOMSOLAR_SRC/fixtures/$f" "$BOMSOLAR_REMOTE/fixtures/$f" "fixtures/$f"
done
if [ "$VERIFY_FAIL" -ne 0 ]; then
  echo "❌ Verification failed — aborting before restart." >&2
  exit 1
fi
echo "  ✓ All verified"

# ── 5. Plesk restart ──────────────────────────────────────────
echo "🔄 Logging into Plesk..."
curl -sk -c "$COOKIES" -L -X POST "${PLESK_URL}/login_up.php" \
  -d "login_name=${PLESK_USER}&passwd=${PLESK_PASS}" > /dev/null 2>&1

CSRF=$(curl -sk -b "$COOKIES" "${PLESK_URL}/smb/web/view" 2>&1 | \
  grep -oP 'forgery_protection_token" content="[^"]*' | head -1 | sed 's/.*content="//')

echo "🔄 Restarting Node.js app..."
curl -sk -b "$COOKIES" -X POST \
  "${PLESK_URL}/modules/nodejs/index.php/api/restart-domain" \
  -H "X-Forgery-Protection-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{"domainId":1061}' 2>&1
echo ""

sleep 5
echo "🏥 Health check..."
curl -sk "https://ai.enervia.co.th/health"
echo ""
echo "✅ Deploy complete!"
