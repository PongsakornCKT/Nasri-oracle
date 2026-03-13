---
title: # Skill: maw-js Performance Optimization (2026-03-13)
tags: [performance, deduplication, ssh, websocket, async-io, tmux, bun, maw-js, n+1-query, capture-polling]
created: 2026-03-13
source: engineering-optimization session 2026-03-13
---

# # Skill: maw-js Performance Optimization (2026-03-13)

# Skill: maw-js Performance Optimization (2026-03-13)

## Problem Pattern: N×SSH Capture Calls
When multiple WebSocket clients subscribe to the same tmux target, the naive implementation calls `capture()` N times per interval — one per client. With 5 clients and 200ms SSH latency, this creates 100 SSH calls/sec.

## Fix: Capture Deduplication (engine.ts)
Group clients by target → one `capture()` per unique target → fan-out result to all clients.

```typescript
private async runCaptureRound(): Promise<void> {
  const targetClients = new Map<string, MawWS[]>();
  for (const ws of this.clients) {
    if (!ws.data.target) continue;
    const arr = targetClients.get(ws.data.target) ?? [];
    arr.push(ws);
    targetClients.set(ws.data.target, arr);
  }
  await Promise.allSettled(
    [...targetClients.entries()].map(async ([target, clients]) => {
      const content = await capture(target, 80);
      for (const ws of clients) {
        const prev = this.lastContent.get(ws);
        if (content !== prev) {
          this.lastContent.set(ws, content);
          ws.send(JSON.stringify({ type: "capture", target, content }));
        }
      }
    })
  );
}
```
Use in interval: `setInterval(() => { this.runCaptureRound(); }, 50);`

Same pattern applies to preview targets across clients (`runPreviewRound()`).

## Fix: Single-call tmux listSessions (ssh.ts)
Old: N+1 SSH calls (1 for session list + 1 per session for windows)
New: One `tmux list-windows -a` call with tab separator

```typescript
const raw = await ssh(
  "tmux list-windows -a -F '#{session_name}\t#{window_index}\t#{window_name}\t#{window_active}' 2>/dev/null",
  host
);
```
Parse with `line.split("\t")` — safer than colon (window names may contain colons).

## Fix: Async File I/O in FeedTailer (feed-tail.ts)
Replace `statSync/openSync/readSync/closeSync` with `stat/open` from `node:fs/promises`.
Use `setTimeout` recursion instead of `setInterval` for async poll — prevents overlapping I/O.

```typescript
const schedule = () => {
  this.timer = setTimeout(async () => {
    await this.poll();
    if (this.timer !== null) schedule();
  }, POLL_MS);
};
```

## Principles Applied
- **Batch before broadcast**: Collect unique work units → do work once → fan out
- **N+1 query pattern**: Same as SQL N+1 — always check if a loop hides sequential calls
- **Async I/O in hot paths**: Sync I/O in interval callbacks blocks the entire event loop
- **setInterval vs setTimeout recursion**: For async poll functions, setTimeout recursion prevents overlap


---
*Added via Oracle Learn*
