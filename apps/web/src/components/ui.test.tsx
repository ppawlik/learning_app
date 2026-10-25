import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ConfirmButton, Summary } from './ui';

it('confirms a destructive action inline', async () => {
  const onConfirm = vi.fn();
  render(<ConfirmButton label="Usuń" onConfirm={onConfirm} />);
  await userEvent.click(screen.getByRole('button', { name: 'Usuń' }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByText('Na pewno?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Nie' }));
  expect(onConfirm).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Usuń' }));
  await userEvent.click(screen.getByRole('button', { name: 'Tak' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Usuń' })).toBeInTheDocument();
});

it('renders paragraphs and bullet lists in the summary', () => {
  render(<Summary text={'Intro\n- one\n* two\n\nOutro'} />);
  expect(screen.getByText('Intro').tagName).toBe('P');
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['one', 'two']);
  expect(screen.getByText('Outro').tagName).toBe('P');
});
