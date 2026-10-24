# 0006: Single user, no authentication

Status: accepted

## Context
The app is a personal learning tool run locally with the owner's Anthropic key in `.env`.

## Decision
No accounts, sessions or per-user data. All learnings belong to the one local user.

## Consequences
Do not expose the API on a public network as it is. Adding users later means a users table, ownership columns and auth middleware, which supersedes this ADR.
