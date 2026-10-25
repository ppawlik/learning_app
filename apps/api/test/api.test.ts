import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import pino from 'pino';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { createDb } from '../src/db/index.js';
import { computeSuccessRate, failInterruptedJobs, INTERRUPTED_MESSAGE } from '../src/services/questionnaires.js';
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
        { category: 'Alfa', text: 'Q1?', type: 'open', expectedAnswer: 'A1' },
        { category: 'Beta', text: 'Q2?', type: 'multiple_choice', options: ['x', 'y'], expectedAnswer: 'x' },
        {
          category: 'Beta',
          text: 'Question 3 statement',
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
    // Four answerable questions (the question statement is not reviewed): 1 passed, 3 failed.
    expect(result.successRate).toBe(25);
    expect(result.answers.map((a: { verdict: string }) => a.verdict)).toEqual(['passed', 'failed', 'failed', 'failed']);
    expect(result.answers.map((a: { questionNumber: number; subLabel: string | null }) => `${a.questionNumber}${a.subLabel ?? ''}`)).toEqual(['1', '2', '3a', '3b']);
    expect(result.answers[2].parentText).toBe('Question 3 statement');
    expect(result.learningId).toBe(id);
    expect(result.answers.map((x: { label: string }) => x.label)).toEqual(['1', '2', '3a', '3b']);
    // ADR 0012: only failed answers of a reviewed submission carry the correct answer
    expect(result.answers.map((x: { expectedAnswer: string | null }) => x.expectedAnswer)).toEqual([null, 'x', 'B1', 'B2']);

    const statement = qn.questions[2];
    const bad = await app.inject({
      method: 'POST',
      url: `/api/questionnaires/${qn.id}/submissions`,
      payload: { answers: [{ questionId: statement.id, answer: 'x' }] },
    });
    expect(bad.statusCode).toBe(400);
  });

  describe('categories', () => {
    it('stores generation options, reuses them on retry, and reports per-category stats and defaults', async () => {
      const calls: unknown[] = [];
      let fail = true;
      await app.close();
      app = buildApp({
        db: createDb(':memory:'),
        uploadsDir: dir,
        claude: {
          ...fakeClaude,
          generateQuestionnaire: async (p, i, options) => {
            calls.push(options);
            if (fail) throw new Error('boom');
            return fakeClaude.generateQuestionnaire(p, i, options);
          },
        },
      });
      const id = (await app.inject({ method: 'POST', url: '/api/learnings', payload: { title: 'T', prompt: 'P' } })).json().id as number;
      await app.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...multipartBody('a.png', 'image/png', PNG) });

      const bad = await app.inject({ method: 'POST', url: `/api/learnings/${id}/questionnaires`, payload: { questionCount: 99 } });
      expect(bad.statusCode).toBe(400);

      const gen = await app.inject({
        method: 'POST',
        url: `/api/learnings/${id}/questionnaires`,
        payload: { categories: ['Alfa', 'Beta'], questionCount: 4 },
      });
      await wait(50);
      fail = false;
      await app.inject({ method: 'POST', url: `/api/questionnaires/${gen.json().id}/retry` });
      await wait(50);
      expect(calls).toEqual([
        { categories: ['Alfa', 'Beta'], questionCount: 4 },
        { categories: ['Alfa', 'Beta'], questionCount: 4 },
      ]);

      let detail = (await app.inject({ method: 'GET', url: `/api/learnings/${id}` })).json();
      expect(detail.questionnaires[0]).toMatchObject({ requestedCategories: ['Alfa', 'Beta'], questionCount: 4 });
      expect(detail.categories.sort()).toEqual(['Alfa', 'Beta']);
      // No reviewed submission yet: every category is preselected.
      expect(detail.defaultCategories.sort()).toEqual(['Alfa', 'Beta']);

      const qn = (await app.inject({ method: 'GET', url: `/api/questionnaires/${gen.json().id}` })).json();
      expect(qn.questions.map((q: { category: string }) => q.category)).toEqual(['Alfa', 'Beta', 'Beta']);
      const sub = await app.inject({
        method: 'POST',
        url: `/api/questionnaires/${qn.id}/submissions`,
        payload: { answers: [{ questionId: qn.questions[0].id, answer: 'A1' }] },
      });
      await wait(50);
      const result = (await app.inject({ method: 'GET', url: `/api/submissions/${sub.json().id}` })).json();
      expect(result.categoryStats).toEqual([
        { category: 'Alfa', passed: 1, total: 1, successRate: 100 },
        { category: 'Beta', passed: 0, total: 3, successRate: 0 },
      ]);

      detail = (await app.inject({ method: 'GET', url: `/api/learnings/${id}` })).json();
      expect(detail.defaultCategories).toEqual(['Beta']);
    });
  });

  describe('management', () => {
    const create = async (title = 'T') =>
      (await app.inject({ method: 'POST', url: '/api/learnings', payload: { title, prompt: 'P' } })).json().id as number;
    const makeSet = async (id: number) => {
      await app.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...multipartBody('a.png', 'image/png', PNG) });
      const gen = await app.inject({ method: 'POST', url: `/api/learnings/${id}/questionnaires` });
      await wait(50);
      return gen.json().id as number;
    };
    const answerAll = async (qnId: number) => {
      const qn = (await app.inject({ method: 'GET', url: `/api/questionnaires/${qnId}` })).json();
      const sub = await app.inject({ method: 'POST', url: `/api/questionnaires/${qnId}/submissions`, payload: { answers: [{ questionId: qn.questions[0].id, answer: 'A1' }] } });
      await wait(50);
      return sub.json().id as number;
    };

    it('lists topics with the set count and the latest reviewed result', async () => {
      const a = await create('A');
      await create('B');
      const set = await makeSet(a);
      await answerAll(set);
      const list = (await app.inject({ method: 'GET', url: '/api/learnings' })).json();
      const byTitle = Object.fromEntries(list.map((l: { title: string }) => [l.title, l]));
      expect(byTitle.A).toMatchObject({ questionnaireCount: 1, lastSuccessRate: 25 });
      expect(byTitle.B).toMatchObject({ questionnaireCount: 0, lastSuccessRate: null });
    });

    it('updates a topic and validates the body', async () => {
      const id = await create();
      const ok = await app.inject({ method: 'PATCH', url: `/api/learnings/${id}`, payload: { title: 'New', prompt: 'New prompt' } });
      expect(ok.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: `/api/learnings/${id}` })).json()).toMatchObject({ title: 'New', prompt: 'New prompt' });
      expect((await app.inject({ method: 'PATCH', url: `/api/learnings/${id}`, payload: { title: '', prompt: 'x' } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'PATCH', url: '/api/learnings/9999', payload: { title: 'a', prompt: 'b' } })).statusCode).toBe(404);
    });

    it('deletes a set with its submissions and a single submission', async () => {
      const id = await create();
      const set = await makeSet(id);
      const sub = await answerAll(set);
      expect((await app.inject({ method: 'DELETE', url: `/api/submissions/${sub}` })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: `/api/submissions/${sub}` })).statusCode).toBe(404);
      const sub2 = await answerAll(set);
      expect((await app.inject({ method: 'DELETE', url: `/api/questionnaires/${set}` })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: `/api/submissions/${sub2}` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'DELETE', url: `/api/questionnaires/${set}` })).statusCode).toBe(404);
    });

    it('refuses to delete work that is still running', async () => {
      const slowApp = buildApp({
        db: createDb(':memory:'),
        claude: { ...fakeClaude, generateQuestionnaire: () => new Promise(() => {}), reviewAnswers: () => new Promise(() => {}) },
        uploadsDir: dir,
      });
      const { id } = (await slowApp.inject({ method: 'POST', url: '/api/learnings', payload: { title: 'T', prompt: 'P' } })).json();
      await slowApp.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...multipartBody('a.png', 'image/png', PNG) });
      const gen = (await slowApp.inject({ method: 'POST', url: `/api/learnings/${id}/questionnaires` })).json();
      expect((await slowApp.inject({ method: 'DELETE', url: `/api/questionnaires/${gen.id}` })).statusCode).toBe(409);
      expect((await slowApp.inject({ method: 'POST', url: `/api/questionnaires/${gen.id}/retry` })).statusCode).toBe(409);
      await slowApp.close();
    });

    it('retries a failed generation on the same questionnaire', async () => {
      let fail = true;
      const flaky = buildApp({
        db: createDb(':memory:'),
        claude: { ...fakeClaude, generateQuestionnaire: async (...args) => { if (fail) throw new Error('boom'); return fakeClaude.generateQuestionnaire(...args); } },
        uploadsDir: dir,
      });
      const { id } = (await flaky.inject({ method: 'POST', url: '/api/learnings', payload: { title: 'T', prompt: 'P' } })).json();
      await flaky.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...multipartBody('a.png', 'image/png', PNG) });
      const gen = (await flaky.inject({ method: 'POST', url: `/api/learnings/${id}/questionnaires` })).json();
      await wait(50);
      const detail = (await flaky.inject({ method: 'GET', url: `/api/learnings/${id}` })).json();
      expect(detail.questionnaires[0]).toMatchObject({ id: gen.id, status: 'failed', error: 'boom' });
      fail = false;
      expect((await flaky.inject({ method: 'POST', url: `/api/questionnaires/${gen.id}/retry` })).statusCode).toBe(202);
      await wait(50);
      const after = (await flaky.inject({ method: 'GET', url: `/api/questionnaires/${gen.id}` })).json();
      expect(after).toMatchObject({ status: 'ready', error: null });
      expect((await flaky.inject({ method: 'POST', url: `/api/questionnaires/${gen.id}/retry` })).statusCode).toBe(409);
      await flaky.close();
    });
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

