#!/usr/bin/env bash
# SessionStart hook — make the workspace ready for Claude Code on the web:
# ensure pnpm is available and install dependencies so tests and linters can run.
# Best-effort and non-blocking: it never fails the session.
set -u

project_dir="${CLAUDE_PROJECT_DIR:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"}"
cd "$project_dir" || exit 0

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

if command -v pnpm >/dev/null 2>&1; then
  echo "[session-start] installing dependencies with pnpm…"
  pnpm install --prefer-offline 2>&1 | tail -n 5 || true
else
  echo "[session-start] pnpm not available; skipping install."
fi

exit 0
