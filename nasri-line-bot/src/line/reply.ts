/**
 * LINE Messaging API helpers — raw HTTP, no SDK dependency.
 */
import type { LineSendMessage, LineFlexContainer } from "./types.js";

const API_BASE = "https://api.line.me/v2/bot";

function headers(): Record<string, string> | null {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("[LINE] No ACCESS_TOKEN — skipping API call (dev mode)");
    return null;
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/** Reply to a webhook event (uses replyToken, free of charge). */
export async function reply(
  replyToken: string,
  messages: LineSendMessage[]
): Promise<void> {
  const h = headers();
  if (!h) {
    console.log(`[LINE reply] (dev) →`, JSON.stringify(messages.map((m) => m.type === "text" ? m.text : m.type)));
    return;
  }
  const res = await fetch(`${API_BASE}/message/reply`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[LINE reply] ${res.status}: ${body}`);
  }
}

/** Push message to a user/group (costs quota). */
export async function push(
  to: string,
  messages: LineSendMessage[]
): Promise<void> {
  const h = headers();
  if (!h) {
    console.log(`[LINE push] (dev) → ${to}:`, JSON.stringify(messages.map((m) => m.type === "text" ? m.text : m.type)));
    return;
  }
  const res = await fetch(`${API_BASE}/message/push`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[LINE push] ${res.status}: ${body}`);
  }
}

/** Send a simple text reply. */
export async function replyText(
  replyToken: string,
  text: string
): Promise<void> {
  await reply(replyToken, [{ type: "text", text }]);
}

/** Build a Flex Message bubble for the Nasri menu. */
export function buildMenuFlex(): LineSendMessage {
  const contents: LineFlexContainer = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "🏠 Nasri Butler",
          weight: "bold",
          size: "lg",
          color: "#1a1a2e",
        },
      ],
      backgroundColor: "#f0e68c",
      paddingAll: "16px",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "สวัสดีครับ ผม Nasri ยินดีให้บริการครับ",
          wrap: true,
          size: "sm",
        },
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: "สั่งงานได้เลยครับ:",
          margin: "md",
          size: "sm",
          weight: "bold",
        },
        {
          type: "text",
          text: '• "nasri สร้าง BOM" — สร้างใบ BOM',
          margin: "sm",
          size: "sm",
          wrap: true,
        },
        {
          type: "text",
          text: '• "nasri ค้นหา [คำค้น]" — ค้นหา BOM เดิม',
          margin: "sm",
          size: "sm",
          wrap: true,
        },
        {
          type: "text",
          text: '• "nasri ช่วย" — เมนูช่วยเหลือ',
          margin: "sm",
          size: "sm",
          wrap: true,
        },
      ],
      paddingAll: "16px",
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "Enervia Group • Powered by Oracle",
          size: "xxs",
          color: "#888888",
          align: "center",
        },
      ],
      paddingAll: "8px",
    },
  };

  return {
    type: "flex",
    altText: "Nasri Butler — เมนูช่วยเหลือ",
    contents,
  };
}
