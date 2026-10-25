import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { SubmissionPage } from './SubmissionPage';
import { api } from '../../api/client';

afterEach(() => vi.restoreAllMocks());

const answer = (over: object) => ({
  questionId: 1,
  questionText: 'Q',
  parentText: null,
  questionNumber: 1,
  subLabel: null,
  answer: 'mine',
  verdict: 'passed' as const,
  feedback: 'fb',
  ...over,
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/submissions/9']}>
        <Routes>
          <Route path="/submissions/:id" element={<SubmissionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const submission = { id: 9, questionnaireId: 1, error: null, createdAt: '' };

it('shows the review with the question statement printed once above its lettered subquestions', async () => {
  vi.spyOn(api, 'getSubmission').mockResolvedValue({
    ...submission,
    status: 'reviewed',
    successRate: 67,
    summary: 'Well done',
    answers: [
      answer({ questionId: 1, questionText: 'Plain' }),
      answer({ questionId: 2, questionText: 'Part one', parentText: 'Statement', questionNumber: 2, subLabel: 'a' }),
      answer({ questionId: 3, questionText: 'Part two', parentText: 'Statement', questionNumber: 2, subLabel: 'b', verdict: 'failed', answer: '' }),
    ],
  });
  renderPage();
  expect(await screen.findByText('67%')).toBeInTheDocument();
  expect(screen.getByText('Well done')).toBeInTheDocument();
  expect(screen.getByText('2 of 3 answers passed')).toBeInTheDocument();
  expect(screen.getByText(/1\. Plain/)).toBeInTheDocument();
  expect(screen.getAllByText('2. Statement')).toHaveLength(1);
  expect(screen.getByText(/a\) Part one/)).toBeInTheDocument();
  expect(screen.getByText(/b\) Part two/)).toBeInTheDocument();
  expect(screen.getByText('(empty)')).toBeInTheDocument();
});

it('shows a spinner while the review runs', async () => {
  vi.spyOn(api, 'getSubmission').mockResolvedValue({
    ...submission,
    status: 'reviewing',
    successRate: null,
    summary: null,
    answers: [],
  });
  renderPage();
  expect(await screen.findByText(/claude is reviewing/i)).toBeInTheDocument();
});
