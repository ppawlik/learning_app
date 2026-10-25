import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createLearningSchema, type CreateLearningInput } from '@learning/shared';
import { api } from '../../api/client';
import { Card, ErrorMessage, Spinner, buttonClass, inputClass } from '../../components/ui';

export function LearningsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
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

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 font-semibold">Nowy temat</h2>
        <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-3">
          <div>
            <label htmlFor="title" className="mb-1 block text-sm">Tytuł</label>
            <input id="title" className={inputClass} {...register('title')} />
            {formState.errors.title && <p className="text-xs text-red-600">Tytuł jest wymagany</p>}
          </div>
          <div>
            <label htmlFor="prompt" className="mb-1 block text-sm">Polecenie (czego ma dotyczyć zestaw pytań?)</label>
            <textarea id="prompt" rows={4} className={inputClass} {...register('prompt')} />
            {formState.errors.prompt && <p className="text-xs text-red-600">Polecenie jest wymagane</p>}
          </div>
          {create.error && <ErrorMessage error={create.error} />}
          <button className={buttonClass} disabled={create.isPending}>Utwórz temat</button>
        </form>
      </Card>

      <div>
        <h2 className="mb-3 font-semibold">Twoje tematy</h2>
        {isLoading && <Spinner />}
        {error && <ErrorMessage error={error} />}
        {data?.length === 0 && <p className="text-sm text-slate-500">Brak tematów.</p>}
        <ul className="space-y-2">
          {data?.map((l) => (
            <li key={l.id}>
              <Link to={`/learnings/${l.id}`} className="block rounded border border-slate-200 bg-white p-3 hover:border-indigo-400">
                <span className="font-medium">{l.title}</span>
                <span className="block truncate text-sm text-slate-500">{l.prompt}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
