import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, loadDraft, saveDraft } from './draftAnswers';

beforeEach(() => localStorage.clear());

describe('draftAnswers', () => {
  it('round-trips answers per questionnaire', () => {
    saveDraft(1, { '10': 'a' });
    saveDraft(2, { '20': 'b' });
    expect(loadDraft(1)).toEqual({ '10': 'a' });
    expect(loadDraft(2)).toEqual({ '20': 'b' });
  });

  it('returns an empty draft when nothing, garbage or a wrong shape is stored', () => {
    expect(loadDraft(1)).toEqual({});
    localStorage.setItem('learning-app:draft:questionnaire:1', 'not json');
    expect(loadDraft(1)).toEqual({});
    localStorage.setItem('learning-app:draft:questionnaire:1', '["x"]');
    expect(loadDraft(1)).toEqual({});
  });

  it('drops non-string values', () => {
    localStorage.setItem('learning-app:draft:questionnaire:1', JSON.stringify({ '1': 'ok', '2': 5, '3': null }));
    expect(loadDraft(1)).toEqual({ '1': 'ok' });
  });

  it('clears a draft', () => {
    saveDraft(1, { '10': 'a' });
    clearDraft(1);
    expect(loadDraft(1)).toEqual({});
  });

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => saveDraft(1, { '1': 'a' })).not.toThrow();
    expect(loadDraft(1)).toEqual({});
    vi.restoreAllMocks();
  });
});
