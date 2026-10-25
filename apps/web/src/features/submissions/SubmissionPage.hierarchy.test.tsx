import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SubmissionPage } from './SubmissionPage';
import { api } from '../../api/client';

afterEach(() => vi.restoreAllMocks());

const answer = (over: object) => ({
  questionId: 1,
  label: '1',
  questionText: 'Q',
  parentText: null,
  questionNumber: 1,
  category: null,
  subLabel: null,
  answer: 'mine',
  verdict: 'passed' as const,
  feedback: 'fb',
  expectedAnswer: null,
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

const submission = { id: 9, questionnaireId: 1, learningId: 4, error: null, createdAt: '', categoryStats: [] };

const topic = { id: 4, title: 'Biologia', prompt: 'P', createdAt: '', images: [], categories: [], defaultCategories: [], questionnaires: [{ id: 1, status: 'ready' as const, error: null, createdAt: '', requestedCategories: [], questionCount: null }], submissions: [{ id: 9, questionnaireId: 1, status: 'reviewed' as const, error: null, successRate: 67, createdAt: '' }] };

beforeEach(() => {
  vi.spyOn(api, 'getLearning').mockResolvedValue(topic);
});

it('shows the review with the question statement printed once above its lettered subquestions', async () => {
  vi.spyOn(api, 'getSubmission').mockResolvedValue({
    ...submission,
    status: 'reviewed',
    successRate: 67,
    summary: 'Well done',
    answers: [
      answer({ questionId: 1, questionText: 'Plain' }),
      answer({ questionId: 2, questionText: 'Part one', parentText: 'Statement', questionNumber: 2, subLabel: 'a', label: '2a' }),
      answer({ questionId: 3, questionText: 'Part two', parentText: 'Statement', questionNumber: 2, subLabel: 'b', label: '2b', verdict: 'failed', answer: '', expectedAnswer: 'Correct B' }),
    ],
  });
  renderPage();
  expect(await screen.findByText('67%')).toBeInTheDocument();
  expect(screen.getByText('Well done')).toBeInTheDocument();
  expect(screen.getByText('2 z 3 odpowiedzi poprawnych')).toBeInTheDocument();
  expect(screen.getByText(/1\. Plain/)).toBeInTheDocument();
  expect(screen.getAllByText('2. Statement')).toHaveLength(1);
  // every card carries the full label, as the review summary cites it
  expect(screen.getByText(/2a\) Part one/)).toBeInTheDocument();
  expect(screen.getByText(/2b\) Part two/)).toBeInTheDocument();
  expect(screen.getByText('(puste)')).toBeInTheDocument();
  // the correct answer appears only for the failed answer
  expect(screen.getAllByText(/Poprawna odpowiedź:/)).toHaveLength(1);
  expect(screen.getByText('Poprawna odpowiedź: Correct B')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /rozwiąż ponownie/i })).toHaveAttribute('href', '/questionnaires/1');
  expect(screen.getByRole('link', { name: /wróć do tematu/i })).toHaveAttribute('href', '/learnings/4');
  expect(await screen.findByRole('link', { name: 'Biologia' })).toHaveAttribute('href', '/learnings/4');
});

it('jumps to failed answers and can hide the passed ones', async () => {
  vi.spyOn(api, 'getSubmission').mockResolvedValue({
    ...submission,
    status: 'reviewed',
    successRate: 50,
    summary: null,
    answers: [
      answer({ questionId: 1, questionText: 'Plain' }),
      answer({ questionId: 2, questionText: 'Part one', parentText: 'Statement', questionNumber: 2, subLabel: 'a', label: '2a', verdict: 'failed', expectedAnswer: 'X' }),
    ],
  });
  renderPage();
  expect(await screen.findByRole('link', { name: '2a' })).toHaveAttribute('href', '#odp-2a');
  await userEvent.click(screen.getByLabelText(/tylko błędne \(1\)/i));
  expect(screen.queryByText(/Plain/)).not.toBeInTheDocument();
  expect(screen.getByText(/2a\) Part one/)).toBeInTheDocument();
  expect(screen.getByText('2. Statement')).toBeInTheDocument();
});

it('renders the summary as paragraphs and a bullet list', async () => {
  vi.spyOn(api, 'getSubmission').mockResolvedValue({
    ...submission,
    status: 'reviewed',
    successRate: 50,
    summary: 'Intro line\n- first mistake\n- second mistake\nClosing tip',
    answers: [answer({})],
  });
  renderPage();
  expect(await screen.findByText('Intro line')).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['first mistake', 'second mistake']);
  expect(screen.getByText('Closing tip')).toBeInTheDocument();
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
  expect(await screen.findByText(/claude ocenia/i)).toBeInTheDocument();
});

it('shows results per category', async () => {
  vi.spyOn(api, 'getSubmission').mockResolvedValue({
    ...submission,
    status: 'reviewed',
    successRate: 50,
    summary: null,
    categoryStats: [
      { category: 'Alfa', passed: 1, total: 1, successRate: 100 },
      { category: 'Beta', passed: 0, total: 1, successRate: 0 },
    ],
    answers: [answer({ category: 'Alfa' }), answer({ questionId: 2, label: '2', questionNumber: 2, category: 'Beta', verdict: 'failed', expectedAnswer: 'X' })],
  });
  renderPage();
  const table = await screen.findByRole('table', { name: 'Wyniki według kategorii' });
  expect(table).toHaveTextContent('Alfa1 z 1100%');
  expect(table).toHaveTextContent('Beta0 z 10%');
});
