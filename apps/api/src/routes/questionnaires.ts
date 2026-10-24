import { eq, asc } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { submitAnswersSchema } from '@learning/shared';
import { schema } from '../db/index.js';
import type { AppDeps } from '../app.js';
import { HttpError, idParams } from './util.js';
import { reviewSubmission } from '../services/questionnaires.js';

const { questionnaires, questions, submissions, answers } = schema;

export const questionnaireRoutes =
  ({ db, claude }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/questionnaires/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      const q = db.select().from(questionnaires).where(eq(questionnaires.id, id)).get();
      if (!q) throw new HttpError(404, 'Questionnaire not found');
      const qs = db.select().from(questions).where(eq(questions.questionnaireId, id)).orderBy(asc(questions.position)).all();
      return {
        id: q.id,
        learningId: q.learningId,
        status: q.status,
        error: q.error,
        createdAt: q.createdAt,
        // expectedAnswer is intentionally omitted
        questions: qs.map((x) => ({ id: x.id, position: x.position, text: x.text, type: x.type, options: x.options })),
      };
    });

    app.post('/questionnaires/:id/submissions', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const body = submitAnswersSchema.parse(req.body);
      const q = db.select().from(questionnaires).where(eq(questionnaires.id, id)).get();
      if (!q) throw new HttpError(404, 'Questionnaire not found');
      if (q.status !== 'ready') throw new HttpError(409, 'Questionnaire is not ready');
      const qs = db.select().from(questions).where(eq(questions.questionnaireId, id)).all();
      const valid = new Set(qs.map((x) => x.id));
      if (body.answers.some((a) => !valid.has(a.questionId))) throw new HttpError(400, 'Unknown question id');

      const given = new Map(body.answers.map((a) => [a.questionId, a.answer]));
      const sub = db.transaction((tx) => {
        const s = tx.insert(submissions).values({ questionnaireId: id, status: 'reviewing' }).returning().get();
        tx.insert(answers)
          .values(qs.map((x) => ({ submissionId: s.id, questionId: x.id, answer: given.get(x.id) ?? '' })))
          .run();
        return s;
      });
      req.log.info({ submissionId: sub.id, questionnaireId: id }, 'submission created');
      void reviewSubmission(db, claude, sub.id, req.log);
      return reply.status(202).send({ id: sub.id, status: sub.status });
    });

    app.get('/submissions/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      const s = db.select().from(submissions).where(eq(submissions.id, id)).get();
      if (!s) throw new HttpError(404, 'Submission not found');
      const rows = db
        .select({ a: answers, text: questions.text, position: questions.position })
        .from(answers)
        .innerJoin(questions, eq(answers.questionId, questions.id))
        .where(eq(answers.submissionId, id))
        .orderBy(asc(questions.position))
        .all();
      return {
        ...s,
        answers: rows.map(({ a, text }) => ({
          questionId: a.questionId,
          questionText: text,
          answer: a.answer,
          verdict: a.verdict,
          feedback: a.feedback,
        })),
      };
    });
  };
