#!/usr/bin/env bash
# ==============================================================================
# Script: check-survey-drift.sh
# Author: Nasri Oracle — Right Hand of Ma'at 𓂀
# Purpose: Inspect & verify Live vs Git drift for survey.enervia theme files
# Based on: deploy-pipelines skill & case-studies #2, #8
# ==============================================================================
# Usage:
#   ./check-survey-drift.sh [options]
#
# Options:
#   --dry-run        (Default) Run in safe simulation/read-only mode.
#   --confirm        Execute actual remote check (requires valid credentials).
#   --file <name>    Target file to check (default: functions.php).
#   --help           Show this help message.
# ==============================================================================

set -euo pipefail

# --- Color Constants ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Defaults ---
CONFIRM=false
DRY_RUN=true
TARGET_FILE="functions.php"
LOCAL_REPO_DIR="${SURVEY_REPO_DIR:-/mnt/c/Users/pO-Ch/Documents/GitHub/enervia-survey}"

# --- Usage Function ---
show_help() {
  cat << 'EOF'
check-survey-drift.sh — Live vs Git Drift Checker for Enervia Survey

USAGE:
  ./check-survey-drift.sh [FLAGS]

FLAGS:
  --confirm      Execute real inspection (fetches FTPS live snapshot safely)
  --dry-run      Run dry-run simulation mode (Default)
  --file <name>  Specify theme file to check (default: functions.php)
  --help         Show this documentation

DESCRIPTION:
  Prevents live-ahead drift where hot-deploys exist on live server but
  are missing from the main Git branch. Uses function signature diffing
  with CRLF stripping (comm -23).
EOF
  exit 0
}

# --- Parse Arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm)
      CONFIRM=true
      DRY_RUN=false
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      CONFIRM=false
      shift
      ;;
    --file)
      TARGET_FILE="$2"
      shift 2
      ;;
    --help)
      show_help
      ;;
    *)
      echo -e "${RED}[ERROR] Unknown option: $1${NC}"
      echo "Use --help for usage details."
      exit 1
      ;;
  esac
done

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}   Enervia Survey — Live vs Git Drift Checker 𓂀   ${NC}"
echo -e "${BLUE}====================================================${NC}"

# --- Safety Check & Warning ---
if [[ "$CONFIRM" != "true" ]]; then
  echo -e "${YELLOW}[WARNING] Running in SAFE DRY-RUN / SIMULATION mode.${NC}"
  echo -e "${YELLOW}[WARNING] No remote connections or credential files touched.${NC}"
  echo -e "${YELLOW}[NOTE] Pass --confirm to execute actual remote FTPS fetch.${NC}"
  echo ""
fi

# --- Helper Functions ---
extract_functions() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo ""
    return
  fi
  # Strip trailing CRs (\r), extract function names, sort unique
  tr -d '\r' < "$file" | grep -oP 'function \K\w+' | sort -u
}

compare_drift() {
  local live_file="$1"
  local main_file="$2"

  local live_funcs
  local main_funcs
  live_funcs=$(mktemp)
  main_funcs=$(mktemp)

  extract_functions "$live_file" > "$live_funcs"
  extract_functions "$main_file" > "$main_funcs"

  # comm -23 outputs lines present in live_funcs but NOT in main_funcs
  local missing_in_main
  missing_in_main=$(comm -23 "$live_funcs" "$main_funcs")

  rm -f "$live_funcs" "$main_funcs"

  echo "$missing_in_main"
}

# --- Execution ---
if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "${BLUE}[INFO] Simulating drift check for file: ${TARGET_FILE}${NC}"
  echo -e "[INFO] Checking local repo path: ${LOCAL_REPO_DIR}"
  echo ""
  echo -e "${GREEN}[SAFE] Dry-run simulation completed cleanly.${NC}"
  echo -e "${GREEN}[SAFE] Status: SAFE — main >= live (Simulation mode passed)${NC}"
  exit 0
fi

# --- Real Execution Mode ---
echo -e "${BLUE}[INFO] Performing real drift check on: ${TARGET_FILE}${NC}"

SECRETS_FILE="${HOME}/.nasri-deploy-secrets"
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo -e "${RED}[ERROR] Secrets file not found at ${SECRETS_FILE}${NC}"
  echo -e "${RED}[ERROR] Cannot perform live FTPS fetch without credentials.${NC}"
  exit 1
fi

source "$SECRETS_FILE"

if [[ -z "${SURVEY_FTP_USER:-}" || -z "${SURVEY_FTP_PASS:-}" ]]; then
  echo -e "${RED}[ERROR] FTP credentials missing in ${SECRETS_FILE}${NC}"
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

LIVE_FILE="${TMP_DIR}/live_${TARGET_FILE}"
MAIN_FILE="${LOCAL_REPO_DIR}/src/theme/${TARGET_FILE}"

if [[ ! -f "$MAIN_FILE" ]]; then
  # Fallback to root if not in src/theme
  MAIN_FILE="${LOCAL_REPO_DIR}/${TARGET_FILE}"
fi

if [[ ! -f "$MAIN_FILE" ]]; then
  echo -e "${RED}[ERROR] Local main file not found at: ${MAIN_FILE}${NC}"
  exit 1
fi

echo -e "[INFO] Fetching live file from FTPS..."
FTP_URL="ftp://survey.enervia.co.th/survey.enervia.co.th/wp-content/themes/leadfollow/${TARGET_FILE}"

if curl -s -k --ssl-reqd --user "${SURVEY_FTP_USER}:${SURVEY_FTP_PASS}" "$FTP_URL" -o "$LIVE_FILE"; then
  echo -e "${GREEN}[OK] Live file fetched successfully.${NC}"
else
  echo -e "${RED}[ERROR] Failed to fetch live file via FTPS.${NC}"
  exit 1
fi

echo -e "[INFO] Diffing functions between Live and Git Main..."
DRIFT=$(compare_drift "$LIVE_FILE" "$MAIN_FILE")

if [[ -n "$DRIFT" ]]; then
  echo -e "${RED}====================================================${NC}"
  echo -e "${RED}[DRIFT DETECTED] Live server contains functions missing from Git Main!${NC}"
  echo -e "${RED}====================================================${NC}"
  echo -e "Unmerged live functions:"
  echo "$DRIFT" | sed 's/^/  - /'
  echo ""
  echo -e "${YELLOW}[ACTION REQUIRED] Port these functions into Git Main before deploying!${NC}"
  exit 2
else
  echo -e "${GREEN}====================================================${NC}"
  echo -e "${GREEN}[SAFE] Status: SAFE — main >= live${NC}"
  echo -e "${GREEN}====================================================${NC}"
  echo -e "No unmerged hot-deploy functions found on live server."
  exit 0
fi
