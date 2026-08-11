/**
 * embedder-updated.ts — KB Phase 02 Embedder with Cold-Start Protection & Warm-up Ping
 *
 * Target File: /mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/embedder.ts
 *
 * Changes:
 *   - DEFAULT_TIMEOUT increased from 30s → 90s (90_000ms) to prevent Cold-Start VRAM swap timeouts
 *   - Added warmupOllama() function to pre-load bge-m3 into GPU VRAM before batch vectorization
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

export interface EmbedderOptions {
  /** Default: http://localhost:11434 */
  ollamaUrl?: string;
  /** Default: bge-m3 */
  model?: string;
  /** Timeout in ms. Default: 90_000 (90 seconds) */
  timeout?: number;
}

/**
 * Resolve Ollama URL — checks in order:
 *   1. OLLAMA_HOST env var
 *   2. WSL2 Windows host via /etc/resolv.conf nameserver
 *   3. localhost:11434 (Linux/native)
 */
function resolveOllamaUrl(): string {
  if (process.env.OLLAMA_HOST) return process.env.OLLAMA_HOST;
  try {
    const resolv = require("fs").readFileSync("/etc/resolv.conf", "utf8");
    const match = resolv.match(/nameserver\s+([\d.]+)/);
    if (match) return `http://${match[1]}:11434`;
  } catch { /* not WSL2 or no resolv.conf */ }
  return "http://localhost:11434";
}

const DEFAULT_URL = resolveOllamaUrl();
const DEFAULT_MODEL = "bge-m3";
const DEFAULT_TIMEOUT = 90_000; // Increased to 90s for Cold-Start resilience

/** Normalize text for embedding */
function normalizeText(text: string): string {
  let result = text;
  result = result.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
  result = result.replace(/\u0E4D\u0E32/g, "\u0E33");
  result = result.replace(/\s+/g, " ").trim();
  const thaiRatio = (result.match(/[\u0E00-\u0E7F]/g) ?? []).length / Math.max(result.length, 1);
  const charLimit = thaiRatio > 0.3 ? 12000 : thaiRatio > 0.1 ? 10000 : 16000;
  return result.slice(0, charLimit);
}

/** Check if Ollama is reachable and the model is available */
export async function checkOllama(ollamaUrl = DEFAULT_URL): Promise<{
  reachable: boolean;
  hasModel: boolean;
  model: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
      if (!res.ok) return { reachable: false, hasModel: false, model: DEFAULT_MODEL };
      const data = (await res.json()) as { models?: { name: string }[] };
      const models = data.models ?? [];
      const hasModel = models.some(
        (m) => m.name === DEFAULT_MODEL || m.name.startsWith("bge-m3")
      );
      return { reachable: true, hasModel, model: DEFAULT_MODEL };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { reachable: false, hasModel: false, model: DEFAULT_MODEL };
  }
}

/** Low-level: call /api/embed once */
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

function averageVectors(vecs: number[][]): Float32Array {
  const dim = vecs[0].length;
  const avg = new Float32Array(dim);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) avg[i] += v[i];
  }
  const n = vecs.length;
  for (let i = 0; i < dim; i++) avg[i] /= n;
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += avg[i] * avg[i];
  norm = Math.sqrt(norm) + 1e-8;
  for (let i = 0; i < dim; i++) avg[i] /= norm;
  return avg;
}

/** Embed a single text using Ollama bge-m3 */
export async function embedText(
  text: string,
  opts: EmbedderOptions = {}
): Promise<Float32Array | null> {
  const url = opts.ollamaUrl ?? DEFAULT_URL;
  const model = opts.model ?? DEFAULT_MODEL;
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const normalized = normalizeText(text);
  if (!normalized) return null;

  try {
    const raw = await callEmbed(url, model, normalized, timeout);
    if (raw) return new Float32Array(raw);

    const WINDOW = 150;
    const windows: string[] = [];
    for (let i = 0; i < normalized.length; i += WINDOW) {
      windows.push(normalized.slice(i, i + WINDOW));
    }
    const successful: number[][] = [];
    for (const w of windows) {
      const wRaw = await callEmbed(url, model, w, timeout);
      if (wRaw) successful.push(wRaw);
    }
    if (successful.length > 0) {
      return averageVectors(successful);
    }

    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isConnectionError =
      msg.includes("abort") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("fetch") ||
      msg.includes("Unable to connect") ||
      msg.includes("Connection refused");
    if (!isConnectionError) {
      console.warn(`[embedder] Unexpected error: ${msg}`);
    }
    return null;
  }
}

/** Pre-warm bge-m3 model in VRAM before running batch jobs */
export async function warmupOllama(opts: EmbedderOptions = {}): Promise<boolean> {
  console.log("[embedder] Pre-warming Ollama bge-m3 in VRAM (90s max timeout)...");
  const t0 = Date.now();
  const vec = await embedText("oracle warmup ping", { ...opts, timeout: 90_000 });
  if (vec) {
    console.log(`[embedder] Warm-up successful in ${Date.now() - t0}ms (vector dim: ${vec.length})`);
    return true;
  }
  console.warn("[embedder] Warm-up failed or timed out.");
  return false;
}

/** Embed a batch of texts */
export async function embedBatch(
  texts: string[],
  opts: EmbedderOptions = {},
  onProgress?: (done: number, total: number) => void
): Promise<(Float32Array | null)[]> {
  const results: (Float32Array | null)[] = [];
  for (let i = 0; i < texts.length; i++) {
    results.push(await embedText(texts[i], opts));
    onProgress?.(i + 1, texts.length);
    if (i < texts.length - 1) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  return results;
}

export function serializeEmbedding(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function deserializeEmbedding(blob: Buffer | Uint8Array): Float32Array {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}