describe('review retry and restart recovery', () => {
  const setup = async (claude: ClaudeService) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-'));
    const db = createDb(':memory:');
    const app = buildApp({ db, claude, uploadsDir: dir });
    const { id } = (await app.inject({ method: 'POST', url: '/api/learnings', payload: { title: 'T', prompt: 'P' } })).json();
    await app.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...multipartBody('a.png', 'image/png', PNG) });
    const gen = await app.inject({ method: 'POST', url: `/api/learnings/${id}/questionnaires` });
    await wait(50);
    const qn = (await app.inject({ method: 'GET', url: `/api/questionnaires/${gen.json().id}` })).json();
    const sub = await app.inject({
      method: 'POST',
      url: `/api/questionnaires/${qn.id}/submissions`,
      payload: { answers: [{ questionId: qn.questions[0].id, answer: 'A1' }] },
    });
    await wait(50);
    return { app, db, dir, subId: sub.json().id as number, learningId: id as number };
  };

  it('retries a failed review and rejects a retry of a reviewed one', async () => {
    let fail = true;
    const { app, dir, subId } = await setup({
      ...fakeClaude,
      reviewAnswers: async (input) => {
        if (fail) throw new Error('boom');
        return fakeClaude.reviewAnswers(input);
      },
    });
    expect((await app.inject({ method: 'GET', url: `/api/submissions/${subId}` })).json().status).toBe('failed');

    fail = false;
    const retry = await app.inject({ method: 'POST', url: `/api/submissions/${subId}/retry` });
    expect(retry.statusCode).toBe(202);
    await wait(50);
    const after = (await app.inject({ method: 'GET', url: `/api/submissions/${subId}` })).json();
    expect(after.status).toBe('reviewed');
    expect(after.error).toBeNull();

    expect((await app.inject({ method: 'POST', url: `/api/submissions/${subId}/retry` })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/submissions/9999/retry' })).statusCode).toBe(404);
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails jobs left in progress by a previous process', async () => {
    const { app, db, dir, subId, learningId } = await setup(fakeClaude);
    const { schema } = await import('../src/db/index.js');
    const stuckQn = db.insert(schema.questionnaires).values({ learningId, status: 'generating' }).returning().get();
    db.update(schema.submissions).set({ status: 'reviewing' }).run();

    failInterruptedJobs(db, app.log);

    const qn = (await app.inject({ method: 'GET', url: `/api/questionnaires/${stuckQn.id}` })).json();
    expect(qn.status).toBe('failed');
    expect(qn.error).toBe(INTERRUPTED_MESSAGE);
    expect((await app.inject({ method: 'GET', url: `/api/submissions/${subId}` })).json().status).toBe('failed');
    // finished rows are untouched
    const learning = (await app.inject({ method: 'GET', url: `/api/learnings/${learningId}` })).json();
    expect(learning.questionnaires.filter((q: { status: string }) => q.status === 'ready')).toHaveLength(1);
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('reviewSubmission', () => {
  it('counts questions missing from the review as failed', async () => {
    const labels: string[] = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-'));
    const app = buildApp({
      db: createDb(':memory:'),
      claude: { ...fakeClaude, reviewAnswers: async ({ items }) => (labels.push(...items.map((i) => i.label)), { answers: [{ questionId: items[0]!.questionId, verdict: 'passed', feedback: 'ok' }], summary: 's' }) },
      uploadsDir: dir,
    });
    const { id } = (await app.inject({ method: 'POST', url: '/api/learnings', payload: { title: 'T', prompt: 'P' } })).json();
    await app.inject({ method: 'POST', url: `/api/learnings/${id}/images`, ...multipartBody('a.png', 'image/png', PNG) });
    const gen = await app.inject({ method: 'POST', url: `/api/learnings/${id}/questionnaires` });
    await wait(50);
    const qn = (await app.inject({ method: 'GET', url: `/api/questionnaires/${gen.json().id}` })).json();
    const sub = await app.inject({ method: 'POST', url: `/api/questionnaires/${qn.id}/submissions`, payload: { answers: [{ questionId: qn.questions[0].id, answer: 'A1' }] } });
    await wait(50);
    const result = (await app.inject({ method: 'GET', url: `/api/submissions/${sub.json().id}` })).json();
    expect(result.status).toBe('reviewed');
    expect(result.answers.map((a: { verdict: string }) => a.verdict)).toEqual(['passed', 'failed', 'failed', 'failed']);
    expect(result.answers[1].feedback).toBe('Nie otrzymano oceny tej odpowiedzi.');
    expect(result.successRate).toBe(25);
    // Claude is given the numbers the page shows, so its summary can cite them.
    expect(labels).toEqual(['1', '2', '3a', '3b']);
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('404s for unknown submissions, questionnaires and ids', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-'));
    const app = buildApp({ db: createDb(':memory:'), claude: fakeClaude, uploadsDir: dir });
    expect((await app.inject({ method: 'GET', url: '/api/submissions/1' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/questionnaires/1' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/questionnaires/1/submissions', payload: { answers: [{ questionId: 1, answer: 'x' }] } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/learnings/abc' })).statusCode).toBe(400);
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('computeSuccessRate', () => {
  it('computes a percentage', () => {
    expect(computeSuccessRate(['passed', 'failed', 'passed'])).toBe(67);
    expect(computeSuccessRate([])).toBe(0);
  });
});
