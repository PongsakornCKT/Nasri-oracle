---
name: deploy-pipelines
description: >-
  Battle-tested deploy procedures for every Enervia system: survey theme,
  leadfollow plugin, wp-config edits, migration runners, and GAS. Includes
  every known trap. Use BEFORE any deploy, hotfix, or live-file change.
---

# Deploy Pipelines — วิธี deploy จริงทุกระบบ (พร้อมกับดักครบ)

pa deploy ระบบพวกนี้มาแล้วหลายสิบรอบ — ลำดับข้างล่างคือที่รอดทุกครั้ง. ข้ามขั้นไหน = เจ็บขั้นนั้น

## A. Survey theme deploy (ใช้บ่อยสุด)

**Creds**: `~/.nasri-deploy-secrets` → `SURVEY_FTP_USER`/`SURVEY_FTP_PASS` (มีทั้งฝั่ง Windows + WSL) · curl ต้อง `-k --ssl-reqd`
**Paths (double-nested!)**: theme = `ftp://survey.enervia.co.th/survey.enervia.co.th/wp-content/themes/leadfollow` · plugin = `.../plugins/leadfollow-core/api` · mu = `.../wp-content/mu-plugins`

ลำดับบังคับ 5 ขั้น:
1. **merge เข้า main ก่อน deploy เสมอ** — deploy จาก branch = สร้าง drift ใหม่
2. **pre-deploy diff**: ดึง live สดมาเทียบ (ห้ามใช้ snapshot เก่า):
   ```bash
   comm -23 <(grep -oP 'function \K\w+' live.php|sort -u) <(grep -oP 'function \K\w+' main.php|sort -u)
   # ว่าง = main ⊇ live ปลอดภัย · ไม่ว่าง = live มี hot-deploy ต้อง port เข้า main ก่อน
   ```
3. `php -l` ทุกไฟล์ (PHP อยู่ `C:\xampp\php\php.exe` — ไม่อยู่ใน PATH)
4. upload → **ดึงกลับ `cmp -s` ยืนยัน byte-identical** (script exit 0 ไม่ใช่หลักฐาน)
5. smoke: หน้าเว็บต้อง 302 (redirect login) · REST route ต้อง 401 · **500/000 = rollback ทันที**

ลำดับไฟล์: `functions.php` **ก่อน** templates (templates เรียกฟังก์ชันในนั้น — สลับ = fatal 4 หน้า) · **WP ก่อน GAS เสมอ**

## B. deploy-survey-enervia.sh — กับดัก 6 ข้อของ script

Script อยู่ `pa-Oracle v2/scripts/` (ไม่ใช่ใน repo enervia-survey):
1. **รับชื่อไฟล์เปล่า** — มันเติม `src/theme/` เอง. ส่ง path เต็ม → "SKIP (missing)" แล้ว **exit 0 เหมือนสำเร็จแต่ไม่ deploy อะไรเลย**
2. **ต้อง pin `SURVEY_REPO_DIR`** — default ชี้ checkout WSL คนละตัวที่ค้าง commit เก่า → deploy โค้ดเก่าแล้วรายงานสำเร็จ
3. `NO_PULL=1` ทำ 2 หน้าที่: เลี่ยง drift gate + ข้าม `git reset --hard` (ที่จะลบงาน uncommitted)
4. Git Bash Windows: env prefix `/mnt/...` โดน MSYS แปลง path เพี้ยน → export **ข้างใน** WSL shell แทน
5. checkout หลักมักค้าง feature branch — ปล่อย script reset = ทับงานค้าง. วิธีเวิร์ค: pin ไป **worktree ทิ้งได้**
6. **default file เป็น redirect stub 17 บรรทัด** — แอป /wf จริงคือ `workflow-app.php` ต้องระบุชื่อเสมอ

Script backup live เก่าที่ `temp/deploy-bak/<file>.LIVE-<ts>` ทุกครั้ง — ใช้ rollback

## C. Plugin (api/) deploy — 3-version trap

