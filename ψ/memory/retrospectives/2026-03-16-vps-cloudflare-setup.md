# Retrospective — 2026-03-16: WSL2 VPS + Cloudflare Tunnel

## What Happened

Pong ต้องการให้ Oracle ทำงาน 24 ชั่วโมงบนเครื่อง Windows ส่วนตัว และเข้าถึงผ่าน `pa.enervia.co.th`

### งานที่ทำ
1. **Explored existing infra** — อ่าน `start-maw.sh`, `start-oracles.sh`, `wsl-bootstrap.sh`, `setup-local.sh`
2. **Created `setup-autostart.sh`** — ติดตั้ง systemd services ใน WSL2 (nasri-maw, nasri-oracle-v2, nasri-agents)
3. **Created `wsl-startup.ps1`** — Task Scheduler + Power Plan สำหรับ Windows autostart
4. **Created `setup-cloudflare-tunnel.sh`** — เชื่อม Cloudflare Tunnel → `pa.enervia.co.th` → localhost:3456
5. **Committed v1.7.0** — 3 ไฟล์, 545 insertions
6. **Pong สร้าง Cloudflare Tunnel** — Tunnel ID: `8b0bc626-...`, Connector active (v2026.3.0)
7. **Guided to get tunnel token** — session ended ก่อนรัน `setup-cloudflare-tunnel.sh` เสร็จ

## What Was Learned

- **WSL2 + systemd** คือวิธีที่ดีที่สุดสำหรับ 24/7 บน Windows — เปิด `systemd=true` ใน `/etc/wsl.conf`
- **Cloudflare Tunnel** เหมาะกับ home/office server — ไม่ต้องเปิด port, ไม่ต้อง static IP, ฟรี
- **Private repo = curl ไม่ผ่าน** — `wsl-bootstrap.sh` curl ได้ 404 เพราะ repo เป็น private
- ต้องใช้ `gh auth login` ใน WSL ก่อนถึง clone repo private ได้
- Cloudflare Dashboard แสดง Tunnel ID ≠ Token — token อยู่ที่ Configure → Install connector

## What Surprised

- Connector version `2026.3.0` ปรากฏในทันทีที่ Pong สร้าง tunnel — แสดงว่า Cloudflare browser preview รัน connector ชั่วคราว ไม่ใช่ WSL จริง
- ระบบ infra มีทุกอย่างอยู่แล้ว (`start-maw.sh` ครบ) — แค่ขาด autostart และ domain exposure

## What's Next

- [ ] Pong รัน `setup-autostart.sh` ใน WSL2 Ubuntu
- [ ] Pong copy tunnel token จาก Cloudflare → รัน `setup-cloudflare-tunnel.sh`
- [ ] ทดสอบ `https://pa.enervia.co.th` เข้าถึง MAW Office ได้
- [ ] Push repo ไป GitHub ให้ bootstrap ผ่าน curl ได้ (หรือ clone via gh CLI)
- [ ] Agents 5 ตัวทำงานค้างคืนได้จริง — ทดสอบเช้าวันถัดไป

## Files Changed

```
+ setup-autostart.sh          (systemd services + WSL2 24/7)
+ setup-cloudflare-tunnel.sh  (pa.enervia.co.th via Cloudflare)
+ wsl-startup.ps1             (Windows Task Scheduler)
```

Commit: `e56f6a7` — v1.7.0
