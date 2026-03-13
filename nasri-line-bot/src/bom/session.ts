/**
 * BOM conversation session manager.
 * Tracks per-group/user conversation state in-memory.
 * Sessions timeout after 30 minutes of inactivity.
 */
import type { BomData, BomItem, BomStep, BomCategory } from "./types.js";

export interface BomSession {
  id: string;
  step: BomStep;
  data: BomData;
  createdAt: number;
  updatedAt: number;
}

/** In-memory session store. Key = groupId or userId. */
const sessions = new Map<string, BomSession>();

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

/** Get session key from LINE source. */
export function sessionKey(source: {
  type: string;
  groupId?: string;
  userId?: string;
}): string {
  return source.type === "group"
    ? `group:${source.groupId}`
    : `user:${source.userId}`;
}

/** Get active session (returns null if expired or nonexistent). */
export function getSession(key: string): BomSession | null {
  const s = sessions.get(key);
  if (!s) return null;
  if (Date.now() - s.updatedAt > SESSION_TIMEOUT_MS) {
    sessions.delete(key);
    return null;
  }
  return s;
}

/** Start a new BOM session. */
export function startSession(key: string): BomSession {
  const now = Date.now();
  const session: BomSession = {
    id: `bom-${now}`,
    step: "project_name",
    data: {
      company_name: "Enervia Group co.,ltd",
      project_name: "",
      project_address: "",
      order_date: new Date().toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }),
      notes: "",
      items: [],
    },
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(key, session);
  return session;
}

/** Update session and touch timestamp. */
export function updateSession(key: string, update: Partial<BomSession>): BomSession | null {
  const s = sessions.get(key);
  if (!s) return null;
  Object.assign(s, update, { updatedAt: Date.now() });
  return s;
}

/** End/remove a session. */
export function endSession(key: string): void {
  sessions.delete(key);
}

/** Parse a text message into a BOM item. Supports flexible Thai/English input.
 *
 * Accepted formats:
 *   "Solar Panel, Trina, 220, 2423"          → name, manufacturer, qty, unit_cost
 *   "Solar Panel / Trina / 220 / 2423"
 *   "Solar Panel 220 ชิ้น 2423 บาท"          → name, qty, unit_cost (loose)
 */
export function parseItemFromText(text: string): BomItem | null {
  // Try CSV/slash-separated: name, manufacturer, qty, unit_cost
  const sep = text.includes("/") ? "/" : ",";
  const parts = text.split(sep).map((s) => s.trim());

  if (parts.length >= 3) {
    const name = parts[0];
    const manufacturer = parts.length >= 4 ? parts[1] : "";
    const qtyStr = parts.length >= 4 ? parts[2] : parts[1];
    const costStr = parts.length >= 4 ? parts[3] : parts[2];

    const qty = parseNumber(qtyStr);
    const cost = parseNumber(costStr);

    if (qty > 0 && cost >= 0) {
      return {
        part_number: "",
        part_name: name,
        manufacturer,
        category: guessCategory(name),
        quantity: qty,
        unit_cost: cost,
        total_cost: qty * cost,
        notes: "",
      };
    }
  }

  // Try loose format: find numbers in text
  const numbers = text.match(/[\d,]+\.?\d*/g)?.map((n) => parseFloat(n.replace(/,/g, ""))) ?? [];
  const namepart = text.replace(/[\d,]+\.?\d*/g, "")
    .replace(/ชิ้น|บาท|หน่วย|pcs|thb|฿/gi, "")
    .trim();

  if (namepart && numbers.length >= 2) {
    const qty = numbers[0];
    const cost = numbers[1];
    return {
      part_number: "",
      part_name: namepart,
      manufacturer: "",
      category: guessCategory(namepart),
      quantity: qty,
      unit_cost: cost,
      total_cost: qty * cost,
      notes: "",
    };
  }

  return null;
}

function parseNumber(s: string): number {
  const n = parseFloat(s.replace(/[,฿บาท\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

/** Guess BOM category from item name. */
function guessCategory(name: string): BomCategory {
  const lower = name.toLowerCase();
  if (/panel|module|โมดูล|แผง/i.test(lower)) return "โมดูล";
  if (/inverter|อินเวอร์เตอร์/i.test(lower)) return "อินเวอร์เตอร์";
  if (/cable|สาย|wire/i.test(lower)) return "cable";
  if (/isolat|ไอโซ/i.test(lower)) return "isolator";
  if (/rail|ราง/i.test(lower)) return "mounting_rail";
  if (/clamp|แคลมป์/i.test(lower)) return "mounting_clamp";
  if (/anchor|สมอ/i.test(lower)) return "mounting_roof_anchor";
  return "general";
}

/** Periodic cleanup of expired sessions. */
setInterval(() => {
  const now = Date.now();
  for (const [key, s] of sessions) {
    if (now - s.updatedAt > SESSION_TIMEOUT_MS) {
      sessions.delete(key);
    }
  }
}, 5 * 60 * 1000); // every 5 min
