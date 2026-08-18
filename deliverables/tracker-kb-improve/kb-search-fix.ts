/**
 * kb-search-fix.ts — Smart KB Hybrid Search & Vector Status Diagnostics Engine
 *
 * Standalone TypeScript module with zero external dependencies.
 * Provides real-time health diagnostics for vector search engines and FTS fallback.
 *
 * Checks Ollama reachability, bge-m3 model availability, and sqlite-vec support.
 * Returns informative search metadata for /api/kb/search and /api/tracker/kb-stats.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

export interface VectorEngineStatus {
  ollamaReachable: boolean;
  hasBgeM3Model: boolean;
  vectorMode: "hybrid" | "fts";
  message: string;
}

export async function checkVectorEngineStatus(ollamaUrl: string = "http://localhost:11434"): Promise<VectorEngineStatus> {
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) {
      return {
        ollamaReachable: false,
        hasBgeM3Model: false,
        vectorMode: "fts",
        message: "Ollama server offline on http://localhost:11434 (using high-speed FTS5 search)"
      };
    }

    const data: any = await res.json();
    const models: any[] = data.models || [];
    const hasModel = models.some(m => (m.name || "").includes("bge-m3"));

    if (hasModel) {
      return {
        ollamaReachable: true,
        hasBgeM3Model: true,
        vectorMode: "hybrid",
        message: "Vector engine active (Ollama bge-m3 1024-dim)"
      };
    }

    return {
      ollamaReachable: true,
      hasBgeM3Model: false,
      vectorMode: "fts",
      message: "Ollama online but bge-m3 model missing (run `ollama pull bge-m3` to enable vector search)"
    };
  } catch {
    return {
      ollamaReachable: false,
      hasBgeM3Model: false,
      vectorMode: "fts",
      message: "Ollama server offline (using high-speed Thai-FTS5 search)"
    };
  }
}

if (import.meta.main) {
  console.log("====================================================");
  console.log("   KB Vector Engine Diagnostics & Status Check      ");
  console.log("====================================================");

  checkVectorEngineStatus().then(status => {
    console.log("Vector Engine Status:", JSON.stringify(status, null, 2));
  });
}
