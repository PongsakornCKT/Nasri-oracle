# Learning: Parity-Test Quote Expiry Boundary Bug & Flawed Test Instrument (2026-08-18)

## Symptom
User reported that a quote created on 2026-08-01 should expire after 2026-08-15, but on 2026-08-16 the system still reported that it was valid/usable. Meanwhile, the test runner reported `3 passed, 0 failed`.

## Root Cause
1. **Calculation Off-by-One**: The function `expiryDate(createdISO)` added 15 days (`+ 15`) instead of 14 days (`+ 14`). When counting the creation date as Day 1 (Day 1 = Aug 1), Day 15 is Aug 15 (`1 + 14 = 15`). Adding 15 days resulted in an expiry date of Aug 16, causing `isExpired` to return `false` on Aug 16 (`'2026-08-16' > '2026-08-16'` is `false`).
2. **Flawed Test Instrument (Tripwire 5)**: `quote-expiry.test.mjs` previously only tested loose inequality (`expiryDate > createdISO`), same-day not expired, and far-future expired. It never asserted the exact expiry date nor boundary conditions on Day 15 and Day 16.

## Fix Applied
1. `parity-test/quote-expiry.mjs`: Changed `+ 15` to `+ 14` in `expiryDate()`.
2. `parity-test/quote-expiry.test.mjs`: Added boundary assertions for `expiryDate('2026-08-01') === '2026-08-15'`, Day 15 (valid), and Day 16 (expired).

## Transferable Lesson
- Always audit test assertions when test results are green but user reports a bug (Mechanical Tripwire 5).
- Ensure test coverage includes exact boundary values (Day 15 and Day 16) alongside general happy paths (Mechanical Tripwire 7).
