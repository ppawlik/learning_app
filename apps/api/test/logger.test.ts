import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLogger } from '../src/logger.js';

const flush = (log: ReturnType<typeof createLogger>) =>
  new Promise<void>((resolve) => {
    log.flush(() => setTimeout(resolve, 50));
  });

describe('createLogger', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('writes info lines to the file, creating the directory, and drops debug', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-'));
    const file = path.join(dir, 'nested', 'api.log');
    const log = createLogger({ level: 'info', file, stdout: false });
    log.info({ id: 1 }, 'hello');
    log.debug('hidden');
    await flush(log);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 30, id: 1, msg: 'hello' });
  });

  it('honours a more verbose level', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-'));
    const file = path.join(dir, 'api.log');
    const log = createLogger({ level: 'debug', file, stdout: false });
    log.debug('shown');
    await flush(log);
    expect(fs.readFileSync(file, 'utf8')).toContain('shown');
  });

  it('redacts the authorization header', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-'));
    const file = path.join(dir, 'api.log');
    const log = createLogger({ level: 'info', file, stdout: false });
    log.info({ req: { headers: { authorization: 'secret' } } }, 'x');
    await flush(log);
    expect(fs.readFileSync(file, 'utf8')).not.toContain('secret');
  });

  it('rejects an invalid level', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-'));
    expect(() => createLogger({ level: 'loud', stdout: false })).toThrow(/Invalid LOG_LEVEL/);
  });
});
