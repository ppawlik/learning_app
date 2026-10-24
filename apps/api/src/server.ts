import fs from 'node:fs/promises';
import { config } from './config.js';
import { createDb } from './db/index.js';
import { createClaudeService } from './claude/client.js';
import { createLogger } from './logger.js';
import { buildApp } from './app.js';

const logger = createLogger({ level: config.logLevel, file: config.logFile, stdout: config.logStdout });

await fs.mkdir(config.uploadsDir, { recursive: true });
const app = buildApp({
  db: createDb(config.dbPath),
  claude: createClaudeService(logger),
  uploadsDir: config.uploadsDir,
  logger,
});
await app.listen({ port: config.port, host: '0.0.0.0' });
logger.info(
  { port: config.port, logLevel: config.logLevel, logFile: config.logFile ?? null, model: config.model },
  'api started',
);
