# Learning App

Create learnings, upload images, and let Claude (vision) generate a questionnaire from them. Submit answers and Claude marks each as passed/failed, with feedback and a success rate.

Stack: pnpm monorepo, React + Vite + TS (`apps/web`), Fastify + SQLite/Drizzle (`apps/api`), shared Zod schemas (`packages/shared`).

## Run
```
./start.sh             # installs dependencies and creates .env on first run, then starts everything
```
Or manually:
```
pnpm install
cp .env.example .env   # set ANTHROPIC_API_KEY
pnpm dev               # web: http://localhost:5173, api: http://localhost:3001
```

## Checks
```
pnpm typecheck && pnpm test
```

## Docs
Requirements, architecture and design decisions are in [`docs/`](docs/README.md).
