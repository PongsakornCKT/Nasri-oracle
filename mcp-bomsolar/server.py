#!/usr/bin/env python3
"""
MCP BOM Solar Agent
Wraps solar-bom-pdf-generator skill as MCP tools.
Uses Google Sheets as product/pricing database.
Integrates with oracle-v2 by writing records to ψ/memory/learnings/.

Google Sheet: https://docs.google.com/spreadsheets/d/1ubrfga3m0uiOf68MGQRApAdnhU8oby6nYKtfzirpn9Y
"""

import os
import sys
import json
import math
from datetime import datetime
from pathlib import Path


def _estimate_tokens(data) -> int:
    """Estimate token count from data (rough: chars / 4)."""
    return max(1, len(json.dumps(data, ensure_ascii=False)) // 4)


def _log_token_usage(tool_name: str, input_tokens: int, output_tokens: int):
    """Append token usage record to ψ/memory/logs/token-usage.jsonl."""
    try:
        log_dir = Path(os.environ.get("ORACLE_REPO_ROOT", "C:/Users/pO-Ch/Nasri-oracle")) / "ψ" / "memory" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        record = {
            "ts": datetime.now().isoformat(),
            "tool": tool_name,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        }
        with open(log_dir / "token-usage.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        pass  # Never crash the tool over logging

# Add scripts to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    print("ERROR: mcp package not found. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

try:
    from scripts.generate_bom_pdf import generate_bom_pdf
    PDF_AVAILABLE = True
except ImportError as e:
    PDF_AVAILABLE = False
    PDF_IMPORT_ERROR = str(e)

# Google Sheets catalog
from sheets import fetch_sheet, fetch_all_sheets, search_catalog, get_catalog_summary, SHEETS

# Oracle root (ψ directory)
ORACLE_ROOT = os.environ.get("ORACLE_REPO_ROOT", "C:/Users/pO-Ch/Nasri-oracle")
PSI_LEARNINGS = Path(ORACLE_ROOT) / "ψ" / "memory" / "learnings"

mcp = FastMCP("bomsolar")


def _format_text_summary(bom_data: dict) -> str:
    """Format BOM data as a text summary for LINE/chat — sent BEFORE PDF."""
    items = bom_data.get("items", [])
    cost_summary = bom_data.get("cost_summary")
    project_name = bom_data.get("project_name", "")
    project_address = bom_data.get("project_address", "")
    order_date = bom_data.get("order_date", "")
    notes = bom_data.get("notes", "")

    # Calculate system size from panels
    actual_wp = 0
    if cost_summary:
        actual_wp = cost_summary.get("actual_wp", 0)
    if not actual_wp:
        for item in items:
            cat = item.get("category", "")
            if cat == "โมดูล":
                # Try to extract wattage from part_name e.g. "(625W)"
                import re
                w_match = re.search(r"(\d{3,4})\s*[Ww]", item.get("part_name", ""))
                if w_match:
                    actual_wp = item.get("quantity", 0) * int(w_match.group(1))
                break

    lines = []
    lines.append("📋 รายการวัสดุ ENERVIA GROUP")
    lines.append("━━━━━━━━━━━━━━━━━━━━")
    lines.append(f"โปรเจกต์: {project_name}")
    if project_address:
        lines.append(f"ที่อยู่: {project_address}")
    lines.append(f"วันที่: {order_date}")
    if actual_wp:
        lines.append(f"ขนาดระบบ: {actual_wp/1000:.1f} kWp")
    if notes:
        lines.append(f"บันทึก: {notes}")
    lines.append("━━━━━━━━━━━━━━━━━━━━")
    lines.append("")

    total_qty = 0
    total_cost = 0
    for i, item in enumerate(items, 1):
        qty = item.get("quantity", 0)
        unit = item.get("unit_cost", 0)
        tc = item.get("total_cost", qty * unit)
        total_qty += qty
        total_cost += tc
        note_str = f"  [{item['notes']}]" if item.get("notes") else ""
        lines.append(f"{i}. {item.get('part_name', '')} ({item.get('manufacturer', '')})")
        lines.append(f"   {qty:,} x ฿{unit:,.2f} = ฿{tc:,.2f}{note_str}")

    lines.append("")
    lines.append(f"━━━━━━━━━━━━━━━━━━━━")
    lines.append(f"รวม: {total_qty:,} รายการ • ฿{total_cost:,.2f}")

    if cost_summary:
        actual_wp = cost_summary.get("actual_wp", 0)
        kw_str = f"{actual_wp/1000:.2f}kW" if actual_wp else ""
        lines.append("")
        lines.append("💰 Cost Summary")
        lines.append(f"━━━━━━━━━━━━━━━━━━━━")
        lines.append(f"รวมค่าอุปกรณ์: ฿{cost_summary.get('equipment_total', 0):,.2f}")
        lines.append(f"VAT 7%: ฿{cost_summary.get('vat_7pct', 0):,.2f}")
        labor_label = f"ค่าแรง ({kw_str} × ฿4.5/Wp)" if kw_str else "ค่าแรง"
        lines.append(f"{labor_label}: ฿{cost_summary.get('labor', 0):,.2f}")
        bos_label = f"BOS ({kw_str} × ฿0.7/Wp)" if kw_str else "BOS"
        lines.append(f"{bos_label}: ฿{cost_summary.get('bos', 0):,.2f}")
        err_label = f"Error Cost ({kw_str} × ฿1.0/Wp)" if kw_str else "Error Cost"
        lines.append(f"{err_label}: ฿{cost_summary.get('error_cost', 0):,.2f}")
        crane = cost_summary.get("crane", 0)
        if crane > 0:
            lines.append(f"ค่าเครน: ฿{crane:,.2f}")
        lines.append(f"ค่าขอขนาน PEA/MEA: ฿{cost_summary.get('pea_mea_fee', 0):,.2f}")
        lines.append(f"━━━━━━━━━━━━━━━━━━━━")
        lines.append(f"🔸 Grand Total: ฿{cost_summary.get('grand_total', 0):,.2f}")

    return "\n".join(lines)


@mcp.tool()
def bomsolar_generate_pdf(
    project_name: str,
    project_address: str,
    order_date: str,
    items: list,
    output_path: str,
    company_name: str = "Enervia Group co.,ltd",
    notes: str = "",
    logo_path: str = "",
    cost_summary: dict = None,
) -> dict:
    """
    Generate a professional Solar BOM PDF document for Enervia Group projects.

    Args:
        project_name: Project name (e.g. "Klonkij Intertrade Co.,Ltd. 250kw")
        project_address: Project location address
        order_date: Order date in DD/MM/YY format
        items: List of BOM items, each with keys:
               part_number, part_name, manufacturer, category,
               quantity, unit_cost, total_cost, notes
        output_path: Full path where the PDF will be saved (e.g. "/tmp/bom.pdf")
        company_name: Company name (default: Enervia Group co.,ltd)
        notes: Additional notes for the project
        logo_path: Optional path to logo image
        cost_summary: Optional cost breakdown dict with keys:
               equipment_total, vat_7pct, labor, bos, error_cost,
               crane, pea_mea_fee, grand_total, actual_wp

    Returns:
        dict with keys: success, output_path, error (if any)

    Categories: cable, isolator, general, mounting_rail,
                mounting_roof_anchor, mounting_clamp, mounting_other,
                โมดูล, อินเวอร์เตอร์
    """
    if not PDF_AVAILABLE:
        return {
            "success": False,
            "error": f"reportlab not installed. Run: pip install reportlab pillow. Details: {PDF_IMPORT_ERROR}"
        }

    input_data = dict(project_name=project_name, project_address=project_address,
                      order_date=order_date, items=items, company_name=company_name,
                      notes=notes, logo_path=logo_path)
    input_tokens = _estimate_tokens(input_data)

    bom_data = {
        "company_name": company_name,
        "project_name": project_name,
        "project_address": project_address,
        "order_date": order_date,
        "notes": notes,
        "items": items,
    }
    if cost_summary:
        bom_data["cost_summary"] = cost_summary

    # Generate text summary BEFORE PDF
    text_summary = _format_text_summary(bom_data)

    try:
        result_path = generate_bom_pdf(
            bom_data,
            output_path,
            logo_path=logo_path if logo_path else None
        )
        result = {
            "success": True,
            "output_path": result_path,
            "item_count": len(items),
            "text_summary": text_summary,
        }
    except Exception as e:
        result = {"success": False, "error": str(e), "text_summary": text_summary}

    output_tokens = _estimate_tokens(result)
    _log_token_usage("bomsolar_generate_pdf", input_tokens, output_tokens)
    result["token_usage"] = {"input": input_tokens, "output": output_tokens, "total": input_tokens + output_tokens}
    return result


@mcp.tool()
def bomsolar_record_to_oracle(
    project_name: str,
    pdf_path: str,
    item_count: int,
    total_cost: float,
    notes: str = "",
) -> dict:
    """
    Save a BOM generation record to oracle-v2 memory (ψ/memory/learnings/).
    Use this after generating a PDF to keep a permanent record in Oracle.

    Args:
        project_name: Name of the solar project
        pdf_path: Path where the PDF was saved
        item_count: Number of BOM items
        total_cost: Total BOM cost (numeric)
        notes: Additional notes to record

    Returns:
        dict with keys: success, file_path, error (if any)
    """
    try:
        PSI_LEARNINGS.mkdir(parents=True, exist_ok=True)

        today = datetime.now().strftime("%Y-%m-%d")
        slug = project_name.lower().replace(" ", "-").replace("/", "-")[:50]
        filename = f"{today}_bom-{slug}.md"
        filepath = PSI_LEARNINGS / filename

        content = f"""---
type: learning
source: bomsolar-mcp
project: bomsolar
date: {today}
concepts: [bom, solar, pdf, enervia]
---

# BOM Record: {project_name}

**Generated**: {datetime.now().strftime("%Y-%m-%d %H:%M")}
**PDF**: `{pdf_path}`
**Items**: {item_count}
**Total Cost**: ฿{total_cost:,.2f}

{f"**Notes**: {notes}" if notes else ""}
"""

        filepath.write_text(content, encoding="utf-8")
        result = {"success": True, "file_path": str(filepath)}
    except Exception as e:
        result = {"success": False, "error": str(e)}

    input_tokens = _estimate_tokens(dict(project_name=project_name, pdf_path=pdf_path,
                                         item_count=item_count, total_cost=total_cost, notes=notes))
    output_tokens = _estimate_tokens(result)
    _log_token_usage("bomsolar_record_to_oracle", input_tokens, output_tokens)
    result["token_usage"] = {"input": input_tokens, "output": output_tokens, "total": input_tokens + output_tokens}
    return result


@mcp.tool()
def bomsolar_create_from_line(
    project_name: str,
    project_address: str,
    items: list,
    company_name: str = "Enervia Group co.,ltd",
    order_date: str = "",
    notes: str = "",
    generate_pdf: bool = False,
    output_path: str = "",
) -> dict:
    """
    Create a BOM from LINE bot conversation data and optionally generate PDF.
    Use this when the Nasri LINE bot collects BOM data via chat.

    Args:
        project_name: Project name collected from LINE chat
        project_address: Project address collected from LINE chat
        items: List of items, each with keys:
               part_name, manufacturer (optional), quantity, unit_cost, total_cost
               (category and part_number are auto-filled if missing)
        company_name: Company name (default: Enervia Group co.,ltd)
        order_date: Order date DD/MM/YY (default: today)
        notes: Additional notes
        generate_pdf: If True, generate PDF immediately
        output_path: PDF output path (required if generate_pdf=True)

    Returns:
        dict with keys: success, bom_data, pdf_path (if generated), record_path
    """
    if not order_date:
        order_date = datetime.now().strftime("%d/%m/%y")

    # Normalize items — fill missing fields
    normalized = []
    for it in items:
        name = it.get("part_name", "")
        cat = it.get("category", "")
        if not cat:
            ln = name.lower()
            if any(w in ln for w in ["panel", "module", "โมดูล", "แผง"]):
                cat = "โมดูล"
            elif any(w in ln for w in ["inverter", "อินเวอร์เตอร์"]):
                cat = "อินเวอร์เตอร์"
            elif any(w in ln for w in ["cable", "สาย", "wire"]):
                cat = "cable"
            elif "isolat" in ln:
                cat = "isolator"
            else:
                cat = "general"
        normalized.append({
            "part_number": it.get("part_number", ""),
            "part_name": name,
            "manufacturer": it.get("manufacturer", ""),
            "category": cat,
            "quantity": it.get("quantity", 0),
            "unit_cost": it.get("unit_cost", 0),
            "total_cost": it.get("total_cost", 0),
            "notes": it.get("notes", ""),
        })

    bom_data = {
        "company_name": company_name,
        "project_name": project_name,
        "project_address": project_address,
        "order_date": order_date,
        "notes": notes,
        "items": normalized,
    }

    total_cost = sum(i["total_cost"] for i in normalized)
    text_summary = _format_text_summary(bom_data)
    result = {"success": True, "bom_data": bom_data, "item_count": len(normalized), "total_cost": total_cost, "text_summary": text_summary}

    # Optionally generate PDF
    if generate_pdf:
        if not output_path:
            slug = project_name.lower().replace(" ", "-")[:40]
            output_path = f"/tmp/bom-{slug}-{int(datetime.now().timestamp())}.pdf"
        if PDF_AVAILABLE:
            try:
                generate_bom_pdf(bom_data, output_path)
                result["pdf_path"] = output_path
            except Exception as e:
                result["pdf_error"] = str(e)
        else:
            result["pdf_error"] = f"reportlab not installed: {PDF_IMPORT_ERROR}"

    # Auto-record to Oracle
    try:
        PSI_LEARNINGS.mkdir(parents=True, exist_ok=True)
        today = datetime.now().strftime("%Y-%m-%d")
        slug = project_name.lower().replace(" ", "-").replace("/", "-")[:50]
        filename = f"{today}_bom-{slug}.md"
        filepath = PSI_LEARNINGS / filename
        content = f"""---
type: learning
source: nasri-line-bot
project: bomsolar
date: {today}
concepts: [bom, solar, line-bot, enervia]
---

# BOM: {project_name}

**Address**: {project_address}
**Date**: {order_date}
**Items**: {len(normalized)}
**Total**: ฿{total_cost:,.2f}
"""
        filepath.write_text(content, encoding="utf-8")
        result["record_path"] = str(filepath)
    except Exception as e:
        result["record_error"] = str(e)

    input_tokens = _estimate_tokens(bom_data)
    output_tokens = _estimate_tokens(result)
    _log_token_usage("bomsolar_create_from_line", input_tokens, output_tokens)
    result["token_usage"] = {"input": input_tokens, "output": output_tokens, "total": input_tokens + output_tokens}
    return result


@mcp.tool()
def bomsolar_smart_bom(
    spec: str,
    project_name: str = "",
    project_address: str = "",
    generate_pdf: bool = False,
    output_path: str = "",
) -> dict:
    """
    Build a BOM automatically from a natural language solar system specification.
    ALWAYS looks up real prices from the Google Sheets catalog.

    Examples of spec:
      - "atmoce 5kw 1phase แผง JA625 + batt + backup"
      - "huawei 10kw 3phase"
      - "sigenergy 5kw + DC charge + batt 9"
      - "solis 10kw แผง aiko"
      - "deye 8kw 1phase + batt 10"

    Args:
        spec: Natural language system specification
        project_name: Project name (optional)
        project_address: Project address (optional)
        generate_pdf: Generate PDF immediately
        output_path: PDF output path

    Returns:
        dict with auto-built BOM items from catalog
    """
    import re
    input_tokens = _estimate_tokens({"spec": spec})

    try:
        all_data = fetch_all_sheets()
        lo = spec.lower()
        items = []

        # Detect phase
        phase = "3P" if re.search(r"3\s*(?:phase|เฟส|p\b)", lo) else "1P"

        # Detect system kW
        kw_match = re.search(r"(\d+)\s*kw", lo)
        system_kw = int(kw_match.group(1)) if kw_match else 5

        # Detect inverter brand
        inv_brand = ""
        inv_sheet = ""
        brand_map = {
            "atmoce": "ATMOCE", "huawei": "Huawei", "solis": "Solis",
            "deye": "Deye", "hoymiles": "Hoymiles", "enphase": "Enphase",
        }
        for key, val in brand_map.items():
            if key in lo:
                inv_brand = val
                inv_sheet = f"Inverters - {val}"
                break
        if not inv_brand and re.search(r"sig(energy)?", lo):
            inv_brand = "Sigenergy"
            inv_sheet = "Inverters - Sigenergy"

        # Detect panel
        panel_brand = ""
        panel_watts = 0
        if m := re.search(r"ja\s*(?:solar)?\s*(\d{3})?", lo):
            panel_brand = "JA Solar"
            panel_watts = int(m.group(1)) if m.group(1) else 625
        elif m := re.search(r"trina\s*(\d{3})?", lo):
            panel_brand = "Trina"
            panel_watts = int(m.group(1)) if m.group(1) else 625
        elif m := re.search(r"aiko\s*(\d{3})?", lo):
            panel_brand = "AIKO"
            panel_watts = int(m.group(1)) if m.group(1) else 650
        elif "vols" in lo:
            panel_brand = "VOLS"
            panel_watts = 625
        elif m := re.search(r"แผง\s*(\d{3})", lo):
            panel_watts = int(m.group(1))

        want_batt = bool(re.search(r"batt|แบต", lo))
        batt_kwh = 0
        if m := re.search(r"batt(?:ery)?\s*(\d+)", lo):
            batt_kwh = int(m.group(1))
        want_backup = bool(re.search(r"backup|สำรอง", lo))
        want_ev = bool(re.search(r"dc\s*charg|ev\s*charg|ชาร์จ", lo))

        # Detect roof type (default: เมทัลชีท → L-Feet 8cm)
        if re.search(r"tile|กระเบื้อง", lo):
            roof_type = "tile"
        elif re.search(r"hangerbolt|ลอนคู่", lo):
            roof_type = "hangerbolt"
        elif re.search(r"kliplock", lo):
            roof_type = "kliplock"
        else:
            roof_type = "metal"  # default: เมทัลชีท → L-Feet 8cm

        def _price(row):
            # Priority 1: short header with ฿ + ราคาสั่งซื้อ
            for k, v in row.items():
                if "฿" in k and "ราคาสั่งซื้อ" in k.lower():
                    try: return float(str(v).replace(",", "").replace("฿", "").strip())
                    except: pass
            # Priority 2: short header with ราคาสั่งซื้อ (not the long title)
            for k, v in row.items():
                if len(k) < 30 and "ราคาสั่งซื้อ" in k.lower():
                    try: return float(str(v).replace(",", "").replace("฿", "").strip())
                    except: pass
            # Priority 3: any column with ฿ + ราคา
            for k, v in row.items():
                if "฿" in k and "ราคา" in k.lower():
                    try: return float(str(v).replace(",", "").replace("฿", "").strip())
                    except: pass
            # Priority 4: any short ราคา column
            for k, v in row.items():
                if len(k) < 30 and "ราคา" in k.lower():
                    try: return float(str(v).replace(",", "").replace("฿", "").strip())
                    except: pass
            return 0

        def _field(row, keywords):
            for k, v in row.items():
                kl = k.lower()
                if any(kw in kl for kw in keywords) and v:
                    return str(v).strip()
            return ""

        # Find inverter
        if inv_brand and inv_sheet:
            inv_rows = all_data.get(inv_sheet, [])
            if inv_brand == "ATMOCE":
                # Detect C&I: ≥30kW or explicit C&I keyword
                is_ci = system_kw >= 30 or bool(re.search(r"c&i|c\si|commercial|โรงงาน", lo))
                if is_ci:
                    # C&I: MI-1250 (1.25kW each)
                    mi = next((r for r in inv_rows if "MI-1250" in " ".join(r.values()) and "warranty" in " ".join(r.values()).lower()), None)
                    if not mi:
                        mi = next((r for r in inv_rows if "MI-1250" in " ".join(r.values())), None)
                    mi_model = "MI-1250"
                    mi_name = "Micro Inverter MI-1250 (1.25kW)"
                    mi_kw = 1.25
                    mi_fallback_price = 4750
                    qty = math.ceil(system_kw / mi_kw)
                else:
                    # Residential default: MI-500 (0.5kW each)
                    mi = next((r for r in inv_rows if "MI-500" in " ".join(r.values()) and "warranty" in " ".join(r.values()).lower()), None)
                    if not mi:
                        mi = next((r for r in inv_rows if "MI-500" in " ".join(r.values())), None)
                    mi_model = "MI-500"
                    mi_name = "Micro Inverter MI-500 (0.5kW)"
                    mi_kw = 0.5
                    mi_fallback_price = 4400
                    qty = math.ceil(system_kw / mi_kw)
                p = _price(mi) if mi else mi_fallback_price
                items.append({"part_number": mi_model, "part_name": mi_name, "manufacturer": "ATMOCE", "category": "อินเวอร์เตอร์", "quantity": qty, "unit_cost": p, "total_cost": qty * p, "notes": ""})
                # Combiner
                comb_key = "MC100T" if phase == "3P" else "MC100"
                comb = next((r for r in inv_rows if comb_key in " ".join(r.values()) and "Wye" not in " ".join(r.values()) and "Lite" not in " ".join(r.values())), None)
                if comb:
                    cp = _price(comb)
                    items.append({"part_number": comb_key, "part_name": f"{comb_key} M-Combiner", "manufacturer": "ATMOCE", "category": "general", "quantity": 1, "unit_cost": cp, "total_cost": cp, "notes": ""})
                if want_batt:
                    ab = next((r for r in inv_rows if "MS-7K" in " ".join(r.values())), None)
                    if ab:
                        bp = _price(ab)
                        items.append({"part_number": "MS-7K-U", "part_name": "M-Battery 7kWh", "manufacturer": "ATMOCE", "category": "battery", "quantity": 1, "unit_cost": bp, "total_cost": bp, "notes": ""})
                    want_batt = False
                if want_backup:
                    bu_key = "MU100T" if phase == "3P" else "MU100S"
                    bu = next((r for r in inv_rows if bu_key in " ".join(r.values())), None)
                    if bu:
                        bup = _price(bu)
                        items.append({"part_number": bu_key, "part_name": f"{bu_key} Backup Box", "manufacturer": "ATMOCE", "category": "general", "quantity": 1, "unit_cost": bup, "total_cost": bup, "notes": ""})
                    want_backup = False
            elif inv_brand == "Sigenergy":
                # Sigenergy: search EC inverters by kW from รายละเอียด column
                # Phase filter: SP = Single Phase (1P), TP = Three Phase (3P)
                phase_suffix = "SP" if phase == "1P" else "TP"
                ec_rows = [r for r in inv_rows
                           if "Inverter (EC)" in " ".join(r.values())
                           and phase_suffix in " ".join(r.values())]
                # Also include Hybrid as fallback
                if not ec_rows:
                    hyb_suffix = "SP" if phase == "1P" else "TP"
                    ec_rows = [r for r in inv_rows
                               if "Hybrid" in " ".join(r.values())
                               and hyb_suffix in " ".join(r.values())]
                best_inv, best_diff = None, 9999
                for r in ec_rows:
                    detail = _field(r, ["รายละเอียด", "detail"]) or ""
                    m = re.search(r"([\d.]+)\s*kw", detail.lower())
                    if m:
                        kw_val = float(m.group(1))
                        diff = abs(kw_val - system_kw)
                        if diff < best_diff:
                            best_diff = diff
                            best_inv = r
                if best_inv:
                    ip = _price(best_inv)
                    model = _field(best_inv, ["รุ่น (Model)", "รุ่น", "model"]) or f"SigenStor EC {system_kw}kW"
                    detail = _field(best_inv, ["รายละเอียด", "detail"]) or ""
                    items.append({"part_number": model, "part_name": f"{model} ({detail})" if detail else model, "manufacturer": "Sigenergy", "category": "อินเวอร์เตอร์", "quantity": 1, "unit_cost": ip, "total_cost": ip, "notes": ""})
            else:
                best_inv, best_diff = None, 9999
                for r in inv_rows:
                    vals = " ".join(r.values()).lower()
                    if phase == "1P" and "3p" in vals and "1p" not in vals: continue
                    if phase == "3P" and "1p" in vals and "3p" not in vals: continue
                    first_val = list(r.values())[0] if r else ""
                    try:
                        kw_val = float(str(first_val).replace(",", ""))
                        if 0 < kw_val <= 1000:
                            diff = abs(kw_val - system_kw)
                            if diff < best_diff:
                                best_diff = diff
                                best_inv = r
                    except: pass
                if best_inv:
                    ip = _price(best_inv)
                    model = _field(best_inv, ["รุ่น", "model", "sku"]) or f"{inv_brand} {system_kw}kW"
                    itype = _field(best_inv, ["ประเภท", "type"])
                    items.append({"part_number": model, "part_name": f"{model}{f' ({itype})' if itype else ''}", "manufacturer": inv_brand, "category": "อินเวอร์เตอร์", "quantity": 1, "unit_cost": ip, "total_cost": ip, "notes": ""})

            # Sigenergy EV
            if want_ev and inv_brand == "Sigenergy":
                evr = [r for r in inv_rows if "evdc" in " ".join(r.values()).lower()]
                if evr:
                    evp = _price(evr[0])
                    evm = _field(evr[0], ["รุ่น", "model"]) or "EVDC 25"
                    items.append({"part_number": evm, "part_name": f"{evm} DC EV Charger", "manufacturer": "Sigenergy", "category": "EV charger", "quantity": 1, "unit_cost": evp, "total_cost": evp, "notes": ""})

            # --- Sigenergy Gateway accessories (CRITICAL rule) ---
            if inv_brand == "Sigenergy":
                sig_rows = all_data.get("Inverters - Sigenergy", [])

                def _sig_search(keyword):
                    for r in sig_rows:
                        if keyword.lower() in " ".join(str(v) for v in r.values()).lower():
                            p = _price(r)
                            if p > 0:
                                return r, p
                    return None, 0

                def _sig_name(row):
                    return _field(row, ["รุ่น (Model)", "รุ่น", "model"]) if row else ""

                if phase == "1P":
                    gw_row, gw_price = _sig_search("HomePro SP-F")
                    if not gw_price:
                        gw_row, gw_price = _sig_search("SP-F")
                    gw_price = gw_price or 33400
                    gw_name = _sig_name(gw_row) or "Gateway HomePro SP-F"
                    items.append({"part_number": "SP-F", "part_name": gw_name, "manufacturer": "Sigenergy", "category": "general", "quantity": 1, "unit_cost": gw_price, "total_cost": gw_price, "notes": "MANDATORY 1P Gateway"})

                    ct_row, ct_price = _sig_search("SP-CT100")
                    ct_price = ct_price or 2400
                    ct_name = _sig_name(ct_row) or "Sensor SP-CT100"
                    items.append({"part_number": "SP-CT100", "part_name": ct_name, "manufacturer": "Sigenergy", "category": "general", "quantity": 1, "unit_cost": ct_price, "total_cost": ct_price, "notes": "SP External CT 100A"})
                else:
                    gw_row, gw_price = _sig_search("Home TP 30K")
                    if not gw_price:
                        gw_row, gw_price = _sig_search("TP 30K")
                    gw_price = gw_price or 15800
                    gw_name = _sig_name(gw_row) or "Gateway Home TP 30K"
                    items.append({"part_number": "TP-30K", "part_name": gw_name, "manufacturer": "Sigenergy", "category": "general", "quantity": 1, "unit_cost": gw_price, "total_cost": gw_price, "notes": "3P Gateway"})

                    ct_row, ct_price = _sig_search("TP-CT100")
                    ct_price = ct_price or 4600
                    ct_name = _sig_name(ct_row) or "Sensor TP-CT100"
                    items.append({"part_number": "TP-CT100", "part_name": ct_name, "manufacturer": "Sigenergy", "category": "general", "quantity": 1, "unit_cost": ct_price, "total_cost": ct_price, "notes": "TP External CT 100A"})

                # Installation Kit (Wall/Ground mounted)
                kit_row, kit_price = _sig_search("Wall-mounted Kit")
                if not kit_price:
                    kit_row, kit_price = _sig_search("Ground-mounted Kit")
                kit_price = kit_price or 4600
                kit_name = _sig_name(kit_row) or "Wall-mounted Kit"
                items.append({"part_number": "SIG-KIT", "part_name": kit_name, "manufacturer": "Sigenergy", "category": "general", "quantity": 1, "unit_cost": kit_price, "total_cost": kit_price, "notes": ""})

            # --- Huawei accessories ---
            if inv_brand == "Huawei":
                hw_rows = all_data.get("Inverters - Huawei", [])

                def _hw_search(keyword):
                    for r in hw_rows:
                        if keyword.lower() in " ".join(str(v) for v in r.values()).lower():
                            p = _price(r)
                            if p > 0:
                                return r, p
                    return None, 0

                dongle_row, dongle_price = _hw_search("Smart Dongle")
                dongle_price = dongle_price or 1730
                dongle_name = (_field(dongle_row, ["รุ่น", "model"]) if dongle_row else "") or "Smart Dongle WIFI"
                items.append({"part_number": "HW-DONGLE", "part_name": dongle_name, "manufacturer": "Huawei", "category": "general", "quantity": 1, "unit_cost": dongle_price, "total_cost": dongle_price, "notes": ""})

                if phase == "1P":
                    ps_row, ps_price = _hw_search("Power Sensor 1P")
                    if not ps_price:
                        ps_row, ps_price = _hw_search("Power Sensor")
                    ps_price = ps_price or 1750
                    ps_name = (_field(ps_row, ["รุ่น", "model"]) if ps_row else "") or "Power Sensor 1P"
                else:
                    ps_row, ps_price = _hw_search("Power Sensor 3P")
                    if not ps_price:
                        ps_row, ps_price = _hw_search("Power Sensor")
                    ps_price = ps_price or 3230
                    ps_name = (_field(ps_row, ["รุ่น", "model"]) if ps_row else "") or "Power Sensor 3P"
                items.append({"part_number": "HW-PS", "part_name": ps_name, "manufacturer": "Huawei", "category": "general", "quantity": 1, "unit_cost": ps_price, "total_cost": ps_price, "notes": ""})

        # Find panels — Sigenergy default: AIKO 650W (not JA Solar 625W)
        if not panel_watts:
            panel_watts = 650 if inv_brand == "Sigenergy" else 625
        if not panel_brand:
            panel_brand = "AIKO" if inv_brand == "Sigenergy" else "JA Solar"
        panel_qty = max(1, round((system_kw * 1000) / panel_watts))
        panel_rows = all_data.get("Solar Panels", [])
        best_panel, best_pdiff = None, 9999
        for r in panel_rows:
            vals = " ".join(r.values()).lower()
            if panel_brand and panel_brand.lower() not in vals: continue
            for v in r.values():
                try:
                    w = int(v)
                    if 400 <= w <= 900:
                        d = abs(w - panel_watts)
                        if d < best_pdiff:
                            best_pdiff = d
                            best_panel = r
                except: pass
        if best_panel:
            pp = _price(best_panel)
            pm = _field(best_panel, ["รุ่น", "model"]) or f"{panel_brand} {panel_watts}W"
            pb = list(best_panel.values())[0] if best_panel else panel_brand
            pw = _field(best_panel, ["กำลังไฟ"]) or str(panel_watts)
            items.append({"part_number": pm, "part_name": f"{pm} ({pw}W)", "manufacturer": pb, "category": "โมดูล", "quantity": panel_qty, "unit_cost": pp, "total_cost": panel_qty * pp, "notes": ""})

        # --- Keenoc mounting auto-add ---
        keenoc_rows = all_data.get("Mounting - Keenoc", [])

        def _keenoc_price(row):
            # Keenoc sheet uses "ราคา ≥50K" column — try that first
            for k, v in row.items():
                if "ราคา" in k and "50" in k and "≥" in k:
                    try:
                        p = float(str(v).replace(",", "").replace("฿", "").strip())
                        if p > 0: return p
                    except: pass
            # Fallback to generic _price()
            return _price(row)

        def _keenoc_search(keyword):
            for r in keenoc_rows:
                if keyword.lower() in " ".join(str(v) for v in r.values()).lower():
                    p = _keenoc_price(r)
                    if p > 0:
                        return r, p
            return None, 0

        # Rail 4200mm — 1 per panel
        rail_row, rail_price = _keenoc_search("4200")
        if not rail_price:
            rail_row, rail_price = _keenoc_search("Rail")
        if rail_price:
            rail_name = (_field(rail_row, ["รุ่น", "model", "รายการ", "description"]) if rail_row else "") or "Rail 4200mm"
            items.append({"part_number": "RAIL-4200", "part_name": rail_name, "manufacturer": "Keenoc", "category": "mounting_rail", "quantity": panel_qty, "unit_cost": rail_price, "total_cost": panel_qty * rail_price, "notes": "1 rail per panel"})

        # End Clamp — panel_qty * 2
        ec_row, ec_price = _keenoc_search("End Clamp")
        if not ec_price:
            ec_row, ec_price = _keenoc_search("End")
        if ec_price:
            ec_qty = panel_qty * 2
            ec_name = (_field(ec_row, ["รุ่น", "model", "รายการ", "description"]) if ec_row else "") or "End Clamp"
            items.append({"part_number": "END-CLAMP", "part_name": ec_name, "manufacturer": "Keenoc", "category": "mounting_clamp", "quantity": ec_qty, "unit_cost": ec_price, "total_cost": ec_qty * ec_price, "notes": ""})

        # Mid Clamp — max(0, (panel_qty - 1) * 2)
        mc_row, mc_price = _keenoc_search("Mid Clamp")
        if not mc_price:
            mc_row, mc_price = _keenoc_search("Mid")
        if mc_price:
            mc_qty = max(0, (panel_qty - 1) * 2)
            mc_name = (_field(mc_row, ["รุ่น", "model", "รายการ", "description"]) if mc_row else "") or "Mid Clamp"
            items.append({"part_number": "MID-CLAMP", "part_name": mc_name, "manufacturer": "Keenoc", "category": "mounting_clamp", "quantity": mc_qty, "unit_cost": mc_price, "total_cost": mc_qty * mc_price, "notes": ""})

        # --- Roof Anchor (by roof type) --- panel_qty * 2
        ra_qty = panel_qty * 2
        if roof_type == "tile":
            ra_row, ra_price = _keenoc_search("Tile Roof Hook")
            if not ra_price:
                ra_row, ra_price = _keenoc_search("Tile")
            ra_pn = "TILE-HOOK"
            ra_fallback = "Tile Roof Hook"
        elif roof_type == "hangerbolt":
            ra_row, ra_price = _keenoc_search("Hangerbolt")
            if not ra_price:
                ra_row, ra_price = _keenoc_search("Hanger")
            ra_pn = "HANGERBOLT"
            ra_fallback = "Hangerbolt"
        elif roof_type == "kliplock":
            ra_row, ra_price = _keenoc_search("Kliplock 717")
            if not ra_price:
                ra_row, ra_price = _keenoc_search("Kliplock")
            ra_pn = "KLIPLOCK-717"
            ra_fallback = "Kliplock 717"
        else:
            # default: เมทัลชีท → L-Feet 8cm
            ra_row, ra_price = _keenoc_search("L-Feet 8cm")
            if not ra_price:
                ra_row, ra_price = _keenoc_search("L-Feet")
            ra_pn = "L-FEET-8CM"
            ra_fallback = "L-Feet 8cm"
        if ra_price:
            ra_name = (_field(ra_row, ["รุ่น", "model", "รายการ", "description"]) if ra_row else "") or ra_fallback
            items.append({"part_number": ra_pn, "part_name": ra_name, "manufacturer": "Keenoc", "category": "mounting_roof_anchor", "quantity": ra_qty, "unit_cost": ra_price, "total_cost": ra_qty * ra_price, "notes": f"2 per panel ({roof_type})"})
        else:
            # No price found — add with 0 cost as placeholder so BOM still lists it
            items.append({"part_number": ra_pn, "part_name": ra_fallback, "manufacturer": "Keenoc", "category": "mounting_roof_anchor", "quantity": ra_qty, "unit_cost": 0, "total_cost": 0, "notes": f"2 per panel ({roof_type}) — price TBC"})

        # --- Grounding Accessories ---
        # Grounding Lug — 1 per panel
        glu_row, glu_price = _keenoc_search("Grounding Lug")
        if not glu_price:
            glu_row, glu_price = _keenoc_search("Lug")
        if glu_price:
            glu_name = (_field(glu_row, ["รุ่น", "model", "รายการ", "description"]) if glu_row else "") or "Grounding Lug"
            items.append({"part_number": "GND-LUG", "part_name": glu_name, "manufacturer": "Keenoc", "category": "mounting_other", "quantity": panel_qty, "unit_cost": glu_price, "total_cost": panel_qty * glu_price, "notes": "1 per panel"})
        else:
            items.append({"part_number": "GND-LUG", "part_name": "Grounding Lug", "manufacturer": "Keenoc", "category": "mounting_other", "quantity": panel_qty, "unit_cost": 0, "total_cost": 0, "notes": "1 per panel — price TBC"})

        # Earthing Clip — 2 per panel
        ecl_row, ecl_price = _keenoc_search("Earthing Clip")
        if not ecl_price:
            ecl_row, ecl_price = _keenoc_search("Earth")
        if ecl_price:
            ecl_qty = panel_qty * 2
            ecl_name = (_field(ecl_row, ["รุ่น", "model", "รายการ", "description"]) if ecl_row else "") or "Earthing Clip"
            items.append({"part_number": "EARTH-CLIP", "part_name": ecl_name, "manufacturer": "Keenoc", "category": "mounting_other", "quantity": ecl_qty, "unit_cost": ecl_price, "total_cost": ecl_qty * ecl_price, "notes": "2 per panel"})
        else:
            ecl_qty = panel_qty * 2
            items.append({"part_number": "EARTH-CLIP", "part_name": "Earthing Clip", "manufacturer": "Keenoc", "category": "mounting_other", "quantity": ecl_qty, "unit_cost": 0, "total_cost": 0, "notes": "2 per panel — price TBC"})

        # Cable Clip — 5 per panel
        ccl_row, ccl_price = _keenoc_search("Cable Clip")
        if not ccl_price:
            ccl_row, ccl_price = _keenoc_search("Clip")
        if ccl_price:
            ccl_qty = panel_qty * 5
            ccl_name = (_field(ccl_row, ["รุ่น", "model", "รายการ", "description"]) if ccl_row else "") or "Cable Clip"
            items.append({"part_number": "CABLE-CLIP", "part_name": ccl_name, "manufacturer": "Keenoc", "category": "mounting_other", "quantity": ccl_qty, "unit_cost": ccl_price, "total_cost": ccl_qty * ccl_price, "notes": "5 per panel"})
        else:
            ccl_qty = panel_qty * 5
            items.append({"part_number": "CABLE-CLIP", "part_name": "Cable Clip", "manufacturer": "Keenoc", "category": "mounting_other", "quantity": ccl_qty, "unit_cost": 0, "total_cost": 0, "notes": "5 per panel — price TBC"})

        # --- Cables auto-add ---
        cable_rows = all_data.get("Cables", [])

        def _cable_search(keyword):
            for r in cable_rows:
                vals = " ".join(str(v) for v in r.values()).lower()
                if keyword.lower() in vals:
                    # Use ราคา ≥50,000 column
                    for k, v in r.items():
                        if "ราคา" in k and "50,000" in k and "≥" in k:
                            try: return r, float(str(v).replace(",", "").strip())
                            except: pass
                    return r, _price(r)
            return None, 0

        # DC Cable — Sigenergy: Link 6sqmm (CB-1060AB), others: Link 4sqmm (CB-1040AB)
        if inv_brand == "Sigenergy":
            dc_row, dc_price = _cable_search("CB-1060AB")
            dc_fallback_name = "CB-1060AB (6sqmm)"
            dc_pn = "CB-1060AB"
        else:
            dc_row, dc_price = _cable_search("CB-1040AB")
            dc_fallback_name = "CB-1040AB (4sqmm)"
            dc_pn = "CB-1040AB"
        if dc_price:
            dc_meters = system_kw * 10
            dc_name = _field(dc_row, ["รุ่น", "ขนาด"]) or dc_fallback_name
            items.append({"part_number": dc_pn, "part_name": f"PV Cable {dc_name}", "manufacturer": "LINK", "category": "cable", "quantity": dc_meters, "unit_cost": dc_price, "total_cost": dc_meters * dc_price, "notes": f"DC ~{dc_meters}m"})

        # MC4 Connector — 1 pair per panel
        mc4_row, mc4_price = _cable_search("MC4")
        if mc4_price:
            items.append({"part_number": "CB-1002", "part_name": "MC4 Connector", "manufacturer": "LINK", "category": "cable", "quantity": panel_qty, "unit_cost": mc4_price, "total_cost": panel_qty * mc4_price, "notes": "1 pair/panel"})

        # AC Cable — Sigenergy: VCT 2C*4 Sqmm, others: FR-CV 2x4 (1P) / FR-CV 4x4 (3P)
        if inv_brand == "Sigenergy":
            ac_row, ac_price = _cable_search("VCT 2C")
            if not ac_price:
                ac_row, ac_price = _cable_search("FR-CV 2x4")  # fallback
            ac_pn = "VCT-2Cx4"
            ac_fallback = "VCT 2C*4 Sqmm"
        else:
            ac_keyword = "FR-CV 2x4" if phase == "1P" else "FR-CV 4x4"
            ac_row, ac_price = _cable_search(ac_keyword)
            ac_pn = ac_keyword
            ac_fallback = ac_keyword
        if ac_price:
            ac_name = _field(ac_row, ["รุ่น", "ขนาด"]) or ac_fallback
            items.append({"part_number": ac_pn, "part_name": f"AC Cable {ac_name}", "manufacturer": "BCC", "category": "cable", "quantity": 1, "unit_cost": ac_price, "total_cost": ac_price, "notes": "1 roll (100m)"})

        # Ground Cable — GND 1x4 — 1 roll
        gnd_row, gnd_price = _cable_search("GND 1x4")
        if gnd_price:
            gnd_name = _field(gnd_row, ["รุ่น", "ขนาด"]) or "GND 1x4 GY"
            items.append({"part_number": "GND-1x4", "part_name": f"Ground Cable {gnd_name}", "manufacturer": "BCC", "category": "cable", "quantity": 1, "unit_cost": gnd_price, "total_cost": gnd_price, "notes": "1 roll (100m)"})

        # Sigenergy extra items: cable tray + adhesive kit
        if inv_brand == "Sigenergy":
            items.append({"part_number": "CABLE-TRAY", "part_name": "รางเก็บสาย+ท่อ ตามหน้างาน", "manufacturer": "Enervia", "category": "general", "quantity": 1, "unit_cost": 0, "total_cost": 0, "notes": "ตามหน้างาน"})
            items.append({"part_number": "ADHESIVE-KIT", "part_name": "ชุดกาวแผงสายไฟ 16/110", "manufacturer": "Enervia", "category": "general", "quantity": 1, "unit_cost": 0, "total_cost": 0, "notes": "ตามหน้างาน"})

        # Battery (generic)
        if want_batt:
            batt_rows = all_data.get("Batteries", [])
            best_b, best_bd = None, 9999
            for r in batt_rows:
                if _price(r) <= 0: continue
                for k, v in r.items():
                    if "kwh" in k.lower() or "ขนาด" in k.lower():
                        try:
                            bkwh = float(v)
                            d = abs(bkwh - batt_kwh) if batt_kwh else bkwh
                            if d < best_bd: best_bd = d; best_b = r
                        except: pass
            if best_b:
                bp = _price(best_b)
                bm = _field(best_b, ["รุ่น", "model"]) or "Battery"
                bb = list(best_b.values())[0] if best_b else ""
                items.append({"part_number": bm, "part_name": f"{bm} Battery", "manufacturer": bb, "category": "battery", "quantity": 1, "unit_cost": bp, "total_cost": bp, "notes": ""})

        # Backup
        if want_backup:
            cb_rows = all_data.get("Combiner Box & Others", [])
            if cb_rows:
                cb = cb_rows[0]
                cbp = _price(cb)
                items.append({"part_number": "", "part_name": _field(cb, ["รายการ", "description"]) or "Combiner Box", "manufacturer": "Enervia", "category": "general", "quantity": 1, "unit_cost": cbp, "total_cost": cbp, "notes": ""})

        total_cost = sum(i["total_cost"] for i in items)

        # --- Financial cost summary ---
        # Use actual Wp from panels (qty × watts) instead of nominal system kW
        actual_wp = panel_qty * panel_watts if panel_qty and panel_watts else system_kw * 1000
        equipment_total = total_cost
        labor = actual_wp * 4.5
        bos = actual_wp * 0.7
        error_cost = actual_wp * 1.0
        crane = 15000 if system_kw >= 30 else 0
        vat = equipment_total * 0.07

        pea_fee_table = [
            (10, 6000), (20, 8500), (30, 12500), (40, 15500),
            (100, 21500), (200, 24000), (500, 36000), (1000, 46000),
        ]
        pea_fee = 46000  # fallback for >1000kW
        for max_kw, fee in pea_fee_table:
            if system_kw <= max_kw:
                pea_fee = fee
                break

        grand_total = equipment_total + vat + labor + bos + error_cost + crane + pea_fee
        actual_kw = actual_wp / 1000

        cost_summary = {
            "equipment_total": equipment_total,
            "vat_7pct": round(vat, 2),
            "labor": labor,
            "bos": bos,
            "error_cost": error_cost,
            "crane": crane,
            "pea_mea_fee": pea_fee,
            "grand_total": round(grand_total, 2),
            "actual_wp": actual_wp,
        }
        bom_data = {
            "company_name": "Enervia Group co.,ltd",
            "project_name": project_name or f"Solar {system_kw}kW {inv_brand}",
            "project_address": project_address,
            "order_date": datetime.now().strftime("%d/%m/%y"),
            "notes": f"Auto-built from: {spec}",
            "items": items,
            "cost_summary": cost_summary,
        }
        text_summary = _format_text_summary(bom_data)
        result = {"success": True, "spec": spec, "bom_data": bom_data, "item_count": len(items), "total_cost": total_cost, "cost_summary": cost_summary, "text_summary": text_summary}

        if generate_pdf and items:
            if not output_path:
                slug = (project_name or inv_brand).lower().replace(" ", "-")[:40]
                output_path = f"/tmp/bom-{slug}-{int(datetime.now().timestamp())}.pdf"
            if PDF_AVAILABLE:
                try:
                    generate_bom_pdf(bom_data, output_path)
                    result["pdf_path"] = output_path
                except Exception as e:
                    result["pdf_error"] = str(e)

    except Exception as e:
        result = {"success": False, "error": str(e)}

    output_tokens = _estimate_tokens(result)
    _log_token_usage("bomsolar_smart_bom", input_tokens, output_tokens)
    result["token_usage"] = {"input": input_tokens, "output": output_tokens, "total": input_tokens + output_tokens}
    return result


@mcp.tool()
def bomsolar_get_catalog(
    sheet_name: str = "",
    search: str = "",
    category: str = "",
) -> dict:
    """
    Fetch product catalog from Enervia's Google Sheets database.
    ALWAYS call this first before creating any BOM to get real pricing data.

    Available sheets:
      - "Solar Panels" — แผงโซลาร์ทุกแบรนด์ (VOLS, JA Solar, Trina, AIKO)
      - "Inverters - Huawei" — Huawei inverters (residential + C&I)
      - "Inverters - Solis" — Solis inverters
      - "Inverters - Deye" — Deye hybrid inverters
      - "Inverters - ATMOCE" — ATMOCE micro inverters + accessories
      - "Inverters - Sigenergy" — Sigenergy inverters + batteries + EV
      - "Inverters - Hoymiles" — Hoymiles micro inverters
      - "Inverters - Enphase" — Enphase micro inverters
      - "Batteries" — แบตเตอรี่ (Dyness, Deye, EENOVANCE, Sigenergy, ATMOCE, Huawei)
      - "Cables" — สายไฟ DC/AC (LINK, BCC)
      - "Mounting - Keenoc" — อุปกรณ์ติดตั้ง Keenoc
      - "Optimizers" — Optimizer (Huawei, Deye)
      - "Combiner Box & Others" — Combiner box & accessories
      - "Labor & Fees" — ค่าแรง, BOS, ค่าขอขนาน

    Args:
        sheet_name: Fetch a specific sheet by name. Leave empty to get summary of all sheets.
        search: Search query to find products across all sheets (e.g. "Trina 625", "Huawei 10kW").
        category: Filter search to sheets matching this category (e.g. "inverter", "panel", "cable").

    Returns:
        dict with catalog data — products with real pricing from Google Sheets
    """
    input_tokens = _estimate_tokens({"sheet_name": sheet_name, "search": search, "category": category})

    try:
        if search:
            matches = search_catalog(search, category=category or None)
            result = {
                "success": True,
                "query": search,
                "matches": matches[:50],  # limit to 50 results
                "total_matches": len(matches),
            }
        elif sheet_name:
            data = fetch_sheet(sheet_name)
            result = {
                "success": True,
                "sheet": sheet_name,
                "rows": data,
                "count": len(data),
            }
        else:
            summary = get_catalog_summary()
            result = {
                "success": True,
                "sheets": summary,
                "available_sheets": list(SHEETS.keys()),
            }
    except Exception as e:
        result = {"success": False, "error": str(e)}

    output_tokens = _estimate_tokens(result)
    _log_token_usage("bomsolar_get_catalog", input_tokens, output_tokens)
    result["token_usage"] = {"input": input_tokens, "output": output_tokens, "total": input_tokens + output_tokens}
    return result


@mcp.tool()
def bomsolar_lookup_price(
    product_name: str,
    quantity: int = 1,
) -> dict:
    """
    Look up the price for a specific solar product from the Enervia catalog.
    Searches the Google Sheets database and returns pricing details.

    Args:
        product_name: Product name or model to search (e.g. "Trina TSM-NEG21C.20", "MI-1250", "Huawei 10KTL")
        quantity: Quantity needed (affects total cost calculation)

    Returns:
        dict with product details and pricing
    """
    input_tokens = _estimate_tokens({"product_name": product_name, "quantity": quantity})

    try:
        matches = search_catalog(product_name)
        if not matches:
            result = {
                "success": True,
                "found": False,
                "message": f"ไม่พบสินค้า '{product_name}' ในระบบ",
                "suggestion": "ลองค้นหาด้วยชื่อรุ่น, แบรนด์, หรือประเภท",
            }
        else:
            top = matches[0]
            # Try to extract price from various column names
            price = 0
            for key in top:
                kl = key.lower()
                if "ราคาสั่งซื้อ" in kl or "buy" in kl or "cost" in kl:
                    try:
                        price = float(str(top[key]).replace(",", "").replace("฿", "").strip())
                        break
                    except (ValueError, TypeError):
                        continue
            if not price:
                for key in top:
                    kl = key.lower()
                    if "ราคา" in kl and "ขาย" not in kl:
                        try:
                            price = float(str(top[key]).replace(",", "").replace("฿", "").strip())
                            break
                        except (ValueError, TypeError):
                            continue

            result = {
                "success": True,
                "found": True,
                "product": top,
                "unit_price": price,
                "quantity": quantity,
                "total_price": price * quantity,
                "all_matches": len(matches),
                "other_options": matches[1:5] if len(matches) > 1 else [],
            }
    except Exception as e:
        result = {"success": False, "error": str(e)}

    output_tokens = _estimate_tokens(result)
    _log_token_usage("bomsolar_lookup_price", input_tokens, output_tokens)
    result["token_usage"] = {"input": input_tokens, "output": output_tokens, "total": input_tokens + output_tokens}
    return result


@mcp.tool()
def bomsolar_example_data() -> dict:
    """
    Return example BOM data structure for reference.
    Useful for understanding the expected input format for bomsolar_generate_pdf.

    Returns:
        dict with example bom_data structure
    """
    result = {
        "company_name": "Enervia Group co.,ltd",
        "project_name": "Example Project 250kw",
        "project_address": "กรุงเทพ, กรุงเทพมหานคร 10520",
        "order_date": datetime.now().strftime("%d/%m/%y"),
        "notes": "",
        "items": [
            {
                "part_number": "TSM-NEG21C.20",
                "part_name": "Solar Panel",
                "manufacturer": "Trina Solar Co., Ltd.",
                "category": "โมดูล",
                "quantity": 220,
                "unit_cost": 2423.00,
                "total_cost": 533060.00,
                "notes": ""
            },
            {
                "part_number": "MI-1250",
                "part_name": "Micro Inverter",
                "manufacturer": "ATMOCE",
                "category": "อินเวอร์เตอร์",
                "quantity": 110,
                "unit_cost": 5630.00,
                "total_cost": 619300.00,
                "notes": ""
            },
        ],
        "categories": [
            "cable", "isolator", "general",
            "mounting_rail", "mounting_roof_anchor",
            "mounting_clamp", "mounting_other",
            "โมดูล", "อินเวอร์เตอร์"
        ]
    }
    output_tokens = _estimate_tokens(result)
    _log_token_usage("bomsolar_example_data", 5, output_tokens)
    result["token_usage"] = {"input": 5, "output": output_tokens, "total": 5 + output_tokens}
    return result


@mcp.tool()
def bomsolar_line_guide() -> dict:
    """
    Return the Nasri LINE OA Bot usage guide — how to add Nasri to LINE groups,
    available commands, and deployment info.

    Use this when a user asks how to use Nasri, how to add to a group,
    or needs the command reference.

    Returns:
        dict with guide sections: setup, commands, smart_bom_examples, cost_rules, deploy
    """
    result = {
        "name": "Nasri LINE OA Bot",
        "description": "LINE OA Bot สำหรับ Enervia Group — เชิญเข้ากลุ่มไลน์แล้วสร้าง BOM/ใบเสนอราคาได้ทันที",
        "setup": {
            "step_1": "เพิ่มเพื่อน — แอดไลน์ @nasri-butler (เพิ่มเพื่อนผ่าน LINE ID)",
            "step_2": "เชิญเข้ากลุ่ม — เข้าไปที่กลุ่มไลน์ที่ต้องการ → กดเชิญเพื่อน → เลือก Nasri",
            "step_3": 'เรียกใช้งาน — พิมพ์ "nasri" หรือ "นัด" หรือ "ไอ่นัด" ในกลุ่มไลน์',
        },
        "trigger_words": ["nasri", "นัด", "ไอ่นัด"],
        "commands": {
            "นัด ช่วย": "แสดงเมนูช่วยเหลือ",
            "นัด ขอ bom": "เริ่มสร้าง BOM ใหม่ (ถามชื่อโปรเจกต์ → ที่อยู่ → เพิ่มรายการ)",
            "นัด atmoce 5kw 1phase แผง JA625 + batt": "สร้าง BOM อัตโนมัติจาก spec (ดึงราคาจาก Google Sheets)",
            "ขอ pdf / สร้าง pdf": "สร้าง PDF จาก BOM ล่าสุด (ส่งสรุปข้อความก่อน แล้วส่ง Flex card)",
            "นัด ค้นหา ชื่อ": "ค้นหา BOM เก่า",
            "นัด โหลด ชื่อ": "โหลด BOM เก่ามาแก้ไข",
            "นัด ดู bom ชื่อ": "ดู BOM เก่า (เปิด HTML)",
            "เสร็จ": "จบการเพิ่มรายการ บันทึก BOM",
            "ลบ": "ลบรายการล่าสุด",
            "ยกเลิก": "ยกเลิก BOM session",
            "แก้ไข": "กลับเข้าโหมดแก้ไข",
            "ชื่อ xxx": "ตั้งชื่อโปรเจกต์",
        },
        "smart_bom_examples": [
            "atmoce 5kw 1phase แผง JA625 + batt + backup",
            "huawei 10kw 3phase แผง trina",
            "sigenergy 8kw 1phase + batt + ev charger",
            "deye 5kw แผง aiko 650",
            "solis 10kw แผง JA Solar",
            "atmoce 30kw 3phase แผง trina (C&I → MI-1250)",
        ],
        "manual_item_format": [
            "Product Name, Quantity, Price",
            "Product Name, Brand, Quantity, Price",
            "Trina 625, 8 (lookup from catalog)",
        ],
        "cost_rules": {
            "labor": "4.5 ฿/Wp",
            "bos": "0.7 ฿/Wp",
            "error_cost": "1.0 ฿/Wp",
            "vat": "7% (equipment only)",
            "crane": "15,000 ฿ (systems ≥ 30kW)",
            "pea_mea_tiers": "10kW→6000, 20kW→8500, 30kW→12500, 40kW→15500, 100kW→21500, 200kW→24000, 500kW→36000, 1000kW→46000",
        },
        "deploy": {
            "server": "ai.enervia.co.th",
            "platform": "Plesk + Phusion Passenger",
            "runtime": "Node.js (CommonJS)",
            "office_portal": "https://ai.enervia.co.th/ — BOM list, catalog browse, usage guide",
            "health_check": "https://ai.enervia.co.th/health",
            "apis": [
                "GET /api/bom-list — list BOMs",
                "GET /api/bom-list?q=search — search BOMs",
                "GET /api/bom-view/:filename — view BOM HTML",
                "GET /api/catalog — list catalog sheets",
                "GET /api/catalog?q=search — search products",
                "GET /api/catalog?sheet=name — get sheet rows",
            ],
        },
        "reference_model": "KBank ขุนทอง — LINE OA bot invited to groups, called by name",
    }
    output_tokens = _estimate_tokens(result)
    _log_token_usage("bomsolar_line_guide", 5, output_tokens)
    result["token_usage"] = {"input": 5, "output": output_tokens, "total": 5 + output_tokens}
    return result


if __name__ == "__main__":
    mcp.run()
