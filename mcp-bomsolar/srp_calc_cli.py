#!/usr/bin/env python3
"""Thin CLI wrapper around calculate_srp() for Node.js bridge calls.

Usage:
    python3 srp_calc_cli.py '{"config":"1:1-1P","panels":8,"battery_kwh":7,"backup":true}'

Outputs: JSON — same schema as SRPResult.as_dict()
Exit 0 = success (JSON on stdout), Exit 1 = error (message on stderr).
"""
from __future__ import annotations

import sys
import json
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from srp_calculator import calculate_srp


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing JSON argument"}), file=sys.stderr)
        sys.exit(1)
    try:
        args = json.loads(sys.argv[1])
        r = calculate_srp(
            args["config"],
            int(args["panels"]),
            battery_kwh=int(args.get("battery_kwh", 0)),
            backup=bool(args.get("backup", False)),
            warranty_years=int(args.get("warranty_years", 0)),
        )
        print(json.dumps(r.as_dict()))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
