#!/usr/bin/env python3
"""
MCP BOM Solar Agent
Wraps solar-bom-pdf-generator skill as MCP tools.
Integrates with oracle-v2 by writing records to ψ/memory/learnings/.
"""

import os
import sys
import json
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

# Oracle root (ψ directory)
ORACLE_ROOT = os.environ.get("ORACLE_REPO_ROOT", "C:/Users/pO-Ch/Nasri-oracle")
PSI_LEARNINGS = Path(ORACLE_ROOT) / "ψ" / "memory" / "learnings"

mcp = FastMCP("bomsolar")


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
        }
    except Exception as e:
        result = {"success": False, "error": str(e)}

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


if __name__ == "__main__":
    mcp.run()
