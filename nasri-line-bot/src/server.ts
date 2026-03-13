/**
 * Nasri LINE OA Bot — Hono server on Bun
 *
 * Endpoints:
 *   POST /webhook           — LINE webhook receiver
 *   GET  /health            — Health check
 *   GET  /api/bom/download/:filename — Download generated BOM PDF
 */
import { Hono } from "hono";
import { logger } from "hono/logger";
import { join } from "path";
import { handleWebhook } from "./line/webhook.js";

const app = new Hono();

app.use("*", logger());

// Health check
app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "nasri-line-bot",
    timestamp: new Date().toISOString(),
  })
);

// LINE webhook
app.post("/webhook", handleWebhook);

// BOM PDF download
app.get("/api/bom/download/:filename", async (c) => {
  const filename = c.req.param("filename");

  // Prevent path traversal
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return c.json({ error: "Invalid filename" }, 400);
  }

  if (!filename.endsWith(".pdf")) {
    return c.json({ error: "Not a PDF" }, 400);
  }

  const filepath = join(
    process.env.ORACLE_REPO_ROOT ?? "C:/Users/pO-Ch/Nasri-oracle",
    "nasri-line-bot",
    "tmp",
    filename
  );

  const file = Bun.file(filepath);
  if (!(await file.exists())) {
    return c.json({ error: "File not found" }, 404);
  }

  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

// Root
app.get("/", (c) =>
  c.text("Nasri LINE Bot — At your service, sir.")
);

const port = Number(process.env.PORT) || 3500;

console.log(`
╔══════════════════════════════════════╗
║   🏠 Nasri LINE Bot                 ║
║   Port: ${String(port).padEnd(28)}║
║   At your service, sir.             ║
╚══════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
