#!/usr/bin/env python3
"""Thin CLI wrapper around calculate_bom_n2() for Node.js bridge calls (#N2).

Usage:
    python3 srp_calc_cli.py '{"action":"bom_n2","system":"sigenergy5in1","panels":16,"phase":"3P"}'

Outputs: JSON
Exit 0 = success (JSON on stdout), Exit 1 = error (JSON with error message on stderr).
"""
from __future__ import annotations

import sys
import json
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from srp_calculator import calculate_bom_n2, calculate_atmoce_bom_n1


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing JSON argument"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    try:
        args = json.loads(sys.argv[1])
        action = args.get("action", "bom_n2")

        if action == "atmoce_n1":
            res = calculate_atmoce_bom_n1(
                panels=int(args.get("panels", 0)),
                ratio=args.get("ratio", "2:1"),
                phase=args.get("phase", "1P"),
                roof_type=args.get("roof_type", "metal"),
                rows=int(args.get("rows", 1)),
                trunk_cable_length=args.get("trunk_cable_length", "2.5"),
                battery_kwh=float(args.get("battery_kwh", 0.0)),
                battery_sku=args.get("battery_sku"),
                backup=bool(args.get("backup", False)),
                fixture_filename=args.get("fixture_filename", "pricelist_fixture.json"),
            )
        else:
            sys_name = args.get("system", "atmoce21")
            res = calculate_bom_n2(
                system=sys_name,
                panels=int(args.get("panels", 0)),
                ratio=args.get("ratio"),
                phase=args.get("phase", "1P"),
                kw=float(args.get("kw", 0.0)),
                battery_kwh=float(args.get("battery_kwh", 0.0)),
                battery_sku=args.get("battery_sku"),
                backup=bool(args.get("backup", False)),
                c_rate=args.get("c_rate"),
                roof_type=args.get("roof_type", "metal"),
                rows=int(args.get("rows", 1)),
                trunk_cable_length=args.get("trunk_cable_length", "2.5"),
                fixture_filename=args.get("fixture_filename", "pricelist_fixture.json"),
            )
        print(json.dumps(res, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc), "success": False}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
