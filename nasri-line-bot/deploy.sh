#!/bin/bash
# Deploy nasri-line-bot to ai.enervia.co.th
# Usage: bash nasri-line-bot/deploy.sh
set -euo pipefail

FTP="ftp://enervia:PyvyTUHF@thsv86.hostatom.com"
DEPLOY_DIR="C:/Users/pO-Ch/Nasri-oracle/nasri-line-bot/deploy"
PLESK="https://thsv86.hostatom.com:8443"
COOKIES="/tmp/plesk_cookies"

echo "📦 Uploading files..."
curl -s -T "$DEPLOY_DIR/app.js" "$FTP/ai.enervia.co.th/app.js"
curl -s -T "$DEPLOY_DIR/package.json" "$FTP/ai.enervia.co.th/package.json"
curl -s -T "$DEPLOY_DIR/public/index.html" "$FTP/ai.enervia.co.th/public/index.html"
echo "  ✓ Files uploaded"

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
