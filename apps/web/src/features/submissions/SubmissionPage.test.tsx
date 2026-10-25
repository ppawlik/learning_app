import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { SubmissionPage } from './SubmissionPage';
import { api } from '../../api/client';

const failed = {
  id: 5,
  questionnaireId: 1,
  status: 'failed' as const,
  error: 'Interrupted by a server restart; please try again',
  successRate: null,
  summary: null,
  createdAt: '',
  answers: [],
};

it('offers to retry a failed review', async () => {
  vi.spyOn(api, 'getSubmission').mockResolvedValue(failed);
  const retry = vi.spyOn(api, 'retryReview').mockResolvedValue({ id: 5 });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/submissions/5']}>
        <Routes>
          <Route path="/submissions/:id" element={<SubmissionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText(/interrupted by a server restart/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /ponów ocenę/i }));
  await waitFor(() => expect(retry).toHaveBeenCalledWith(5));
});
