# Glossary

- **Learning**: a topic with a title, a prompt and a set of images. Owns questionnaires.
- **Prompt**: the learner's instructions for what Claude should ask about (e.g. number and style of questions).
- **Questionnaire**: a generated set of questions for one learning. Several can exist per learning.
- **Task**: a top-level question, shown as a number (1, 2, 3). Either a plain question or a statement with subquestions.
- **Subquestion**: a part of a task, shown as a letter (a, b, c) and answered separately. Stored as a `questions` row with `parent_id` set.
- **Question**: `open` or `multiple_choice`, with a server-only expected answer. Plain tasks and subquestions are answerable; the statement row of a task with subquestions is not.
- **Submission**: one filling-in of a questionnaire; reviewed by Claude.
- **Answer**: the learner's response to one answerable question (plain task or subquestion) within a submission, with a verdict and feedback after review.
- **Verdict**: `passed` or `failed` per answer.
- **Success rate**: percentage of passed answers in a submission (rounded).
