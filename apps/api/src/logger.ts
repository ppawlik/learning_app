import pino from 'pino';
import type { Logger } from 'pino';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LoggerOptions {
  level: string;
  /** Path of the log file; undefined disables file output. */
  file?: string;
  stdout: boolean;
}

export function createLogger({ level, file, stdout }: LoggerOptions): Logger {
  if (!(LOG_LEVELS as readonly string[]).includes(level)) {
    throw new Error(`Invalid LOG_LEVEL "${level}". Use one of: ${LOG_LEVELS.join(', ')}`);
  }
  // Each stream needs the level too: multistream entries default to info. The logger level 'silent' already drops everything.
  const streamLevel = (level === 'silent' ? 'fatal' : level) as pino.Level;
  const streams: pino.StreamEntry[] = [];
  if (stdout) streams.push({ level: streamLevel, stream: process.stdout });
  if (file) streams.push({ level: streamLevel, stream: pino.destination({ dest: file, mkdir: true, sync: false }) });
  return pino(
    { level, redact: ['req.headers.authorization', 'req.headers["x-api-key"]', '*.apiKey'] },
    pino.multistream(streams, { dedupe: false }),
  );
}
