# Session 10 Retrospective — Smart Battery + Quotation Intelligence
**Date**: 2026-03-15
**Duration**: Extended session (~3 hours)
**Butler**: Nasri (Claude Opus 4.6)

## What Happened

Massive upgrade across 3 services — bomsolar, qsolar, and LINE bot.

### Battery Intelligence (bomsolar + qsolar)
- Built `_find_best_battery` with brand compatibility map (BATTERY_BRAND_COMPAT)
- Huawei: LUNA2000-7-E1 + mandatory Controller accessory
- Sigenergy: BAT 6.0 (6kWh) / BAT 10.0 (9kWh) selection
- Dyness (Deye/Solis): prefer largest model first, 20% tolerance
- ATMOCE: MS-7K-U with 1P max 3 units, 3P unlimited
- ATMOCE pricing: 99k/unit + backup box (1P=11k, 3P=31k)
- Hybrid Combiner Box auto-add for Solis/Huawei/Deye (1P=9.5k, 3P=15.85k)

### Quotation Parsing (LINE bot + qsolar)
- Full natural language parsing: customer name, selling price, discount, panel count, battery qty, remarks
- "คุณวัลลภ atmoce 15แผง JA625 batt 7*2 backup ขาย 420000 ส่วนลด 9000 ฟรีกันนก" → single-message PDF
- Smart ask: no spec → ask 5 questions; brand+kW → generate immediately
- Claude AI system prompt upgraded with solar knowledge + "ขอไปหาข้อมูลในเวปก่อนนะ" fallback

### Deploys
- 3 successful deploys to ai.enervia.co.th via FTP + Plesk restart
- All health checks passed

## What Was Learned

1. **Battery selection is brand-specific, not generic** — each brand has mandatory accessories (Huawei Controller, Hybrid Combiner Box). A generic "find closest kWh" algorithm is insufficient.

2. **Tolerance-based preference works** — `max(2kWh, 20% of requested)` tolerance lets larger batteries win over exact-match small batteries, without overshooting on small requests.

3. **ATMOCE pricing is composite** — not just battery×qty. It's battery×qty + backup_box(phase-dependent). The backup box price differs by phase (1P=11k, 3P=31k), explaining the 110k/130k selling prices.

4. **One-message quotation is the goal** — Pong types everything in one LINE message. The parser must extract 8+ fields from natural Thai+English mixed text.

5. **"Ask before generating" UX** — require both brand AND kW to auto-generate. Brand alone isn't enough context.

## What Surprised

- The 60/40 payment split is a standard business practice — every quotation shows it automatically
- Hoymiles + ATMOCE battery is a valid cross-brand combo (Hoymiles is on-grid micro, ATMOCE battery has its own hybrid controller)
- The tolerance algorithm needed 3 iterations (30% → 20%) to balance "prefer large" vs "don't overshoot"

## What's Next

- **Test LINE bot end-to-end** — Pong needs to test real quotation generation via LINE
- **Huawei/Sigenergy quotation PDF** — the PDF rendering for these brands with battery may need tuning (line items, descriptions)
- **BOM → Quotation flow** — currently BOM and quotation are separate; linking them (BOM cost → quotation selling price with markup) would be powerful
- **Deploy automation** — consider making deploy.sh a git hook or CI step
