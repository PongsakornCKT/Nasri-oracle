#!/bin/bash
# Deploy nasri-line-bot to ai.enervia.co.th
# Usage: bash nasri-line-bot/deploy.sh
set -euo pipefail

# SECURITY WARNING: This file contains plaintext FTP and Plesk credentials.
# Risk: Anyone with read access to this file (or the git repo) gains full
#       server access. Severity: CRITICAL.
# Recommended remediation:
#   1. Move credentials to a local secrets file (e.g. ~/.nasri-deploy-secrets)
#      that is NOT committed to git and load it here with: source ~/.nasri-deploy-secrets
#   2. Add deploy.sh to .gitignore or replace values with env-var references:
#      FTP="ftp://${DEPLOY_FTP_USER}:${DEPLOY_FTP_PASS}@thsv86.hostatom.com"
#      PLESK_PASS="${DEPLOY_PLESK_PASS}"
#   3. Rotate the FTP password and Plesk password after moving them out.
# NOTE: Credentials are kept inline for now so the deploy script continues to
#       work — DO NOT commit further credential changes to git history.
FTP="ftp://enervia:PyvyTUHF@thsv86.hostatom.com"
DEPLOY_DIR="C:/Users/pO-Ch/Nasri-oracle/nasri-line-bot/deploy"
REPO_ROOT="C:/Users/pO-Ch/Nasri-oracle"
PLESK="https://thsv86.hostatom.com:8443"
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
for f in server.py sheets.py; do
  [ -f "$BOMSOLAR_SRC/$f" ] && curl -s --ftp-create-dirs -T "$BOMSOLAR_SRC/$f" "$BOMSOLAR_DEST/$f" && echo "  ✓ $f"
done
# scripts/ subdirectory
BOMSOLAR_SCRIPTS_DEST="$FTP/ai.enervia.co.th/mcp-bomsolar/scripts"
for f in generate_bom_pdf.py __init__.py; do
  [ -f "$BOMSOLAR_SRC/scripts/$f" ] && curl -s --ftp-create-dirs -T "$BOMSOLAR_SRC/scripts/$f" "$BOMSOLAR_SCRIPTS_DEST/$f" && echo "  ✓ scripts/$f"
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

# ── 5. Plesk restart ──────────────────────────────────────────
echo "🔄 Logging into Plesk..."
curl -sk -c "$COOKIES" -L -X POST "$PLESK/login_up.php" \
  -d "login_name=enervia&passwd=jBj7%5Eq370" > /dev/null 2>&1

CSRF=$(curl -sk -b "$COOKIES" "$PLESK/smb/web/view" 2>&1 | \
  grep -oP 'forgery_protection_token" content="[^"]*' | head -1 | sed 's/.*content="//')

echo "🔄 Restarting Node.js app..."
curl -sk -b "$COOKIES" -X POST \
  "$PLESK/modules/nodejs/index.php/api/restart-domain" \
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
