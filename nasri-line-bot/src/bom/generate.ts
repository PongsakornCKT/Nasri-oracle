/**
 * BOM PDF generation — calls the Python mcp-bomsolar script via subprocess.
 */
import { join } from "path";
import type { BomData } from "./types.js";

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

/** Format BOM summary text for LINE message. */
export function formatBomSummary(data: BomData): string {
  const totalCost = data.items.reduce((sum, item) => sum + item.total_cost, 0);
  const totalQty = data.items.reduce((sum, item) => sum + item.quantity, 0);

  let text = `📋 สรุป BOM\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  text += `โปรเจกต์: ${data.project_name}\n`;
  text += `ที่อยู่: ${data.project_address}\n`;
  text += `วันที่: ${data.order_date}\n`;
  text += `━━━━━━━━━━━━━━━\n`;

  for (const [i, item] of data.items.entries()) {
    text += `${i + 1}. ${item.part_name}`;
    if (item.manufacturer) text += ` (${item.manufacturer})`;
    text += `\n   ${item.quantity} x ฿${item.unit_cost.toLocaleString()} = ฿${item.total_cost.toLocaleString()}\n`;
  }

  text += `━━━━━━━━━━━━━━━\n`;
  text += `รวม: ${totalQty} รายการ • ฿${totalCost.toLocaleString()}\n`;

  return text;
}
