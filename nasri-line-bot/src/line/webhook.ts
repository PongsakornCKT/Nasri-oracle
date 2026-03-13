/**
 * LINE Webhook handler — signature verification + event dispatch.
 */
import type { Context } from "hono";
import type { LineWebhookBody, LineEvent } from "./types.js";
import { replyText, reply, buildMenuFlex } from "./reply.js";
import { handleStartBom, handleBomMessage } from "../bom/flow.js";

/**
 * Verify LINE webhook signature using HMAC-SHA256.
 * Returns true if valid. Skips verification if secret is not set (dev mode).
 */
export async function verifySignature(
  body: string,
  signature: string | undefined
): Promise<boolean> {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    console.warn("[webhook] LINE_CHANNEL_SECRET not set — skipping verification (dev mode)");
    return true;
  }
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expected === signature;
}

/** Main webhook POST handler. */
export async function handleWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-line-signature");

  const valid = await verifySignature(rawBody, signature);
  if (!valid) {
    console.warn("[webhook] Invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body: LineWebhookBody = JSON.parse(rawBody);

  // Process events async — return 200 immediately (LINE requires fast response)
  processEvents(body.events).catch((err) =>
    console.error("[webhook] Error processing events:", err)
  );

  return c.json({ ok: true });
}

/** Process all events from webhook. */
async function processEvents(events: LineEvent[]): Promise<void> {
  for (const event of events) {
    if (event.type === "message" && event.message?.type === "text") {
      await handleTextMessage(event);
    }
  }
}

/** Handle a text message — check for "nasri" trigger or active BOM session. */
async function handleTextMessage(event: LineEvent): Promise<void> {
  const text = event.message?.text?.trim() ?? "";
  const lower = text.toLowerCase();
  const replyToken = event.replyToken;
  if (!replyToken) return;

  // If there's an active BOM session, route message to BOM flow first
  // (unless it's a new "nasri" command)
  const isNasriCommand = lower.includes("nasri");

  if (!isNasriCommand) {
    // Try BOM session handler (returns true if session was active and handled)
    const handled = await handleBomMessage(event);
    if (handled) return;
    // No active session and no "nasri" trigger — ignore
    return;
  }

  // "nasri" was mentioned — parse intent
  const sourceLabel =
    event.source.type === "group"
      ? `group:${event.source.groupId}`
      : `user:${event.source.userId}`;
  console.log(`[nasri] Triggered by ${sourceLabel}: "${text}"`);

  // BOM creation: "nasri สร้าง BOM" or "nasri create bom"
  if ((lower.includes("สร้าง") || lower.includes("create")) && lower.includes("bom")) {
    await handleStartBom(event);
    return;
  }

  // Search
  if (lower.includes("ค้นหา") || lower.includes("search")) {
    const query = text.replace(/nasri/i, "").replace(/ค้นหา|search/gi, "").trim();
    await replyText(
      replyToken,
      `ค้นหา "${query}" ให้ครับ...\n\n(ฟีเจอร์นี้กำลังพัฒนาครับ)`
    );
    return;
  }

  // Help
  if (lower.includes("ช่วย") || lower.includes("help") || lower.includes("เมนู")) {
    await reply(replyToken, [buildMenuFlex()]);
    return;
  }

  // Default: show menu
  await reply(replyToken, [buildMenuFlex()]);
}
