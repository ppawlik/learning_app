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
    { id: 11, position: 0, text: 'What is shown?', type: 'open' as const, options: null },
    { id: 12, position: 1, text: 'Pick one', type: 'multiple_choice' as const, options: ['a', 'b'] },
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
  await userEvent.click(screen.getByLabelText('b'));
  await userEvent.click(screen.getByRole('button', { name: /submit answers/i }));
  await waitFor(() =>
    expect(spy).toHaveBeenCalledWith(7, {
      answers: [
        { questionId: 11, answer: 'a cat' },
        { questionId: 12, answer: 'b' },
      ],
    }),
  );
});