มี 3 เวอร์ชันเสมอ อย่าสับสน: **live** (ของจริง, re-pull มา patch) · **mirror** (aspirational, นำหน้า live) · **deployed/ snapshot** (ควรตรง live แต่ STALE บ่อย)
- **Patch onto LIVE เสมอ** — additive เท่านั้น, verify "removed/changed existing = 0" ก่อน upload
- pa มีแค่ FTPS ไม่มี SSH/wp-cli → ALTER TABLE ทำไม่ได้ → **เก็บ state ใน `wp_options`** (precedent: lf_pay_config, lf_favorite_leads; autoload=false ถ้าอ่านเฉพาะบางหน้า)
- smoke route: **401/403 = route มีจริง, 404 = ไม่มี** (เทียบกับ control route เดิม)
- ห้าม deploy mirror api/ ทับ live โดยไม่ diff — mirror `upsert_install` รับ payload คนละ shape กับ live (PWA ส่ง `{fields:{Thai keys}}`) deploy ทับ = PWA พังทันที

## D. Live-ahead trap + transplant pattern (โดนมา 3 รอบ)

Live มี hot-deploy ที่ไม่อยู่ใน git (sw.js route, booking calendar-sync, ระบบ sigenci ทั้งชุด) — deploy mirror/branch ทับ = ฟีเจอร์หายทั้งบริษัท:
- ก่อน deploy: grep marker เด่นๆ บน live (`WF_PAGES`, `custom_pl`) เทียบ base
- Live ahead + งานเร่ง → **transplant**: backup live → apply edits ลง copy ของ live ด้วย script ที่ assert แต่ละ replacement match ครั้งเดียวเป๊ะ → diff merged-vs-live เหลือแค่จุดแก้ → upload → commit mirror = merged
- เทียบ live กับ checkout Windows จะ DIFF ทุกไฟล์เพราะ CRLF vs LF — ใช้ `diff --strip-trailing-cr` ก่อนสรุปว่า drift จริง

## E. wp-config edit ผ่าน FTPS

ไฟล์เป็น **LF ล้วน** (เช็คด้วย python `data.count(b'\r\n')` — `od -c` ให้ผลผิด):
backup → แทรก block ด้วย python byte-level (assert ไม่มี CRLF) → `php -l` → upload → `cmp -s` → smoke → auto-rollback ถ้า `/` ได้ 500

## F. Migration runner (mu-plugin pattern — แทน wp-cli ที่ไม่มี)

define token ใน wp-config → upload runner เข้า `mu-plugins/` → เปิด `?<param>=<token>` (dry-run) → `&apply=1` → runner self-delete → ถอน token. Guard: ไม่มี param = return, `hash_equals`. **ตัวที่ไม่ apply ไม่ self-delete — ลบเองด้วย `curl -Q "DELE ..."`**

## G. GAS deploy (Apps Script)

- Manual เท่านั้น: script.google.com → วางโค้ด → **Manage deployments → ✏️ เดิม → New version** (ห้าม "New deployment" — URL เปลี่ยนทั้งระบบ). Paste โค้ดอย่างเดียวไม่พอ deployment ยังชี้ version เก่า
- **ห้ามยิง `/exec` ทดสอบ** — payload แปลกตกไปเป็น survey submission = แถวขยะถาวรในชีต. เช็ค version ใหม่ด้วย GET `?action=pricelist` ไม่มี secret (read-only ตอบ error ไม่เขียน)
- `saveImage_` dedup ด้วยชื่อไฟล์ — ชื่อ deterministic ซ้ำข้าม batch = **รูปใหม่ถูกทิ้งเงียบ** ต้องผูก timestamp ในชื่อ
- Client ยิง GAS แบบ no-cors fire-and-forget — alert "สำเร็จ" เสมอแม้ GAS ตาย. Verify ที่ชีตจริง นับ unique file id
- Verify ที่ดีที่สุด = ให้คนใช้จริงกด 1 ครั้งแล้วดูผล
