# 0011: Playwright for browser and visual tests

Status: accepted

## Context
Unit and `app.inject` tests (Vitest, jsdom) cannot catch layout regressions or wiring errors between the real web app, the Vite proxy and the API, for example the task/subquestion hierarchy or the retry flow.

## Decision
Add an `e2e` workspace package with Playwright (Chromium, pinned to 1.63.0 to match the locally cached browser). `pnpm e2e` starts a dedicated API (`apps/api/e2e/server.ts`: real routes, in-memory db, deterministic fake Claude, test-only `POST /api/__e2e/reset`) on port 3101 and Vite on port 5273 proxying to it, so it runs without an API key and next to `pnpm dev`. Flow tests assert behavior; visual tests use `toHaveScreenshot` with baselines committed under `e2e/tests/__screenshots__`, timestamps masked, a strict per-pixel colour threshold (0.02) and 0.2% of pixels allowed to differ (the default threshold missed a deliberate card colour change). Tests run on one worker because they share the API and reset it before each test.

## Alternatives
Vitest browser mode or Storybook snapshots (do not exercise the real stack); a hosted visual service (external dependency, uploads screenshots); running e2e against the real Claude API (slow, costs money, non-deterministic).

## Consequences
Baselines are tied to Chromium on Linux and may differ on other platforms or font sets; regenerate them deliberately with `pnpm e2e:update`. The reset route exists only in the e2e server. Real Claude behavior (prompt quality, `tool_choice`) stays untested here, as in ADR 0004.
