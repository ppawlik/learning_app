# 0009: Fail interrupted jobs at startup, allow review retry

Status: accepted

## Context
ADR 0003 runs Claude jobs in-process. A restart (including every `tsx watch` reload in development) leaves rows in `generating` or `reviewing`, so the UI polled forever, and a failed review could not be repeated even though the answers were stored.

## Decision
At startup, before listening, `failInterruptedJobs` sets every questionnaire in `generating` and every submission in `reviewing` to `failed` with the error "Interrupted by a server restart; please try again". A failed submission can be reviewed again with `POST /api/submissions/:id/retry` (409 unless `failed`), which resets it to `reviewing` and runs the same fire-and-forget job. A failed questionnaire is not retried; the user generates a new one.

## Alternatives
Resume jobs automatically at startup (risk of surprise cost and repeated crashes); a persistent job queue (more infrastructure than a single-user app needs).

## Consequences
No row stays in progress forever. The work of an interrupted call is lost, but the user can retry reviews without retyping answers. Only valid for a single server process (see ADR 0002).
