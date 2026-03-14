---
type: learning
date: 2026-03-14
source: session-6
concepts: [solar, bom, natural-language, parser, catalog]
---

# Smart Solar System Spec Parser

## Pattern
Parse natural language like "atmoce 5kw 1phase แผง JA625 + batt + backup" into BOM items:
1. Detect inverter brand (atmoce/huawei/solis/deye/sigenergy/hoymiles/enphase)
2. Detect system kW (`\d+kw`)
3. Detect phase (`1phase`/`3phase`/`1P`/`3P`)
4. Detect panel brand + watts (`JA625`, `trina 715`, `aiko`)
5. Detect battery (`batt` + optional kWh)
6. Detect backup (`backup`/`สำรอง`)
7. Detect EV charger (`DC charge`/`EV charge`)

## Key rules
- ATMOCE = micro inverters: MI-1250 (1.25kW each), qty = ceil(kW / 1.25)
- Other brands = string/hybrid: 1 inverter, find closest kW match
- Panel qty = ceil(systemKW * 1000 / panelWatts)
- Default panel: JA Solar 625W if not specified
- Default system: 5kW if kW not specified

## Implementation
Both in `nasri-line-bot/deploy/app.js` (production) and `mcp-bomsolar/server.py` (`bomsolar_smart_bom` tool).
