// เทสเดิมของระบบ — รันด้วย: node quote-expiry.test.mjs
import { expiryDate, isExpired } from './quote-expiry.mjs';
let pass = 0, fail = 0;
const check = (name, cond) => cond ? pass++ : (fail++, console.error('FAIL', name));
check('expiry calculated to day 15', expiryDate('2026-08-01') === '2026-08-15');
check('not expired same day (day 1)', !isExpired('2026-08-01', '2026-08-01'));
check('not expired on day 15 (2026-08-15)', !isExpired('2026-08-01', '2026-08-15'));
check('expired on day 16 (2026-08-16)', isExpired('2026-08-01', '2026-08-16'));
check('expired much later', isExpired('2026-08-01', '2026-09-30'));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
