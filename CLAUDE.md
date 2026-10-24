# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

pnpm workspace monorepo (`apps/api`, `apps/web`, `packages/shared`). Run from the repo root:

- `pnpm dev`: starts the API (`:3001`, via `tsx watch`) and the Vite web app (`:5173`) together. Vite proxies `/api` to the API and listens on all interfaces (`host: true`), so the app is reachable on the LAN; from WSL2 that also needs mirrored networking or a Windows port proxy. Needs `ANTHROPIC_API_KEY` in a root `.env` (see `.env.example`).
- `pnpm typecheck`: `tsc` in every package. There is no linter configured.
- `pnpm test`: Vitest in api and web. Set `NODE_ENV=test` when running API tests so Fastify's logger stays quiet.
- Single package or test: `pnpm --filter @learning/api test -- -t "full flow"`, or `pnpm --filter @learning/web test -- AnswerForm`.
- Logging: pino to stdout and a file. Env `LOG_LEVEL` (default `info`), `LOG_FILE` (default `logs/api.log` in `apps/api`; `off` disables), `LOG_STDOUT` (default `true`). Use the injected logger, never `console.log`.
- `pnpm build`: the API "build" is only a typecheck; the web build produces `apps/web/dist`.

## Docs

Project knowledge lives in `docs/`: [requirements](docs/requirements.md) (FR-n IDs, known gaps), [architecture](docs/architecture.md) (async flow, data model, invariants), [glossary](docs/glossary.md), [best practices](docs/best-practices.md) (follow these when changing code), and [decisions/](docs/decisions/) (ADRs). Update them in the same change as the behavior they describe. For every change: before starting, review the relevant docs (requirements, architecture, glossary, ADRs) so the change fits existing decisions; before finishing, update every doc the change affects (new or changed FR-n, data model, flows, invariants, known gaps, glossary terms) and this file if a command or gotcha changed. A change is not done until the docs match the code. Record a new design decision as a new ADR; never rewrite an accepted one, supersede it.

## Architecture (gotchas; full detail in docs/architecture.md)

**`packages/shared`** holds the Zod schemas and the types derived from them (`z.infer`). It is the API contract, and both apps import it as source (`main: src/index.ts`, no build step). It also holds the schemas Claude's structured output is validated against (`generatedQuestionnaireSchema`, `reviewResultSchema`) and the upload limits. Change the contract here first.

**`apps/api`** (Fastify + better-sqlite3 + Drizzle):
- `buildApp(deps)` in `src/app.ts` takes `{ db, claude, uploadsDir }`, so tests inject an in-memory db and a fake `ClaudeService`. `src/server.ts` is the only place that wires real dependencies. `ClaudeService` (the interface in `src/claude/client.ts`) is the seam for mocking Claude.
- The database schema exists twice. `src/db/schema.ts` is the Drizzle table definitions, and the raw `DDL` string in `src/db/index.ts` creates the tables at startup. There are no migrations, so keep both in sync when changing columns.
- Claude work is asynchronous. `POST .../questionnaires` and `POST .../submissions` insert a row with status `generating` or `reviewing`, return 202, and run `generateQuestionnaire` / `reviewSubmission` (`src/services/questionnaires.ts`) fire-and-forget. These write `ready`/`reviewed` or `failed` plus an error message. The web app polls with TanStack Query `refetchInterval`. Rows stuck in `generating` or `reviewing` after a server restart are not recovered.
- `successRate` is computed server-side from the verdicts (`computeSuccessRate`), not taken from Claude. Questions missing from Claude's review count as failed.
- `questions.expected_answer` must never be sent to the client. `GET /questionnaires/:id` omits it on purpose, and a test checks this.
- Uploaded images are stored on disk under `uploads/<learningId>/`; the `images` table keeps the path. Claude receives them as base64 image blocks.

**Claude API quirk:** this model rejects a forced `tool_choice` (`{type: 'tool'}`/`'any'`) with a 400 error. `callTool` in `src/claude/client.ts` therefore uses `tool_choice: auto`, adds a "respond only by calling the X tool" instruction, and validates the tool input with the shared Zod schema. The model comes from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).

**`apps/web`** (React + Vite + Tailwind): the typed fetch wrapper in `src/api/client.ts` is the only code that talks to the API. Pages are in `src/features/{learnings,questionnaires,submissions}`.

## Git

Pushes to GitHub only work with the noreply author email (repo-level `user.email` is `10567198+ppawlik@users.noreply.github.com`). A commit authored with the real Gmail address is rejected.
