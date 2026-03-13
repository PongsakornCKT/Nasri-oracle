/**
 * BOM conversation flow handler.
 * Processes user messages based on current session step.
 */
import type { LineEvent, LineSendMessage, LineFlexContainer } from "../line/types.js";
import { replyText, reply } from "../line/reply.js";
import {
  sessionKey,
  getSession,
  startSession,
  updateSession,
  endSession,
  parseItemFromText,
} from "./session.js";
import { generateBomPdf, formatBomSummary } from "./generate.js";

/** Handle "nasri สร้าง BOM" — start new session. */
export async function handleStartBom(event: LineEvent): Promise<void> {
  const key = sessionKey(event.source);
  const existing = getSession(key);

  if (existing && existing.step !== "generating") {
    await replyText(
      event.replyToken!,
      `มี BOM ค้างอยู่ครับ (${existing.data.project_name || "ยังไม่ตั้งชื่อ"})\n\nพิมพ์ "ยกเลิก" เพื่อเริ่มใหม่ หรือส่งข้อมูลต่อได้เลยครับ`
    );
    return;
  }

  startSession(key);
  await replyText(
    event.replyToken!,
    "รับครับ เริ่มสร้าง BOM นะครับ 📋\n\nชื่อโปรเจกต์อะไรครับ?"
  );
}

/** Handle any message when a BOM session is active. Returns true if handled. */
export async function handleBomMessage(event: LineEvent): Promise<boolean> {
  const key = sessionKey(event.source);
  const session = getSession(key);
  if (!session) return false;

  const text = event.message?.text?.trim() ?? "";
  const lower = text.toLowerCase();
  const replyToken = event.replyToken;
  if (!replyToken) return false;

  // Cancel command — works at any step
  if (lower === "ยกเลิก" || lower === "cancel") {
    endSession(key);
    await replyText(replyToken, "ยกเลิกเรียบร้อยครับ 🙏");
    return true;
  }

  switch (session.step) {
    case "project_name":
      return await stepProjectName(key, replyToken, text);

    case "project_address":
      return await stepProjectAddress(key, replyToken, text);

    case "add_items":
      return await stepAddItems(key, replyToken, text, lower);

    case "confirm":
      return await stepConfirm(key, replyToken, text, lower, event);

    case "generating":
      await replyText(replyToken, "กำลังสร้าง PDF อยู่ครับ กรุณารอสักครู่...");
      return true;
  }

  return false;
}

// ─── Step Handlers ───────────────────────────────────────────

async function stepProjectName(
  key: string,
  replyToken: string,
  text: string
): Promise<boolean> {
  const session = updateSession(key, {});
  if (!session) return false;

  session.data.project_name = text;
  session.step = "project_address";

  await replyText(
    replyToken,
    `โปรเจกต์: ${text} ✓\n\nที่อยู่โปรเจกต์ครับ?`
  );
  return true;
}

async function stepProjectAddress(
  key: string,
  replyToken: string,
  text: string
): Promise<boolean> {
  const session = updateSession(key, {});
  if (!session) return false;

  session.data.project_address = text;
  session.step = "add_items";

  await reply(replyToken, [buildAddItemsMessage()]);
  return true;
}

async function stepAddItems(
  key: string,
  replyToken: string,
  text: string,
  lower: string
): Promise<boolean> {
  const session = updateSession(key, {});
  if (!session) return false;

  // Done adding items
  if (lower === "เสร็จ" || lower === "done" || lower === "จบ") {
    if (session.data.items.length === 0) {
      await replyText(replyToken, "ยังไม่มีรายการครับ กรุณาเพิ่มอย่างน้อย 1 รายการ");
      return true;
    }
    session.step = "confirm";
    const summary = formatBomSummary(session.data);
    await replyText(
      replyToken,
      `${summary}\n\nพิมพ์ "ยืนยัน" เพื่อสร้าง PDF\nหรือ "แก้ไข" เพื่อเพิ่ม/ลบรายการ`
    );
    return true;
  }

  // Remove last item
  if (lower === "ลบ" || lower === "undo") {
    const removed = session.data.items.pop();
    if (removed) {
      await replyText(
        replyToken,
        `ลบ "${removed.part_name}" แล้วครับ\nเหลือ ${session.data.items.length} รายการ`
      );
    } else {
      await replyText(replyToken, "ไม่มีรายการให้ลบครับ");
    }
    return true;
  }

  // Try to parse item
  const item = parseItemFromText(text);
  if (item) {
    session.data.items.push(item);
    const n = session.data.items.length;
    await replyText(
      replyToken,
      `✓ เพิ่มแล้ว: ${item.part_name} x${item.quantity} = ฿${item.total_cost.toLocaleString()}\n(รวม ${n} รายการ)\n\nเพิ่มอีก หรือพิมพ์ "เสร็จ"`
    );
    return true;
  }

  // Couldn't parse
  await replyText(
    replyToken,
    `ไม่เข้าใจรูปแบบครับ 🙏\n\nลองพิมพ์แบบนี้:\nSolar Panel, Trina, 220, 2423\n\nหรือ:\nSolar Panel 220 ชิ้น 2423 บาท\n\n(ชื่อ, ผู้ผลิต, จำนวน, ราคา/หน่วย)`
  );
  return true;
}

