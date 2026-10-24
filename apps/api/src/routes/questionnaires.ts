import { eq, asc } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { subquestionLabel, submitAnswersSchema } from '@learning/shared';
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
      // expectedAnswer is intentionally omitted
      const view = (x: (typeof qs)[number]) => ({ id: x.id, position: x.position, text: x.text, type: x.type, options: x.options });
      return {
        id: q.id,
        learningId: q.learningId,
        status: q.status,
        error: q.error,
        createdAt: q.createdAt,
        questions: qs
          .filter((x) => x.parentId === null)
          .map((x) => ({ ...view(x), subquestions: qs.filter((c) => c.parentId === x.id).map(view) })),
      };
    });

    app.post('/questionnaires/:id/submissions', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const body = submitAnswersSchema.parse(req.body);
      const q = db.select().from(questionnaires).where(eq(questionnaires.id, id)).get();
      if (!q) throw new HttpError(404, 'Questionnaire not found');
      if (q.status !== 'ready') throw new HttpError(409, 'Questionnaire is not ready');
      const qs = db.select().from(questions).where(eq(questions.questionnaireId, id)).all();
      const parentIds = new Set(qs.map((x) => x.parentId).filter((x): x is number => x !== null));
      const answerable = qs.filter((x) => !parentIds.has(x.id));
      const valid = new Set(answerable.map((x) => x.id));
      if (body.answers.some((a) => !valid.has(a.questionId))) throw new HttpError(400, 'Unknown question id');

      const given = new Map(body.answers.map((a) => [a.questionId, a.answer]));
      const sub = db.transaction((tx) => {
        const s = tx.insert(submissions).values({ questionnaireId: id, status: 'reviewing' }).returning().get();
        tx.insert(answers)
          .values(answerable.map((x) => ({ submissionId: s.id, questionId: x.id, answer: given.get(x.id) ?? '' })))
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
      const qs = db
        .select()
        .from(questions)
        .where(eq(questions.questionnaireId, s.questionnaireId))
        .orderBy(asc(questions.position))
        .all();
      const byId = new Map(qs.map((x) => [x.id, x]));
      const tasks = qs.filter((x) => x.parentId === null);
      const rows = db.select().from(answers).where(eq(answers.submissionId, id)).all();
      const entries = rows.map((a) => {
        const q = byId.get(a.questionId)!;
        const parent = q.parentId === null ? null : byId.get(q.parentId)!;
        const task = parent ?? q;
        return {
          questionId: a.questionId,
          questionText: q.text,
          parentText: parent?.text ?? null,
          taskNumber: tasks.findIndex((t) => t.id === task.id) + 1,
          subLabel: parent ? subquestionLabel(q.position) : null,
          answer: a.answer,
          verdict: a.verdict,
          feedback: a.feedback,
          order: [task.position, parent ? q.position : -1],
        };
      });
      entries.sort((x, y) => x.order[0]! - y.order[0]! || x.order[1]! - y.order[1]!);
      return { ...s, answers: entries.map(({ order, ...rest }) => rest) };
    });
  };
