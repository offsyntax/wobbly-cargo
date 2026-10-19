#!/usr/bin/env bash
# SessionStart hook: puts the handoff and recent git state into Claude's context.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

echo "=== docs/HANDOFF.md (read first; you MUST keep it updated, see CLAUDE.md) ==="
if [ -f docs/HANDOFF.md ]; then
  sed -n '1,140p' docs/HANDOFF.md
else
  echo "docs/HANDOFF.md is missing. Create it following the Handoff rules in CLAUDE.md."
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo
  echo "=== Recent commits ==="
  git log --oneline -8 2>/dev/null
  echo
  echo "=== Uncommitted changes (first 20) ==="
  git status --short 2>/dev/null | head -20
fi
exit 0
