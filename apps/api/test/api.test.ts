import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import pino from 'pino';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { createDb } from '../src/db/index.js';
import { computeSuccessRate } from '../src/services/questionnaires.js';
import type { ClaudeService } from '../src/claude/client.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
vi.mock('heic-convert', () => ({
  default: async ({ buffer }: { buffer: Buffer }) => {
    if (buffer.toString() === 'not heic') throw new Error('bad');
    return JPEG;
  },
}));

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const fakeClaude: ClaudeService = {
  async generateQuestionnaire() {
    return {
      questions: [
        { text: 'Q1?', type: 'open', expectedAnswer: 'A1' },
        { text: 'Q2?', type: 'multiple_choice', options: ['x', 'y'], expectedAnswer: 'x' },
        {
          text: 'Task 3 statement',
          subquestions: [
            { text: 'First part?', type: 'open', expectedAnswer: 'B1' },
            { text: 'Second part?', type: 'open', expectedAnswer: 'B2' },
          ],
        },
      ],
    };
  },
  async reviewAnswers({ items }) {
    return {
      answers: items.map((i, idx) => ({
        questionId: i.questionId,
        verdict: idx === 0 ? ('passed' as const) : ('failed' as const),
        feedback: 'fb',
      })),
      summary: 'ok',
    };
  },
};

function multipartBody(filename: string, type: string, data: Buffer) {
  const boundary = '----t';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), data, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('api', () => {
  let dir: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-'));
    app = buildApp({ db: createDb(':memory:'), claude: fakeClaude, uploadsDir: dir });
  });
  afterEach(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('runs the full flow without leaking expected answers', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/learnings', payload: { title: 'T', prompt: 'P' } });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    const noImages = await app.inject({ method: 'POST', url: `/api/learnings/${id}/questionnaires` });
    expect(noImages.statusCode).toBe(400);

    const up = multipartBody('a.png', 'image/png', PNG);
    const upload = await app.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...up });
    expect(upload.statusCode).toBe(201);

    const gen = await app.inject({ method: 'POST', url: `/api/learnings/${id}/questionnaires` });
    expect(gen.statusCode).toBe(202);
    await wait(50);

    const qn = (await app.inject({ method: 'GET', url: `/api/questionnaires/${gen.json().id}` })).json();
    expect(qn.status).toBe('ready');
    expect(qn.questions).toHaveLength(3);
    expect(qn.questions[2].subquestions.map((s: { text: string }) => s.text)).toEqual(['First part?', 'Second part?']);
    expect(JSON.stringify(qn)).not.toContain('expectedAnswer');

    const sub = await app.inject({
      method: 'POST',
      url: `/api/questionnaires/${qn.id}/submissions`,
      payload: { answers: [{ questionId: qn.questions[0].id, answer: 'A1' }] },
    });
    expect(sub.statusCode).toBe(202);
    await wait(50);

    const result = (await app.inject({ method: 'GET', url: `/api/submissions/${sub.json().id}` })).json();
    expect(result.status).toBe('reviewed');
    // Four answerable questions (the task statement is not reviewed): 1 passed, 3 failed.
    expect(result.successRate).toBe(25);
    expect(result.answers.map((a: { verdict: string }) => a.verdict)).toEqual(['passed', 'failed', 'failed', 'failed']);
    expect(result.answers.map((a: { taskNumber: number; subLabel: string | null }) => `${a.taskNumber}${a.subLabel ?? ''}`)).toEqual(['1', '2', '3a', '3b']);
    expect(result.answers[2].parentText).toBe('Task 3 statement');

    const statement = qn.questions[2];
    const bad = await app.inject({
      method: 'POST',
      url: `/api/questionnaires/${qn.id}/submissions`,
      payload: { answers: [{ questionId: statement.id, answer: 'x' }] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('rejects non-image uploads', async () => {
    const { id } = (await app.inject({ method: 'POST', url: '/api/learnings', payload: { title: 'T', prompt: 'P' } })).json();
    const up = multipartBody('a.txt', 'text/plain', Buffer.from('hi'));
    const res = await app.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...up });
    expect(res.statusCode).toBe(400);
  });

  it('converts HEIC uploads to JPEG', async () => {
    const { id } = (await app.inject({ method: 'POST', url: '/api/learnings', payload: { title: 'T', prompt: 'P' } })).json();
    // Browsers often send HEIC as application/octet-stream, so the extension must count too.
    for (const [name, type] of [['a.heic', 'image/heic'], ['b.HEIC', 'application/octet-stream']]) {
      const res = await app.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...multipartBody(name, type, Buffer.from('heic')) });
      expect(res.statusCode).toBe(201);
      expect(res.json().mimeType).toBe('image/jpeg');
      const file = await app.inject({ method: 'GET', url: `/api/images/${res.json().id}/file` });
      expect(file.headers['content-type']).toContain('image/jpeg');
      expect(file.rawPayload.equals(JPEG)).toBe(true);
    }
  });

  it('rejects unreadable HEIC uploads', async () => {
    const { id } = (await app.inject({ method: 'POST', url: '/api/learnings', payload: { title: 'T', prompt: 'P' } })).json();
    const res = await app.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...multipartBody('a.heic', 'image/heic', Buffer.from('not heic')) });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid learning input', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/learnings', payload: { title: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('marks a questionnaire failed when Claude errors', async () => {
    const logLines: { level: number; msg: string; err: { message: string } }[] = [];
    const logger = pino({ level: 'info' }, { write: (chunk: string) => void logLines.push(JSON.parse(chunk)) });
    const failing = buildApp({
      logger,
      db: createDb(':memory:'),
      claude: { ...fakeClaude, generateQuestionnaire: async () => { throw new Error('boom'); } },
      uploadsDir: dir,
    });
    const { id } = (await failing.inject({ method: 'POST', url: '/api/learnings', payload: { title: 'T', prompt: 'P' } })).json();
    await failing.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...multipartBody('a.png', 'image/png', PNG) });
    const gen = await failing.inject({ method: 'POST', url: `/api/learnings/${id}/questionnaires` });
    await wait(50);
    const qn = (await failing.inject({ method: 'GET', url: `/api/questionnaires/${gen.json().id}` })).json();
    expect(qn.status).toBe('failed');
    expect(qn.error).toBe('boom');
    expect(logLines.some((l) => l.level === 50 && l.msg === 'questionnaire generation failed' && l.err.message === 'boom')).toBe(true);
    await failing.close();
  });
});

describe('computeSuccessRate', () => {
  it('computes a percentage', () => {
    expect(computeSuccessRate(['passed', 'failed', 'passed'])).toBe(67);
    expect(computeSuccessRate([])).toBe(0);
  });
});
