# 0002: Fastify + SQLite + Drizzle

Status: accepted

## Context
Single-user learning app that should run locally with no external services.

## Decision
Fastify API, SQLite via better-sqlite3, Drizzle for typed queries. Images are stored on local disk.

## Alternatives
Express + Postgres (needs a database server); Next.js full-stack (less separation between frontend and backend).

## Consequences
Zero setup. Not suited to multiple server instances. Tables are created at startup without migrations; the schema lives in two places (see architecture.md).
