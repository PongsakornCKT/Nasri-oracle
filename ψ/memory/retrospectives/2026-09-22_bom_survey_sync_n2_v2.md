# Retrospective: N2 r5 — Porting BOM Engine onto Live app.js v2 Architecture (2026-09-22)

## Work Completed & Evidence
- **Branch**: Created `feat/bom-survey-sync-n2-v2` from `live/ai-enervia-2026-09-22` (head `3b40fed`).
- **mcp-bomsolar Port**:
  - Ported N2 BOM survey engine (`survey_catalog.py`, `srp_calculator.py`, `srp_calc_cli.py`) and fixtures (`pricelist_fixture_2p5.json`) onto live version.
  - Preserved live's `srp_result_from_dict` helper in `srp_calculator.py` for PDF generation parity.
  - `python3 -m pytest -q tests/`: **19 passed, 1 skipped** (battery matching test guarded for non-sheets env).
- **app.js v2 & bom-parser Integration**:
  - Extracted zero-side-effect parser module [bom-parser.js](file:///home/po-ch/wt/nasri-bom-survey-sync-n2-v2/nasri-line-bot/deploy/bom-parser.js).
  - Integrated `bom-parser` into `parseSystemSpec` in [app.js](file:///home/po-ch/wt/nasri-bom-survey-sync-n2-v2/nasri-line-bot/deploy/app.js#L1033) for both ATMOCE and Sigenergy.
  - Handled quick replies (ratio 2:1/1:1, Sigenergy 5in1/neo/c&i) and prompts (backup/C-rate for C&I).
  - Updated [python-bridge.js](file:///home/po-ch/wt/nasri-bom-survey-sync-n2-v2/nasri-line-bot/deploy/lib/python-bridge.js#L50) `srpCalcBom` to accept object payloads cleanly.
  - Guarded `server.listen` with `!process.env.NASRI_NO_LISTEN` to prevent port 3000 collision while avoiding `require.main === module` guard (Passenger compatibility).
- **Node Test Suite Evidence**:
  - `node tests/test_app_load.cjs`: **PASS** (`app.js` loaded cleanly via `env.stub.cjs`).
  - `node tests/test_bom_parser.cjs`: **7/7 passed**.
  - `node tests/test_bom_n2_integration.cjs`: **6/6 passed** (E2E message $\rightarrow$ parser $\rightarrow$ python-bridge $\rightarrow$ CLI $\rightarrow$ BOM payload).

## Lessons Learned & Traps
1. **Passenger Require Trap**: Never use `require.main === module` to guard HTTP server listening in app.js because Passenger `require()`s the main script directly. Using `process.env.NASRI_NO_LISTEN` allows testing imports without breaking Passenger.
2. **Dual mcp-bomsolar Location**: Live app structure contains both root `mcp-bomsolar` and `nasri-line-bot/deploy/mcp-bomsolar`. Keeping both updated ensures local unit tests and `python-bridge` subprocess calls run identically.

## Path
`ψ/memory/retrospectives/2026-09-22_bom_survey_sync_n2_v2.md`
