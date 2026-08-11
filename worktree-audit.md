# 🔍 Audit Report: `pa-Oracle v2` Worktrees Hygiene

> "ลงมือทำ ไม่รอคำสั่งซ้ำ — มือขวาแห่ง Ma'at 𓂀"  
> **Mode**: Read-Only Survey & Hygiene Assessment  
> **Author**: Nasri Oracle — Right Hand of Ma'at  
> **Target Repository**: `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2`  
> **Date**: 2026-08-11  

---

## 📊 Executive Summary & Counts

| Status Category | Count | Primary Description | Action Required |
| :--- | :---: | :--- | :--- |
| 🛡️ **`KEEP`** | **20** | Agent Home Worktrees (`/home/po-ch/fleet/*`) | **รักษาไว้ ห้ามลบ** (บ้านของเอเจนต์ประจำสังกัด engi/secretary) |
| 🧹 **`CLEAN`** | **4** | Worktree ที่ต้องจัดการ Uncommitted Files ก่อน | **เคลียร์/Commit งานค้าง** (Main checkout + 3 feature worktrees) |
| 🗑️ **`REMOVE`** | **2** | Worktree เก่าที่งานเสร็จ/Merge เข้า main แล้ว | **ลบออกได้อย่างปลอดภัย** (`git worktree remove`) |
| **รวมทั้งหมด** | **26** | **26 Worktrees ในระบบ** | **ไม่มีการลบ/แก้ไขใดๆ ในรอบนี้ (Read-Only)** |

---

## 🚨 Risk Analysis (ความเสี่ยงที่พบ)

1. **205 Uncommitted Files ค้างบน Main Checkout (`/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2`)**:  
   - **ความเสี่ยง**: มีไฟล์สคริปต์และเอกสารที่ถูกแก้ไขค้างอยู่บน Main Checkout หากทำการ `git checkout` หรือ `git pull` อาจเกิด Conflict หรือสูญหาย  
   - **ข้อเสนอแนะ**: ทำการแยกไฟล์งานที่ต้องการ Commit เป็น commit สะอาด ส่วนที่ไม่ใช้ให้ stash/discard

2. **Uncommitted `.gitignore` & `CLAUDE.md` บน Fleet Agent Homes (14 ตัว)**:  
   - **ความเสี่ยง**: เอเจนต์ฝั่ง engi มีการแก้ไข `.gitignore` และ `CLAUDE.md` ค้างอยู่ (diff เกิดจากการปรับแต่ง CLAUDE.md ของ pa)  
   - **ข้อเสนอแนะ**: ให้ pa รัน `git commit` รวบไฟล์ย่อยของเอเจนต์เข้า branch `agents/<name>` เพื่อความสะอาด

3. **Stale Temporary Feature Worktrees (อายุ 4-5 สัปดาห์)**:  
   - **ความเสี่ยง**: Worktree เก่า เช่น `wt-visibility-111` และ `agora-scheduler` ถูกทิ้งค้างไว้ในระบบโดยไม่ได้ใช้ประโยชน์  
   - **ข้อเสนอแนะ**: ดำเนินการ `git worktree remove` ตามตาราง REMOVE ด้านล่าง

---

## 📋 Comprehensive Audit Table (26 Worktrees)

