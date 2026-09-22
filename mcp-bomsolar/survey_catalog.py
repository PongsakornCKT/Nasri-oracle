"""
Survey Catalog API Client & Tab Parser for BOM Solar Engine (#N1).
Fetches /pricelist and /catalog/qpkg with 10-minute cache TTL,
or loads from local fixture JSON files when LF_BOM_FIXTURE_MODE=1.
"""

import json
import math
import os
import re
import time
import urllib.request
from pathlib import Path
from typing import Dict, Any, List, Optional

_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 600  # 10 minutes cache TTL

SURVEY_BASE_URL = os.environ.get("SURVEY_BASE_URL", "https://survey.enervia.co.th/wp-json/leadfollow/v1")
FIXTURE_DIR = Path(__file__).parent / "fixtures"


class SurveyUnavailable(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(f"ดึงราคาจาก survey ไม่ได้: {reason}")


def _cpl_num(val: Any) -> Optional[float]:
    if val is None or val == '':
        return None
    if isinstance(val, (int, float)):
        f = float(val)
        return f if not math.isnan(f) else None
    try:
        s = str(val).strip()
        if not s:
            return None
        # Remove non-numeric except dot
        clean = re.sub(r'[^0-9.]', '', s)
        if not clean:
            return None
        f = float(clean)
        return f if not math.isnan(f) else None
    except Exception:
        return None


def is_fixture_mode() -> bool:
    v = os.environ.get("LF_BOM_FIXTURE_MODE", "").strip().lower()
    return v in ("1", "true", "yes")


def get_survey_api_key() -> str:
    return os.environ.get("LF_SURVEY_API_KEY", "").strip()


def fetch_pricelist(force: bool = False, fixture_filename: str = "pricelist_fixture.json") -> Dict[str, Any]:
    """
    Fetch /pricelist from Survey REST API with 10-minute caching.
    If LF_BOM_FIXTURE_MODE=1, load from local pricelist_fixture.json (or specified fixture_filename).
    Otherwise, if API key missing or API fails, raise SurveyUnavailable.
    """
    now = time.time()
    cache_key = f"pricelist:{fixture_filename}"
    if is_fixture_mode():
        fixture_path = FIXTURE_DIR / fixture_filename
        if not fixture_path.exists():
            raise SurveyUnavailable(f"ไม่มี fixture file ({fixture_filename})")
        try:
            raw = json.loads(fixture_path.read_text(encoding="utf-8"))
            _CACHE[cache_key] = {"data": raw, "ts": now}
            return raw
        except Exception as e:
            raise SurveyUnavailable(f"อ่าน fixture ไม่สำเร็จ: {e}")

    if not force and cache_key in _CACHE:
        entry = _CACHE[cache_key]
        if now - entry["ts"] < CACHE_TTL:
            return entry["data"]

    api_key = get_survey_api_key()
    if not api_key:
        raise SurveyUnavailable("ไม่มี API Key (LF_SURVEY_API_KEY)")

    try:
        url = f"{SURVEY_BASE_URL}/pricelist"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "NasriBOM/1.0",
                "X-LF-Api-Key": api_key,
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                raw = json.loads(resp.read().decode("utf-8"))
                if raw and raw.get("ok"):
                    _CACHE["pricelist"] = {"data": raw, "ts": now}
                    return raw
                else:
                    reason = raw.get("error") if isinstance(raw, dict) else "API returned ok:false"
                    raise SurveyUnavailable(reason or "ok:false")
            else:
                raise SurveyUnavailable(f"HTTP Status {resp.status}")
    except SurveyUnavailable:
        raise
    except Exception as e:
        raise SurveyUnavailable(f"Network error: {e}")


def fetch_qpkg(force: bool = False) -> Dict[str, Any]:
    """
    Fetch /catalog/qpkg from Survey REST API with 10-minute caching.
    If LF_BOM_FIXTURE_MODE=1, load from local qpkg_fixture.json.
    """
    now = time.time()
    if is_fixture_mode():
        fixture_path = FIXTURE_DIR / "qpkg_fixture.json"
        if not fixture_path.exists():
            raise SurveyUnavailable("ไม่มี fixture file (qpkg_fixture.json)")
        try:
            raw = json.loads(fixture_path.read_text(encoding="utf-8"))
            _CACHE["qpkg"] = {"data": raw, "ts": now}
            return raw
        except Exception as e:
            raise SurveyUnavailable(f"อ่าน qpkg fixture ไม่สำเร็จ: {e}")

    if not force and "qpkg" in _CACHE:
        entry = _CACHE["qpkg"]
        if now - entry["ts"] < CACHE_TTL:
            return entry["data"]

    api_key = get_survey_api_key()
    if not api_key:
        raise SurveyUnavailable("ไม่มี API Key (LF_SURVEY_API_KEY)")

    try:
        url = f"{SURVEY_BASE_URL}/catalog/qpkg"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "NasriBOM/1.0",
                "X-LF-Api-Key": api_key,
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                raw = json.loads(resp.read().decode("utf-8"))
                if raw:
                    _CACHE["qpkg"] = {"data": raw, "ts": now}
                    return raw
                raise SurveyUnavailable("qpkg response empty")
            raise SurveyUnavailable(f"HTTP Status {resp.status}")
    except SurveyUnavailable:
        raise
    except Exception as e:
        raise SurveyUnavailable(f"Network error: {e}")


def parse_pricelist_catalog(tabs: Dict[str, List[Any]]) -> Dict[str, Any]:
    """
    Parse pricelist tabs into indexed product catalogs matching theme rules.
    """
    catalog: Dict[str, Any] = {
        "atmoce_inverters": {},
        "cables": {},
        "mounting_keenoc": {},
        "combiner_others": {},
        "labor_fees": {},
        "solar_panels": {},
        "raw_tabs": tabs,
    }

    # 1. Inverters - ATMOCE (col 0 SKU, col 1 Desc, col 2 Cost)
    rows_atmoce = tabs.get("Inverters - ATMOCE", [])
    for r in rows_atmoce:
        if not isinstance(r, list) or not r:
            continue
        c0 = str(r[0] if len(r) > 0 and r[0] is not None else "").strip()
        if not c0 or c0.startswith("⚡") or c0.startswith("📋") or c0 == "SKU" or c0 == "เฟส":
            continue
        desc = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
        cost = _cpl_num(r[2]) if len(r) > 2 else None
        catalog["atmoce_inverters"][c0] = {
            "sku": c0,
            "desc": desc,
            "cost": cost,
        }

    # 2. Solar Panels (col 0 Brand, col 1 Model, col 2 W, col 5 Cost, col 6 Sale)
    rows_panels = tabs.get("Solar Panels", [])
    for r in rows_panels:
        if not isinstance(r, list) or not r:
            continue
        c0 = str(r[0] if len(r) > 0 and r[0] is not None else "").strip()
        if not c0 or c0.startswith("☀️") or c0 == "แบรนด์":
            continue
        model = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
        watt = _cpl_num(r[2]) if len(r) > 2 else 650
        cost = _cpl_num(r[5]) if len(r) > 5 else None
        sale = _cpl_num(r[6]) if len(r) > 6 else None
        key = f"{c0} {model}".strip()
        catalog["solar_panels"][key] = {
            "brand": c0,
            "model": model,
            "watt": watt,
            "cost": cost,
            "sale": sale,
        }

    # 3. Cables (r[1] brand, r[2] model, r[3] detail, r[4] unit, r[6]->r[5] price)
    # Rule 4: [ประเภท, แบรนด์, รุ่น, คำอธิบาย, หน่วย, ≥50k, <50k] -> index 6 (<50k), fallback to index 5 (≥50k)
    rows_cables = tabs.get("Cables", [])
    for r in rows_cables:
        if not isinstance(r, list) or not r:
            continue
        c0 = str(r[0] if len(r) > 0 and r[0] is not None else "").strip()
        if not c0 or c0.startswith("🔌") or c0.startswith("⚡") or c0 == "ประเภท":
            continue
        brand = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
        model = str(r[2] if len(r) > 2 and r[2] is not None else "").strip()
        if not model:
            continue
        detail = str(r[3] if len(r) > 3 and r[3] is not None else "").strip()
        unit = str(r[4] if len(r) > 4 and r[4] is not None else "").strip()
        p6 = _cpl_num(r[6]) if len(r) > 6 else None
        p5 = _cpl_num(r[5]) if len(r) > 5 else None
        price = p6 if p6 is not None else p5
        if price is not None and ("ม้วน" in unit or "100m" in model.lower() or "100m" in detail.lower()):
            price = round(price / 100.0, 4)

        full_name = f"{brand} {model}".strip()
        catalog["cables"][full_name] = {
            "category": c0,
            "brand": brand,
            "model": model,
            "full_name": full_name,
            "detail": detail,
            "unit": unit,
            "cost": price,
        }

    # 4. Mounting - Keenoc (r[0] name, r[1] detail, r[6] price 1 piece)
    # Rule 4: [รายการ, คำอธิบาย, กล่อง, ประกัน, ≥250K, ≥50K, 1 ชิ้น] -> index 6
    rows_mount = tabs.get("Mounting - Keenoc", [])
    for r in rows_mount:
        if not isinstance(r, list) or not r:
            continue
        c0 = str(r[0] if len(r) > 0 and r[0] is not None else "").strip()
        if not c0 or c0.startswith("🏗") or c0 == "รายการ":
            continue
        detail = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
        price_p1 = _cpl_num(r[6]) if len(r) > 6 else None

        item_key = c0.strip()
        catalog["mounting_keenoc"][item_key] = {
            "name": c0,
            "detail": detail,
            "cost": price_p1,
            "unit": "ชิ้น",
        }

    # 5. Combiner Box & Others (r[0] name, r[1] detail, r[2] price)
    rows_comb = tabs.get("Combiner Box & Others", [])
    for r in rows_comb:
        if not isinstance(r, list) or not r:
            continue
        c0 = str(r[0] if len(r) > 0 and r[0] is not None else "").strip()
        if not c0 or c0.startswith("🔧") or c0 == "รายการ":
            continue
        detail = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
        cost = _cpl_num(r[2]) if len(r) > 2 else None
        catalog["combiner_others"][c0] = {
            "name": c0,
            "detail": detail,
            "cost": cost,
        }

    # 6. Labor & Fees (r[0] name, r[1] detail, r[2] cost, r[3] unit)
    rows_labor = tabs.get("Labor & Fees", [])
    for r in rows_labor:
        if not isinstance(r, list) or not r:
            continue
        c0 = str(r[0] if len(r) > 0 and r[0] is not None else "").strip()
        if not c0 or c0.startswith("💰") or c0.startswith("🔗") or c0 == "รายการ" or c0 == "ขนาดต่ำสุด (kW)":
            continue
        detail = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
        cost = _cpl_num(r[2]) if len(r) > 2 else None
        unit = str(r[3] if len(r) > 3 and r[3] is not None else "").strip()
        catalog["labor_fees"][c0] = {
            "name": c0,
            "detail": detail,
            "cost": cost,
            "unit": unit,
        }

    # 7. Inverters - Sigenergy (r[0] category, r[1] model, r[2] detail, r[3] sku, r[4] cost, r[5] sale)
    # Rule 3: Header: หมวด, รุ่น (Model), รายละเอียด, SKU, ราคาสั่งซื้อ r[4], ราคาขาย r[5]
    catalog["sigenergy_items"] = {}
    rows_sigenergy = tabs.get("Inverters - Sigenergy", [])
    for r in rows_sigenergy:
        if not isinstance(r, list) or not r:
            continue
        c0 = str(r[0] if len(r) > 0 and r[0] is not None else "").strip()
        if not c0 or c0.startswith("⚡") or c0 == "หมวด":
            continue
        model = str(r[1] if len(r) > 1 and r[1] is not None else "").strip()
        if not model:
            continue
        detail = str(r[2] if len(r) > 2 and r[2] is not None else "").strip()
        cost = _cpl_num(r[4]) if len(r) > 4 else None
        sale = _cpl_num(r[5]) if len(r) > 5 else None

        catalog["sigenergy_items"][model] = {
            "category": c0,
            "model": model,
            "detail": detail,
            "cost": cost,
            "sale": sale,
        }

    return catalog
