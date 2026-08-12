#!/usr/bin/env bash
# qsolar-release.sh — S4 Versioned Release & Rollback Script (#S4)
# Prepares deployment manifests, sha256 checksums, and rollback archives.
# Safety Rule: ONLY prepares artifacts locally. DOES NOT execute real FTP upload.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RELEASES_DIR="${REPO_DIR}/releases"

mkdir -p "${RELEASES_DIR}"

TIMESTAMP=$(date +"%Y%m%d-%H%M")
RELEASE_TAG="qsolar-v${TIMESTAMP}"

case "${1:-}" in
  --release)
    echo "📦 Creating release: ${RELEASE_TAG}..."
    TARGET_DIR="${RELEASES_DIR}/${RELEASE_TAG}"
    mkdir -p "${TARGET_DIR}"

    # Generate sha256 manifest for all core application files
    echo "🔒 Generating sha256 manifest..."
    cd "${REPO_DIR}"
    find app.js lib/ package.json -type f ! -path '*/.*' -exec sha256sum {} + > "${TARGET_DIR}/manifest.sha256" 2>/dev/null || true

    # Archive release snapshot
    tar -czf "${TARGET_DIR}/bundle.tar.gz" app.js lib/ package.json "${TARGET_DIR}/manifest.sha256" 2>/dev/null || true
    echo "${RELEASE_TAG}" > "${RELEASES_DIR}/LATEST_RELEASE"

    echo "✅ Release ${RELEASE_TAG} prepared at ${TARGET_DIR}"
    ;;

  --rollback)
    TAG="${2:-}"
    if [ -z "${TAG}" ]; then
      if [ -f "${RELEASES_DIR}/LATEST_RELEASE" ]; then
        TAG=$(cat "${RELEASES_DIR}/LATEST_RELEASE")
      else
        echo "❌ Error: Release tag required for --rollback <tag>"
        exit 1
      fi
    fi
    echo "⏪ Preparing rollback archive for tag: ${TAG}..."
    TARGET_DIR="${RELEASES_DIR}/${TAG}"
    if [ ! -d "${TARGET_DIR}" ]; then
      echo "❌ Error: Release directory ${TARGET_DIR} not found!"
      exit 1
    fi
    ROLLBACK_DIR="${RELEASES_DIR}/rollback-${TAG}"
    mkdir -p "${ROLLBACK_DIR}"
    cp -r "${TARGET_DIR}/"* "${ROLLBACK_DIR}/"
    echo "✅ Rollback archive prepared at ${ROLLBACK_DIR} (Ready for FTP deploy)"
    ;;

  *)
    echo "Usage: $0 --release | --rollback <tag>"
    exit 1
    ;;
esac
