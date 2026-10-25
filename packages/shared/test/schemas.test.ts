import { describe, expect, it } from 'vitest';
import {
  createLearningSchema,
  generatedQuestionnaireSchema,
  isHeicFile,
  reviewResultSchema,
  submitAnswersSchema,
  subquestionLabel,
} from '../src/index.js';

describe('subquestionLabel', () => {
  it('maps indexes to letters', () => {
    expect([0, 1, 2, 25].map(subquestionLabel)).toEqual(['a', 'b', 'c', 'z']);
  });
});

describe('isHeicFile', () => {
  it.each([
    ['image/heic', 'a.jpg', true],
    ['IMAGE/HEIF', 'a.jpg', true],
    ['application/octet-stream', 'IMG_1.HEIC', true],
    ['image/png', 'a.png', false],
  ])('%s %s -> %s', (mime, name, expected) => {
    expect(isHeicFile(mime, name)).toBe(expected);
  });
});

describe('createLearningSchema', () => {
  it('trims and enforces limits', () => {
    expect(createLearningSchema.parse({ title: '  T  ', prompt: 'P' })).toEqual({ title: 'T', prompt: 'P' });
    expect(createLearningSchema.safeParse({ title: '   ', prompt: 'P' }).success).toBe(false);
    expect(createLearningSchema.safeParse({ title: 'x'.repeat(201), prompt: 'P' }).success).toBe(false);
    expect(createLearningSchema.safeParse({ title: 'T', prompt: 'x'.repeat(5001) }).success).toBe(false);
  });
});

describe('generatedQuestionnaireSchema', () => {
  const leaf = { text: 'Q?', type: 'open', expectedAnswer: 'A' };

  it('accepts plain questions and questions with subquestions', () => {
    const ok = generatedQuestionnaireSchema.safeParse({
      questions: [{ ...leaf, category: 'A' }, { category: 'A', text: 'Statement', subquestions: [leaf, { ...leaf, type: 'multiple_choice', options: ['x'] }] }],
    });
    expect(ok.success).toBe(true);
  });

  it.each([
    ['no questions', { questions: [] }],
    ['plain question without expectedAnswer', { questions: [{ category: 'A', text: 'Q?', type: 'open' }] }],
    ['question with neither type nor subquestions', { questions: [{ category: 'A', text: 'Q?' }] }],
    ['question without category', { questions: [{ ...leaf }] }],
    ['question with subquestions and its own type', { questions: [{ category: 'A', text: 'S', type: 'open', subquestions: [leaf] }] }],
    ['subquestion without expectedAnswer', { questions: [{ category: 'A', text: 'S', subquestions: [{ text: 'a', type: 'open' }] }] }],
  ])('rejects %s', (_name, input) => {
    expect(generatedQuestionnaireSchema.safeParse(input).success).toBe(false);
  });
});

describe('submitAnswersSchema', () => {
  it('requires at least one answer and bounds the length', () => {
    expect(submitAnswersSchema.safeParse({ answers: [] }).success).toBe(false);
    expect(submitAnswersSchema.safeParse({ answers: [{ questionId: 1, answer: 'x'.repeat(5001) }] }).success).toBe(false);
    expect(submitAnswersSchema.safeParse({ answers: [{ questionId: 1, answer: '' }] }).success).toBe(true);
  });
});

describe('reviewResultSchema', () => {
  it('rejects an unknown verdict', () => {
    const bad = { answers: [{ questionId: 1, verdict: 'maybe', feedback: 'f' }], summary: 's' };
    expect(reviewResultSchema.safeParse(bad).success).toBe(false);
  });
});
