#!/usr/bin/env bash
# CI assertion: vendored system prompt must match upstream claim-auditor body.
# Compares hash of system-prompts/claim-auditor.md against re-derived body from
# the upstream agents/claim-auditor.md (frontmatter stripped). Fails non-zero on drift.
set -euo pipefail

SOURCE_REPO="${SOURCE_REPO:-${1:-/workspaces/claude-code-audit-stack}}"
SOURCE_FILE="${SOURCE_REPO}/agents/claim-auditor.md"
VENDORED_FILE="$(dirname "$0")/../system-prompts/claim-auditor.md"

if [[ ! -f "${SOURCE_FILE}" ]]; then
  echo "WARNING: upstream source not available at ${SOURCE_FILE}; skipping drift check." >&2
  exit 0
fi

if [[ ! -f "${VENDORED_FILE}" ]]; then
  echo "ERROR: vendored prompt missing: ${VENDORED_FILE}" >&2
  exit 1
fi

UPSTREAM_BODY="$(awk '
  BEGIN { in_fm = 0; past_fm = 0; line_num = 0 }
  {
    line_num++
    if (line_num == 1 && $0 == "---") { in_fm = 1; next }
    if (in_fm && $0 == "---") { in_fm = 0; past_fm = 1; next }
    if (in_fm) next
    if (past_fm || line_num > 1) print
    else if (line_num == 1) { print; past_fm = 1 }
  }
' "${SOURCE_FILE}" | sed -e '/./,$!d')"

VENDORED_BODY="$(cat "${VENDORED_FILE}")"

if [[ "${UPSTREAM_BODY}" == "${VENDORED_BODY}" ]]; then
  echo "OK: vendored prompt matches upstream."
  exit 0
else
  echo "ERROR: vendored prompt drifts from upstream." >&2
  echo "Run: npm run sync-prompt" >&2
  exit 1
fi
