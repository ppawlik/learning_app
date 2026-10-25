import { useQuery } from '@tanstack/react-query';
import type { LearningDetail } from '@learning/shared';
import { api } from '../api/client';
import type { Crumb } from '../components/ui';

/** Per-topic numbers (by creation order) shown instead of database ids. */
export function setNumber(detail: LearningDetail, questionnaireId: number) {
  return [...detail.questionnaires].sort((a, b) => a.id - b.id).findIndex((q) => q.id === questionnaireId) + 1;
}

export function submissionNumber(detail: LearningDetail, questionnaireId: number, submissionId: number) {
  return (
    detail.submissions
      .filter((s) => s.questionnaireId === questionnaireId)
      .sort((a, b) => a.id - b.id)
      .findIndex((s) => s.id === submissionId) + 1
  );
}

/** Breadcrumbs down to the current page; falls back to "Tematy" while the topic loads. */
export function useTrail(learningId: number | undefined, current?: { questionnaireId: number; submissionId?: number }): Crumb[] {
  const { data } = useQuery({
    queryKey: ['learning', learningId],
    queryFn: () => api.getLearning(learningId!),
    enabled: learningId !== undefined,
  });
  const root: Crumb = { label: 'Tematy', to: '/' };
  if (!data || learningId === undefined) return [{ label: 'Tematy' }];
  const topic: Crumb = { label: data.title, to: `/learnings/${learningId}` };
  if (!current) return [root, { label: data.title }];
  const set: Crumb = { label: `Zestaw ${setNumber(data, current.questionnaireId)}`, to: `/questionnaires/${current.questionnaireId}` };
  if (current.submissionId === undefined) return [root, topic, { label: set.label }];
  return [root, topic, set, { label: `Podejście ${submissionNumber(data, current.questionnaireId, current.submissionId)}` }];
}
