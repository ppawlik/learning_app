# 0007: Structured logging with pino, to stdout and a file

Status: accepted

## Context
Only Fastify's default request log existed. Background jobs and Claude calls logged nothing, and handled job errors were visible only as a `failed` row, which made failures hard to diagnose after the fact (e.g. a truncated Claude tool call).

## Decision
Use pino, which Fastify already embeds. `createLogger` in `apps/api/src/logger.ts` builds one logger writing JSON lines to stdout and to a file. `src/server.ts` creates it and passes it to `buildApp` (`loggerInstance`) and `createClaudeService`; jobs receive `req.log`, so their lines carry the request id. Configuration is by environment variable:

- `LOG_LEVEL`: `fatal|error|warn|info|debug|trace|silent`, default `info`; an invalid value stops startup.
- `LOG_FILE`: default `logs/api.log` relative to the API working directory (`apps/api/logs/api.log` under `pnpm dev`); empty or `off` disables the file.
- `LOG_STDOUT`: default `true`.

Logs contain ids, counts, durations, statuses, token usage and error objects. They never contain prompts, questions, answers, image data or the API key; authorization headers are redacted.

## Consequences
No log rotation: the file grows until it is rotated externally (`logrotate`) or `pino-roll` is added. Tests run without a logger (quiet) unless one is injected through `buildApp({logger})`.
