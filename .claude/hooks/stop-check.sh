#!/usr/bin/env bash
# Stop hook: if project files changed since the last handoff update, make Claude update
# docs/HANDOFF.md before it finishes. Does nothing on turns without file changes.
input="$(cat)"
case "$input" in
  *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;;  # avoid loops
esac

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

if [ ! -f docs/HANDOFF.md ]; then
  echo "docs/HANDOFF.md is missing. Create it (see Handoff rules in CLAUDE.md) before finishing." >&2
  exit 2
fi

# Handoff already updated in the working tree -> fine.
if [ -n "$(git status --porcelain -- docs/HANDOFF.md)" ]; then
  exit 0
fi

pending="$(git status --porcelain -- . ':(exclude)docs/HANDOFF.md' | head -1)"
last="$(git log -1 --format=%H -- docs/HANDOFF.md 2>/dev/null)"
committed=""
if [ -n "$last" ]; then
  committed="$(git diff --name-only "$last" HEAD -- . ':(exclude)docs/HANDOFF.md' | head -1)"
fi

if [ -n "$pending" ] || [ -n "$committed" ]; then
  echo "Project files changed since the last handoff. Before finishing, update docs/HANDOFF.md: rewrite Current state, Milestones, In progress, Next steps, Waiting on humans, Open issues; add new Decisions; prepend a Session log entry. Then commit it." >&2
  exit 2
fi
exit 0