async function stepConfirm(
  key: string,
  replyToken: string,
  text: string,
  lower: string,
  event: LineEvent
): Promise<boolean> {
  const session = updateSession(key, {});
  if (!session) return false;

  if (lower === "ยืนยัน" || lower === "confirm" || lower === "ok") {
    session.step = "generating";
    await replyText(replyToken, "กำลังสร้าง PDF ครับ... 📄");

    // Generate PDF async, then push result
    generateAndSend(key, session.data, event.source).catch((err) => {
      console.error("[bom] PDF generation error:", err);
    });
    return true;
  }

  if (lower === "แก้ไข" || lower === "edit") {
    session.step = "add_items";
    await replyText(
      replyToken,
      `กลับมาแก้ไขรายการครับ\nตอนนี้มี ${session.data.items.length} รายการ\n\nเพิ่มรายการ หรือพิมพ์ "ลบ" เพื่อลบรายการล่าสุด`
    );
    return true;
  }

  await replyText(
    replyToken,
    'พิมพ์ "ยืนยัน" เพื่อสร้าง PDF หรือ "แก้ไข" เพื่อกลับไปแก้ไขครับ'
  );
  return true;
}

// ─── PDF Generation + Delivery ───────────────────────────────

async function generateAndSend(
  key: string,
  data: import("./types.js").BomData,
  source: LineEvent["source"]
): Promise<void> {
  const { push } = await import("../line/reply.js");
  const to = source.type === "group" ? source.groupId! : source.userId!;

  try {
    const pdfPath = await generateBomPdf(data);

    // Build download URL (when deployed, serve from /tmp/ or upload somewhere)
    // For now, notify with path. In production, upload to cloud storage or serve via the Hono server.
    const filename = pdfPath.split(/[/\\]/).pop();

    await push(to, [
      {
        type: "text",
        text: `✅ BOM PDF สร้างเสร็จแล้วครับ!\n\n📄 ${data.project_name}\n📦 ${data.items.length} รายการ\n💰 ฿${data.items.reduce((s, i) => s + i.total_cost, 0).toLocaleString()}\n\nดาวน์โหลด: /api/bom/download/${filename}`,
      },
    ]);

    endSession(key);
  } catch (err: any) {
    console.error("[bom] Generation failed:", err);
    await push(to, [
      {
        type: "text",
        text: `❌ สร้าง PDF ไม่สำเร็จครับ\n\nError: ${err.message}\n\nลองใหม่ได้ด้วย "nasri สร้าง BOM"`,
      },
    ]);
    endSession(key);
  }
}

// ─── Flex Messages ───────────────────────────────────────────

function buildAddItemsMessage(): LineSendMessage {
  const contents: LineFlexContainer = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "📦 เพิ่มรายการ BOM",
          weight: "bold",
          size: "md",
          color: "#1a1a2e",
        },
      ],
      backgroundColor: "#f0e68c",
      paddingAll: "12px",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "พิมพ์รายการในรูปแบบ:",
          size: "sm",
          wrap: true,
        },
        {
          type: "text",
          text: "ชื่อ, ผู้ผลิต, จำนวน, ราคา",
          size: "sm",
          weight: "bold",
          margin: "sm",
          wrap: true,
        },
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: "ตัวอย่าง:",
          margin: "md",
          size: "xs",
          color: "#888888",
        },
        {
          type: "text",
          text: "Solar Panel, Trina, 220, 2423",
          margin: "sm",
          size: "xs",
          color: "#888888",
          wrap: true,
        },
        {
          type: "text",
          text: "Micro Inverter, ATMOCE, 110, 5630",
          margin: "sm",
          size: "xs",
          color: "#888888",
          wrap: true,
        },
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: "คำสั่ง:",
          margin: "md",
          size: "xs",
          weight: "bold",
        },
        {
          type: "text",
          text: '• "เสร็จ" — จบการเพิ่ม → สรุป\n• "ลบ" — ลบรายการล่าสุด\n• "ยกเลิก" — ยกเลิก BOM',
          margin: "sm",
          size: "xs",
          wrap: true,
        },
      ],
      paddingAll: "12px",
    },
  };

  return {
    type: "flex",
    altText: "เพิ่มรายการ BOM — พิมพ์: ชื่อ, ผู้ผลิต, จำนวน, ราคา",
    contents,
  };
}
