# 50 Ideas to Improve MAW Office Dashboard (maw-js-server)

> "พัฒนาด้วยการสืบสวนจริงจาก live checkout (`/home/po-ch/agents/maw-js-server`)"
> รายงานเสนอโดย: **Nasri Oracle — Right Hand of Ma'at 𓂀**

---

## 🎨 หมวดที่ 1: UI/UX & Visual Experience (10 ไอเดีย)

| # | ชื่อไอเดีย | Function / จุดที่แตะ | ทำไมถึงดีขึ้น (Benefit / Rationale) | ความยาก |
|---|---|---|---|---|
| 1 | **Dark/Light Theme Switcher** | `office/src/index.css`, `App.tsx` | รองรับการทำงานสภาพแสงสว่างภายนอก ป้องกัน CSS hardcoded hex คล้ายเคส survey theme | S |
| 2 | **Responsive Mobile Layout & Viewport Lock** | `DashboardView.tsx`, `RoomGrid.tsx` | ช่าง/ผู้บริหารเปิดดู fleet status จากมือถือได้โดยการ์ดไม่ซ้อนทับกัน ล็อก layout A4/Mobile | M |
| 3 | **Compact vs Density Matrix Toggle** | `DashboardView.tsx`, `FleetGrid.tsx` | เมื่อ fleet มี agent >20 ตัว สามารถย่อการ์ดเป็น mini-badge เพื่อดูภาพรวมโดยไม่ต้อง scroll | S |
| 4 | **Interactive Timeline / Scrubber** | `DashboardView.tsx`, `StatusBar.tsx` | ย้อนดูเหตุการณ์ของ fleet ย้อนหลัง 1-24 ชั่วโมงตามไทม์ไลน์ เลื่อนดูสถานะย้อนหลังได้ | M |
| 5 | **Visual Sound Effects Indicator & Audio Visualizer** | `StatusBar.tsx`, `lib/sounds.ts` | มีแถบคลื่นเสียง/Icon แสดงสถานะ audio unlock และเตือนเมื่อมีเสียง event สำคัญ | S |
| 6 | **Draggable & Resizable Grid Layout** | `OverviewGrid.tsx`, `DashboardView.tsx` | ให้ผู้ใช้ปรับแต่งตำแหน่ง widget บน Dashboard ตามความสนใจ (เช่น ย้าย Cost Card ไว้บนสุด) | M |
| 7 | **Agent Status Avatar Glow & Animation Filter** | `AgentAvatar.tsx` | แยกสถานะ BUSY/READY/IDLE/ERROR ด้วยการสั่นระลอกคลื่นสี (Pulse Effect) ชัดเจนขึ้น 200% | S |
| 8 | **Keyboard Navigation & Quick Focus (Cmd+1..9)** | `App.tsx`, `ShortcutOverlay.tsx` | สลับแท็บ Dashboard, Fleet, Terminal, Config ด้วยปุ่มตัวเลขโดยไม่ต้องใช้เมาส์ | S |
| 9 | **Syntax Highlighted Log Viewer** | `TerminalView.tsx`, `XTerminal.tsx` | Highlight สีคำเตือน ERROR/WARN/SUCCESS ใน terminal stream เพื่ออ่าน log ง่ายขึ้น | S |
| 10| **Full Screen Presentation Mode (War Room HUD)** | `App.tsx`, `HudOverlay.tsx` | ซ่อน Navigation bar เพื่อแสดงผลบนจอมอนิเตอร์กลางของห้องควบคุมแบบ Clean HUD | S |

---

## ⚡ หมวดที่ 2: Realtime Data & Analytics (10 ไอเดีย)

