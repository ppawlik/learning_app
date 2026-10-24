import fs from 'node:fs/promises';
import { config } from './config.js';
import { createDb } from './db/index.js';
import { createClaudeService } from './claude/client.js';
import { createLogger } from './logger.js';
import { buildApp } from './app.js';
import { failInterruptedJobs } from './services/questionnaires.js';

const logger = createLogger({ level: config.logLevel, file: config.logFile, stdout: config.logStdout });

await fs.mkdir(config.uploadsDir, { recursive: true });
const db = createDb(config.dbPath);
failInterruptedJobs(db, logger);
const app = buildApp({
  db,
  claude: createClaudeService(logger),
  uploadsDir: config.uploadsDir,
  logger,
});
await app.listen({ port: config.port, host: config.host });
logger.info(
  { host: config.host, port: config.port, logLevel: config.logLevel, logFile: config.logFile ?? null, model: config.model },
  'api started',
);
