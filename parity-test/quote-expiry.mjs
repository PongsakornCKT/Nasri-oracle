// quote-expiry.mjs — parity-test (ระบบสมมติ ไม่ใช่ของจริง)
// spec: ใบเสนอราคาอายุ 15 วัน โดยนับวันที่สร้างเป็นวันที่ 1
//       (สร้าง 2026-08-01 → ใช้ได้ถึง 2026-08-15, วันที่ 16 ถือว่าหมดอายุ)
export function expiryDate(createdISO) {
  const d = new Date(createdISO + 'T00:00:00');
  d.setDate(d.getDate() + 14);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function isExpired(createdISO, todayISO) {
  return todayISO > expiryDate(createdISO);
}
