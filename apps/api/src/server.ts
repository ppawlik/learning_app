import fs from 'node:fs/promises';
import { config } from './config.js';
import { createDb } from './db/index.js';
import { createClaudeService } from './claude/client.js';
import { buildApp } from './app.js';

await fs.mkdir(config.uploadsDir, { recursive: true });
const app = buildApp({
  db: createDb(config.dbPath),
  claude: createClaudeService(),
  uploadsDir: config.uploadsDir,
});
await app.listen({ port: config.port, host: '0.0.0.0' });
