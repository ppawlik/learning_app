import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { AnswerForm } from './QuestionnairePage';
import { api } from '../../api/client';

const questionnaire = {
  id: 7,
  learningId: 1,
  status: 'ready' as const,
  error: null,
  createdAt: '',
  questions: [
    { id: 11, position: 0, text: 'What is shown?', type: 'open' as const, options: null, subquestions: [] },
    {
      id: 12,
      position: 1,
      text: 'About the picture',
      type: 'open' as const,
      options: null,
      subquestions: [
        { id: 13, position: 0, text: 'Pick one', type: 'multiple_choice' as const, options: ['x', 'y'] },
        { id: 14, position: 1, text: 'Why?', type: 'open' as const, options: null },
      ],
    },
  ],
};

const draftKey = 'learning-app:draft:questionnaire:7';

const renderForm = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AnswerForm questionnaire={questionnaire} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => localStorage.clear());

it('submits typed and selected answers', async () => {
  const spy = vi.spyOn(api, 'submitAnswers').mockResolvedValue({ id: 99 });
  renderForm();
  await userEvent.type(screen.getByLabelText('Odpowiedź 1'), 'a cat');
  expect(screen.getByText('2. About the picture')).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText('y'));
  await userEvent.type(screen.getByLabelText('Odpowiedź 2b'), 'because');
  await userEvent.click(screen.getByRole('button', { name: /wyślij odpowiedzi/i }));
  await waitFor(() =>
    expect(spy).toHaveBeenCalledWith(7, {
      answers: [
        { questionId: 11, answer: 'a cat' },
        { questionId: 13, answer: 'y' },
        { questionId: 14, answer: 'because' },
      ],
    }),
  );
});

it('keeps an answer when focus leaves the input and restores it later', async () => {
  const first = renderForm();
  await userEvent.type(screen.getByLabelText('Odpowiedź 1'), 'a cat');
  expect(localStorage.getItem(draftKey)).toBeNull(); // still typing, nothing saved yet
  await userEvent.click(screen.getByLabelText('y')); // moves focus out of the textarea
  await userEvent.click(screen.getByLabelText('Odpowiedź 2b')); // and out of the radio
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual({ '11': 'a cat', '13': 'y', '14': '' });
  first.unmount();

  renderForm();
  expect(screen.getByLabelText('Odpowiedź 1')).toHaveValue('a cat');
  expect(screen.getByLabelText('y')).toBeChecked();
});

it('clears the draft after a successful submit', async () => {
  vi.spyOn(api, 'submitAnswers').mockResolvedValue({ id: 99 });
  renderForm();
  await userEvent.type(screen.getByLabelText('Odpowiedź 1'), 'a cat');
  await userEvent.click(screen.getByRole('button', { name: /wyślij odpowiedzi/i }));
  await waitFor(() => expect(localStorage.getItem(draftKey)).toBeNull());
});

it('ignores a corrupt draft', () => {
  localStorage.setItem(draftKey, '{not json');
  renderForm();
  expect(screen.getByLabelText('Odpowiedź 1')).toHaveValue('');
});
