# Deploy

## Setup

Create `/home/po-ch/.nasri-deploy-secrets` (never commit this file):

```bash
NASRI_FTP_URL=thsv86.hostatom.com
NASRI_FTP_USER=your_ftp_user
NASRI_FTP_PASS=your_ftp_password
PLESK_URL=https://thsv86.hostatom.com:8443
PLESK_USER=your_plesk_user
PLESK_PASS=your_plesk_password_url_encoded
```

Override the path with `NASRI_SECRETS_FILE=/other/path bash nasri-line-bot/deploy.sh`.

## Run

```bash
bash nasri-line-bot/deploy.sh
```

Steps: FTP upload (app + mcp-qsolar + mcp-bomsolar + assets) → Plesk login → Node.js restart → health check.
