---
type: learning
date: 2026-03-14
source: session-6
concepts: [google-sheets, csv, api, no-auth]
---

# Google Sheets CSV Export (No API Key)

## Pattern
Published Google Sheets can be read as CSV without OAuth or API key:
```
https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&gid={GID}
```

## Discover sheet GIDs
Parse from `/htmlview` HTML source:
```bash
curl -sL "https://docs.google.com/spreadsheets/d/{ID}/htmlview" | grep -oP 'name: "[^"]*"'
curl -sL "..." | grep -oP 'gid=\d+' | sort -u
```

## Price extraction gotcha
Some sheets embed "ราคา" in the first column header (which is a title, not a price column).
Fix: prioritize columns where header is SHORT (<30 chars) and contains "฿" symbol.

## Cache
30-second TTL = good balance for near-real-time sync without hammering Google.
