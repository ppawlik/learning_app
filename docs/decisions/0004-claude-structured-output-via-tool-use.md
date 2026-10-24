# 0004: Structured output through tool use, tool_choice auto

Status: accepted

## Context
Questionnaires and reviews must be machine-readable. The first implementation forced the tool with `tool_choice: {type: 'tool'}`; the real API rejected it for `claude-sonnet-5-5` with a 400 ("tool_choice: type tool and any are not supported for this model").

## Decision
Define one tool per task with a JSON schema, use `tool_choice: auto`, and add "Respond only by calling the X tool" to the prompt. Parse the tool input with the shared Zod schema; throw if there is no tool call.

## Alternatives
Forced tool choice (rejected by the API); free-form JSON in text (fragile parsing).

## Consequences
The model could answer without calling the tool; that surfaces as a `failed` status with an error. Unit tests mock `ClaudeService`, so they cannot catch API-level incompatibilities. Check changes to `callTool` against the real API.
