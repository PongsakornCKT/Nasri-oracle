#!/usr/bin/env python3
"""Thin CLI wrapper around calculate_atmoce_bom_n1() for Node.js bridge calls.

Usage:
    python3 srp_calc_cli.py '{"action":"atmoce_n1","panels":10,"ratio":"2:1","phase":"1P"}'

Outputs: JSON
Exit 0 = success (JSON on stdout), Exit 1 = error (JSON with error message on stderr).
"""
from __future__ import annotations

import sys
import json
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from srp_calculator import calculate_atmoce_bom_n1


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing JSON argument"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    try:
        args = json.loads(sys.argv[1])
        res = calculate_atmoce_bom_n1(
            panels=int(args["panels"]),
            ratio=args.get("ratio", "2:1"),
            phase=args.get("phase", "1P"),
            roof_type=args.get("roof_type", "metal"),
            rows=int(args.get("rows", 1)),
            trunk_cable_length=args.get("trunk_cable_length", "2.5"),
            battery_kwh=int(args.get("battery_kwh", 0)),
            battery_sku=args.get("battery_sku"),
            backup=bool(args.get("backup", False)),
        )
        print(json.dumps(res, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc), "success": False}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
