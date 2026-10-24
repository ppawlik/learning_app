import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
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

it('submits typed and selected answers', async () => {
  const spy = vi.spyOn(api, 'submitAnswers').mockResolvedValue({ id: 99 });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AnswerForm questionnaire={questionnaire} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.type(screen.getByLabelText('Answer 1'), 'a cat');
  expect(screen.getByText('2. About the picture')).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText('y'));
  await userEvent.type(screen.getByLabelText('Answer 2b'), 'because');
  await userEvent.click(screen.getByRole('button', { name: /submit answers/i }));
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
