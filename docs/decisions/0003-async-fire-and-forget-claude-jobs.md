# 0003: Asynchronous Claude jobs, status polling

Status: accepted

## Context
Vision calls and reviews can take many seconds, longer than is comfortable for one HTTP request.

## Decision
Create the row with status `generating`/`reviewing`, return 202, run the Claude call in the same process without awaiting it, store the result or the error. The web app polls with TanStack Query `refetchInterval`.

## Alternatives
Hold the request open; a job queue (BullMQ etc.); server-sent events.

## Consequences
Simple, with no extra infrastructure. Jobs are lost on server restart and the row stays in progress forever (known gap, see requirements.md).
