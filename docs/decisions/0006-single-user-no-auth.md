# 0006: Single user, no authentication

Status: accepted

## Context
The app is a personal learning tool run locally with the owner's Anthropic key in `.env`.

## Decision
No accounts, sessions or per-user data. All learnings belong to the one local user.

## Consequences
Do not expose the API on a public network as it is. The Vite dev server listens on all interfaces (`server.host: true`) (the API itself listens on loopback, ADR 0010, but the Vite proxy forwards to it), so anyone on the same LAN can reach the app; use it only on a trusted network. Adding users later means a users table, ownership columns and auth middleware, which supersedes this ADR.
