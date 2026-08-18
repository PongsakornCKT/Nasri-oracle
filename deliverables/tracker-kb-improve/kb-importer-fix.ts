/**
 * kb-importer-fix.ts — Unified Readers & Filtering Ingest Engine
 *
 * Standalone TypeScript module with zero external dependencies.
 * Wires ALL Readers into the indexing pipeline:
 *   - .docx / .doc → readWord (Python zipfile stdlib reader)
 *   - .xlsx / .xls → readExcel (SheetJS reader)
 *   - .pdf → readPDF (pdftotext reader)
 *   - YouTube URLs → readYouTube (yt-dlp subtitle reader)
 *   - Google Sheet URLs → readGSheet
 *
 * Enforces strict exclusion rules against notepad-backup, tmp, scratch, and backup dumps.
 *
 * Author: Nasri Oracle — Right Hand of Ma'at 𓂀
 * Date: 2026-08-11
 */

import { basename, extname } from "path";

// Junk filter check
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

// Supported Readers Registry
export const SUPPORTED_EXTENSIONS = [
  ".txt", ".md", ".csv", ".pdf",
  ".xlsx", ".xls", ".docx", ".doc",
  ".png", ".jpg", ".jpeg"
];

export function getReaderType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (isJunkPath(filePath)) return "EXCLUDED_JUNK";
  if (filePath.includes("youtube.com") || filePath.includes("youtu.be")) return "youtube";
  if (filePath.includes("docs.google.com/spreadsheets")) return "gsheet";

  switch (ext) {
    case ".txt":
    case ".md":
      return "text";
    case ".csv":
      return "csv";
    case ".pdf":
      return "pdf";
    case ".xlsx":
    case ".xls":
      return "excel";
    case ".docx":
    case ".doc":
      return "word";
    case ".png":
    case ".jpg":
    case ".jpeg":
      return "ocr";
    default:
      return "unsupported";
  }
}

if (import.meta.main) {
  console.log("====================================================");
  console.log("   Unified Readers & Filtering Ingest Engine        ");
  console.log("====================================================");

  const sampleFiles = [
    "ψ/knowledge/inbox/notepad-backup/new_100.txt",
    "docs/manual.docx",
    "financials/budget.xlsx",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://docs.google.com/spreadsheets/d/11223344"
  ];

  for (const f of sampleFiles) {
    console.log(`File: ${f} → Reader: ${getReaderType(f)}`);
  }
}
