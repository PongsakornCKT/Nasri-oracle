# 15 Ideas to Improve Oracle Tracker 𓂀

> "ลงมือทำ ไม่รอคำสั่งซ้ำ — มือขวาแห่ง Ma'at 𓂀"

**Author**: Nasri Oracle — Right Hand of Ma'at  
**Target System**: Oracle Tracker (`http://localhost:4000/tracker`)  
**Target Files**: `oracle-studio/tracker.html` & `scripts/tracker-api.ts` (:4100)  
**Date**: 2026-08-11

---

## 🔍 Inventory & System Architecture Overview

จากการสำรวจโครงสร้างของ **Oracle Tracker**:
* **Frontend**: [`oracle-studio/tracker.html`](file:///mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle%20v2/oracle-studio/tracker.html)  
  ประกอบด้วย 3 คอลัมน์หลัก: Sidebar รายชื่อ Projects, Main Grid (Milestones, Proposals, Quick Execute Bar), และ Right Sidebar (Agent Fleet Status, Agora Feed Stream, Standup Digest)
* **Backend API**: [`scripts/tracker-api.ts`](file:///mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle%20v2/scripts/tracker-api.ts) (Port 4100)  
  บริการ SQLite `agora.db` reader, JSONL parser, Endpoints อ่าน/เขียน Projects, Milestones, Proposals, Auto-update status, Archive, และ `POST /api/tracker/execute` ( Quick Execute Bar Flow)

---

## 💡 15 Ideas to Improve Oracle Tracker

### 🎨 หมวดที่ 1: UX & Visual Scanning (UX การอ่าน)

#### 1. #1 Interactive Milestone Kanban Board View
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (`renderMilestones()`, Toggle view state)
* **ทำไมถึงช่วยพี่พง**: ให้ตัวเลือกสลับการมองเห็นระหว่าง **List View** เดิม กับ **Kanban Board** (Backlog → In Progress → Review → Done) ช่วยให้พี่พงประเมินสถานะและคอขวดของทุกโปรเจกต์ได้ในพริบตาเดียว
* **ความยาก**: `M` (Medium)

#### 2. #2 Global Search & Quick Filter Overlay (`Cmd+K / Ctrl+K`)
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (Global Keydown listener + Search Modal UI)
* **ทำไมถึงช่วยพี่พง**: ค้นหา Project, Milestone, Proposal หรือ Agent ได้ทันทีใน 1 วินาที เพียงกด `Ctrl+K` โดยไม่ต้องเลื่อนหาสิ่งที่ต้องการตามหมวด
* **ความยาก**: `S` (Small)

#### 3. #3 Proposals Impact & Effort Badges (S/M/L)
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (`renderProposals()`), `scripts/tracker-api.ts` (`handleProposals()`)
* **ทำไมถึงช่วยพี่พง**: ติดป้ายขนาดงาน `Quick Win (S)`, `Core Upgrade (M)`, `Architecture (L)` บนการ์ด Proposal ช่วยให้พี่พงเลือกลุยงานชิ้นที่เหมาะกับเวลาที่มี ณ ตอนนั้นได้ทันที
* **ความยาก**: `S` (Small)

---

### ⚡ หมวดที่ 2: Command & Execution Flow (การสั่งงาน & Triage)

#### 4. #4 Batch Execute Selected Proposals (Multi-Select Execute)
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (`proposals-grid` checkboxes + Header Action), `scripts/tracker-api.ts` (`handleExecute()`)
* **ทำไมถึงช่วยพี่พง**: ต่อยอดจาก Quick Execute Bar — ช่วยให้พี่พงติ๊กเลือก 3-5 Proposals ที่ชอบพร้อมกัน แล้วกด **"Execute Selected"** เพียงครั้งเดียว ประหยัดเวลาสั่งงานทีละการ์ด
* **ความยาก**: `M` (Medium)

#### 5. #5 Proposal-to-Milestone One-Click Converter
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (Card button), `scripts/tracker-api.ts` (`POST /api/tracker/convert-proposal`)
* **ทำไมถึงช่วยพี่พง**: แปลง Proposal ที่ approve แล้วเป็น Active Milestone พร้อม Checklist ย่อยเข้าสู่ Project หลักได้ทันทีใน 1 คลิก โดยไม่ต้องคัดลอกข้อความไปพิมพ์ใหม่
* **ความยาก**: `M` (Medium)

#### 6. #6 Quick Dismiss with Feedback Reason for Proposals
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (Dismiss modal UI), `scripts/tracker-api.ts` (`handleDismissProposal()`)
* **ทำไมถึงช่วยพี่พง**: ให้พี่พงเลือกเหตุผลสั้นๆ ตอนปฏิเสธ Proposal (เช่น "ซ้ำกับงานเดิม", "ไว้ก่อน", "ไม่อยู่ในทิศทาง") เพื่อบันทึกเข้า Agora feed ให้ออราเคิลรับทราบและเสนอไอเดียได้ตรงจุดในรอบถัดไป
* **ความยาก**: `S` (Small)

---

### 📡 หมวดที่ 3: Live Agent Visibility & Task Tracking (สถานะ Agent & งานที่รันอยู่)

#### 7. #7 Real-Time Active Execution Progress & Console Live Stream
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (Execution Header Bar), `scripts/tracker-api.ts` (`GET /api/tracker/active-executions`)
* **ทำไมถึงช่วยพี่พง**: แสดงสถานะ Real-time ของ Proposal/Task ที่ถูกสั่ง Execute อยู่ เช่น `[nasri-oracle] Running Step 2/4 (Vitest probes passing...)` พร้อม Console Log 3 บรรทัดล่าสุด
* **ความยาก**: `M` (Medium)

#### 8. #8 Agent Workload & Bottleneck Visual Badges
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (`sidebar-agents`), `scripts/tracker-api.ts` (`handleAgents()`)
* **ทำไมถึงช่วยพี่พง**: แสดงจำนวนงานที่ถือครองอยู่ต่อเอเจนต์ (เช่น `horus: 3 tasks`, `nasri: 1 task`) พร้อมเตือนสีส้ม/แดงหากเอเจนต์ตัวใดมีงานค้างเกิน 3 ชิ้น ป้องกันการมอบหมายงานซ้ำซ้อน
* **ความยาก**: `S` (Small)

#### 9. #9 Live Tmux & Task Terminal Snapshot Viewer Modal
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (Agent card click modal), `scripts/tracker-api.ts` (`POST /api/tracker/terminal-preview`)
* **ทำไมถึงช่วยพี่พง**: คลิกที่ชื่อเอเจนต์เพื่อแอบดู snapshot หน้าจอ terminal นั้นๆ ได้โดยตรงบน Tracker โดยไม่ต้องสลับหน้าต่างไปที่ terminal CLI
* **ความยาก**: `M` (Medium)

---

### 🛡️ หมวดที่ 4: Data Quality & Consistency (ความถูกต้องของข้อมูล)

#### 10. #10 Stale Milestone Auto-Archive & Re-engagement Alert
* **ไฟล์/จุดที่แตะ**: `scripts/tracker-api.ts` (`handleAutoUpdateStatus()`), `oracle-studio/tracker.html` (Alert banner)
* **ทำไมถึงช่วยพี่พง**: ตรวจจับ Milestone ที่ไม่มีความคืบหน้าเกิน 7 วัน และเสนอให้กด Archive หรือ Re-assign ให้เอเจนต์อื่น เพื่อรักษาความสะอาดของ Tracker ไม่ให้รกรุงรัง
* **ความยาก**: `S` (Small)

#### 11. #11 Duplicate Proposal Detector & Similarity Alert
* **ไฟล์/จุดที่แตะ**: `scripts/tracker-api.ts` (`handleProposals()`), `oracle-studio/tracker.html` (Card duplicate badge)
* **ทำไมถึงช่วยพี่พง**: ตรวจจับและติดป้าย `Duplicate (85% similarity)` เมื่อมีเอเจนต์เสนอไอเดียซ้ำกัน ช่วยลดความสับสนในการอ่านและเลือกงานของพี่พง
* **ความยาก**: `M` (Medium)

#### 12. #12 Subtask Checklist Completion & Auto-DONE Trigger
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (`renderMilestones()`), `scripts/tracker-api.ts` (`handleAutoUpdateStatus()`)
* **ทำไมถึงช่วยพี่พง**: เมื่อติ๊ก checklist ครบทุกข้อ ระบบจะพลิกสถานะ Milestone เป็น DONE ให้อัตโนมัติ พร้อมบันทึกเวลาที่เสร็จสิ้นลงใน Audit Log
* **ความยาก**: `S` (Small)

---

### 🚀 หมวดที่ 5: Speed & Performance (ความเร็ว & Performance)

#### 13. #13 Incremental Agora Feed Polling with `since_ts`
* **ไฟล์/จุดที่แตะ**: `scripts/tracker-api.ts` (`handleFeed()`), `oracle-studio/tracker.html` (`fetchFeed()`)
* **ทำไมถึงช่วยพี่พง**: ดึงเฉพาะข้อมูล Agora Feed ใหม่นับจาก timestamp ล่าสุด (`since_ts`) แทนการอ่านไฟล์ JSONL/DB ทั้งหมด ช่วยลด I/O และทำให้หน้าจออัปเดตเร็วขึ้น 5 เท่า
* **ความยาก**: `M` (Medium)

#### 14. #14 LocalStorage Offline Cache & Instant Skeleton Loader
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (`init()`, `cacheData()`)
* **ทำไมถึงช่วยพี่พง**: เปิดหน้า Tracker ปุ๊บ ข้อมูลล่าสุดจะแสดงทันทีใน 0.05 วินาทีจาก LocalStorage ก่อนจะ Sync กับ Backend ในเบื้องหลัง ป้องกันอาการหน้าขาวเวลาเชื่อมต่อช้า
* **ความยาก**: `S` (Small)

#### 15. #15 Web Push Notification for High-Priority Proposals & Blockers
* **ไฟล์/จุดที่แตะ**: `oracle-studio/tracker.html` (`setupPushNotifications()`), `scripts/tracker-api.ts` (`handlePushSubscribe()`)
* **ทำไมถึงช่วยพี่พง**: เด้งการแจ้งเตือนบนเบราว์เซอร์เมื่อมี Proposal สำคัญสูงส่งเข้ามา หรือเมื่อมีเอเจนต์ติดสถานะ STUCK ต้องการคำตัดสินจากพี่พง
* **ความยาก**: `M` (Medium)

---

## 🏆 TOP-3 Recommended First Items (ข้อเสนอแนะ 3 อันดับแรกที่ควรทำก่อน)

| Rank | Idea | Category | Effort | Key Rationale |
| :---: | :--- | :--- | :---: | :--- |
| **#1** | **#2 Global Search & Quick Filter Overlay (`Ctrl+K`)** | UX Scanning | **`S`** | **ทำง่าย Impact สูง**: ช่วยให้พี่พงและเอเจนต์ค้นหาสิ่งที่ต้องการใน Tracker ได้ทันทีใน 1 วินาที |
| **#2** | **#7 Real-Time Active Execution Progress & Console Stream** | Live Visibility | **`M`** | **ต่อยอด Quick Execute**: พี่พงสั่งงานแล้วเห็นทันทีว่าเอเจนต์รันถึงขั้นตอนไหน พร้อม Log ล่าสุด |
| **#3** | **#4 Batch Execute Selected Proposals (Multi-Select)** | Command Flow | **`M`** | **เพิ่มสปีดการสั่งงาน**: ติ๊กเลือกหลาย Proposal แล้วกด Execute พร้อมกันในครั้งเดียว |

---

*Nasri Oracle — Right Hand of Ma'at 𓂀*
