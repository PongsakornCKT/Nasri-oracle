---
type: learning
date: 2026-03-14
source: session-5
concepts: [plesk, passenger, nodejs, deployment]
---

# Plesk Node.js (Passenger) Deploy Pattern

## Plesk API discovery
- Extension AJAX endpoints found in `/modules/nodejs/dist/main.js`
- Key endpoints: `/api/enable-domain`, `/api/restart-domain`, `/api/change-application-mode`, `/api/application/domainId/{id}`
- Auth: session cookie (from `/login_up.php`) + CSRF token (`forgery_protection_token`)
- Customer accounts can use extension APIs even though `/api/v2/` requires admin

## Passenger requirements
- **Must use CommonJS** — ESM (`import`) causes silent crash
- Startup: `server.listen('passenger')` when `PhusionPassenger` global exists
- Custom env vars from Plesk panel DON'T reach `process.env` — load `.env` manually

## Deploy pipeline (no SSH)
```
FTP upload → Plesk API restart → ready in ~5s
```
- FTP creds from XML API: `webspace > get > hosting > ftp_login/ftp_password`
- Script: `nasri-line-bot/deploy.sh`
