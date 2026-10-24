# Requirements

Single-user app; no authentication. Requirement IDs can be referenced from tests and commits.

## Functional

- **FR-1 Create learning.** The user creates a learning with a title (1-200 chars) and a prompt (1-5000 chars) describing what the questionnaire should cover. Learnings can be listed, opened and deleted (deleting also removes its uploaded files).
- **FR-2 Images.** The user uploads images to a learning (drag and drop or file picker) and can remove them. Allowed: JPEG, PNG, GIF, WebP; max 5 MB each; max 20 per learning. Anything else is rejected with 400/413.
- **FR-3 Generate questionnaire.** With at least one image, the user triggers generation. Claude (vision) builds the questions from the images, following the learning prompt. Question types: `open` and `multiple_choice`. The questionnaire is attached to the learning and moves `generating` to `ready` or `failed` (with an error message).
- **FR-4 Answer.** The user fills in a ready questionnaire (text area for open questions, radio buttons for multiple choice) and submits the answers.
- **FR-5 Review.** After submission Claude reviews every answer: verdict `passed` or `failed`, per-answer feedback, and a descriptive overall summary. A submission moves `reviewing` to `reviewed` or `failed`.
- **FR-6 Statistics.** Each reviewed submission shows a success rate (percentage of passed answers) and the number of passed answers.

## Non-functional

- **NFR-1** The Anthropic API key exists only on the server.
- **NFR-2** Expected answers are never sent to the client before or after submission.
- **NFR-3** Claude's structured output is validated with shared Zod schemas before it is stored.

## Known gaps

- Jobs left in `generating`/`reviewing` when the server restarts are never recovered.
- No schema migrations (tables are created at startup with `CREATE TABLE IF NOT EXISTS`).
- No linter.
- No UI to retry a failed questionnaire/review (the user can generate a new questionnaire).
- Claude is called with all of a learning's images each time; there is no resizing or cost limit.
