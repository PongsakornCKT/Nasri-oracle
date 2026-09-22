"""
Test suite for generate_bom_pdf with and without bom_meta header/footer (#N3).
Run from mcp-bomsolar/: python3 -m pytest tests/test_bom_pdf_meta.py
"""

import os
import sys
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scripts.generate_bom_pdf import generate_bom_pdf


def test_bom_pdf_meta_rendering():
    try:
        from pypdf import PdfReader
    except ImportError:
        pytest.skip("pypdf not installed", allow_module_level=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_with_meta_path = os.path.join(tmpdir, "bom_with_meta.pdf")
        pdf_no_meta_path = os.path.join(tmpdir, "bom_no_meta.pdf")

        items = [
            {
                "part_number": "MI-1250",
                "part_name": "ATMOCE MI-1250",
                "manufacturer": "ATMOCE",
                "category": "Inverter",
                "quantity": 2,
                "unit_cost": 12000.0,
                "total_cost": 24000.0,
                "notes": "",
            }
        ]

        bom_data_with_meta = {
            "company_name": "Enervia Group co.,ltd",
            "project_name": "ATMOCE Test 5kW",
            "project_address": "Bangkok",
            "order_date": "22/09/26",
            "notes": "",
            "items": items,
            "bom_meta": {
                "system": "atmoce21",
                "phase": "1P",
                "panels": 8,
                "kwp": 5.2,
                "kw_ac": 5.0,
                "package_label": "ATMOCE 2:1 Package",
                "inverter_sku": "MI-1250",
                "inverter_count": 4,
                "synced_at_thai": "15/09/2026 00:17:29",
            },
        }

        bom_data_no_meta = {
            "company_name": "Enervia Group co.,ltd",
            "project_name": "Huawei Test 5kW",
            "project_address": "Bangkok",
            "order_date": "22/09/26",
            "notes": "",
            "items": items,
        }

        # Render both PDFs
        generate_bom_pdf(bom_data_with_meta, pdf_with_meta_path)
        generate_bom_pdf(bom_data_no_meta, pdf_no_meta_path)

        assert os.path.exists(pdf_with_meta_path), "PDF with meta was not generated"
        assert os.path.exists(pdf_no_meta_path), "PDF without meta was not generated"

        # Extract text using pypdf
        reader_meta = PdfReader(pdf_with_meta_path)
        text_meta = "\n".join(page.extract_text() or "" for page in reader_meta.pages)

        reader_no_meta = PdfReader(pdf_no_meta_path)
        text_no_meta = "\n".join(page.extract_text() or "" for page in reader_no_meta.pages)

        # Assert PDF with meta contains kWp, kW AC, and synced_at_thai
        assert "kWp" in text_meta, f"Expected 'kWp' in PDF with meta, got: {text_meta}"
        assert "kW AC" in text_meta, f"Expected 'kW AC' in PDF with meta, got: {text_meta}"
        assert "ราคาจากชีตราคากลาง survey ณ" in text_meta, f"Expected survey timestamp in PDF with meta, got: {text_meta}"

        # Assert PDF without meta DOES NOT contain any of those 3 strings
        assert "kWp" not in text_no_meta, f"Did NOT expect 'kWp' in PDF without meta, got: {text_no_meta}"
        assert "kW AC" not in text_no_meta, f"Did NOT expect 'kW AC' in PDF without meta, got: {text_no_meta}"
        assert "ราคาจากชีตราคากลาง survey ณ" not in text_no_meta, f"Did NOT expect survey timestamp in PDF without meta, got: {text_no_meta}"