| # | ชื่อไอเดีย | Function / จุดที่แตะ | ทำไมถึงดีขึ้น (Benefit / Rationale) | ความยาก |
|---|---|---|---|---|
| 11| **Realtime Token Rate Sparkline Graph** | `DashboardView.tsx`, `/api/tokens/rate` | แสดงกราฟเส้นขนาดเล็ก (Sparkline) ของการใช้ Token/min ย้อนหลัง 60 นาทีแบบ Realtime | M |
| 12| **Live Cost Calculator & Budget Threshold Alert** | `cost-index.ts`, `DashboardView.tsx` | แจ้งเตือนสีแดงเมื่อค่าใช้จ่ายรวมต่อวันทะลุ Budget ที่ตั้งไว้ (เช่น > $10/day) | S |
| 13| **WebSocket Reconnection & Network Health Indicator** | `useWebSocket.ts`, `StatusBar.tsx` | แสดง ping/latency และสถานะ reconnecting อัตโนมัติเมื่อสัญญาณเน็ตหลุด | S |
| 14| **Token Cache Hit Rate Efficiency Gauge** | `token-index.ts`, `DashboardView.tsx` | แสดงสัดส่วน Cache Read vs Cache Create ช่วยวัดประสิทธิภาพความคุ้มค่าของ Prompt Cache | S |
| 15| **Per-Agent Cost Trend & Projection (AI Forecast)** | `cost-index.ts`, `DashboardView.tsx` | คำนวณแนวโน้มค่าใช้จ่ายล่วงหน้าสิ้นเดือนจากพฤติกรรมการใช้งาน 7 วันล่าสุด | M |
| 16| **Live Feed Filter by Agent & Severity** | `feed-tail.ts`, `DashboardView.tsx` | กรองข้อความ feed feed.log เฉพาะ agent ที่สนใจ หรือเฉพาะระดับ ERROR/WARN | S |
| 17| **Subagent Hierarchy & Dependency Tree Visualizer** | `KnowledgeMap.tsx`, `server.ts` | แสดงแผนผังต้นไม้การแตก Subagent (Parent -> Child) พร้อม realtime progress | M |
| 18| **Execution Time & Idle Duration Heatmap** | `maw-log.ts`, `DashboardView.tsx` | แสดงกราฟความหนาแน่นเวลาที่ agent ทำงานเทียบกับช่วงเวลาที่ idle เพื่อวัดความคุ้มค่า | M |
| 19| **Active Worktree Drift & Uncommitted Changes Counter** | `worktrees.ts`, `WorktreeView.tsx` | ดึงจำนวนไฟล์ที่ uncommitted หรือค้างใน worktrees มาโชว์ realtime กันงานหาย | S |
| 20| **Live Terminal Stream Output Buffering & Diff View** | `pty.ts`, `TerminalModal.tsx` | แสดงผลการรันคำสั่งแบบ stream ไม่กระตุก และโชว์ diff ของไฟล์ที่โดนแก้สดๆ | M |

---

## 🛡️ หมวดที่ 3: Fleet Monitoring & Agent Management (10 ไอเดีย)

