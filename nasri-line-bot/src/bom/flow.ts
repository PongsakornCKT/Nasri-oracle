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

/** Handle "นัด" or "nasri" — start new BOM session directly. */
export async function handleStartBom(event: LineEvent): Promise<void> {
  const key = sessionKey(event.source);
  const existing = getSession(key);

  if (existing && existing.step !== "done") {
    await replyText(
      event.replyToken!,
      `มี BOM ค้างอยู่ครับ (${existing.data.project_name || "ยังไม่ตั้งชื่อ"})\n\nพิมพ์ "ยกเลิก" เพื่อเริ่มใหม่ หรือส่งข้อมูลต่อได้เลยครับ`
    );
    return;
  }

  startSession(key);
  await replyText(
    event.replyToken!,
    "รับครับ เริ่มสร้าง BOM 📋\n\nชื่อโปรเจกต์อะไรครับ?"
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

    case "done":
      return await stepDone(key, replyToken, text, lower);
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

  // Done adding items — save and show summary (no auto PDF)
  if (lower === "เสร็จ" || lower === "done" || lower === "จบ") {
    if (session.data.items.length === 0) {
      await replyText(replyToken, "เพิ่มอย่างน้อย 1 รายการครับ");
      return true;
    }
    session.step = "done";
    const summary = formatBomSummary(session.data);
    await replyText(
      replyToken,
      `${summary}\n\n✅ บันทึกแล้วครับ\n\nพิมพ์ "สร้าง pdf" เมื่อต้องการสร้าง PDF\nหรือ "แก้ไข" เพื่อกลับแก้ไข`
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

async function stepDone(
  key: string,
  replyToken: string,
  _text: string,
  lower: string
): Promise<boolean> {
  const session = updateSession(key, {});
  if (!session) return false;

  if (lower === "แก้ไข" || lower === "edit") {
    session.step = "add_items";
    await replyText(
      replyToken,
      `แก้ไขได้เลยครับ (${session.data.items.length} รายการ)\n\nเพิ่มรายการ หรือ "ลบ" / "เสร็จ"`
    );
    return true;
  }

  // If they start a new BOM, let it fall through
  return false;
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
