# Tracker Improve Phase 1: Global Search Ctrl+K (#2) Apply Guide for pa Oracle

**Target File**: `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/oracle-studio/tracker.html`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11

---

## 1. จุดแทรกใน `oracle-studio/tracker.html` (ก่อน `</body>` บรรทัดที่ 2277)

### (ก) บรรทัดจริงก่อน Apply (BEFORE APPLY Context) จาก `tracker.html` (บรรทัดที่ 2274-2278)
```html
2274: <script src="palette.js"></script>
2275: <script>if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js').catch(function(){}); }</script>
2276: 
2277: </body>
2278: </html>
```

### (ข) โค้ดที่ต้องแทรก (คัดลอกเนื้อหาจาก `deliverables/tracker-search/tracker-search-block.html`)
วางก้อนบล็อก HTML/CSS/JS ทั้งก้อนจาก `tracker-search-block.html` ต่อท้ายบรรทัดที่ 2275 ทันที ก่อนปิด `</body>`

### (ค) บริบทหลังแทรก (AFTER Context)
```html
2274: <script src="palette.js"></script>
2275: <script>if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js').catch(function(){}); }</script>
2276: 
2277: <!-- Tracker Improve Phase 1: Global Search & Filter Overlay (Ctrl+K) -->
2278: ... [เนื้อหาทั้งก้อนจาก tracker-search-block.html] ...
2279: 
2280: </body>
2281: </html>
```

---

## 📋 ขั้นตอนการ Apply & Verification สำหรับ pa Oracle

```bash
# 1. แปะเนื้อหา tracker-search-block.html เข้าไปท้ายไฟล์ tracker.html ก่อน </body>
# (หรือใช้คำสั่ง cat แทรกก่อน </body>)

# 2. Verification
# เปิดเบราว์เซอร์เข้า http://localhost:4000/tracker
# กดคีย์ลัด Ctrl + K (หรือ Cmd + K) หรือคลิกปุ่ม 🔍 Search Tracker... มุมขวาล่าง
# ทดสอบพิมพ์คำค้น เช่น "health", "nasri", "search"
# ทดสอบใช้ปุ่มลูกศร ↑ ↓ และกด Enter เพื่อ scroll กระโดดไปยังตำแหน่งเป้าหมายพร้อมไฮไลต์วูบ
```
