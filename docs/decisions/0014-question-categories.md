# 0014: Question categories and generation options

Status: accepted. Builds on ADR 0008 (hierarchical questions) and ADR 0013 (retry).

## Context
Sets were flat, so a learner could not see which areas were weak, nor practise only those.

## Decision
Claude assigns each top-level question a short free-text category (required in `generatedQuestionnaireSchema`); it is stored in `questions.category` on the question and its subquestions. A new set can be requested with `{categories?, questionCount?}`; both are stored on the `questionnaires` row (`requested_categories`, `question_count`) so retry (ADR 0013) and any later re-run use the same options. The prompt tells Claude to use exactly the chosen categories and the exact count; as with other prompt rules this is not enforced in code. Submissions return `categoryStats` (passed, total, rate per category), computed from the verdicts; legacy questions without a category form a `null` group shown as "Bez kategorii". The topic page lists categories seen in earlier sets and preselects those failed in the newest reviewed submission.

## Alternatives
A fixed category list or a separate Claude call to suggest categories before the first set (extra async state, more cost); a category table (free text is enough, no renaming or hierarchy needed).

## Consequences
The first set of a topic cannot be restricted by category because none exist yet. Category names are Claude's wording, so the same area may get slightly different names across sets and appear as separate categories.
