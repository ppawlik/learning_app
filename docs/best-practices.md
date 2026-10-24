# Best practices

Conventions for changing this codebase. They follow from the architecture and ADRs; when one of them changes, update this file in the same change.

## Process

- Review the relevant docs before starting and update them before finishing (see [README](README.md)).
- Record a new design decision as a new ADR in `decisions/`. Never rewrite an accepted ADR; supersede it.
- Keep changes small and focused. Do not mix refactors with behavior changes.
- Commit only with the noreply author email (see `CLAUDE.md`, Git).
- Draw diagrams in mermaid inside `docs/` (GitHub renders it; PlantUML code blocks are not rendered there).
- Before calling a change done, run `pnpm typecheck`, `NODE_ENV=test pnpm test` and, for any change that touches the UI or the API flow, `pnpm e2e`.

## Contract and types

- Change the API contract in `packages/shared` first (Zod schema), then the API, then the web app.
- Derive types with `z.infer`; do not hand-write a type that duplicates a schema.
- Validate every request body, and every Claude tool input, with the shared schema.
- Do not add a build step to `packages/shared`; it is consumed as source.

## API (Fastify, SQLite, Drizzle)

- Take dependencies as arguments to `buildApp`; only `src/server.ts` wires real ones. Do not import a concrete Claude client or db inside routes or services.
- Keep route handlers thin: parse, call a service, return. Put job and business logic in `src/services/`.
- Keep `src/db/schema.ts` and the `DDL` string in `src/db/index.ts` in sync. There are no migrations: for a column added to an existing table also add an `ALTER TABLE` check in `createDb` (with a test), otherwise existing dev databases break; for any other schema change say in the docs that it needs a fresh database.
- Never send `questions.expected_answer` to the client. Add or keep a test whenever a new route returns questions.
- Compute derived values (such as `successRate`) on the server from stored data, never trust them from Claude.
- Fire-and-forget jobs must catch every error and write `failed` with a message. A job must never leave a row in `generating` or `reviewing` through a handled error; rows left by a crash or restart are failed by `failInterruptedJobs` at startup.
- Validate uploads against the limits in `packages/shared`, and store files only under `uploads/<learningId>/`.
- Never log secrets such as `ANTHROPIC_API_KEY`, and do not commit `.env`.

## Claude calls

- Go through the `ClaudeService` interface so tests can inject a fake. Never call the Anthropic SDK from anywhere else.
- Use the `callTool` pattern: `tool_choice: auto`, an explicit "respond only by calling the X tool" instruction, then Zod validation of the tool input (ADR 0004). Check `stop_reason`: a `max_tokens` stop truncates the tool call and must fail with a clear error, not a Zod message.
- Treat Claude output as untrusted input: validate, handle a missing or malformed result as a failure, and handle questions missing from a review as failed.
- Prompt rules (for example how questions are labelled or split into subquestions) are not guaranteed; keep the matching schema and UI tolerant, and add a server-side check if a rule must hold.
- Read the model from `ANTHROPIC_MODEL`; do not hardcode a model id in feature code.

## Web (React, Vite, Tailwind)

- All API access goes through `src/api/client.ts`. Components do not call `fetch`.
- Use TanStack Query for server state. Poll with `refetchInterval` only while a status is `generating` or `reviewing`, and stop on `ready`, `reviewed` or `failed`.
- Show `failed` states with the stored error message, and loading and empty states for every list.
- Keep feature code in `src/features/{learnings,questionnaires,submissions}`; share only genuinely generic components.
- Make forms accessible: labels tied to inputs, buttons for actions, links for navigation.

## Logging

- Use the injected logger (`req.log`, or the `log` argument of services and `createClaudeService`); do not use `console.log` or create loggers elsewhere. Only `src/server.ts` builds the real one.
- Log ids, counts, durations and statuses. Never log prompts, questions, answers, image data, or secrets.
- Log a handled error where it is caught (for example in a job's `catch`) with the error object under `err`, in addition to storing the message on the row.
- Use `info` for lifecycle events, `warn` for rejected input, `error` for failures, `debug` for detail.

## Testing

- API: build the app with an in-memory db and a fake `ClaudeService`. Test the full flow (create, generate, answer, review) and the `expected_answer` exclusion.
- Web: test behavior through the rendered UI (Vitest), not implementation details.
- Add a test for every bug fix that reproduces the bug first.
- Tests must not call the real Anthropic API or need a key.
- Pyramid: unit tests for pure logic and schemas (`packages/shared/test`, `draftAnswers`), component tests with Testing Library for UI states, API integration tests through `app.inject` with a fake `ClaudeService`, and Playwright (`e2e/`) for browser flows and visual regression (ADR 0011).
- Visual baselines are PNGs in `e2e/tests/__screenshots__`. Mask volatile content (timestamps) instead of loosening the tolerance, review image diffs before running `pnpm e2e:update`, and never update baselines to make a failing run pass without understanding the change.
- The e2e fake Claude (`apps/api/e2e/server.ts`) mirrors `ClaudeService`; extend it when the contract changes, and keep the `__e2e/reset` route out of the production server.

## Security and scope

- The app is single user with no auth (ADR 0006). Do not expose the API publicly as it is.
- Do not add dependencies without a reason that fits the stack; prefer what is already installed.
- Keep error messages shown to the user free of stack traces and internal paths.
