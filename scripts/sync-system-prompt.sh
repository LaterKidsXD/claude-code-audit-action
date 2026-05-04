#!/usr/bin/env bash
# Vendor the claim-auditor system prompt body into system-prompts/claim-auditor.md.
# The body is everything AFTER the closing `---` of the YAML frontmatter.
#
# Usage:
#   bash scripts/sync-system-prompt.sh [path-to-audit-stack]
#
# Default source path: /workspaces/claude-code-audit-stack
# CI override: SOURCE_REPO env var, e.g. SOURCE_REPO=/tmp/audit-stack bash scripts/sync-system-prompt.sh
set -euo pipefail

SOURCE_REPO="${SOURCE_REPO:-${1:-/workspaces/claude-code-audit-stack}}"
SOURCE_FILE="${SOURCE_REPO}/agents/claim-auditor.md"
DEST_FILE="$(dirname "$0")/../system-prompts/claim-auditor.md"

if [[ ! -f "${SOURCE_FILE}" ]]; then
  echo "ERROR: source file not found: ${SOURCE_FILE}" >&2
  exit 1
fi

# Strip YAML frontmatter (everything from start through the second `---` line on its own).
# awk is more robust than sed here for matching `---` exactly.
awk '
  BEGIN { in_fm = 0; past_fm = 0; line_num = 0 }
  {
    line_num++
    if (line_num == 1 && $0 == "---") { in_fm = 1; next }
    if (in_fm && $0 == "---") { in_fm = 0; past_fm = 1; next }
    if (in_fm) next
    if (past_fm || line_num > 1) print
    else if (line_num == 1) { print; past_fm = 1 }
  }
' "${SOURCE_FILE}" | sed -e '/./,$!d' > "${DEST_FILE}"

echo "Synced ${SOURCE_FILE} → ${DEST_FILE}"
echo "Bytes: $(wc -c < "${DEST_FILE}")"
