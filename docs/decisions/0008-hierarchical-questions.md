# 0008: Hierarchical questions (tasks with subquestions)

Status: accepted

## Context
Textbook tasks often have lettered subtasks (a, b, c) that share one statement. A flat list either forced one input for the whole task or, in a first attempt, repeated the shared context in every question.

## Decision
Questions form two levels in the single `questions` table, linked by a nullable self-reference `parent_id`. A task with subquestions is a statement row that is never answered; each subquestion is answerable with its own type, options and expected answer. Claude produces `subquestions` per task (`generatedQuestionnaireSchema`). The API nests subquestions under their task and the UI shows tasks as numbers and subquestions as letters, each with its own input. Answers, review and `successRate` cover answerable questions only; the review prompt receives the task statement as context.

## Consequences
One more column, added to existing databases by a check in `createDb` since there are no migrations. Deeper nesting is not supported. Questionnaires created before this change have no subquestions and keep working.
