# Embedder Cold-Start Patch Guide (#EmbedderPatch)

**Target File**: `/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/embedder.ts`  
**Author**: Nasri Oracle — Right Hand of Ma'at 𓂀  
**Date**: 2026-08-11  

---

## 🎯 สรุปการแก้ไข

1. **ขยาย Timeout (`DEFAULT_TIMEOUT`) จาก 30s → 90s**:
   - ป้องกันการหลุด Timeout เมื่อ Ollama ต้อง Unload โมเดล LLM ขนาดใหญ่ (`wy-big` 18.5GB) ออกจาก VRAM เพื่อ Swap โมเดล `bge-m3` (1.1GB) เข้าสู่ GPU VRAM ในคำขอแรก
2. **เพิ่มฟังก์ชัน `warmUp(opts)` (120s Timeout)**:
   - ฟังก์ชันสำหรับส่งคำขอทดสอบสั้นๆ (`"oracle warmup ping"`) เพื่อกระตุ้นให้ Ollama โหลด `bge-m3` เข้า VRAM ล่วงหน้าก่อนเริ่มสแกนงาน batch
3. **เพิ่มกลไก Auto-Retry 1 ครั้งเมื่อได้ `null`**:
   - หาก `callEmbed` ส่งคืน `null` หรือเกิด Error จากจังหวะ VRAM Swap จะหน่วงเวลา 1,000ms แล้วลองใหม่อีก 1 ครั้งทันที

---

## 1. เปรียบเทียบ BEFORE / AFTER Diff

### (ก) ส่วนที่ 1: ปรับเพิ่ม `DEFAULT_TIMEOUT` (บรรทัดที่ 37)

```diff
<<<< BEFORE
const DEFAULT_URL = resolveOllamaUrl();
const DEFAULT_MODEL = "bge-m3";
const DEFAULT_TIMEOUT = 30_000;
====
const DEFAULT_URL = resolveOllamaUrl();
const DEFAULT_MODEL = "bge-m3";
// 90s: bge-m3 cold-load into VRAM can exceed 30s when swapping large models
const DEFAULT_TIMEOUT = 90_000;
>>>> AFTER
```

### (ข) ส่วนที่ 2: เพิ่มกลไก Retry 1 ครั้งใน `callEmbed` (บรรทัดที่ 89-114)

```diff
<<<< BEFORE
async function callEmbed(
  url: string,
  model: string,
  input: string,
  timeout: number
): Promise<number[] | null> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${url}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embeddings?: number[][] };
    const raw = data.embeddings?.[0];
    if (!raw || raw.length === 0) return null;
    if (raw.some((v) => !isFinite(v))) return null;
    return raw;
  } finally {
    clearTimeout(tid);
  }
}
====
async function callEmbedOnce(
  url: string,
  model: string,
  input: string,
  timeout: number
): Promise<number[] | null> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${url}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embeddings?: number[][] };
    const raw = data.embeddings?.[0];
    if (!raw || raw.length === 0) return null;
    if (raw.some((v) => !isFinite(v))) return null;
    return raw;
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

async function callEmbed(
  url: string,
  model: string,
  input: string,
  timeout: number
): Promise<number[] | null> {
  // Attempt 1
  let res = await callEmbedOnce(url, model, input, timeout);
  if (res) return res;

  // Retry once after 1s delay (handles transient VRAM swap stalls)
  await new Promise((r) => setTimeout(r, 1000));
  return await callEmbedOnce(url, model, input, timeout);
}
>>>> AFTER
```

### (ค) ส่วนที่ 3: เพิ่มฟังก์ชัน `warmUp` สำหรับเรียกใช้งานภายนอก (บรรทัดที่ 188)

```diff
<<<< BEFORE
  return results;
}
====
  return results;
}

/**
 * Pre-warm bge-m3 model in Ollama VRAM before running batch jobs.
 * Waits up to 120s (120,000ms) for VRAM swap completion.
 */
export async function warmUp(opts: EmbedderOptions = {}): Promise<boolean> {
  console.log("[embedder] Warming up Ollama bge-m3 in VRAM (up to 120s)...");
  const t0 = Date.now();
  const vec = await embedText("oracle warmup ping", { ...opts, timeout: 120_000 });
  if (vec) {
    console.log(`[embedder] Warm-up successful in ${Date.now() - t0}ms (dim: ${vec.length})`);
    return true;
  }
  console.warn("[embedder] Warm-up ping returned null or timed out.");
  return false;
}
>>>> AFTER
```

---

## 📋 วิธีนำ Patch ไปใช้งานและทดสอบ

```bash
# 1. นำไฟล์ embedder-updated.ts วางทับ scripts/knowledge/embedder.ts
cp deliverables/kb-phase2/embedder-updated.ts "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/embedder.ts"

# 2. รันเทส warmUp() ผ่าน Bun
cd "/mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2"
bun -e '
import { warmUp } from "./scripts/knowledge/embedder";
await warmUp();
'

# Expected Output:
# [embedder] Warming up Ollama bge-m3 in VRAM (up to 120s)...
# [embedder] Warm-up successful in 342ms (dim: 1024)
```
