import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Questionnaire } from '@learning/shared';
import { api } from '../../api/client';
import { Card, ErrorMessage, Spinner, buttonClass, inputClass } from '../../components/ui';

type FormValues = { answers: Record<string, string> };

export function QuestionnairePage() {
  const id = Number(useParams().id);
  const { data, isLoading, error } = useQuery({
    queryKey: ['questionnaire', id],
    queryFn: () => api.getQuestionnaire(id),
    refetchInterval: (q) => (q.state.data?.status === 'generating' ? 2000 : false),
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorMessage error={error ?? new Error('Not found')} />;
  if (data.status === 'generating') return <Spinner label="Claude is generating your questionnaire…" />;
  if (data.status === 'failed') return <ErrorMessage error={new Error(data.error ?? 'Generation failed')} />;
  return <AnswerForm questionnaire={data} />;
}

export function AnswerForm({ questionnaire }: { questionnaire: Questionnaire }) {
  const navigate = useNavigate();
  const { register, handleSubmit } = useForm<FormValues>();
  const submit = useMutation({
    mutationFn: (v: FormValues) =>
      api.submitAnswers(questionnaire.id, {
        answers: questionnaire.questions.map((q) => ({ questionId: q.id, answer: v.answers?.[q.id] ?? '' })),
      }),
    onSuccess: (s) => navigate(`/submissions/${s.id}`),
  });

  return (
    <form onSubmit={handleSubmit((v) => submit.mutate(v))} className="space-y-4">
      <Link to={`/learnings/${questionnaire.learningId}`} className="text-sm text-indigo-600 hover:underline">
        ← Back to learning
      </Link>
      {questionnaire.questions.map((q, i) => (
        <Card key={q.id}>
          <p className="mb-2 font-medium">{i + 1}. {q.text}</p>
          {q.type === 'multiple_choice' && q.options ? (
            <fieldset className="space-y-1">
              {q.options.map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input type="radio" value={o} {...register(`answers.${q.id}`)} /> {o}
                </label>
              ))}
            </fieldset>
          ) : (
            <textarea aria-label={`Answer ${i + 1}`} rows={3} className={inputClass} {...register(`answers.${q.id}`)} />
          )}
        </Card>
      ))}
      {submit.error && <ErrorMessage error={submit.error} />}
      <button className={buttonClass} disabled={submit.isPending}>
        {submit.isPending ? 'Submitting…' : 'Submit answers'}
      </button>
    </form>
  );
}
