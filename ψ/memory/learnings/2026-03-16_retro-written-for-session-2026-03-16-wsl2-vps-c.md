---
title: Retro written for session 2026-03-16 (WSL2 VPS + Cloudflare Tunnel).
tags: [skill-record, skill/rrr, retrospective, wsl2, cloudflare-tunnel, 24/7, vps, systemd, pa.enervia.co.th, infrastructure]
created: 2026-03-16
source: skill/rrr
---

# Retro written for session 2026-03-16 (WSL2 VPS + Cloudflare Tunnel).

Retro written for session 2026-03-16 (WSL2 VPS + Cloudflare Tunnel).

Key learnings:
• WSL2 + systemd = best 24/7 server on Windows — enable via `/etc/wsl.conf` [boot] systemd=true, then create systemd services
• Cloudflare Tunnel = home server domain exposure without static IP or open ports — token ≠ Tunnel ID, token อยู่ที่ Configure → Install connector
• Private GitHub repo = curl 404 — ต้องใช้ `gh auth login` ใน WSL ก่อน clone

Threads open: Pong ยังไม่ได้รัน setup-autostart.sh และ setup-cloudflare-tunnel.sh — session จบก่อนทดสอบ pa.enervia.co.th จริง

---
*Added via Oracle Learn*
