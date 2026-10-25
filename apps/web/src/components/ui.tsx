import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function ErrorMessage({ error, id }: { error: unknown; id?: string }) {
  return (
    <p id={id} role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
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

/** Status text for a job Claude is working on: elapsed time, expected duration and the reassurance that leaving is safe. */
export function WaitingNotice({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Card>
      <p role="status" className="font-medium">{label}</p>
      <p className="mt-1 text-sm text-slate-500">Upłynęło {seconds} s. To może potrwać do minuty; możesz wrócić do tematu, praca trwa na serwerze.</p>
    </Card>
  );
}

export const buttonClass =
  'rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButtonClass =
  'rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const linkClass = 'text-sm text-indigo-600 hover:underline';
export const inputClass = 'w-full rounded border border-slate-300 px-3 py-2 text-sm';

export function BackLink({ to, children = '← Wróć do tematu' }: { to: string; children?: ReactNode }) {
  return (
    <Link to={to} className={`${linkClass} inline-block py-2`}>
      {children}
    </Link>
  );
}

export type Crumb = { label: string; to?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Okruszki" className="mb-4 flex flex-wrap gap-x-1 text-xs text-slate-500">
      {items.map((c, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true"> › </span>}
          {c.to ? (
            <Link to={c.to} className="hover:underline">
              {c.label}
            </Link>
          ) : (
            <span aria-current="page">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Destructive action that confirms inline ("Na pewno? Tak / Nie") instead of opening a browser dialog. */
export function ConfirmButton({
  label,
  onConfirm,
  disabled,
  className = 'text-sm text-red-600 hover:underline',
  ariaLabel,
  children,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <span role="group" aria-label={`Potwierdź: ${label}`} className="inline-flex items-center gap-2 text-sm">
        <span>Na pewno?</span>
        <button
          type="button"
          className="rounded bg-red-600 px-2 py-1 text-white"
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          Tak
        </button>
        <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1" onClick={() => setAsking(false)}>
          Nie
        </button>
      </span>
    );
  }
  return (
    <button type="button" className={className} disabled={disabled} aria-label={ariaLabel} onClick={() => setAsking(true)}>
      {children ?? label}
    </button>
  );
}

/** Renders Claude's summary: plain lines become paragraphs, consecutive "- " lines a bullet list. */
export function Summary({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="ml-5 list-disc space-y-1">
          {list.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    if (bullet) list.push(bullet[1]!);
    else {
      flush();
      if (line) blocks.push(<p key={`p${blocks.length}`}>{line}</p>);
    }
  }
  flush();
  return <div className="mt-3 space-y-2 text-sm">{blocks}</div>;
}

/** Modal image preview on the native <dialog>. */
export function ImagePreview({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal?.();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} onClick={onClose} aria-label={alt} className="m-auto max-h-[90vh] max-w-[90vw] rounded p-2">
      <img src={src} alt={alt} className="max-h-[80vh] max-w-full" />
      <button type="button" className={`${secondaryButtonClass} mt-2`} onClick={onClose}>
        Zamknij
      </button>
    </dialog>
  );
}
