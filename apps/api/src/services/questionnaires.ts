import { eq } from 'drizzle-orm';
import { questionLabel } from '@learning/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/index.js';
import { schema } from '../db/index.js';
import type { ClaudeService } from '../claude/client.js';

const { images, learnings, questionnaires, questions, submissions, answers } = schema;

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Unknown error';
}

export const INTERRUPTED_MESSAGE = 'Interrupted by a server restart; please try again';

/** Jobs run in-process (ADR 0003), so any row still in progress at startup belongs to a dead process. */
export function failInterruptedJobs(db: Db, log: FastifyBaseLogger) {
  const generating = db
    .update(questionnaires)
    .set({ status: 'failed', error: INTERRUPTED_MESSAGE })
    .where(eq(questionnaires.status, 'generating'))
    .run().changes;
  const reviewing = db
    .update(submissions)
    .set({ status: 'failed', error: INTERRUPTED_MESSAGE })
    .where(eq(submissions.status, 'reviewing'))
    .run().changes;
  if (generating + reviewing > 0) log.warn({ generating, reviewing }, 'marked interrupted jobs as failed');
}

export async function generateQuestionnaire(db: Db, claude: ClaudeService, questionnaireId: number, log: FastifyBaseLogger) {
  const started = Date.now();
  log.info({ questionnaireId }, 'questionnaire generation started');
  try {
    const q = db.select().from(questionnaires).where(eq(questionnaires.id, questionnaireId)).get();
    if (!q) return;
    const learning = db.select().from(learnings).where(eq(learnings.id, q.learningId)).get()!;
    const imgs = db.select().from(images).where(eq(images.learningId, q.learningId)).all();
    const result = await claude.generateQuestionnaire(learning.prompt, imgs);
    db.transaction((tx) => {
      const leaf = (item: { text: string; type: 'open' | 'multiple_choice'; options?: string[]; expectedAnswer: string }) => ({
        text: item.text,
        type: item.type,
        options: item.type === 'multiple_choice' ? (item.options ?? []) : null,
        expectedAnswer: item.expectedAnswer,
      });
      result.questions.forEach((item, i) => {
        if (item.subquestions?.length) {
          // The parent is only a statement; it is never answered or reviewed.
          const parent = tx
            .insert(questions)
            .values({ questionnaireId, position: i, text: item.text, type: 'open', options: null, expectedAnswer: '' })
            .returning()
            .get();
          tx.insert(questions)
            .values(item.subquestions.map((sq, j) => ({ questionnaireId, parentId: parent.id, position: j, ...leaf(sq) })))
            .run();
        } else {
          // The refine in generatedQuestionnaireSchema guarantees type and expectedAnswer here.
          tx.insert(questions)
            .values({ questionnaireId, position: i, ...leaf({ ...item, type: item.type!, expectedAnswer: item.expectedAnswer! }) })
            .run();
        }
      });
      tx.update(questionnaires).set({ status: 'ready' }).where(eq(questionnaires.id, questionnaireId)).run();
    });
    log.info(
      { questionnaireId, questionCount: result.questions.length, durationMs: Date.now() - started },
      'questionnaire generated',
    );
  } catch (err) {
    log.error({ err, questionnaireId, durationMs: Date.now() - started }, 'questionnaire generation failed');
    db.update(questionnaires)
      .set({ status: 'failed', error: errorMessage(err) })
      .where(eq(questionnaires.id, questionnaireId))
      .run();
  }
}

export function computeSuccessRate(verdicts: ('passed' | 'failed')[]) {
  if (verdicts.length === 0) return 0;
  return Math.round((verdicts.filter((v) => v === 'passed').length / verdicts.length) * 100);
}

export async function reviewSubmission(db: Db, claude: ClaudeService, submissionId: number, log: FastifyBaseLogger) {
  const started = Date.now();
  log.info({ submissionId }, 'submission review started');
  try {
    const sub = db.select().from(submissions).where(eq(submissions.id, submissionId)).get();
    if (!sub) return;
    const qn = db.select().from(questionnaires).where(eq(questionnaires.id, sub.questionnaireId)).get()!;
    const learning = db.select().from(learnings).where(eq(learnings.id, qn.learningId)).get()!;
    const imgs = db.select().from(images).where(eq(images.learningId, qn.learningId)).all();
    const all = db.select().from(questions).where(eq(questions.questionnaireId, qn.id)).all();
    const parentText = new Map(all.map((q) => [q.id, q.text]));
    const questionNumber = new Map(
      all
        .filter((q) => q.parentId === null)
        .sort((a, b) => a.position - b.position)
        .map((q, i) => [q.id, i + 1] as const),
    );
    // Only answerable questions (not question statements that have subquestions) are reviewed.
    const parentIds = new Set(all.map((q) => q.parentId).filter((x): x is number => x !== null));
    const qs = all.filter((q) => !parentIds.has(q.id));
    const given = db.select().from(answers).where(eq(answers.submissionId, submissionId)).all();
    const answerByQ = new Map(given.map((a) => [a.questionId, a]));

    const result = await claude.reviewAnswers({
      learningPrompt: learning.prompt,
      images: imgs,
      items: qs.map((q) => ({
        questionId: q.id,
        label: questionLabel(questionNumber.get(q.parentId ?? q.id)!, q.parentId === null ? null : q.position),
        context: q.parentId === null ? null : (parentText.get(q.parentId) ?? null),
        text: q.text,
        options: q.options,
        expectedAnswer: q.expectedAnswer,
        answer: answerByQ.get(q.id)?.answer ?? '',
      })),
    });

    const reviewByQ = new Map(result.answers.map((a) => [a.questionId, a]));
    // Unreviewed questions count as failed so stats always cover every question.
    const verdicts = qs.map((q) => reviewByQ.get(q.id)?.verdict ?? 'failed');

    db.transaction((tx) => {
      qs.forEach((q, i) => {
        const r = reviewByQ.get(q.id);
        tx.update(answers)
          .set({ verdict: verdicts[i]!, feedback: r?.feedback ?? 'No review was returned for this answer.' })
          .where(eq(answers.id, answerByQ.get(q.id)!.id))
          .run();
      });
      tx.update(submissions)
        .set({ status: 'reviewed', successRate: computeSuccessRate(verdicts), summary: result.summary })
        .where(eq(submissions.id, submissionId))
        .run();
    });
    log.info(
      { submissionId, successRate: computeSuccessRate(verdicts), durationMs: Date.now() - started },
      'submission reviewed',
    );
  } catch (err) {
    log.error({ err, submissionId, durationMs: Date.now() - started }, 'submission review failed');
    db.update(submissions)
      .set({ status: 'failed', error: errorMessage(err) })
      .where(eq(submissions.id, submissionId))
      .run();
  }
}
