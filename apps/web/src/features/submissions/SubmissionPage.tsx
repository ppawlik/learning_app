import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { BackLink, Breadcrumbs, Card, ErrorMessage, Spinner, Summary, WaitingNotice, buttonClass, secondaryButtonClass } from '../../components/ui';
import { useTrail } from '../trail';

export function SubmissionPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const [onlyFailed, setOnlyFailed] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['submission', id],
    queryFn: () => api.getSubmission(id),
    refetchInterval: (q) => (q.state.data?.status === 'reviewing' ? 2000 : false),
  });
  const trail = useTrail(data?.learningId, data ? { questionnaireId: data.questionnaireId, submissionId: id } : undefined);

  const retry = useMutation({
    mutationFn: () => api.retryReview(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submission', id] }),
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorMessage error={error ?? new Error('Nie znaleziono')} />;
  const back = `/learnings/${data.learningId}`;
  if (data.status === 'reviewing') {
    return (
      <div className="space-y-4">
        <Breadcrumbs items={trail} />
        <WaitingNotice label="Claude ocenia Twoje odpowiedzi…" />
        <BackLink to={back} />
      </div>
    );
  }
  if (data.status === 'failed') {
    return (
      <div className="space-y-4">
        <Breadcrumbs items={trail} />
        <ErrorMessage error={new Error(data.error ?? 'Ocena nie powiodła się')} />
        {retry.error && <ErrorMessage error={retry.error} />}
        <div className="flex items-center gap-3">
          <button className={buttonClass} disabled={retry.isPending} onClick={() => retry.mutate()}>
            Ponów ocenę
          </button>
          <BackLink to={back} />
        </div>
      </div>
    );
  }

  const passed = data.answers.filter((a) => a.verdict === 'passed').length;
  const failed = data.answers.filter((a) => a.verdict === 'failed');
  const visible = onlyFailed ? failed : data.answers;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={trail} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink to={back} />
        <Link to={`/questionnaires/${data.questionnaireId}`} className={secondaryButtonClass}>
          Rozwiąż ponownie
        </Link>
      </div>
      <Card>
        <p className="text-sm text-slate-500">Wynik</p>
        <p className="text-4xl font-bold">{data.successRate}%</p>
        <p className="text-sm text-slate-500">{passed} z {data.answers.length} odpowiedzi poprawnych</p>
        {data.summary && <Summary text={data.summary} />}
        {failed.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-sm">
            <p>
              Błędne:{' '}
              {failed.map((a, i) => (
                <span key={a.questionId}>
                  {i > 0 && ' · '}
                  <a href={`#odp-${a.label}`} className="text-indigo-600 hover:underline">{a.label}</a>
                </span>
              ))}
            </p>
            <label className="flex min-h-10 items-center gap-2">
              <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} />
              Tylko błędne ({failed.length})
            </label>
          </div>
        )}
      </Card>
      {visible.map((a, i) => {
        // The statement of a question with subquestions is printed once, above its first visible subquestion.
        const first = visible[i - 1]?.questionNumber !== a.questionNumber;
        return (
          <Card key={a.questionId} id={`odp-${a.label}`}>
            {a.parentText && first && <p className="mb-3 font-medium">{a.questionNumber}. {a.parentText}</p>}
            <div className={`flex items-start justify-between gap-3 ${a.parentText ? 'border-l-2 border-slate-200 pl-4' : ''}`}>
              <p className="font-medium">
                {a.subLabel ? `${a.label}) ` : `${a.label}. `}
                {a.questionText}
              </p>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                  a.verdict === 'passed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {a.verdict === 'passed' ? 'Poprawna' : 'Błędna'}
              </span>
            </div>
            <p className="mt-2 text-sm"><span className="text-slate-500">Twoja odpowiedź:</span> {a.answer || <em>(puste)</em>}</p>
            {a.expectedAnswer && (
              <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm font-medium text-green-800">Poprawna odpowiedź: {a.expectedAnswer}</p>
            )}
            <p className="mt-1 text-sm text-slate-700">{a.feedback}</p>
          </Card>
        );
      })}
    </div>
  );
}
