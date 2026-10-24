#!/usr/bin/env bash
# Starts the whole app (API on :3001, web on :5173) from the repo root.
# Installs dependencies and creates .env on first run.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

command -v pnpm >/dev/null || { echo "pnpm is not installed (https://pnpm.io/installation)" >&2; exit 1; }

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  pnpm install
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Set ANTHROPIC_API_KEY in it, then run ./start.sh again." >&2
  exit 1
fi

if ! grep -Eq '^ANTHROPIC_API_KEY=sk-ant-[^.]' .env; then
  echo "ANTHROPIC_API_KEY in .env is missing or still the placeholder." >&2
  exit 1
fi

exec pnpm dev
