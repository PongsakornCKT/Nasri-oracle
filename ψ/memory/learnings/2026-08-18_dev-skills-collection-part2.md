# Development & Code Tools (Part 2) — Skills Audit & Distillation Guide

> **Author**: Nasri Oracle (Right Hand of Ma'at 𓂀)
> **Date**: 2026-08-18
> **Source**: [claude-skills-collection](https://github.com/abubakarsiddik31/claude-skills-collection) (Section: Development & Code Tools, Items 41-80 / Row 161-200)

## 📊 Summary Executive Dashboard

- **Total Skills Audited**: 40 skills
- **Passed Security Audit**: 29 skills
- **Failed Security Audit (Skipped)**: 11 skills (เหตุผลหลัก: unpinned `@latest`, `curl|sh`, หรือคำสั่งอันตราย)
- **Installed to `~/.gemini/skills/`**: 12 skills (ผ่านความปลอดภัย + ตรงกับ Stack จริง)
- **Distilled for Reference**: 17 skills (ผ่านความปลอดภัยแต่เป็น Stack/Domain อื่น)

---

## 🔍 Security Audit Criteria & Rules Applied
1. **No Remote Shell Piping**: ปฏิเสธทุกสคริปต์ที่มี `curl | sh` หรือ `wget | sh` โดยไม่มีการตรวจสอบ hash/verification
2. **Pinned Package Dependencies**: ปฏิเสธทุกคำสั่งที่มี `npx <package>@latest` หรือ `npm install <package>@latest` โดยไม่ล็อกเวอร์ชัน เพื่อป้องกัน Supply Chain Attack
3. **No Unsafeguarded Destructive Commands**: ปฏิเสธคำสั่งทำลายล้าง เช่น `rm -rf /`, `git push --force`, `DROP DATABASE` ที่ไม่มี confirmation safety gates
4. **Stack & Domain Fit**: เลือกติดตั้งเฉพาะทักษะที่ใช้กับ Stack จริงของเรา (JS/Node, PHP/WordPress, PostgreSQL, Bash, Documentation)

---

## 📚 Skill Summaries & Action Guide (40 Skills)

### 1. `web-artifacts-builder` (anthropics) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: สร้าง HTML/React/Tailwind artifacts ซับซ้อนสำหรับ UI prototype และ interactive components บน Claude
- **When to use**: เมื่อต้องการสร้าง UI prototype, PWA interface, หรือ interactive dashboard สำหรับพรีเซนต์
- **Fleet / Enervia Application Idea**: ใช้สร้าง UI mockups สำหรับ Enervia Survey PWA และ QSolar calculator ให้พี่พงตรวจก่อนลงโค้ดจริง

### 2. `pypict-claude-skill` (omkamal) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (เน้น Python PICT combinatorics, fleet ใช้ Vitest/PHPUnit))
- **What it does**: ออกแบบ Combinatorial Test Cases แบบ Pairwise Independent Testing ด้วย Microsoft PICT (Python)
- **When to use**: เมื่อมีพารามิเตอร์ของระบบหลายตัวแปรและต้องการลดจำนวน test cases ให้เหลือน้อยที่สุดแต่ครอบคลุมทุกคู่
- **Fleet / Enervia Application Idea**: ประยุกต์หลักการ Pairwise Testing มาวางผังสูตรทดสอบ Option ในใบเสนอราคา QSolar/Price List

### 3. `aws-skills` (zxkane) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (เน้น AWS CDK/Serverless, fleet ใช้ WSL2/Local/WP/GAS))
- **What it does**: ให้คำแนะนำการสถาปัตยกรรม AWS CDK, Cost Optimization และ Serverless Event-driven patterns
- **When to use**: เมื่อต้องออกแบบหรือย้ายระบบขึ้น AWS cloud
- **Fleet / Enervia Application Idea**: ศึกษา Serverless Event Queue patterns มาปรับใช้กับ LINE Bot Webhook Router ใน Enervia API

### 4. `move-code-quality-skill` (1NickPappas) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (ภาษา Move / Web3 smart contracts))
- **What it does**: ตรวจสอบคุณภาพโค้ดภาษา Move บน Aptos/Sui ตาม Move Book Code Quality Checklist
- **When to use**: เมื่อเขียน Smart Contract ด้วยภาษา Move
- **Fleet / Enervia Application Idea**: ประยุกต์ Checklist-driven linter Pattern มาใช้กับ shell-hygiene และ PHP standard linter

### 5. `audit-website` (squirrelscan) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: CLI Web Auditing Tool สำหรับเช็ก SEO, Performance, Security, Accessibility และกฎเกณฑ์เว็บกว่า 140+ ข้อ
- **When to use**: เมื่อต้องการตรวจสอบความพร้อมและคุณภาพของเว็บก่อน deploy ขึ้น production
- **Fleet / Enervia Application Idea**: ใช้รัน audit สแกนความปลอดภัยและ Web Vitals ของ survey.enervia.co.th และ QSolar PWA

### 6. `stripe-best-practices` (stripe) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Domain mismatch (Enervia ใช้ระบบใบเสนอราคา/โอนเงินตรง ไม่ได้ใช้ Stripe))
- **What it does**: คำแนะนำและ Best Practices ในการต่อ Stripe Payments, Subscriptions และ Webhook handlers
- **When to use**: เมื่อต้องการพัฒนาระบบชำระเงินออนไลน์ด้วย Stripe API
- **Fleet / Enervia Application Idea**: นำแนวทาง Webhook Idempotency & Signature Verification มาปรับใช้กับ LINE Webhooks

### 7. `upgrade-stripe` (stripe) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Domain mismatch (ไม่ได้ใช้ Stripe))
- **What it does**: คำแนะนำสำหรับการอัปเกรด Stripe SDK และ API versions อย่างปลอดภัยโดยไม่เกิด breaking changes
- **When to use**: เมื่อต้องอัปเกรดเวอร์ชันของ Stripe API
- **Fleet / Enervia Application Idea**: ปรับกระบวนการ API Version Upgrade Checklists มาใช้กับการอัปเกรด WordPress / Node.js dependencies

### 8. `expo-app-design` (expo) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: ใช้ unpinned npx skills@latest แบบไม่ระบุเวอร์ชันล็อก)
- **What it does**: คำแนะนำการออกแบบและพัฒนา React Native / Expo Mobile Apps ตามมาตรฐานของ Expo
- **When to use**: เมื่อต้องพัฒนา Mobile Application ด้วย Expo
- **Fleet / Enervia Application Idea**: แนวทาง Component hierarchy ของ Expo สามารถประยุกต์กับ PWA Mobile layout ได้

### 9. `supabase-postgres` (supabase) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant (Postgres DB best practices))
- **What it does**: คำแนะนำ PostgreSQL Best Practices ในการออกแบบ Schema, RLS Policies, Indexes และ SQL performance
- **When to use**: เมื่อต้องออกแบบหรือปรับแต่งคำสั่ง SQL / Postgres Database ในระบบ
- **Fleet / Enervia Application Idea**: ปรับปรุงการเขียน Query & Indexing ใน Enervia Tracker API Postgres Database

### 10. `terraform-code-generation` (hashicorp) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (HashiCorp Terraform IaC))
- **What it does**: สร้างและตรวจสอบโค้ด Terraform HCL สำหรับจัดการ Infrastructure as Code
- **When to use**: เมื่อต้องเขียนหรือ refactor Terraform HCL scripts
- **Fleet / Enervia Application Idea**: นำสถาปัตยกรรม Declarative Infrastructure Configuration มาประยุกต์กับ Fleet Environment Setup

### 11. `terraform-module-generation` (hashicorp) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (HashiCorp Terraform IaC))
- **What it does**: สร้างและออกแบบ Reusable Terraform Modules ตามหลักการ Modularity
- **When to use**: เมื่อต้องการแบ่งโครงสร้าง Terraform ออกเป็น Module ย่อยๆ
- **Fleet / Enervia Application Idea**: ประยุกต์หลักการ Module Interface Design เข้ากับการเขียน Antigravity Skills / Sidecars

### 12. `terraform-provider-development` (hashicorp) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (HashiCorp Terraform Custom Provider in Go))
- **What it does**: คำแนะนำการพัฒนา Custom Terraform Provider ด้วย Go Plugin Framework
- **When to use**: เมื่อต้องเขียน Terraform Provider สำหรับ Custom REST APIs
- **Fleet / Enervia Application Idea**: ใช้เป็นแนวทางศึกษาการทำ Custom API Adapter

### 13. `terraform-skill` (antonbabenko) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (Terraform/OpenTofu patterns))
- **What it does**: รวบรวม Best Practices กว่า 100+ patterns สำหรับ Terraform, OpenTofu, Testing และ CI/CD
- **When to use**: เมื่อต้องการสถาปัตยกรรม Cloud Infrastructure ขนาดใหญ่ด้วย Terraform
- **Fleet / Enervia Application Idea**: นำรูปแบบ CI/CD Static Analysis Gates มาปรับใช้กับ GitHub Actions ใน repo ของ fleet

### 14. `cloudflare-agents-sdk` (cloudflare) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (Cloudflare Workers Agents SDK, fleet ใช้ Local Agents/maw))
- **What it does**: สร้าง Stateful AI Agents ด้วย Cloudflare Agents SDK บน Cloudflare Workers
- **When to use**: เมื่อต้องการสร้าง AI Agent บน Edge Cloud Serverless Platform
- **Fleet / Enervia Application Idea**: ศึกษาแนวคิด RPC Communication & State Scheduling มาปรับใช้กับการสื่อสารระหว่าง Fleet Agents

### 15. `cloudflare-wrangler` (cloudflare) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: มีการใช้ unpinned npm install -D wrangler@latest และ create-cloudflare@latest)
- **What it does**: คู่มือการใช้ Wrangler CLI ในการ deploy และจัดการ Workers, KV, R2, D1 และ Queues
- **When to use**: เมื่อต้องพัฒนาและสั่ง deploy Cloudflare Serverless stack
- **Fleet / Enervia Application Idea**: เทคนิคการจัดการ KV / D1 Serverless storage สามารถใช้เป็นแนวทางในอนาคต

### 16. `cloudflare-web-perf` (cloudflare) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: การวิเคราะห์และวัดผล Core Web Vitals (LCP, CLS, INP) และแก้ปัญหา Render-blocking Resources
- **When to use**: เมื่อต้องการเพิ่มความเร็วการโหลดหน้าเว็บและปรับปรุงคะแนน Lighthouse/Performance
- **Fleet / Enervia Application Idea**: ใช้วิเคราะห์และเพิ่มความเร็วหน้าใบเสนอราคา Enervia Survey PWA ให้โหลดได้ลื่นไหลบนมือถือ

### 17. `cloudflare-building-ai-agent` (cloudflare) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: ใช้ unpinned npx create-cloudflare@latest)
- **What it does**: ขั้นตอนการสร้าง AI Agent แบบเต็มรูปแบบบน Cloudflare Workers + AI Models
- **When to use**: เมื่อเริ่มสร้าง AI Agent บน Cloudflare
- **Fleet / Enervia Application Idea**: ศึกษาโครงสร้าง Agent System Prompt และ Memory Persistence

### 18. `cloudflare-building-mcp-server` (cloudflare) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: ใช้ unpinned npx create-cloudflare@latest และ @modelcontextprotocol/inspector@latest)
- **What it does**: คู่มือสร้างและ deploy MCP Server บน Cloudflare Workers ให้ Claude เรียกใช้ผ่าน SSE
- **When to use**: เมื่อต้องการโฮสต์ MCP Server บน Edge Cloud
- **Fleet / Enervia Application Idea**: สถาปัตยกรรม MCP Remote Endpoint บน Edge Worker

### 19. `cloudflare-durable-objects` (cloudflare) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (Cloudflare Durable Objects))
- **What it does**: คู่มือการเขียน Stateful, Globally Consistent Object บน Cloudflare Edge
- **When to use**: เมื่อต้องการทำ Real-time Coordination / Single-point-of-truth บน Cloud
- **Fleet / Enervia Application Idea**: ประยุกต์หลักการ Concurrency Lock & State Synchronization กับการแยกล็อก SQLite / Worktree

### 20. `cloudflare-sandbox-sdk` (cloudflare) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (Cloudflare Sandbox Container Environment))
- **What it does**: การรัน Untrusted Code อย่างปลอดภัยใน Sandbox Environment ของ Cloudflare
- **When to use**: เมื่อต้องให้ผู้ใช้รันโค้ดภายนอกบนเซิร์ฟเวอร์
- **Fleet / Enervia Application Idea**: นำหลักเกณฑ์ Sandboxing & Process Isolation มากำกับคำสั่ง shell ใน --yolo mode

### 21. `cloudflare-workers-best-practices` (cloudflare) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (Cloudflare Edge Workers))
- **What it does**: Best Practices การพัฒนา Cloudflare Workers ด้าน Performance, Security และ Architecture Patterns
- **When to use**: เมื่อเขียน Serverless JavaScript/TypeScript บน Edge Workers
- **Fleet / Enervia Application Idea**: นำรูปแบบ Async I/O Handling มาปรับใช้กับ Node.js / Express Services

### 22. `netlify-functions` (netlify) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: ตรวจพบคำสั่งอันตราย rm -rf / ในไฟล์คำอธิบาย)
- **What it does**: คำแนะนำสร้าง Serverless API Endpoints และ Background Tasks บน Netlify
- **When to use**: เมื่อพัฒนา Netlify Functions
- **Fleet / Enervia Application Idea**: แนวทาง Background Jobs Execution

### 23. `netlify-db` (netlify) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: ตรวจพบคำสั่งอันตราย rm -rf / ในไฟล์คำอธิบาย)
- **What it does**: การใช้งาน Managed Postgres บน Netlify ร่วมกับ Deploy Preview Branching
- **When to use**: เมื่อทำ Database Preview Environment ใน Pull Requests
- **Fleet / Enervia Application Idea**: แนวคิด Database Branching สำหรับการทำ QA / Testing

### 24. `neon-postgres` (neon) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: คำแนะนำเทคนิคการใช้งาน Serverless Postgres, Connection Pooling, Branching และ Query Tuning
- **When to use**: เมื่อต้องการปรับปรุงประสิทธิภาพ Postgres Database และการจัดการ Connection Pool
- **Fleet / Enervia Application Idea**: นำเทคนิค Connection Pooling และ Index Optimization มาใช้กับ Enervia Tracker API Postgres

### 25. `vercel-react` (vercel) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: แนะนำรูปแบบ React Component Architecture, State Management, Server/Client Side Patterns ของ Vercel
- **When to use**: เมื่อพัฒนา frontend React components หรือ SPA/PWA
- **Fleet / Enervia Application Idea**: นำ React Best Practices มาปรับใช้กับโค้ด Frontend ของ Enervia Survey PWA และ QSolar

### 26. `next-best-practices` (vercel) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: ใช้ unpinned npx @next/codemod@latest)
- **What it does**: คำแนะนำสถาปัตยกรรม Next.js App Router, Caching, และ Server Components
- **When to use**: เมื่อพัฒนา Next.js Applications
- **Fleet / Enervia Application Idea**: รูปแบบ Caching Strategies

### 27. `next-upgrade` (vercel) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: ใช้ unpinned npx @next/codemod@latest)
- **What it does**: ขั้นตอนและเครื่องมืออัปเกรด Next.js เป็นเวอร์ชันล่าสุดอย่างราบรื่น
- **When to use**: เมื่อต้องอัปเกรด Next.js project
- **Fleet / Enervia Application Idea**: Automated Codemod Migration Patterns

### 28. `react-native-best-practices` (callstack) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: ใช้ unpinned npx skills@latest)
- **What it does**: เทคนิคปรับแต่งประสิทธิภาพ React Native (Render Optimization, Native Modules) โดย Callstack
- **When to use**: เมื่อจูน Performance ของ React Native Mobile App
- **Fleet / Enervia Application Idea**: หลักการลด Re-renders ใน Mobile UI

### 29. `better-auth` (better-auth) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: ใช้ unpinned npx @better-auth/cli@latest)
- **What it does**: คำแนะนำติดตั้งและตั้งค่า Better Auth สำหรับ Authentication (OAuth, 2FA, Passkeys, Session)
- **When to use**: เมื่อต้องการสร้างระบบ Authentication สมัยใหม่ใน Node.js/TypeScript
- **Fleet / Enervia Application Idea**: โครงสร้าง Session Management & Passkey Auth

### 30. `tinybird` (tinybird) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (Tinybird Real-time Data Platform))
- **What it does**: การสร้าง Data Pipes, Endpoints และ SQL Transformations บน Tinybird
- **When to use**: เมื่อทำ Real-time Analytics API จาก High-throughput Log Events
- **Fleet / Enervia Application Idea**: นำโครงสร้าง Real-time Event Ingestion มาประยุกต์กับ Fleet Telemetry / Activity Feed

### 31. `sanity` (sanity) — 🔴 **[SKIPPED]**
- **Security Status**: FAIL (เหตุผล: Security: ใช้ unpinned npx sanity@latest)
- **What it does**: คำแนะนำใช้งาน Sanity CMS, โครงสร้าง GROQ Queries และ Content Pipelines
- **When to use**: เมื่อพัฒนา Headless CMS ด้วย Sanity
- **Fleet / Enervia Application Idea**: โครงสร้าง Headless Content Modeling

### 32. `clickhouse` (clickhouse) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (ClickHouse Columnar Database))
- **What it does**: Best Practices การเขียน SQL Query และ Data Schema สำหรับ ClickHouse Analytics Database
- **When to use**: เมื่อทำ Big Data Analytics / Columnar Storage Query Optimization
- **Fleet / Enervia Application Idea**: หลักการ Columnar Aggregation สามารถประยุกต์กับการจัดเก็บ Log Data ใน Fleet ได้

### 33. `remotion-skill` (remotion-dev) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (Programmatic Video Creation in React))
- **What it does**: การสร้างวิดีโอด้วยโค้ด React/JS ผ่าน Remotion Engine
- **When to use**: เมื่อต้องการสร้างวิดีโออนิเมชันหรือภาพเคลื่อนไหวอัตโนมัติจากข้อมูล
- **Fleet / Enervia Application Idea**: การสร้าง Dynamic Asset Generation จาก Template

### 34. `ios-simulator-skill` (conorluddy) — 🟡 **[DISTILLED]**
- **Security Status**: PASS (เหตุผล: Stack mismatch (iOS Simulator Automation on macOS, fleet อยู่บน WSL2/Linux))
- **What it does**: ชุดสคริปต์ 21 ตัวสำหรับสั่งการ iOS Simulator ผ่าน Accessibility APIs เพื่อทดสอบ UI
- **When to use**: เมื่อต้องการทำ Automated Testing บน iOS Simulator ใน macOS
- **Fleet / Enervia Application Idea**: ประยุกต์รูปแบบ Scripted UI Automation เข้ากับ Playwright Browser Testing

### 35. `claude-d3js-skill` (chrisvoncsefalvay) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: คู่มือและแพตเทิร์นการสร้าง Interactive Data Visualizations ด้วย D3.js
- **When to use**: เมื่อต้องการสร้าง กราฟ แผนภูมิ หรือ Dashboard แสดงผลข้อมูลทางสถิติซับซ้อน
- **Fleet / Enervia Application Idea**: ใช้สร้าง กราฟเปรียบเทียบการผลิตไฟฟ้า/คำนวณราคา ใน QSolar PWA และ Tracker Dashboards

### 36. `playwright-skill` (lackeyjb) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: คู่มือการใช้ Playwright สำหรับ Browser Automation, E2E Testing, และ Web Scraping
- **When to use**: เมื่อต้องการเขียน E2E Integration Tests หรือทดสอบระบบผ่าน Web Browser จริง
- **Fleet / Enervia Application Idea**: ใช้วางชุดทดสอบ E2E Automated Regression Test สำหรับ Enervia Survey PWA

### 37. `claude-a11y-skill` (airowe) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: การประเมินและปรับปรุง Accessibility ของหน้าเว็บตามมาตรฐาน WCAG 2.1 (axe-core, eslint-a11y)
- **When to use**: เมื่อต้องการตรวจและแก้ไขปัญหาการเข้าถึงของ UI (Accessibility & Form Labels)
- **Fleet / Enervia Application Idea**: ปรับปรุง Form Accessibility และ ARIA attributes ของฟอร์มสำรวจใน Enervia Survey PWA

### 38. `context-engineering-kit` (NeoLabHQ) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: เทคนิค Context Engineering, Multi-agent Architecture, Reflexion Loops และ Domain-Driven Prompting
- **When to use**: เมื่อต้องการออกแบบ Prompt Structure และ Context Management สำหรับ Agent Fleet ซับซ้อน
- **Fleet / Enervia Application Idea**: นำรูปแบบ Reflexion Loops และ Domain Prompting มาเสริมศักยภาพของ Nasri และ Fleet Agents

### 39. `compound-engineering-plugin` (EveryInc) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: ปลั๊กอินวิศวกรรมแบบ Compound: Ideation, Planning, Multi-agent Review และ Knowledge Compounding
- **When to use**: เมื่อต้องการวางแผน พัฒนา ตรวจสอบ และสะสมความรู้ทางวิศวกรรมซอฟต์แวร์อย่างเป็นระบบ
- **Fleet / Enervia Application Idea**: ใช้ต่อยอดกระบวนการสะสมบทเรียน (Knowledge Compounding) ใน `ψ/memory/learnings/` ของ fleet

### 40. `vscode-extension-builder` (SuryaPrakashPandurangi) — 🟢 **[INSTALLED]**
- **Security Status**: PASS (เหตุผล: Safe & highly relevant)
- **What it does**: เครื่องมือช่วยสร้าง คอมไพล์ แพ็กเกจ และติดตั้ง VS Code Extension ครบวงจร
- **When to use**: เมื่อต้องการสร้าง VS Code / Antigravity Extension, Theme หรือ Snippet Pack
- **Fleet / Enervia Application Idea**: ใช้สร้าง Custom Extension หรือ Helper Tool สำหรับ Antigravity IDE ในเครื่องพี่พง
