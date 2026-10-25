# 0013: Retry a failed questionnaire generation on the same row

Status: accepted. Extends ADR 0009 (which left failed questionnaires without a retry).

## Context
A failed generation (token limit, network error, interrupted by a restart) was a dead end: the page showed the error and the user had to go back and generate another questionnaire, leaving a failed row behind.

## Decision
`POST /api/questionnaires/:id/retry` (409 unless `failed`) resets the row to `generating`, clears the error and runs the same fire-and-forget job as the first attempt, mirroring `POST /submissions/:id/retry`. The questionnaire page and the topic page offer "Wygeneruj ponownie". Generation inserts questions in one transaction, so a failed row has none and a retry cannot duplicate them. Rows can also be deleted (`DELETE /api/questionnaires/:id`, `DELETE /api/submissions/:id`), except while `generating` / `reviewing` (409).

## Alternatives
Only generate a new questionnaire (leaves failed rows, the numbering per topic gets gaps); automatic retries (hidden cost).

## Consequences
No dead ends after a failed job, and failed sets can be cleaned up. The images and prompt are read again at retry time, so edits made in between apply.
