import type {
  CreateLearningInput,
  Learning,
  LearningDetail,
  LearningImage,
  Questionnaire,
  SubmitAnswersInput,
  Submission,
} from '@learning/shared';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  listLearnings: () => request<Learning[]>('/api/learnings'),
  createLearning: (input: CreateLearningInput) => request<Learning>('/api/learnings', json('POST', input)),
  getLearning: (id: number) => request<LearningDetail>(`/api/learnings/${id}`),
  deleteLearning: (id: number) => request<void>(`/api/learnings/${id}`, { method: 'DELETE' }),
  uploadImage: (learningId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<LearningImage>(`/api/learnings/${learningId}/images`, { method: 'POST', body: form });
  },
  deleteImage: (id: number) => request<void>(`/api/images/${id}`, { method: 'DELETE' }),
  imageUrl: (id: number) => `/api/images/${id}/file`,
  generateQuestionnaire: (learningId: number) =>
    request<{ id: number; status: string }>(`/api/learnings/${learningId}/questionnaires`, { method: 'POST' }),
  getQuestionnaire: (id: number) => request<Questionnaire>(`/api/questionnaires/${id}`),
  submitAnswers: (questionnaireId: number, input: SubmitAnswersInput) =>
    request<{ id: number }>(`/api/questionnaires/${questionnaireId}/submissions`, json('POST', input)),
  retryReview: (submissionId: number) =>
    request<{ id: number }>(`/api/submissions/${submissionId}/retry`, { method: 'POST' }),
  getSubmission: (id: number) => request<Submission>(`/api/submissions/${id}`),
};
