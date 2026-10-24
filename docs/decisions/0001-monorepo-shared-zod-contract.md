# 0001: pnpm monorepo with a shared Zod contract

Status: accepted

## Context
A TypeScript frontend and backend that must agree on request/response shapes and on Claude's structured output.

## Decision
pnpm workspaces with `apps/web`, `apps/api` and `packages/shared`. Shared holds Zod schemas and `z.infer` types and is consumed as source (no build step).

## Alternatives
tRPC (end-to-end types but couples the API to TS clients); OpenAPI with generated clients (more tooling than needed).

## Consequences
One definition per type; the same schemas validate requests and Claude output. Both apps must run through a TS-aware tool (tsx, Vite).
