# Requirements

Single-user app; no authentication. Requirement IDs can be referenced from tests and commits.

## Functional

- **FR-1 Create learning.** The user creates a learning with a title (1-200 chars) and a prompt (1-5000 chars) describing what the questionnaire should cover. Learnings can be listed, opened and deleted (deleting also removes its uploaded files).
- **FR-2 Images.** The user uploads images to a learning (drag and drop or file picker) and can remove them. Allowed: JPEG, PNG, GIF, WebP, HEIC/HEIF (detected by MIME type or `.heic`/`.heif` extension, converted to JPEG on upload and stored as JPEG); max 5 MB each (also checked after conversion); max 20 per learning. Anything else is rejected with 400/413.
- **FR-3 Generate questionnaire.** With at least one image, the user triggers generation. Claude (vision) builds the questions from the images, following the learning prompt. Question types: `open` and `multiple_choice`. The questionnaire is attached to the learning and moves `generating` to `ready` or `failed` (with an error message). Questions are hierarchical (ADR 0008): a task is either a plain question or a statement with lettered subquestions (a, b, c), each with its own type and expected answer.
- **FR-4 Answer.** The user fills in a ready questionnaire (text area for open questions, radio buttons for multiple choice) and submits the answers. Tasks are numbered 1, 2, 3 and subquestions lettered a, b, c; every plain task and every subquestion has its own input, while the statement of a task with subquestions has none. Interim answers are saved in the browser's `localStorage` whenever focus leaves an input, restored when the form is opened again, and cleared after a successful submit.
- **FR-5 Review.** After submission Claude reviews every answer (one per plain task or subquestion): verdict `passed` or `failed`, per-answer feedback, and a descriptive overall summary. A submission moves `reviewing` to `reviewed` or `failed`.
- **FR-6 Statistics.** Each reviewed submission shows a success rate (percentage of passed answers) and the number of passed answers.

## Non-functional

- **NFR-1** The Anthropic API key exists only on the server.
- **NFR-2** Expected answers are never sent to the client before or after submission.
- **NFR-3** Claude's structured output is validated with shared Zod schemas before it is stored.
- **NFR-4** The API logs structured JSON at a configurable level (`LOG_LEVEL`, default `info`) to stdout and a file (`LOG_FILE`, `LOG_STDOUT`), without secrets or learner content.

## Known gaps

- Log files are not rotated.
- Jobs left in `generating`/`reviewing` when the server restarts are never recovered.
- No schema migrations (tables are created at startup with `CREATE TABLE IF NOT EXISTS`); the one column added since, `questions.parent_id`, is added to older databases by an `ALTER TABLE` check in `createDb`.
- Interim answers (FR-4) are per browser and device, not synced, and are not removed if the questionnaire is never submitted.
- No linter.
- No UI to retry a failed questionnaire/review (the user can generate a new questionnaire).
- Claude is called with all of a learning's images each time; there is no resizing or cost limit.
