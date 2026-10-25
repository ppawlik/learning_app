import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { QuestionnairePage } from './QuestionnairePage';
import { api } from '../../api/client';

afterEach(() => vi.restoreAllMocks());

const base = { id: 3, learningId: 1, error: null, createdAt: '', questions: [] };

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/questionnaires/3']}>
        <Routes>
          <Route path="/questionnaires/:id" element={<QuestionnairePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

it('shows a spinner while the questionnaire is being generated', async () => {
  vi.spyOn(api, 'getQuestionnaire').mockResolvedValue({ ...base, status: 'generating' });
  renderPage();
  expect(await screen.findByText(/claude is generating/i)).toBeInTheDocument();
});

it('shows the stored error when generation failed', async () => {
  vi.spyOn(api, 'getQuestionnaire').mockResolvedValue({ ...base, status: 'failed', error: 'Claude ran out of tokens' });
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('Claude ran out of tokens');
});

it('shows an error when the questionnaire cannot be loaded', async () => {
  vi.spyOn(api, 'getQuestionnaire').mockRejectedValue(new Error('Questionnaire not found'));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('Questionnaire not found');
});

it('numbers questions and letters subquestions, with an input for each answerable question only', async () => {
  vi.spyOn(api, 'getQuestionnaire').mockResolvedValue({
    ...base,
    status: 'ready',
    questions: [
      { id: 1, position: 0, text: 'Plain', type: 'open', options: null, subquestions: [] },
      {
        id: 2,
        position: 1,
        text: 'Statement',
        type: 'open',
        options: null,
        subquestions: [
          { id: 3, position: 0, text: 'First', type: 'open', options: null },
          { id: 4, position: 1, text: 'Second', type: 'open', options: null },
        ],
      },
    ],
  });
  renderPage();
  expect(await screen.findByText('1. Plain')).toBeInTheDocument();
  expect(screen.getByText('2. Statement')).toBeInTheDocument();
  expect(screen.getByText('a) First')).toBeInTheDocument();
  expect(screen.getByText('b) Second')).toBeInTheDocument();
  expect(screen.getAllByRole('textbox').map((t) => t.getAttribute('aria-label'))).toEqual(['Answer 1', 'Answer 2a', 'Answer 2b']);
});