| # | ชื่อไอเดีย | Function / จุดที่แตะ | ทำไมถึงดีขึ้น (Benefit / Rationale) | ความยาก |
|---|---|---|---|---|
| 21| **One-Click Agent Emergency Kill/Pause Button** | `server.ts` (`/api/exec`), `AgentCard.tsx` | หยุดการทำงานของ Agent ที่ติด loop หรือรันงานผิดพลาดได้ทันทีจาก UI | S |
| 22| **Heartbeat & Liveness Probe Monitor** | `hooks.ts`, `StatusBar.tsx` | ตรวจสอบว่า agent ส่ง heartbeat (agy-maw-hook) ตรงเวลาหรือไม่ Alert หากขาดหาย >10 นาที | S |
| 23| **Agent Capability & Skill Inventory Matrix** | `FleetGrid.tsx`, `ConfigView.tsx` | แสดงตารางว่า Agent แต่ละตัวมี Skill/MCP อะไรบ้าง และเวอร์ชันไหน | M |
| 24| **Session Memory & Context Window Fullness Bar** | `engine.ts`, `DashboardView.tsx` | แสดงเปอร์เซ็นต์ความเต็มของ Context Window ของ agent เพื่อเตือนก่อน context ล้น | M |
| 25| **Agent Role & Roster Quick Filter (engi/solar/research)** | `RoomGrid.tsx`, `FleetGrid.tsx` | แท็บกรองแสดงผลแยกกลุ่มทีมงาน (ทีมวิศวะ 14 ตัว, โซลาร์ 12 ตัว, วิจัย 3 ตัว) | S |
| 26| **Global Message Broadcast (maw hey-all UI)** | `cli.ts`, `StatusBar.tsx` | มีช่องส่งข้อความหาทุก agent ใน fleet พร้อมกันจาก dashboard UI โดยไม่ต้องพิมพ์ CLI | S |
| 27| **Task Claiming & Locking Status Board** | `asks.json`, `MissionControl.tsx` | แสดงว่างานไหนถูก agent ตัวไหน claim ไปทำ ป้องกัน agent ชนงานกัน 67% ตามบทเรียน | M |
| 28| **Agent Activity Audit Log Export (JSON/CSV)** | `maw-log.ts`, `server.ts` | ปุ่ม Export ประวัติการทำงานและการส่งข้อความของ Agent ออกเป็นไฟล์เพื่อนำไปวิเคราะห์ | S |
| 29| **Auto-Restart & Recovery Manager for Stuck Agents** | `feed-watcher.py`, `server.ts` | เฝ้าระวัง agent ที่นิ่งเกิน 15 นาที และมีปุ่มเสนอแนวทาง Recovery อัตโนมัติ | M |
| 30| **Multi-Agent Battle/Benchmark Mode Comparison** | `VSView.tsx`, `VSAgentPanel.tsx` | เทียบผลงาน ความเร็ว ค่าใช้จ่าย และจำนวน turns ของ Agent 2 ตัวในการแก้โจทย์เดียวกัน | M |

---

## 🔒 หมวดที่ 4: Performance, Security & Infrastructure (10 ไอเดีย)

| # | ชื่อไอเดีย | Function / จุดที่แตะ | ทำไมถึงดีขึ้น (Benefit / Rationale) | ความยาก |
|---|---|---|---|---|
| 31| **Background Non-blocking Token Indexing Optimizations** | `rebuild-token-index.ts`, `server.ts` | ปรับจังหวะ Background Scan log ให้ลด I/O impact บน WSL filesystem | S |
| 32| **PIN Authentication Audit Log & Anti-Bruteforce** | `PinLock.tsx`, `server.ts` (`/api/pin-verify`) | บันทึกประวัติการใส่ PIN ปรับชะลอเวลาเมื่อใส่ผิด 3 ครั้ง ป้องกันแฮกเกอร์สุ่ม PIN | S |
| 33| **Client-Side Virtualized List Rendering for Heavy Logs** | `ChatView.tsx`, `TerminalView.tsx` | ใช้ Virtual Scroll (react-window) เรนเดอร์ข้อความหลักแสนบรรทัดโดยไม่กระตุก | M |
| 34| **Sensitive Data Redaction & Masking Filter** | `server.ts`, `maw-log.ts` | ซ่อน API Keys, Nonce, Secrets ใน log หรือ UI ก่อนเรนเดอร์ออกหน้าจอ | S |
| 35| **Local File System Storage Quota & Cleanup Alert** | `worktrees.ts`, `server.ts` | แจ้งเตือนเมื่อขนาดของ log/tmp ในระบบเกิน 5GB และมีปุ่ม One-click Cleanup | S |
| 36| **HTTPS / TLS Self-Signed Certificate Helper** | `server.ts`, `maw.config.json` | สวิตช์เปิดใช้ TLS ให้ maw server เพื่อความปลอดภัยเมื่อเปิดดูจากเครือข่ายภายนอก | M |
| 37| **Static Asset Compression (Gzip/Brotli) & Caching** | `server.ts` (`serveStatic`) | บีบอัดไฟล์ JS/CSS ของ dashboard ช่วยให้หน้าเว็บโหลดเร็วขึ้น 3 เท่าบนมือถือ | S |
| 38| **Cross-Platform Path Resolver Sanitizer (Win/WSL)** | `config.ts`, `worktrees.ts` | ตัวจัดการ Path กลาง ป้องกัน MSYS path mangling และปัญหา `/mnt/c/` ค้าง | S |
| 39| **WebSocket Heartbeat Ping/Pong Keep-Alive** | `useWebSocket.ts`, `server.ts` | ป้องกันการหลุด connection จาก router/firewall timeout ด้วยการยิง ping-pong ทุก 30 วิ | S |
| 40| **API Gateway Proxy Health Check & Fallback** | `server.ts` (`/api/gateway/*`) | เช็คความพร้อมของ Gateway (:4300) หากล่มให้แสดงสถานะ Fallback บน UI ชัดเจน | S |

