/**
 * BOM PDF generation — calls the Python mcp-bomsolar script via subprocess.
 */
import { join } from "path";
import type { BomData, CostSummary } from "./types.js";

const REPO_ROOT = process.env.ORACLE_REPO_ROOT ?? "C:/Users/pO-Ch/Nasri-oracle";
const BOMSOLAR_SCRIPT = join(REPO_ROOT, "mcp-bomsolar", "scripts", "generate_bom_pdf.py");
const OUTPUT_DIR = join(REPO_ROOT, "nasri-line-bot", "tmp");

/** Generate BOM PDF by calling the Python script. Returns path to generated PDF. */
export async function generateBomPdf(data: BomData): Promise<string> {
  // Ensure output dir exists
  const { mkdir } = await import("fs/promises");
  await mkdir(OUTPUT_DIR, { recursive: true });

  const slug = data.project_name
    .replace(/[^a-zA-Z0-9ก-๙]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  const timestamp = Date.now();
  const outputPath = join(OUTPUT_DIR, `bom-${slug}-${timestamp}.pdf`);

  // Write a temp JSON file with the BOM data for the Python script
  const tempJson = join(OUTPUT_DIR, `bom-input-${timestamp}.json`);
  await Bun.write(tempJson, JSON.stringify(data));

  // Python wrapper script that reads JSON and calls generate_bom_pdf
  const pyCode = `
import sys, json
sys.path.insert(0, r"${join(REPO_ROOT, "mcp-bomsolar", "scripts").replace(/\\/g, "/")}")
from generate_bom_pdf import generate_bom_pdf

with open(r"${tempJson.replace(/\\/g, "/")}", "r", encoding="utf-8") as f:
    data = json.load(f)

result = generate_bom_pdf(data, r"${outputPath.replace(/\\/g, "/")}")
print(result)
`;

  const proc = Bun.spawn(["python", "-c", pyCode], {
    cwd: join(REPO_ROOT, "mcp-bomsolar"),
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();

  // Cleanup temp JSON
  try {
    const { unlink } = await import("fs/promises");
    await unlink(tempJson);
  } catch {}

  if (exitCode !== 0) {
    throw new Error(`PDF generation failed (exit ${exitCode}): ${stderr}`);
  }

  return outputPath;
}

/** Calculate system size (Wp) from panel items. */
function calcSystemWp(data: BomData): number {
  if (data.cost_summary?.actual_wp) return data.cost_summary.actual_wp;
  for (const item of data.items) {
    if (item.category === "โมดูล") {
      const m = item.part_name.match(/(\d{3,4})\s*[Ww]/);
      if (m) return item.quantity * parseInt(m[1]);
    }
  }
  return 0;
}

/** Auto-calculate cost summary if not provided. */
function autoCostSummary(data: BomData): CostSummary {
  if (data.cost_summary) return data.cost_summary;

  const equipmentTotal = data.items.reduce((s, i) => s + i.total_cost, 0);
  const actualWp = calcSystemWp(data);
  const systemKw = actualWp / 1000;
  const vat = equipmentTotal * 0.07;
  const labor = actualWp * 4.5;
  const bos = actualWp * 0.7;
  const errorCost = actualWp * 1.0;
  const crane = systemKw >= 30 ? 15000 : 0;

  const peaTable: [number, number][] = [
    [10, 6000], [20, 8500], [30, 12500], [40, 15500],
    [100, 21500], [200, 24000], [500, 36000], [1000, 46000],
  ];
  let peaFee = 46000;
  for (const [maxKw, fee] of peaTable) {
    if (systemKw <= maxKw) { peaFee = fee; break; }
  }

  return {
    equipment_total: equipmentTotal,
    vat_7pct: Math.round(vat * 100) / 100,
    labor,
    bos,
    error_cost: errorCost,
    crane,
    pea_mea_fee: peaFee,
    grand_total: Math.round((equipmentTotal + vat + labor + bos + errorCost + crane + peaFee) * 100) / 100,
    actual_wp: actualWp,
  };
}

/** Format BOM summary text for LINE message — sent BEFORE PDF. */
export function formatBomSummary(data: BomData): string {
  const totalCost = data.items.reduce((sum, item) => sum + item.total_cost, 0);
  const totalQty = data.items.reduce((sum, item) => sum + item.quantity, 0);
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const actualWp = calcSystemWp(data);

  let text = `📋 รายการวัสดุ ENERVIA GROUP\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `โปรเจกต์: ${data.project_name}\n`;
  if (data.project_address) text += `ที่อยู่: ${data.project_address}\n`;
  text += `วันที่: ${data.order_date}\n`;
  if (actualWp) text += `ขนาดระบบ: ${(actualWp / 1000).toFixed(1)} kWp\n`;
  if (data.notes) text += `บันทึก: ${data.notes}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const [i, item] of data.items.entries()) {
    const note = item.notes ? `  [${item.notes}]` : "";
    text += `${i + 1}. ${item.part_name} (${item.manufacturer})\n`;
    text += `   ${item.quantity.toLocaleString()} x ฿${fmt(item.unit_cost)} = ฿${fmt(item.total_cost)}${note}\n`;
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  text += `รวม: ${totalQty.toLocaleString()} รายการ • ฿${fmt(totalCost)}\n`;

  // Auto-calculate cost summary if not provided
  const cs = data.cost_summary ?? (actualWp ? autoCostSummary(data) : undefined);
  if (cs) {
    const kwStr = cs.actual_wp ? `${(cs.actual_wp / 1000).toFixed(2)}kW` : "";
    text += `\n💰 Cost Summary\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `รวมค่าอุปกรณ์: ฿${fmt(cs.equipment_total)}\n`;
    text += `VAT 7%: ฿${fmt(cs.vat_7pct)}\n`;
    text += kwStr ? `ค่าแรง (${kwStr} × ฿4.5/Wp): ฿${fmt(cs.labor)}\n` : `ค่าแรง: ฿${fmt(cs.labor)}\n`;
    text += kwStr ? `BOS (${kwStr} × ฿0.7/Wp): ฿${fmt(cs.bos)}\n` : `BOS: ฿${fmt(cs.bos)}\n`;
    text += kwStr ? `Error Cost (${kwStr} × ฿1.0/Wp): ฿${fmt(cs.error_cost)}\n` : `Error Cost: ฿${fmt(cs.error_cost)}\n`;
    if (cs.crane > 0) text += `ค่าเครน: ฿${fmt(cs.crane)}\n`;
    text += `ค่าขอขนาน PEA/MEA: ฿${fmt(cs.pea_mea_fee)}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🔸 Grand Total: ฿${fmt(cs.grand_total)}\n`;
  }

  return text;
}
