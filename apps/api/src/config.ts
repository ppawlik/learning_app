import path from 'node:path';

const apiKey = process.env.ANTHROPIC_API_KEY;

const logFile = process.env.LOG_FILE ?? 'logs/api.log';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  anthropicApiKey: apiKey,
  model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
  dbPath: process.env.DB_PATH ?? path.resolve(process.cwd(), 'learning.db'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // Relative paths resolve against the API's working directory; empty or "off" disables file logging.
  logFile: logFile === '' || logFile.toLowerCase() === 'off' ? undefined : path.resolve(process.cwd(), logFile),
  logStdout: (process.env.LOG_STDOUT ?? 'true').toLowerCase() !== 'false',
  uploadsDir: process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), 'uploads'),
};