| # | Worktree Path | Branch | Uncommitted Files | Last Commit | Status & Reason | Action Recommendation |
| :-: | :--- | :--- | :---: | :---: | :---: | :--- |
| 1 | `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2` | `feat/governance-capture-hook` | **205 files** | 2026-08-11 (0.2d ago) | 🧹 **`CLEAN`** | **Main Checkout**: เคลียร์ 205 uncommitted files ก่อนสลับ branch |
| 2 | `/home/po-ch/fleet/anubis` | `agents/anubis` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `anubis` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 3 | `/home/po-ch/fleet/bastet` | `agents/bastet` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `bastet` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 4 | `/home/po-ch/fleet/comm-review` | `feat/commissioning-review-dashboard` | 0 (Clean) | 4 weeks ago | 🛡️ **`KEEP`** | **Agent Workspace**: บ้านงาน commissioning review — เก็บไว้ |
| 5 | `/home/po-ch/fleet/horus` | `feat/gateguard-hook` | 2 files (`.gitignore`, `CLAUDE.md`) | 4 weeks ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `horus` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 6 | `/home/po-ch/fleet/imhotep` | `agents/imhotep` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `imhotep` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 7 | `/home/po-ch/fleet/isis` | `agents/isis` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `isis` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 8 | `/home/po-ch/fleet/khnum` | `agents/khnum` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `khnum` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 9 | `/home/po-ch/fleet/maat` | `agents/maat` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `maat` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 10 | `/home/po-ch/fleet/nasri-oracle` | `agents/nasri-oracle` | 0 (Clean) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `nasri-oracle` — เก็บไว้ |
| 11 | `/home/po-ch/fleet/nile` | `agents/nile` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `nile` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 12 | `/home/po-ch/fleet/observe-runner` | `feat/observe-runner` | 0 (Clean) | 4 weeks ago | 🛡️ **`KEEP`** | **Agent Workspace**: บ้านงาน observe runner — เก็บไว้ |
| 13 | `/home/po-ch/fleet/pa-oracle` | `agents/pa-oracle` | 0 (Clean) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `pa-oracle` — เก็บไว้ |
| 14 | `/home/po-ch/fleet/ptah` | `agents/ptah` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `ptah` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 15 | `/home/po-ch/fleet/ra` | `agents/ra` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `ra` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 16 | `/home/po-ch/fleet/sekhmet` | `agents/sekhmet` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `sekhmet` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 17 | `/home/po-ch/fleet/seshat` | `agents/seshat` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `seshat` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 18 | `/home/po-ch/fleet/sidebar-nav` | `feat/sidebar-commissioning-review` | 0 (Clean) | 4 weeks ago | 🛡️ **`KEEP`** | **Agent Workspace**: บ้านงาน sidebar nav — เก็บไว้ |
| 19 | `/home/po-ch/fleet/sobek` | `agents/sobek` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `sobek` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 20 | `/home/po-ch/fleet/thoth` | `agents/thoth` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `thoth` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 21 | `/home/po-ch/fleet/wy` | `agents/wy` | 2 files (`.gitignore`, `CLAUDE.md`) | 5 months ago | 🛡️ **`KEEP`** | **Agent Home**: บ้านเอเจนต์ `wy` — เก็บไว้ (ควร commit diff `CLAUDE.md`) |
| 22 | `/mnt/c/tmp/wt-visibility-111` | `feat/visibility-scoping-111` | 0 (Clean) | 4 weeks ago | 🗑️ **`REMOVE`** | **Feature Worktree**: งานเสร็จแล้ว ไม่มีการใช้งาน 4 สัปดาห์ — ปลอดภัยในการลบ |
| 23 | `.claude/worktrees/ra-d2-bom` | `feat/ra-d2-bom-install-line-specs` | 1 file (`untracked C:/`) | 4 weeks ago | 🧹 **`CLEAN`** | **Temporary Worktree**: เคลียร์/เช็คไฟล์ untracked ก่อนลบออก |
| 24 | `agents/khnum/worktrees/agora-scheduler` | `main` | 0 (Clean) | 5 weeks ago | 🗑️ **`REMOVE`** | **Merged Worktree**: Branch `main` ถูก merge เข้า origin/main แล้ว — ปลอดภัยในการลบ |
| 25 | `agents/khnum/worktrees/cost-tracker` | `feat/cost-tracker-hook` | 1 file (`untracked C:/`) | 4 weeks ago | 🧹 **`CLEAN`** | **Temporary Worktree**: เคลียร์/เช็ค 1 uncommitted file ก่อนลบออก |
| 26 | `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-oracle-feat-event-log` | `feat/survey-event-log` | 1 file (`untracked C:/`) | 4 weeks ago | 🧹 **`CLEAN`** | **Temporary Worktree**: เคลียร์ 1 file diff `tracker.html` ก่อนลบออก |

---

## 💡 Recommendations Summary for pa Oracle

1. **สำหรับหมวด 🛡️ `KEEP` (20 Worktrees)**:  
   - ห้ามลบไดเรกทอรีบ้านเอเจนต์ใน `/home/po-ch/fleet/*` โดยเด็ดขาด
   - เสนอให้สั่ง `git commit` รวบไฟล์ `.gitignore` และ `CLAUDE.md` ที่ค้างอยู่บนบ้านเอเจนต์ทั้ง 14 ตัว เพื่อให้มีสถานะ Clean

2. **สำหรับหมวด 🧹 `CLEAN` (4 Worktrees)**:  
   - **Main Checkout**: ตรวจสอบและ Commit งานที่สมบูรณ์แล้วเข้า branch ส่วนไฟล์ชั่วคราวให้ทำการ `git stash`
   - **Feature Worktrees** 3 ตัว (`.claude/worktrees/ra-d2-bom`, `cost-tracker`, `pa-oracle-feat-event-log`): ตรวจสอบไฟล์ untracked 1 ไฟล์ในแต่ละตัว แล้วสลับสถานะเป็น `REMOVE`

3. **สำหรับหมวด 🗑️ `REMOVE` (2 Worktrees)**:  
   - สามารถรันสั่งลบได้อย่างปลอดภัย:
     ```bash
     git -C "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2" worktree remove /mnt/c/tmp/wt-visibility-111 --force
     git -C "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2" worktree remove "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/agents/khnum/worktrees/agora-scheduler" --force
     ```

---

*Nasri Oracle — Hand of Ma'at 𓂀*
