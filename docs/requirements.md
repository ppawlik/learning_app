# Requirements

Single-user app; no authentication. Requirement IDs can be referenced from tests and commits.

## Functional

- **FR-1 Create learning.** The user creates a learning with a title (1-200 chars) and a prompt (1-5000 chars) describing what the questionnaire should cover. Learnings can be listed (with the number of questionnaires and the latest result), opened, edited (title and prompt) and deleted (deleting also removes its uploaded files).
- **FR-2 Images.** The user uploads images to a learning (drag and drop or file picker) and can remove them. Allowed: JPEG, PNG, GIF, WebP, HEIC/HEIF (detected by MIME type or `.heic`/`.heif` extension, converted to JPEG on upload and stored as JPEG); max 5 MB each (also checked after conversion); max 20 per learning. Anything else is rejected with 400/413.
- **FR-3 Generate questionnaire.** With at least one image, the user triggers generation. Claude (vision) builds the questions from the images, following the learning prompt. Question types: `open` and `multiple_choice`. The questionnaire is attached to the learning and moves `generating` to `ready` or `failed` (with an error message); a failed one can be regenerated on the same row (`POST /api/questionnaires/:id/retry`, ADR 0013). Questionnaires and submissions can be deleted unless a job is still running. Questions are hierarchical (ADR 0008): a question is either a plain question or a statement with lettered subquestions (a, b, c), each with its own type and expected answer.
- **FR-4 Answer.** The user fills in a ready questionnaire (text area for open questions, radio buttons for multiple choice) and submits the answers. Questions are numbered 1, 2, 3 and subquestions lettered a, b, c; every plain question and every subquestion has its own input, while the statement of a question with subquestions has none. Interim answers are saved in the browser's `localStorage` whenever focus leaves an input, restored when the form is opened again, and cleared after a successful submit.
- **FR-5 Review.** After submission Claude reviews every answer (one per plain question or subquestion): verdict `passed` or `failed`, per-answer feedback, and a descriptive overall summary. Feedback and summary refer to questions by the numbers shown on the page (1, 2a), not internal ids. The summary is addressed to the learner and follows a fixed shape set in the review prompt: count of correct answers, what was fully correct, bulleted mistakes per question, closing practice tips (a prompt rule, not enforced in code). A submission moves `reviewing` to `reviewed` or `failed`; a failed review can be retried on the stored answers (`POST /api/submissions/:id/retry`).
- **FR-6 Statistics.** Each reviewed submission shows a success rate (percentage of passed answers) and the number of passed answers. The topic page lists the attempts of each questionnaire with their results and a trend.
- **FR-7 Result page.** For a failed answer the review shows the correct answer (ADR 0012). Cards carry the full question label, failed answers can be jumped to and filtered, and the learner can solve the same questionnaire again.
- **FR-8 Navigation and waiting.** Every page has breadcrumbs and a way back to its topic, also while a job runs or after it failed. Waiting pages show elapsed time and say that leaving is safe. Destructive actions confirm inline. Layout and flows are described in [ui-layout.md](ui-layout.md).

## Non-functional

- **NFR-1** The Anthropic API key exists only on the server.
- **NFR-2** Expected answers are never sent to the client while the questionnaire can still be answered. The only exception is the correct answer of a failed answer in a reviewed submission (ADR 0012).
- **NFR-3** Claude's structured output is validated with shared Zod schemas before it is stored.
- **NFR-5** The API listens on loopback (`127.0.0.1`) by default and is reached by browsers through the Vite proxy (ADR 0010); `HOST` overrides it.
- **NFR-6** Jobs left in progress by a previous server process are marked `failed` at startup (ADR 0009).
- **NFR-7** All user-visible text is Polish: the web UI (`<html lang="pl">`, dates formatted with `pl-PL`), API error messages and the fallback review feedback. Code, logs, docs and prompts to Claude stay English; Claude writes feedback and summary in the language of the questions. Labels such as `Odpowiedź 3b` are also the accessible names that tests query.
- **NFR-4** The API logs structured JSON at a configurable level (`LOG_LEVEL`, default `info`) to stdout and a file (`LOG_FILE`, `LOG_STDOUT`), without secrets or learner content.

## Known gaps

- Log files are not rotated.
- Interrupted jobs are failed at startup, not resumed (ADR 0009); the user retries a review or generates a new questionnaire.
- No schema migrations (tables are created at startup with `CREATE TABLE IF NOT EXISTS`); the one column added since, `questions.parent_id`, is added to older databases by an `ALTER TABLE` check in `createDb`.
- Interim answers (FR-4) are per browser and device, not synced, and are not removed if the questionnaire is never submitted.
- Visual baselines are Chromium on Linux only; another OS or font set shows small diffs (ADR 0011). No CI pipeline runs the tests yet.
- No linter.
- Showing correct answers (ADR 0012) means repeated attempts can be answered from memory.
- Claude is called with all of a learning's images each time; there is no resizing or cost limit.
