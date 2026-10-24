# 0010: API binds to loopback by default

Status: accepted

## Context
ADR 0006 accepts no authentication. The API listened on `0.0.0.0`, so anyone on the LAN could call it directly, including endpoints that spend the Anthropic key. Browsers, including those on the LAN, only need the Vite dev server (`host: true`), which proxies `/api` to the API on the same machine.

## Decision
The API listens on `127.0.0.1` by default; `HOST` overrides it (for example `0.0.0.0` in a container). The Vite dev server still listens on all interfaces.

## Consequences
The API is no longer reachable directly from other devices; they use the web app's address and its `/api` proxy. Anyone on the LAN who can reach the Vite port can still use the app, so ADR 0006's trusted-network warning stays.
