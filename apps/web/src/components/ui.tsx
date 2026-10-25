import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

export function ErrorMessage({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
      {error instanceof Error ? error.message : 'Coś poszło nie tak'}
    </p>
  );
}

export function Spinner({ label = 'Ładowanie…' }: { label?: string }) {
  return (
    <p role="status" className="text-sm text-slate-500">
      {label}
    </p>
  );
}

export const buttonClass =
  'rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
export const inputClass = 'w-full rounded border border-slate-300 px-3 py-2 text-sm';
