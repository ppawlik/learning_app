import path from 'node:path';

const apiKey = process.env.ANTHROPIC_API_KEY;

export const config = {
  port: Number(process.env.PORT ?? 3001),
  anthropicApiKey: apiKey,
  model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
  dbPath: process.env.DB_PATH ?? path.resolve(process.cwd(), 'learning.db'),
  uploadsDir: process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), 'uploads'),
};
