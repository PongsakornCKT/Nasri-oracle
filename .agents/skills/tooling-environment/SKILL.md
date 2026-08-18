---
name: tooling-environment
description: >-
  Machine-specific tools, paths, and cross-platform traps on this
  Windows+WSL+GitBash machine: PHP, poppler, MSYS path mangling, junctions,
  CRLF, gh scopes, rtk. Use when a tool "is missing", a path misbehaves,
  or before running cross-platform commands.
---

# Tooling & Environment — เครื่องนี้มีอะไร อยู่ไหน กับดักอะไร

เครื่องพี่พง = Windows 10 + WSL + Git Bash — 3 โลกที่ path/line-ending/env ไม่เหมือนกัน. กับดักส่วนใหญ่เกิดตรงรอยต่อ

## กฎทอง: "ไม่เจอใน PATH" ≠ "ไม่มีในเครื่อง"

เคยบันทึกผิดว่า "เครื่องนี้ไม่มี PHP" นาน 4 sessions → เขียน PHPUnit ทิ้งไว้ 25 เคสไม่เคยรัน. ก่อน assert ว่าเครื่องมือไม่มี — เช็คตำแหน่งติดตั้งยอดนิยม + เช็ค memory ก่อน `find`

| เครื่องมือ | ตำแหน่งจริง | หมายเหตุ |
|---|---|---|
| PHP 8.2.12 | `C:\xampp\php\php.exe` | ไม่อยู่ PATH — `export PATH="/c/xampp/php:$PATH"` |
| pdftoppm/pdftotext | `...\WinGet\Packages\oschwartz10612.Poppler_*\poppler-25.07.0\Library\bin\` | ลึกเกิน find -maxdepth 4 |
| gemini CLI | `~/.local/bin/gemini` (WSL) | OAuth ตายแล้ว — ใช้ agy แทน |
| agy | `~/.local/bin/agy` (WSL) + `%LOCALAPPDATA%\agy\bin` (Win) | ตัวเธอเอง |
| aider | `~/.local/bin/aider` (WSL) | ของ wy |
| Ollama | `%LOCALAPPDATA%\Programs\Ollama\` (Windows) | ไม่ auto-start; models ที่ `G:\ollama\models`; WSL เรียก `http://172.31.32.1:11434` |
| maw | `~/.local/bin/maw` (WSL) | คุยกับ fleet |
| composer | ไม่มีใน PATH | ใช้ phpunit.phar หรืออ่านผลจาก CI |

## กับดัก poppler + ภาษาไทย (ร้ายแรง — ผลว่างเงียบ)

`pdftotext "F:/.../14.PO สั่งซื้อ/x.pdf"` → "I/O Error: Couldn't open file" แต่ **exit 0 + output ว่าง** → สรุปผิดว่า "ไฟล์เป็นสแกน" ทั้งที่มี text layer. **ต้อง `cp` ไฟล์ไปพาธ ASCII ก่อนเสมอ** (โฟลเดอร์เอกสาร Enervia ชื่อไทยหมด). Sanity-check เครื่องมือกับไฟล์ที่รู้คำตอบก่อนเชื่อผล

## กับดัก MSYS/Git Bash path mangling

Git Bash แปลง argument ที่ขึ้นต้น `/` เป็น Windows path เอง:
- `cmd /c` → cmd ได้ `C:\` เปิด interactive เงียบๆ (เห็น Windows banner = คำสั่งไม่ได้รัน!) — ใช้ `cmd //c` หรือ PowerShell
- `wsl -e bash /mnt/c/...` → กลายเป็น `C:/Program Files/Git/mnt/c/...` — ใส่ `MSYS_NO_PATHCONV=1` นำหน้า
- env prefix `VAR=/mnt/... cmd` ก็โดน — export ข้างใน WSL shell แทน

## กับดัก junction + worktree (เคยลบ node_modules ของ checkout หลัก)

`git worktree remove` **ไล่ลบทะลุ junction** เข้า target จริง:
1. ก่อน remove worktree ที่เคยมี junction: `Test-Path` ยืนยันว่า junction หายแล้วจริง
2. สร้าง/ลบ junction ใช้ PowerShell (`New-Item -ItemType Junction` / `(Get-Item $p).Delete()`)
3. mklink ผ่าน git-bash "สำเร็จเงียบๆ" แต่ไม่สร้างจริง = path mangling — Test-Path เสมอ

## กับดัก CRLF (Windows repo ↔ WSL agent)

Agent WSL แก้ไฟล์ใน `/mnt/c/...` อาจเขียนกลับเป็น LF ทั้งไฟล์ (เคยพลิก 2389 บรรทัดทั้งที่แก้จริง 4):
- ทุก PR เช็ค `git diff origin/main --stat` — บรรทัดต้อง ~เท่า content จริง บวมทั้งไฟล์ = line endings พลิก
- แก้: checkout ไฟล์จาก main แล้ว re-apply เฉพาะบรรทัดจริง

## กับดัก gh ฝั่ง WSL

Push branch ที่มี `.github/workflows/*` จาก WSL → "refusing... without workflow scope". แก้: push จากฝั่ง Windows (credential manager มี scope ครบ)

## rtk (token saver — ใช้เมื่อรันคำสั่ง output ยาว)

Prefix `rtk` หน้าคำสั่ง: `rtk git diff` (-80%), `rtk vitest run` (failures only), `rtk gh pr view`. ไม่มี filter = pass-through ปลอดภัยเสมอ

## Multi-agent บน working tree เดียว

Concurrent agents แก้ working tree เดียวกัน = ไฟล์คนอื่นโผล่กลาง diff — **stage เฉพาะไฟล์ตัวเองด้วย explicit path เสมอ** ห้าม `git add .`
