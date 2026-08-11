/**
 * ingest-updated.ts — Unified Multi-Format File Reader & Ingest Engine
 *
 * Target File: /mnt/c/Users/pO-Ch/Documents/GitHub/pa-Oracle v2/scripts/knowledge/ingest.ts
 *
 * Features:
 *   - Wires all Readers: Word (.docx), Excel (.xlsx), PDF (.pdf), YouTube, GSheet
 *   - Strict Exclusion Filter against notepad-backup, tmp, scratch, and backup-restore
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { resolve, extname, basename, join } from "path";
import { existsSync } from "fs";
import { indexChunks, type Chunk } from "./indexer";
import { readPDF } from "./readers/pdf";
import { readExcel } from "./readers/excel";
import { read as readWordFile } from "./readers/word";
import { readYouTube } from "./readers/youtube";
import { readGSheet } from "./readers/gsheet";
import { readWeb } from "./readers/web";
import { ocrImage } from "./readers/ocr";
import { chunkText, chunkExcelRows } from "./chunker";

/** Junk path exclusion check */
export function isJunkPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  const JUNK_PATTERNS = [
    "/notepad-backup/",
    "/tmp/",
    "/scratch/",
    "/backup-restore/",
    "~$",
    ".tmp"
  ];
  return JUNK_PATTERNS.some(p => normalized.includes(p));
}

function detectLanguage(text: string): string {
  const thaiPattern = /[\u0E00-\u0E7F]/;
  const englishPattern = /[a-zA-Z]/;
  const hasThai = thaiPattern.test(text);
  const hasEnglish = englishPattern.test(text);
  if (hasThai && hasEnglish) return "mixed";
  if (hasThai) return "th";
  return "en";
}

async function readTextFileAsync(filePath: string): Promise<Chunk[]> {
  const text = await Bun.file(filePath).text();
  const fileName = basename(filePath);
  const ext = extname(filePath).slice(1);

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return paragraphs.map((paragraph, index) => ({
    source: filePath,
    source_type: ext,
    title: fileName,
    content: paragraph,
    language: detectLanguage(paragraph),
    tags: [],
    chunk_index: index,
    metadata: { paragraphs: paragraphs.length },
  }));
}

async function readCsvFile(filePath: string): Promise<Chunk[]> {
  const text = await Bun.file(filePath).text();
  const fileName = basename(filePath);
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = lines[0];
  const rows = lines.slice(1);

  return rows.map((row, index) => ({
    source: filePath,
    source_type: "csv",
    title: fileName,
    content: `${header}\n${row}`,
    language: detectLanguage(row),
    tags: [],
    chunk_index: index,
    metadata: { row: index + 1, total_rows: rows.length },
  }));
}

async function readPdfFile(filePath: string): Promise<Chunk[]> {
  const result = await readPDF(filePath);
  if (!result.content) return [];
  const chunks = chunkText(result.content, { source_type: "pdf" });
  return chunks.map((c) => ({
    source: filePath,
    source_type: "pdf",
    title: result.title,
    content: c.content,
    language: c.metadata.language as string,
    tags: [],
    chunk_index: c.chunk_index,
    metadata: { ...result.metadata, ...c.metadata },
  }));
}

async function readExcelFile(filePath: string): Promise<Chunk[]> {
  const result = await readExcel(filePath);
  const allChunks: Chunk[] = [];
  for (const sheet of result.sheets) {
    const chunks = chunkExcelRows(sheet.rows, sheet.headers);
    for (const c of chunks) {
      allChunks.push({
        source: filePath,
        source_type: "excel",
        title: `${result.title} — ${sheet.name}`,
        content: c.content,
        language: c.metadata.language as string,
        tags: [],
        chunk_index: allChunks.length,
        metadata: { ...result.metadata, sheet: sheet.name, ...c.metadata },
      });
    }
  }
  return allChunks;
}

async function readWordFileWrapped(filePath: string): Promise<Chunk[]> {
  const result = await readWordFile(filePath);
  if (!result.chunks || result.chunks.length === 0) return [];
  return result.chunks.map((c, i) => ({
    source: filePath,
    source_type: "word",
    title: result.title || basename(filePath),
    content: c.content,
    language: detectLanguage(c.content),
    tags: result.tags || [],
    chunk_index: i,
    metadata: {},
  }));
}

async function readImageFile(filePath: string): Promise<Chunk[]> {
  const result = await ocrImage(filePath);
  if (!result.text || result.text.length === 0) return [];
  const chunks = chunkText(result.text, { source_type: "text" });
  return chunks.map((c) => ({
    source: filePath,
    source_type: "image",
    title: basename(filePath).replace(/\.\w+$/, ""),
    content: c.content,
    language: c.metadata.language as string,
    tags: ["ocr"],
    chunk_index: c.chunk_index,
    metadata: {
      ...c.metadata,
      ocr: true,
      ocr_method: result.method,
      ocr_confidence: result.confidence,
    },
  }));
}

const READERS: Record<string, (path: string) => Promise<Chunk[]>> = {
  ".txt": readTextFileAsync,
  ".md": readTextFileAsync,
  ".csv": readCsvFile,
  ".pdf": readPdfFile,
  ".xlsx": readExcelFile,
  ".xls": readExcelFile,
  ".docx": readWordFileWrapped,
  ".doc": readWordFileWrapped,
  ".png": readImageFile,
  ".jpg": readImageFile,
  ".jpeg": readImageFile,
};

/** Ingest a single file or URL */
export async function ingestFile(filePath: string): Promise<{ inserted: number; skipped: number }> {
  if (isJunkPath(filePath)) {
    console.log(`[ingest] Excluded junk file: ${filePath}`);
    return { inserted: 0, skipped: 1 };
  }

  // Handle YouTube URL
  if (filePath.includes("youtube.com") || filePath.includes("youtu.be")) {
    const res = await readYouTube(filePath);
    const chunks: Chunk[] = res.chunks.map((c, i) => ({
      source: filePath, source_type: "youtube", title: res.title, content: c.content,
      language: detectLanguage(c.content), tags: ["youtube"], chunk_index: i, metadata: {}
    }));
    return await indexChunks(chunks);
  }

  // Handle Google Sheet URL
  if (filePath.includes("docs.google.com/spreadsheets")) {
    const res = await readGSheet(filePath);
    const chunks: Chunk[] = res.chunks.map((c, i) => ({
      source: filePath, source_type: "gsheet", title: res.title, content: c.content,
      language: detectLanguage(c.content), tags: ["gsheet"], chunk_index: i, metadata: {}
    }));
    return await indexChunks(chunks);
  }

  const absPath = resolve(process.cwd(), filePath);
  const ext = extname(absPath).toLowerCase();

  if (!existsSync(absPath)) {
    console.error(`[ingest] File not found: ${absPath}`);
    return { inserted: 0, skipped: 0 };
  }

  const reader = READERS[ext];
  if (reader) {
    const chunks = await reader(absPath);
    if (chunks.length === 0) return { inserted: 0, skipped: 0 };
    return await indexChunks(chunks);
  }

  console.log(`[ingest] Unsupported file format (${ext}): ${filePath}`);
  return { inserted: 0, skipped: 0 };
}
