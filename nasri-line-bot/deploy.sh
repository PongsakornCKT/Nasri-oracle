#!/bin/bash
# Deploy nasri-line-bot to ai.enervia.co.th
# Usage: bash nasri-line-bot/deploy.sh
set -euo pipefail

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

FTP="ftp://${NASRI_FTP_USER}:${NASRI_FTP_PASS}@${NASRI_FTP_URL}"
DEPLOY_DIR="C:/Users/pO-Ch/Nasri-oracle/nasri-line-bot/deploy"
REPO_ROOT="C:/Users/pO-Ch/Nasri-oracle"
COOKIES="/tmp/plesk_cookies"

# ── 1. Core app files ──────────────────────────────────────────
echo "📦 Uploading app files..."
curl -s -T "$DEPLOY_DIR/app.js"              "$FTP/ai.enervia.co.th/app.js"
curl -s -T "$DEPLOY_DIR/package.json"        "$FTP/ai.enervia.co.th/package.json"
curl -s -T "$DEPLOY_DIR/public/index.html"   "$FTP/ai.enervia.co.th/public/index.html"
echo "  ✓ App files uploaded"

# ── 2. mcp-qsolar Python scripts ──────────────────────────────
echo "🐍 Uploading mcp-qsolar..."
QSOLAR_SRC="$REPO_ROOT/mcp-qsolar"
QSOLAR_DEST="$FTP/ai.enervia.co.th/mcp-qsolar"
for f in server.py generate_pdf.py sheet_prices.py sheets.py thai_baht.py __init__.py; do
  [ -f "$QSOLAR_SRC/$f" ] && curl -s -T "$QSOLAR_SRC/$f" "$QSOLAR_DEST/$f" && echo "  ✓ $f"
done
echo "  ✓ mcp-qsolar uploaded"

# ── 2b. mcp-bomsolar Python scripts ─────────────────────────
echo "🐍 Uploading mcp-bomsolar..."
BOMSOLAR_SRC="$REPO_ROOT/mcp-bomsolar"
BOMSOLAR_DEST="$FTP/ai.enervia.co.th/mcp-bomsolar"
for f in server.py sheets.py survey_catalog.py srp_calculator.py srp_calc_cli.py; do
  [ -f "$BOMSOLAR_SRC/$f" ] && curl -s --ftp-create-dirs -T "$BOMSOLAR_SRC/$f" "$BOMSOLAR_DEST/$f" && echo "  ✓ $f"
done
# scripts/ subdirectory
BOMSOLAR_SCRIPTS_DEST="$FTP/ai.enervia.co.th/mcp-bomsolar/scripts"
for f in generate_bom_pdf.py __init__.py; do
  [ -f "$BOMSOLAR_SRC/scripts/$f" ] && curl -s --ftp-create-dirs -T "$BOMSOLAR_SRC/scripts/$f" "$BOMSOLAR_SCRIPTS_DEST/$f" && echo "  ✓ scripts/$f"
done
# fixtures/ subdirectory
BOMSOLAR_FIXTURES_DEST="$FTP/ai.enervia.co.th/mcp-bomsolar/fixtures"
for f in pricelist_fixture.json qpkg_fixture.json; do
  [ -f "$BOMSOLAR_SRC/fixtures/$f" ] && curl -s --ftp-create-dirs -T "$BOMSOLAR_SRC/fixtures/$f" "$BOMSOLAR_FIXTURES_DEST/$f" && echo "  ✓ fixtures/$f"
done
echo "  ✓ mcp-bomsolar uploaded"

# ── 2c. Assets for bomsolar (fonts + logo) ───────────────────
echo "🔤 Uploading bomsolar assets..."
BOMSOLAR_ASSETS="$BOMSOLAR_SRC/assets"
BOMSOLAR_ASSETS_DEST="$FTP/ai.enervia.co.th/mcp-bomsolar/assets"
# Fonts
curl -s --ftp-create-dirs -T "$BOMSOLAR_ASSETS/fonts/TH-Sarabun-New-Regular.ttf" "$BOMSOLAR_ASSETS_DEST/fonts/TH-Sarabun-New-Regular.ttf"
curl -s --ftp-create-dirs -T "$BOMSOLAR_ASSETS/fonts/TH-Sarabun-New-Bold.ttf"    "$BOMSOLAR_ASSETS_DEST/fonts/TH-Sarabun-New-Bold.ttf"
# Logo
curl -s --ftp-create-dirs -T "$BOMSOLAR_ASSETS/logo/enervia.jpg" "$BOMSOLAR_ASSETS_DEST/logo/enervia.jpg"
echo "  ✓ Bomsolar assets uploaded"

# ── 3. Assets: fonts ──────────────────────────────────────────
echo "🔤 Uploading fonts..."
FONT_SRC="$REPO_ROOT/tmppic/tempagent/quotation-solar/assets/font"
FONT_DEST="$FTP/ai.enervia.co.th/assets/font"
curl -s -T "$FONT_SRC/TH-Sarabun-New-Regular.ttf" "$FONT_DEST/TH-Sarabun-New-Regular.ttf"
curl -s -T "$FONT_SRC/TH-Sarabun-New-Bold.ttf"    "$FONT_DEST/TH-Sarabun-New-Bold.ttf"
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
  [ -f "$PIC_SRC/$f" ] && curl -s --ftp-create-dirs -T "$PIC_SRC/$f" "$PIC_DEST/$f" || true
done
echo "  ✓ Images uploaded"

# ── 4b. Verify mcp-bomsolar uploads (sha1 match) ─────────────
echo "🔍 Verifying mcp-bomsolar uploads..."
VERIFY_FAIL=0
BOMSOLAR_REMOTE="$FTP/ai.enervia.co.th/mcp-bomsolar"
verify_file() {
  local local_path="$1" remote_url="$2" label="$3"
  [ -f "$local_path" ] || return 0
  local local_sha remote_sha tmp
  local_sha=$(sha1sum "$local_path" | cut -d' ' -f1)
  tmp=$(mktemp)
  if curl -s -o "$tmp" "$remote_url" 2>/dev/null; then
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
