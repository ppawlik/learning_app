import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { questionLabel, subquestionLabel, type Questionnaire, type Subquestion } from '@learning/shared';
import type { UseFormRegister } from 'react-hook-form';
import { api } from '../../api/client';
import { clearDraft, loadDraft, saveDraft } from './draftAnswers';
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
  const { register, handleSubmit, getValues } = useForm<FormValues>({
    defaultValues: { answers: loadDraft(questionnaire.id) },
  });
  const submit = useMutation({
    mutationFn: (v: FormValues) =>
      api.submitAnswers(questionnaire.id, {
        // Only answerable questions: plain questions and subquestions, not question statements.
        answers: questionnaire.questions
          .flatMap((q) => (q.subquestions.length ? q.subquestions : [q]))
          .map((q) => ({ questionId: q.id, answer: v.answers?.[q.id] ?? '' })),
      }),
    onSuccess: (s) => {
      clearDraft(questionnaire.id);
      navigate(`/submissions/${s.id}`);
    },
  });

  return (
    <form
      onSubmit={handleSubmit((v) => submit.mutate(v))}
      // blur bubbles in React, so this saves a draft whenever focus leaves any input
      onBlur={() => saveDraft(questionnaire.id, getValues('answers'))}
      className="space-y-4"
    >
      <Link to={`/learnings/${questionnaire.learningId}`} className="text-sm text-indigo-600 hover:underline">
        ← Back to learning
      </Link>
      {questionnaire.questions.map((q, i) => {
        const number = String(i + 1);
        return (
          <Card key={q.id}>
            <p className="mb-2 font-medium">{number}. {q.text}</p>
            {q.subquestions.length ? (
              <div className="space-y-4 border-l-2 border-slate-200 pl-4">
                {q.subquestions.map((sq, j) => (
                  <AnswerInput key={sq.id} q={sq} label={questionLabel(i + 1, j)} heading={`${subquestionLabel(j)})`} register={register} />
                ))}
              </div>
            ) : (
              <AnswerInput q={q} label={number} register={register} />
            )}
          </Card>
        );
      })}
      {submit.error && <ErrorMessage error={submit.error} />}
      <button className={buttonClass} disabled={submit.isPending}>
        {submit.isPending ? 'Submitting…' : 'Submit answers'}
      </button>
    </form>
  );
}

function AnswerInput({
  q,
  label,
  heading,
  register,
}: {
  q: Subquestion;
  label: string;
  heading?: string;
  register: UseFormRegister<FormValues>;
}) {
  return (
    <div>
      {heading && <p className="mb-2 text-sm font-medium">{heading} {q.text}</p>}
      {q.type === 'multiple_choice' && q.options ? (
        <fieldset className="space-y-1" aria-label={`Answer ${label}`}>
          {q.options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="radio" value={o} {...register(`answers.${q.id}`)} /> {o}
            </label>
          ))}
        </fieldset>
      ) : (
        <textarea aria-label={`Answer ${label}`} rows={3} className={inputClass} {...register(`answers.${q.id}`)} />
      )}
    </div>
  );
}
