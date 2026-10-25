# Glossary

- **Learning**: a topic with a title, a prompt and a set of images. Owns questionnaires.
- **Prompt**: the learner's instructions for what Claude should ask about (e.g. number and style of questions).
- **Questionnaire**: a generated set of questions for one learning. Several can exist per learning.
- **Question**: a top-level item of a questionnaire, shown as a number (1, 2, 3). Either a plain question (answerable) or a statement with subquestions. It has a type, `open` or `multiple_choice`, and a server-only expected answer.
- **Subquestion**: a part of a question, shown as a letter (a, b, c) and answered separately. Stored as a `questions` row with `parent_id` set.
- **Statement**: the shared text of a question that has subquestions. It is never answered or reviewed.
- **Answerable question**: a plain question or a subquestion.
- **Label**: the number the page shows for an answerable question (`3`, `3b`), used in review feedback and summary.
- **Submission**: one filling-in of a questionnaire; reviewed by Claude.
- **Answer**: the learner's response to one answerable question (plain question or subquestion) within a submission, with a verdict and feedback after review.
- **Verdict**: `passed` or `failed` per answer.
- **Success rate**: percentage of passed answers in a submission (rounded).
