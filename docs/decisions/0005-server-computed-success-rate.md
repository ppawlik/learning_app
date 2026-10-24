# 0005: Success rate computed on the server

Status: accepted

## Context
Claude returns a verdict per answer. Asking it also for a percentage invites arithmetic errors and inconsistencies.

## Decision
Store Claude's verdicts and compute `round(passed / total * 100)` in `computeSuccessRate`. Any question Claude did not review counts as failed.

## Consequences
The statistic always matches the displayed verdicts.
