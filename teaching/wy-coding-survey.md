# บทเรียนการเขียนโค้ด survey.enervia.co.th (สำหรับ wy 🤖)

สวัสดี wy! นี่คือคู่มือเขียนโค้ดสำหรับระบบ survey อ่านและทำตามทีละขั้นนะ

---

## 1. โครงสร้างและ HTML/CSS/JS พื้นฐาน
1. โค้ดของ theme อยู่ใน WordPress (`leadfollow`)
2. HTML ใช้โครงสร้างเรียบง่าย แบ่ง section ชัดเจน
3. JS ใช้ Vanilla JavaScript เน้น DOM manipulation พื้นฐาน
4. อย่าใช้ library ภายนอกโดยไม่จำเป็น

---

## 2. กติกา CSS Variables (Canonical Vars)
1. ห้ามตั้งชื่อสีเอง และห้าม hardcode สี hex เช่น `#6b7280`
2. ต้องใช้ CSS variables กลางของระบบเสมอ:
   - `--bg-card` : สีพื้นหลังของการ์ด
   - `--bg-body` : สีพื้นหลังของหน้าเว็บ
   - `--color-text` : สีตัวหนังสือหลัก
   - `--color-muted` : สีตัวหนังสือรอง
   - `--color-border` : สีเส้นขอบ
3. การใช้สีตามตัวแปรนี้จะรองรับทั้ง Light mode และ Dark mode อัตโนมัติ

---

## 3. รูปแบบ Payload (Payload Shape)
1. การยิง API ฝั่ง PWA บน live รับข้อมูลโครงสร้างนี้เท่านั้น:
   `{ fields: { Thai_keys } }`
2. ตัวอย่าง: `{ fields: { "ชื่อลูกค้า": "สมชาย", "เบอร์โทร": "0812345678" } }`
3. ห้ามเปลี่ยนโครงสร้างเป็นภาษาอังกฤษหรือแบบอื่นเด็ดขาด เพราะ PWA บน live จะอ่านไม่ได้

---

## 4. การใช้ WP REST API Nonce
1. การยิง REST API GET/POST ที่ต้องระบุตัวตน ต้องส่ง Header:
   `X-WP-Nonce: <nonce_value>`
2. ดึง nonce มาจาก endpoint `GET /me` เท่านั้น
3. ห้ามใช้ nonce จาก `POST /auth/login` เพราะอาจยืนยันสิทธิ์ไม่ผ่าน

---

## 5. กติกาความปลอดภัย Production
1. **ห้ามยิงหรือแก้ระบบ Production โดยตรงเด็ดขาด**
2. ทำงานในเครื่อง local / worktree เท่านั้น
3. เมื่อทำเสร็จแล้ว ให้ส่งมอบงานผ่าน **pa Oracle** เสมอ

---

## 6. Checklist เช็คงาน 5 ข้อก่อนส่ง
- [ ] 1. โค้ดไม่มีสี hardcode (ใช้ `--bg-card`, `--color-text` ครบ)
- [ ] 2. Payload ข้อมูลตรงตามรูปแบบ `{ fields: { Thai_keys } }`
- [ ] 3. ยิง API มีการส่ง `X-WP-Nonce` จาก `/me`
- [ ] 4. ทดสอบรันแล้วไม่มี error ใน console
- [ ] 5. ส่งงานให้ pa Oracle ตรวจ ไม่ได้แตะ production ตรงๆ

---
*เขียนโดย Nasri Oracle — ส่งต่อให้ wy นำไปปฏิบัติ 𓂀*
