import { eq, asc } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { questionLabel, subquestionLabel, submitAnswersSchema } from '@learning/shared';
import { schema } from '../db/index.js';
import type { AppDeps } from '../app.js';
import { HttpError, idParams } from './util.js';
import { computeCategoryStats, generateQuestionnaire, reviewSubmission } from '../services/questionnaires.js';

const { questionnaires, questions, submissions, answers } = schema;

export const questionnaireRoutes =
  ({ db, claude }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/questionnaires/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      const q = db.select().from(questionnaires).where(eq(questionnaires.id, id)).get();
      if (!q) throw new HttpError(404, 'Nie znaleziono zestawu pytań');
      const qs = db.select().from(questions).where(eq(questions.questionnaireId, id)).orderBy(asc(questions.position)).all();
      // expectedAnswer is intentionally omitted
      const view = (x: (typeof qs)[number]) => ({ id: x.id, position: x.position, category: x.category, text: x.text, type: x.type, options: x.options });
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

    app.post('/questionnaires/:id/retry', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const q = db.select().from(questionnaires).where(eq(questionnaires.id, id)).get();
      if (!q) throw new HttpError(404, 'Nie znaleziono zestawu pytań');
      if (q.status !== 'failed') throw new HttpError(409, 'Ponowić można tylko nieudane generowanie');
      db.update(questionnaires).set({ status: 'generating', error: null }).where(eq(questionnaires.id, id)).run();
      req.log.info({ questionnaireId: id }, 'generation retried');
      void generateQuestionnaire(db, claude, id, req.log);
      return reply.status(202).send({ id, status: 'generating' });
    });

    app.delete('/questionnaires/:id', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const q = db.select().from(questionnaires).where(eq(questionnaires.id, id)).get();
      if (!q) throw new HttpError(404, 'Nie znaleziono zestawu pytań');
      if (q.status === 'generating') throw new HttpError(409, 'Zestaw pytań jest w trakcie generowania');
      const reviewing = db.select().from(submissions).where(eq(submissions.questionnaireId, id)).all().some((s) => s.status === 'reviewing');
      if (reviewing) throw new HttpError(409, 'Któreś podejście jest w trakcie oceny');
      db.delete(questionnaires).where(eq(questionnaires.id, id)).run();
      req.log.info({ questionnaireId: id }, 'questionnaire deleted');
      return reply.status(204).send();
    });

    app.delete('/submissions/:id', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const s = db.select().from(submissions).where(eq(submissions.id, id)).get();
      if (!s) throw new HttpError(404, 'Nie znaleziono podejścia');
      if (s.status === 'reviewing') throw new HttpError(409, 'Podejście jest w trakcie oceny');
      db.delete(submissions).where(eq(submissions.id, id)).run();
      req.log.info({ submissionId: id }, 'submission deleted');
      return reply.status(204).send();
    });

    app.post('/questionnaires/:id/submissions', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const body = submitAnswersSchema.parse(req.body);
      const q = db.select().from(questionnaires).where(eq(questionnaires.id, id)).get();
      if (!q) throw new HttpError(404, 'Nie znaleziono zestawu pytań');
      if (q.status !== 'ready') throw new HttpError(409, 'Zestaw pytań nie jest gotowy');
      const qs = db.select().from(questions).where(eq(questions.questionnaireId, id)).all();
      const parentIds = new Set(qs.map((x) => x.parentId).filter((x): x is number => x !== null));
      const answerable = qs.filter((x) => !parentIds.has(x.id));
      const valid = new Set(answerable.map((x) => x.id));
      if (body.answers.some((a) => !valid.has(a.questionId))) throw new HttpError(400, 'Nieznane pytanie');

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

    app.post('/submissions/:id/retry', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const s = db.select().from(submissions).where(eq(submissions.id, id)).get();
      if (!s) throw new HttpError(404, 'Nie znaleziono podejścia');
      if (s.status !== 'failed') throw new HttpError(409, 'Ponowić można tylko nieudaną ocenę');
      db.update(submissions).set({ status: 'reviewing', error: null }).where(eq(submissions.id, id)).run();
      req.log.info({ submissionId: id }, 'review retried');
      void reviewSubmission(db, claude, id, req.log);
      return reply.status(202).send({ id, status: 'reviewing' });
    });

    app.get('/submissions/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      const s = db.select().from(submissions).where(eq(submissions.id, id)).get();
      if (!s) throw new HttpError(404, 'Nie znaleziono podejścia');
      const qs = db
        .select()
        .from(questions)
        .where(eq(questions.questionnaireId, s.questionnaireId))
        .orderBy(asc(questions.position))
        .all();
      const byId = new Map(qs.map((x) => [x.id, x]));
      const rootQuestions = qs.filter((x) => x.parentId === null);
      const qn = db.select().from(questionnaires).where(eq(questionnaires.id, s.questionnaireId)).get()!;
      const rows = db.select().from(answers).where(eq(answers.submissionId, id)).all();
      const entries = rows.map((a) => {
        const q = byId.get(a.questionId)!;
        const parent = q.parentId === null ? null : byId.get(q.parentId)!;
        const root = parent ?? q;
        const questionNumber = rootQuestions.findIndex((t) => t.id === root.id) + 1;
        return {
          questionId: a.questionId,
          label: questionLabel(questionNumber, parent ? q.position : null),
          questionText: q.text,
          parentText: parent?.text ?? null,
          questionNumber,
          category: q.category,
          subLabel: parent ? subquestionLabel(q.position) : null,
          answer: a.answer,
          verdict: a.verdict,
          feedback: a.feedback,
          // ADR 0012: the correct answer is revealed only for failed answers of a reviewed submission
          expectedAnswer: s.status === 'reviewed' && a.verdict === 'failed' ? q.expectedAnswer : null,
          order: [root.position, parent ? q.position : -1],
        };
      });
      entries.sort((x, y) => x.order[0]! - y.order[0]! || x.order[1]! - y.order[1]!);
      const categoryStats =
        s.status === 'reviewed'
          ? computeCategoryStats(entries.map((e) => ({ category: e.category, verdict: e.verdict ?? 'failed' })))
          : [];
      return { ...s, learningId: qn.learningId, categoryStats, answers: entries.map(({ order, ...rest }) => rest) };
    });
  };
