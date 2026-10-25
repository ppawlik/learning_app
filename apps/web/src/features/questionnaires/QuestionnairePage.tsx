import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { questionLabel, subquestionLabel, type Questionnaire, type Subquestion } from '@learning/shared';
import type { Control, UseFormRegister } from 'react-hook-form';
import { api } from '../../api/client';
import { clearDraft, loadDraft, saveDraft } from './draftAnswers';
import { BackLink, Breadcrumbs, Card, ErrorMessage, Spinner, WaitingNotice, buttonClass, inputClass, secondaryButtonClass } from '../../components/ui';
import { useTrail } from '../trail';

type FormValues = { answers: Record<string, string> };

export function QuestionnairePage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['questionnaire', id],
    queryFn: () => api.getQuestionnaire(id),
    refetchInterval: (q) => (q.state.data?.status === 'generating' ? 2000 : false),
  });
  const retry = useMutation({
    mutationFn: () => api.retryQuestionnaire(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questionnaire', id] }),
  });
  const trail = useTrail(data?.learningId, { questionnaireId: id });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorMessage error={error ?? new Error('Nie znaleziono')} />;
  const back = `/learnings/${data.learningId}`;
  if (data.status === 'generating') {
    return (
      <div className="space-y-4">
        <Breadcrumbs items={trail} />
        <WaitingNotice label="Claude generuje Twój zestaw pytań…" />
        <BackLink to={back} />
      </div>
    );
  }
  if (data.status === 'failed') {
    return (
      <div className="space-y-4">
        <Breadcrumbs items={trail} />
        <ErrorMessage error={new Error(data.error ?? 'Generowanie nie powiodło się')} />
        {retry.error && <ErrorMessage error={retry.error} />}
        <div className="flex items-center gap-3">
          <button className={buttonClass} disabled={retry.isPending} onClick={() => retry.mutate()}>
            Wygeneruj ponownie
          </button>
          <BackLink to={back} />
        </div>
      </div>
    );
  }
  return (
    <div>
      <Breadcrumbs items={trail} />
      <AnswerForm questionnaire={data} />
    </div>
  );
}

export function AnswerForm({ questionnaire }: { questionnaire: Questionnaire }) {
  const navigate = useNavigate();
  const [askEmpty, setAskEmpty] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const { register, handleSubmit, getValues, control } = useForm<FormValues>({
    defaultValues: { answers: loadDraft(questionnaire.id) },
  });
  // Only answerable questions: plain questions and subquestions, not question statements.
  const answerable = questionnaire.questions.flatMap((q) => (q.subquestions.length ? q.subquestions : [q]));
  const submit = useMutation({
    mutationFn: (v: FormValues) =>
      api.submitAnswers(questionnaire.id, {
        answers: answerable.map((q) => ({ questionId: q.id, answer: v.answers?.[q.id] ?? '' })),
      }),
    onSuccess: (s) => {
      clearDraft(questionnaire.id);
      navigate(`/submissions/${s.id}`);
    },
  });
  const emptyCount = (v: FormValues) => answerable.filter((q) => !(v.answers?.[q.id] ?? '').trim()).length;
  const send = (v: FormValues) => submit.mutate(v);

  return (
    <form
      onSubmit={handleSubmit((v) => {
        if (emptyCount(v) > 0) setAskEmpty(true);
        else send(v);
      })}
      // blur bubbles in React, so this saves a draft whenever focus leaves any input
      onBlur={() => {
        saveDraft(questionnaire.id, getValues('answers'));
        setDraftSaved(true);
      }}
      className="space-y-4"
    >
      <BackLink to={`/learnings/${questionnaire.learningId}`} />
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
      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white px-4 py-3">
        {askEmpty ? (
          <EmptyWarning
            control={control}
            ids={answerable.map((q) => q.id)}
            pending={submit.isPending}
            onSend={() => send(getValues())}
            onBack={() => setAskEmpty(false)}
          />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <Progress control={control} ids={answerable.map((q) => q.id)} />
              {draftSaved && <p className="text-xs text-green-700">Szkic zapisany</p>}
            </div>
            <button className={buttonClass} disabled={submit.isPending}>
              {submit.isPending ? 'Wysyłanie…' : 'Wyślij odpowiedzi'}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

function useAnswered(control: Control<FormValues>, ids: number[]) {
  const answers = useWatch({ control, name: 'answers' }) ?? {};
  return ids.filter((id) => (answers[id] ?? '').trim()).length;
}

function Progress({ control, ids }: { control: Control<FormValues>; ids: number[] }) {
  const answered = useAnswered(control, ids);
  return <p className="font-medium">{answered} z {ids.length} odpowiedzi</p>;
}

function EmptyWarning({ control, ids, pending, onSend, onBack }: { control: Control<FormValues>; ids: number[]; pending: boolean; onSend: () => void; onBack: () => void }) {
  const empty = ids.length - useAnswered(control, ids);
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>Masz {empty} {empty === 1 ? 'pustą odpowiedź' : 'puste odpowiedzi'}. Wysłać mimo to?</p>
      <div className="flex gap-2">
        <button type="button" className={buttonClass} disabled={pending} onClick={onSend}>Wyślij mimo to</button>
        <button type="button" className={secondaryButtonClass} onClick={onBack}>Wróć do formularza</button>
      </div>
    </div>
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
        <fieldset className="space-y-1">
          <legend className="sr-only">Odpowiedź {label}: {q.text}</legend>
          {q.options.map((o) => (
            <label key={o} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="radio" value={o} {...register(`answers.${q.id}`)} /> {o}
            </label>
          ))}
        </fieldset>
      ) : (
        <textarea aria-label={`Odpowiedź ${label}`} rows={3} className={inputClass} {...register(`answers.${q.id}`)} />
      )}
    </div>
  );
}
