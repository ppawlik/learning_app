import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createLearningSchema, type CreateLearningInput } from '@learning/shared';
import { api } from '../../api/client';
import { Breadcrumbs, Card, ErrorMessage, Spinner, buttonClass, inputClass, secondaryButtonClass } from '../../components/ui';

const plural = (n: number) => (n === 1 ? '1 zestaw' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? `${n} zestawy` : `${n} zestawów`);

export function LearningsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState<boolean | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['learnings'], queryFn: api.listLearnings });
  const { register, handleSubmit, reset, formState } = useForm<CreateLearningInput>({
    resolver: zodResolver(createLearningSchema),
  });
  const create = useMutation({
    mutationFn: api.createLearning,
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['learnings'] });
      reset();
      navigate(`/learnings/${l.id}`);
    },
  });
  // With no topics the form is open from the start; otherwise the user opens it with "Nowy temat".
  const open = formOpen ?? (data ? data.length === 0 : false);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Tematy' }]} />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Twoje tematy</h1>
        {data && !open && (
          <button className={buttonClass} onClick={() => setFormOpen(true)}>
            Nowy temat
          </button>
        )}
      </div>

      {open && (
        <Card>
          <h2 className="mb-3 font-semibold">Nowy temat</h2>
          <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-3">
            <div>
              <label htmlFor="title" className="mb-1 block text-sm">Tytuł</label>
              <input id="title" className={inputClass} aria-describedby="title-error" {...register('title')} />
              {formState.errors.title && <p id="title-error" className="text-xs text-red-600">Tytuł jest wymagany</p>}
            </div>
            <div>
              <label htmlFor="prompt" className="mb-1 block text-sm">Polecenie (czego ma dotyczyć zestaw pytań?)</label>
              <textarea id="prompt" rows={4} className={inputClass} aria-describedby="prompt-error" {...register('prompt')} />
              {formState.errors.prompt && <p id="prompt-error" className="text-xs text-red-600">Polecenie jest wymagane</p>}
            </div>
            {create.error && <ErrorMessage error={create.error} />}
            <div className="flex gap-2">
              <button className={buttonClass} disabled={create.isPending}>Utwórz temat</button>
              {(data?.length ?? 0) > 0 && (
                <button type="button" className={secondaryButtonClass} onClick={() => { reset(); setFormOpen(false); }}>
                  Anuluj
                </button>
              )}
            </div>
          </form>
        </Card>
      )}

      <div>
        {isLoading && <Spinner />}
        {error && <ErrorMessage error={error} />}
        {data?.length === 0 && (
          <Card>
            <p className="font-medium">Brak tematów.</p>
            <p className="mt-2 text-sm text-slate-600">Jak zacząć:</p>
            <ol className="mt-1 ml-5 list-decimal text-sm text-slate-600">
              <li>Utwórz temat i opisz, o co mają być pytania</li>
              <li>Dodaj zdjęcia lub skany materiału</li>
              <li>Wygeneruj zestaw pytań i na nie odpowiedz</li>
            </ol>
          </Card>
        )}
        <ul className="space-y-2">
          {data?.map((l) => (
            <li key={l.id}>
              <Link to={`/learnings/${l.id}`} className="block rounded border border-slate-200 bg-white p-3 hover:border-indigo-400">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{l.title}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {plural(l.questionnaireCount)} · {l.lastSuccessRate === null ? 'brak wyniku' : `ostatni wynik ${l.lastSuccessRate}%`}
                  </span>
                </span>
                <span className="block truncate text-sm text-slate-500">{l.prompt}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
