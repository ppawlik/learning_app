// API for the Playwright suite: the real app and routes with an in-memory db and a deterministic fake Claude.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { createDb, schema } from '../src/db/index.js';
import type { ClaudeService } from '../src/claude/client.js';

const failedOnce = new Set<number>();

const claude: ClaudeService = {
  async generateQuestionnaire() {
    return {
      questions: [
        { text: 'What object is shown in the picture?', type: 'open', expectedAnswer: 'A cat' },
        { text: 'Which colour is the sky?', type: 'multiple_choice', options: ['Blue', 'Green', 'Red'], expectedAnswer: 'Blue' },
        {
          text: 'Study the diagram and answer the questions below.',
          subquestions: [
            { text: 'Name the first element.', type: 'open', expectedAnswer: 'Alpha' },
            { text: 'Name the second element.', type: 'open', expectedAnswer: 'Beta' },
          ],
        },
      ],
    };
  },
  // The first item passes, the rest fail. An answer containing "boom" makes the first review attempt throw,
  // so the retry flow can be tested.
  async reviewAnswers({ items }) {
    const boom = items.find((i) => i.answer.includes('boom'));
    if (boom && !failedOnce.has(boom.questionId)) {
      failedOnce.add(boom.questionId);
      throw new Error('Simulated review failure');
    }
    return {
      answers: items.map((i, idx) => ({
        questionId: i.questionId,
        verdict: idx === 0 ? ('passed' as const) : ('failed' as const),
        feedback: idx === 0 ? 'Correct.' : 'Not quite: compare with the material.',
      })),
      summary: 'A solid start. Revisit the diagram questions.',
    };
  },
};

const db = createDb(':memory:');
const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-e2e-'));
const app = buildApp({ db, claude, uploadsDir });

// Test-only: wipe all data so every test starts from an empty app.
app.post('/api/__e2e/reset', async (_req, reply) => {
  db.delete(schema.learnings).run();
  failedOnce.clear();
  return reply.status(204).send();
});

await app.listen({ port: Number(process.env.PORT ?? 3101), host: '127.0.0.1' });
