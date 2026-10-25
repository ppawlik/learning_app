import Fastify, { type FastifyBaseLogger } from 'fastify';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { MAX_IMAGE_BYTES } from '@learning/shared';
import type { Db } from './db/index.js';
import type { ClaudeService } from './claude/client.js';
import { learningRoutes } from './routes/learnings.js';
import { questionnaireRoutes } from './routes/questionnaires.js';

export interface AppDeps {
  db: Db;
  claude: ClaudeService;
  uploadsDir: string;
  /** Defaults to Fastify's own logger, which is off under NODE_ENV=test. */
  logger?: FastifyBaseLogger;
}

export function buildApp(deps: AppDeps) {
  const app = deps.logger
    ? Fastify({ loggerInstance: deps.logger })
    : Fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.register(multipart, { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Nieprawidłowe dane', issues: err.issues });
    }
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    else app.log.warn({ status, err: e.message }, 'request rejected');
    return reply.status(status).send({ error: status >= 500 ? 'Wewnętrzny błąd serwera' : e.message });
  });

  app.register(async (api) => {
    api.register(learningRoutes(deps));
    api.register(questionnaireRoutes(deps));
  }, { prefix: '/api' });

  return app;
}