---

## 🚀 หมวดที่ 5: New Features & Automation (10 ไอเดีย)

| # | ชื่อไอเดีย | Function / จุดที่แตะ | ทำไมถึงดีขึ้น (Benefit / Rationale) | ความยาก |
|---|---|---|---|---|
| 41| **Integrated System Health Dashboard (All Ports 4000-47779)** | `DashboardView.tsx`, `server.ts` | หน้ารวมสถานะ Service ทั้งหมด (4000, 4100, 4201, 4300, 47779) ใน widget เดียว | M |
| 42| **GitHub PR & Worktree Linker** | `WorktreeView.tsx`, `server.ts` | ลิงก์ worktree เข้ากับ GitHub PR อัตโนมัติ แสดง status CI/Check บนการ์ด worktree | M |
| 43| **One-Click Deploy Trigger & Live Drift Check** | `DashboardView.tsx`, `server.ts` | ปุ่มตรวจ Live vs Main drift และสั่งรัน script deploy จาก dashboard พร้อม byte verify | L |
| 44| **Oracle Knowledge Graph Quick Search Widget** | `OracleSearch.tsx`, `/api/oracle/search` | ช่องค้นหาความรู้/ resonance/ learnings ของ fleet แบบ Instant Search บน Dashboard | M |
| 45| **Automatic Daily Retrospective & Report Generator** | `maw-log.ts`, `server.ts` | สรุปงานประจำวันของทั้ง fleet ออกมาเป็น Markdown Report อัตโนมัติทุก 24 ชม. | M |
| 46| **LINE / Telegram Webhook Incident Alerting** | `server.ts`, `feed-tail.ts` | ส่งการแจ้งเตือนเข้า LINE กลุ่มพี่พง เมื่อมีสถานะ STUCK หรือ Incident ร้ายแรง | M |
| 47| **Interactive Voice Command & Speech-to-Text** | `StatusBar.tsx`, `App.tsx` | พิมพ์คำสั่งสั่งงาน fleet ผ่านเสียงพูดภาษาไทย (สำหรับสั่งงานจากมือถือขณะเดินทาง) | L |
| 48| **Wy Local Model (Ollama) Status & Task Delegation Widget** | `DashboardView.tsx`, `server.ts` | หน้าจอมอนิเตอร์ Wy (Qwen 2.5:7b) แสดง VRAM/Queue และปุ่มส่งงาน offline เบาๆ | M |
| 49| **Automated Test Pipeline Execution & Visual Reporter** | `server.ts`, `DashboardView.tsx` | ปุ่มกดสั่งรัน Vitest / PHPUnit แล้วแสดงผลเขียว/แดง แบบชาร์ตแท่งบน dashboard | M |
| 50| **AI Assistant Auto-Prompter for pa Oracle (Co-Pilot)** | `ChatView.tsx`, `DashboardView.tsx` | ผู้ช่วยเสนอไอเดียคำสั่งถัดไปให้ pa Oracle ในการจ่ายงาน fleet ตามสถานะปัจจุบัน | L |

---
*สรุป: 50 ไอเดียครอบคลุมทั้ง UI, Realtime Analytics, Fleet Monitoring, Infrastructure และ Feature ใหม่ที่สอดคล้องกับสถาปัตยกรรมจริงของ maw-js-server*

