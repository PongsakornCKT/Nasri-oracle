---
name: MCP restart timing + CJS function collision
description: Two recurring traps in Nasri development — stale MCP processes and JS function shadowing
type: feedback
---

## MCP Restart Timing
Code changes to a running MCP server (stdio process) only take effect after the MCP is restarted.
Adding code AFTER a restart means the new code is NOT live yet.
**Rule**: always restart MCP AFTER the last code change, not before.
**How to apply**: when tests show stale behaviour (old items, missing items), check if code was changed post-restart before debugging logic.

**Why**: Sigenergy EC inverter fix was correct but appeared broken for a full session because MCP restarted before the EC fix was added.

## CJS Function Name Collision
In Node.js CJS, declaring `function foo()` twice in the same file — the latter declaration wins silently.
**Rule**: before adding a new helper function, `grep` the file for the name first.
**How to apply**: `grep "function priceSearch\|function searchCatalog" deploy/app.js` before adding.

**Why**: `searchCatalog(query)` shadowed the existing `searchCatalog(catalog, query)`, breaking price lookups silently — no error, just wrong function called.

## LINE Bot Function Name Reference
- All-sheets fetch: `getCatalog()` (NOT `fetchAllSheets()`)
- Single sheet: `fetchSheet(gid)`
- Price extraction: `extractPrice(row)`
- Catalog search: `searchCatalog(catalog, query)` (takes 2 args)
