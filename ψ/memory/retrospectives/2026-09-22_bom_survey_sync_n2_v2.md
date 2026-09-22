# Retrospective: N2 r5/r6 — Porting BOM Engine & Compat Exports onto Live app.js v2 Architecture (2026-09-22)

## Work Completed & Evidence
- **Branch**: `feat/bom-survey-sync-n2-v2` from `live/ai-enervia-2026-09-22` (head `3b40fed`).
- **N2 r6 Fixes**:
  1. **server.py Compatibility Exports**: Restored `SRPParams`, `PRICES_ATMOCE_DEFAULT`, `BOMLine`, `SRPResult`, `calculate_srp`, and `srp_result_from_dict` in [srp_calculator.py](file:///home/po-ch/wt/nasri-bom-survey-sync-n2-v2/mcp-bomsolar/srp_calculator.py). Added [test_server_imports.py](file:///home/po-ch/wt/nasri-bom-survey-sync-n2-v2/mcp-bomsolar/tests/test_server_imports.py) with `pytest.importorskip('mcp')` guard.
  2. **Removed Duplicate deploy/mcp-bomsolar**: Removed `nasri-line-bot/deploy/mcp-bomsolar/` duplicate copy to prevent code drift. Updated [python-bridge.js](file:///home/po-ch/wt/nasri-bom-survey-sync-n2-v2/nasri-line-bot/deploy/lib/python-bridge.js#L41) and [env.stub.cjs](file:///home/po-ch/wt/nasri-bom-survey-sync-n2-v2/nasri-line-bot/tests/env.stub.cjs#L9) to resolve root `mcp-bomsolar/server.py` directly.
  3. **Event Loop Timer Unref & Clean Exit**: Added `.unref()` to `app.js` interval timers (`_archiveTimer`, `_sessionTimer`) and ensured all test files call `process.exit(0)` on completion. Verified with 10s timeout execution.
- **Verification Evidence**:
  - `python3 -m pytest -q tests/`: **19 passed, 2 skipped** (`test_battery_matching` & `test_server_imports` skipped when mcp/sheets env omitted).
  - Node test suites (`timeout 10 node tests/test_app_load.cjs && timeout 10 node tests/test_bom_parser.cjs && timeout 10 node tests/test_bom_n2_integration.cjs`): **All passed in 0s** (7/7 unit, 6/6 integration E2E).

## Lessons Learned & Traps
1. **Un-unref'd Timers Keep Event Loop Alive**: `setInterval()` timers in top-level app modules will keep Node processes alive indefinitely unless `.unref()` is called or `process.exit()` is explicitly invoked in test harnesses.
2. **Module Re-export Integrity**: Upstream modules like `server.py` or `generate_pdf.py` rely on specific exported dataclasses and dicts (`SRPParams`, `PRICES_ATMOCE_DEFAULT`). Always verify `from module import ...` statements across the codebase when refactoring shared engines.
3. **Single Source of Truth**: Eliminating duplicate folders (`nasri-line-bot/deploy/mcp-bomsolar`) and resolving root scripts dynamically via `python-bridge.js` prevents subtle bugs caused by partial file updates.

## Path
`ψ/memory/retrospectives/2026-09-22_bom_survey_sync_n2_v2.md`