---


## 🌟 TOP-5 เสนอพี่พง (High Value, Effort S/M, Safe Scope)

กลั่นกรองจาก 50 ไอเดีย โดยคัดเลือกฟีเจอร์ที่ **ตอบโจทย์พี่พงมากที่สุด** (เห็นสถานะชัด ประหยัดเวลา/เงิน) ใช้เวลาทำไม่เกิน 1-2 วัน (Effort S/M) และ **ไม่แตะระบบ production ภายนอก** (ปลอดภัย 100% ทำเฉพาะใน `maw-js-server`):

### 1. #12 Live Cost Calculator & Budget Threshold Alert
* **ทำไมถึงติด TOP-5**: พี่พงควบคุมค่าใช้จ่าย API เสมอ ฟีเจอร์นี้แสดงยอดเงิน USD รวมต่อวันชัดเจน และเปลี่ยนเป็นสีแดงพร้อมเตือนทันทีเมื่อใช้เกินงบ (เช่น > $10/วัน)
* **สเก็ตช์วิธีทำ (3 ขั้น)**:
  1. เพิ่มฟังก์ชันคำนวณ budget limit ใน `src/cost-index.ts` เช็คยอดรวมเทียบกับ threshold ใน `maw.config.json`
  2. ส่งค่า `overBudget: boolean` และ `budgetLimit: number` ผ่าน API `/api/costs`
  3. เพิ่ม Badge คำนวณเงินพร้อมสถานะสีแดงเตือนบน `DashboardView.tsx` (ข้างบนสุด)
* **ความเสี่ยง 1 ข้อ**: การประเมินราคาโมเดลต่างค่ายอาจคลาดเคลื่อนเล็กน้อยหากมีการปรับราคา API จากผู้ให้บริการ ต้องใช้อัตราถัวเฉลี่ย ($8/1M tokens)

### 2. #19 Active Worktree Drift & Uncommitted Changes Counter
* **ทำไมถึงติด TOP-5**: แก้ปัญหาคลาสสิกของ fleet ที่ agent หรือผู้ใช้ลืม commit หรือทิ้ง worktree ค้างไว้จนงานหายหรือเกิด drift
* **สเก็ตช์วิธีทำ (3 ขั้น)**:
  1. ขยาย API `/api/worktrees` ใน `src/worktrees.ts` ให้รัน `git status --porcelain` นับ uncommitted files ในแต่ละ worktree
  2. ส่งสถิติ `uncommittedCount` และ `lastCommitTime` ออกมาทาง JSON
  3. แสดงตัวเลขเตือนสีส้มบนแท็บ Worktrees ใน `WorktreeView.tsx` เมื่อมี uncommitted changes > 0
* **ความเสี่ยง 1 ข้อ**: การรัน `git status` หลาย worktree พร้อมกันอาจชะลอ I/O เล็กน้อยบน WSL หากมี worktree ค้างเกิน 10 ตัว (แก้ไขโดยใส่ cache 10 วินาที)

### 3. #22 Heartbeat & Liveness Probe Monitor
* **ทำไมถึงติด TOP-5**: พี่พงจะเห็นทันทีว่า Agent ตัวไหนกำลังทำงาน ตัวไหนหลับ หรือตัวไหนค้าง โดยไม่ต้องคอยพิมพ์ `maw peek` เอง
* **สเก็ตช์วิธีทำ (3 ขั้น)**:
  1. ปรับ `src/hooks.ts` ให้นับเวลา timestamp ล่าสุดที่ได้รับ heartbeat จาก `/home/po-ch/.oracle/agy-maw-hook.sh`
  2. เพิ่ม endpoint `/api/fleet/health` คืนค่าสถานะ liveness ของ agent รายตัว (Active / Silent / Stale)
  3. แสดงสถานะดวงไฟ (Green/Amber/Red) บน `AgentStatusCard` ใน `DashboardView.tsx`
