// Interim answers live in the browser only; storage can be missing or throw, so every access is guarded.
const key = (questionnaireId: number) => `learning-app:draft:questionnaire:${questionnaireId}`;

export function loadDraft(questionnaireId: number): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(questionnaireId)) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveDraft(questionnaireId: number, answers: Record<string, string> | undefined) {
  try {
    localStorage.setItem(key(questionnaireId), JSON.stringify(answers ?? {}));
  } catch {
    // Drafts are a convenience; ignore quota or privacy-mode errors.
  }
}

export function clearDraft(questionnaireId: number) {
  try {
    localStorage.removeItem(key(questionnaireId));
  } catch {
    // ignore
  }
}
