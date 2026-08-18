# Learning: Shell Script Hygiene Linter & Option Clustering Regex Trap (2026-08-18)

## Context
Fleet-parity Phase 6 final exam: Created `scripts/check-shell-hygiene.sh` in repo `pa-Oracle v2` to automate shell hygiene auditing based on findings from ptah and bastet.

## Key Features Implemented
1. **Missing `set -euo pipefail` Detection**: Scans scripts for explicit `set` directives ensuring `-e` (errexit), `-u` (nounset), and `-o pipefail` are active.
2. **Hardcoded Path Detection**: Scans for `/home/po-ch` and `/mnt/c`, reporting hit counts per file.
3. **Allowlist Mechanism**: Any file containing `# hygiene-ok` is skipped.
4. **Summary & Output Modes**: Supports `--summary` flag for concise output alongside full detailed report.
5. **Exit Codes**: Returns `0` when clean or all allowlisted, `1` when non-allowlisted violations exist.

## Trap Found & Resolved (Regex Option Clusters)
- **Symptom**: Initial regex `set -.*euo.*pipefail` matched false positives (such as `echo "Missing set -euo pipefail"` inside code strings) and failed on option clusters (`set -euo pipefail` vs `set -o pipefail`).
- **Root Cause**:
  1. Searching for `set` without anchoring to line start (`^\s*set\s+`) caught text inside `echo` statements.
  2. In `set -euo pipefail`, `-o` is part of the cluster `-euo`, followed by parameter `pipefail`. A naive regex looking for `-o\s+pipefail` fails because `-o` isn't a standalone flag in `-euo`.
- **Fix**: Used precise anchored regexes:
  - `-e`: `^\s*set\s+.*(-[a-zA-Z]*e|-o\s+errexit)`
  - `-u`: `^\s*set\s+.*(-[a-zA-Z]*u|-o\s+nounset)`
  - `pipefail`: `^\s*set\s+.*-[a-zA-Z]*o\s+pipefail`

## Empirical Verification
- **Fixtures (4 files)**: 1 clean, 1 allowlisted, 1 missing set, 1 hardcoded paths (2 hits) -> Scanned: 4, Violations: 2, Exit Code: 1.
- **Production `scripts/` (52 files)**: Scanned: 52, Allowlisted: 1, Violations: 35 (Missing set -euo: 27, Hardcoded paths: 21 files / 92 hits), Exit Code: 1.
- **Commit SHA**: `f28b6e4` in worktree `/home/po-ch/wt-shell-hygiene` (branch `feat/shell-hygiene-check`).