* **ความเสี่ยง 1 ข้อ**: Agent ที่กำลังรัน I/O หนักหรือรันคำสั่งยาว (>5 นาที) อาจถูกจัดเป็น Silent ชั่วคราว (แก้ไขโดยอ้างอิงสถานะ BUSY ร่วมด้วย)

### 4. #41 Integrated System Health Dashboard (All Local Ports 4000-47779)
* **ทำไมถึงติด TOP-5**: รวมศูนย์การตรวจเช็ค Service ทั้งหมดในเครื่อง (MAW :4000, Tracker :4100, Enervia API :4201, Gateway :4300, Arra :47779) ไว้ใน Widget เดียว ไม่ต้องเปิด terminal คอย curl เอง
* **สเก็ตช์วิธีทำ (3 ขั้น)**:
  1. เพิ่ม background check ใน `src/server.ts` ยิง HTTP GET `/health` หา 5 พอร์ตหลักทุก 30 วินาที
  2. เก็บสถานะ `online/offline` และ response latency (ms) ไว้ใน memory state
  3. สร้าง Widget `System Services Status` บนหน้า `DashboardView.tsx` โชว์ไฟสถานะแต่ละ Service
* **ความเสี่ยง 1 ข้อ**: หาก service บางตัวยังไม่ได้เปิด (เช่น Enervia API :4201) อาจเห็นไฟแดงเตือนตลอดเวลา (แก้ไขโดยเพิ่มปุ่ม Mute Alert สำหรับ service ที่ไม่ได้เปิด)

### 5. #27 Task Claiming & Locking Status Board
* **ทำไมถึงติด TOP-5**: ลดปัญหางานซ้ำซ้อน 67% จากการที่ agent แย่งกันหยิบงานจาก list เดียวกันตามบทเรียน delegation
* **สเก็ตช์วิธีทำ (3 ขั้น)**:
  1. สร้างโครงสร้างเก็บข้อมูล task claims ใน `asks.json` (`taskId`, `claimedBy`, `claimedAt`, `status`)
  2. เพิ่ม API `POST /api/asks/claim` ให้ agent สามารถส่งคำร้องจองงานก่อนเริ่มทำ
  3. แสดงการ์ด Task ใน `MissionControl.tsx` พร้อม Avatar ของ agent ที่ถือครองงานนั้นๆ
* **ความเสี่ยง 1 ข้อ**: หาก agent หลุดการทำงานกลางค้าง งานจะถูก lock ค้างไว้ (แก้ไขโดยใส่ระบบ Auto-release lock หลังผ่านไป 30 นาที)

---

## 💡 ข้อเสนอแนะงานเพิ่มเติมสำหรับพี่พง (Beyond Dashboard)

หากพี่พงต้องการให้ Nasri ช่วยลุยงานต่อเพื่อเพิ่มความเรียบร้อยของระบบ ขอเสนอ 2 งานปลอดภัยที่มีคุณค่าสูงครับ:

1. **สร้าง Script ตรวจสอบ Live-vs-Git Drift อัตโนมัติ (`scripts/check-survey-drift.sh`)**:
   - *คุณค่า*: ป้องกันปัญหา Live-ahead drift ของ `survey.enervia` ที่เคยทำให้ฟีเจอร์หายทั้งบริษัท
   - *วิธีทำ*: สร้าง script ดึง `functions.php` และ `survey.php` จาก FTPS มา diff แบบ `--strip-trailing-cr` เทียบกับ `main` branch บน local โดยไม่มีการ overwrite ใดๆ ปลอดภัย 100%

2. **สร้าง Unified Test Runner CLI (`scripts/run-fleet-tests.sh`)**:
   - *คุณค่า*: ช่วยให้พี่พง หรือ agent รันเทส JS (`vitest`) และ PHP (`PHPUnit`) ได้ในคำสั่งเดียว พร้อมกรองผลลัพธ์เทียบกับ 10 Baseline Fails เดิมบน CI เพื่อยืนยันว่าไม่มี regression ใหม่เกิดขึ้นก่อน merge PR
