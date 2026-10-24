#!/usr/bin/env bash
# Controls the whole app (API on :3001, web on :5173) from the repo root.
#   ./app.sh [start]   install deps / create .env on first run, then run in the foreground (Ctrl+C stops it)
#   ./app.sh stop      stop a running instance (from another terminal)
#   ./app.sh restart   stop, then start
#   ./app.sh status    show whether it is running
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

PIDFILE=.app.pid
PORTS=(3001 5173)

# Process group of the instance started by this script, if it is still alive.
running_pgid() {
  [ -f "$PIDFILE" ] || return 1
  local pid
  pid=$(cat "$PIDFILE")
  kill -0 "$pid" 2>/dev/null || return 1
  echo "$pid"
}

# PIDs listening on the app ports (covers instances started with plain `pnpm dev`).
port_pids() {
  local p
  for p in "${PORTS[@]}"; do
    ss -ltnpH "sport = :$p" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true
  done | sort -u
}

stop_app() {
  local pgid stopped=0 pid
  if pgid=$(running_pgid); then
    kill -TERM -- "-$pgid" 2>/dev/null || true
    stopped=1
  fi
  # Also stop anything still holding the ports (e.g. started by `pnpm dev` directly, or left behind).
  for pid in $(port_pids); do
    kill -TERM "$pid" 2>/dev/null || true
    stopped=1
  done
  rm -f "$PIDFILE"
  if [ "$stopped" = 1 ]; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      [ -z "$(port_pids)" ] && break
      sleep 0.5
    done
    for pid in $(port_pids); do kill -KILL "$pid" 2>/dev/null || true; done
    echo "Stopped."
  else
    echo "Not running."
  fi
}

status_app() {
  local pids
  pids=$(port_pids | tr '\n' ' ')
  if [ -n "$pids" ]; then
    echo "Running (pids: $pids). Web: http://localhost:5173, API: http://localhost:3001"
  else
    echo "Not running."
    return 1
  fi
}

start_app() {
  command -v pnpm >/dev/null || { echo "pnpm is not installed (https://pnpm.io/installation)" >&2; exit 1; }

  if [ -n "$(port_pids)" ]; then
    echo "Already running (ports ${PORTS[*]} are in use). Use './app.sh restart' or './app.sh stop'." >&2
    exit 1
  fi

  if [ ! -d node_modules ]; then
    echo "Installing dependencies..."
    pnpm install
  fi

  if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example. Set ANTHROPIC_API_KEY in it, then run ./app.sh again." >&2
    exit 1
  fi

  if ! grep -Eq '^ANTHROPIC_API_KEY=sk-ant-[^.]' .env; then
    echo "ANTHROPIC_API_KEY in .env is missing or still the placeholder." >&2
    exit 1
  fi

  # Own process group, so `stop` (or Ctrl+C here) takes down pnpm, tsx and vite together.
  setsid pnpm dev &
  echo $! > "$PIDFILE"
  trap 'kill -TERM -- "-$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"' INT TERM
  wait "$!" || true
  rm -f "$PIDFILE"
}

case "${1:-start}" in
  start) start_app ;;
  stop) stop_app ;;
  restart) stop_app; start_app ;;
  status) status_app ;;
  *) echo "Usage: $0 [start|stop|restart|status]" >&2; exit 2 ;;
esac
