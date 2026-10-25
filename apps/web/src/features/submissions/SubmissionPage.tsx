import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, ErrorMessage, Spinner, buttonClass } from '../../components/ui';

export function SubmissionPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['submission', id],
    queryFn: () => api.getSubmission(id),
    refetchInterval: (q) => (q.state.data?.status === 'reviewing' ? 2000 : false),
  });

  const retry = useMutation({
    mutationFn: () => api.retryReview(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submission', id] }),
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorMessage error={error ?? new Error('Not found')} />;
  if (data.status === 'reviewing') return <Spinner label="Claude is reviewing your answers…" />;
  if (data.status === 'failed') {
    return (
      <div className="space-y-3">
        <ErrorMessage error={new Error(data.error ?? 'Review failed')} />
        {retry.error && <ErrorMessage error={retry.error} />}
        <button className={buttonClass} disabled={retry.isPending} onClick={() => retry.mutate()}>
          Retry review
        </button>
      </div>
    );
  }

  const passed = data.answers.filter((a) => a.verdict === 'passed').length;

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Success rate</p>
        <p className="text-4xl font-bold">{data.successRate}%</p>
        <p className="text-sm text-slate-500">{passed} of {data.answers.length} answers passed</p>
        {data.summary && <p className="mt-3 whitespace-pre-wrap text-sm">{data.summary}</p>}
      </Card>
      {data.answers.map((a, i) => {
        const first = data.answers[i - 1]?.questionNumber !== a.questionNumber;
        return (
          <Card key={a.questionId}>
            {a.parentText && first && <p className="mb-3 font-medium">{a.questionNumber}. {a.parentText}</p>}
            <div className={`flex items-start justify-between gap-3 ${a.parentText ? 'border-l-2 border-slate-200 pl-4' : ''}`}>
              <p className="font-medium">
                {a.subLabel ? `${a.subLabel}) ` : `${a.questionNumber}. `}
                {a.questionText}
              </p>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                  a.verdict === 'passed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {a.verdict === 'passed' ? 'Passed' : 'Failed'}
              </span>
            </div>
            <p className="mt-2 text-sm"><span className="text-slate-500">Your answer:</span> {a.answer || <em>(empty)</em>}</p>
            <p className="mt-1 text-sm text-slate-700">{a.feedback}</p>
          </Card>
        );
      })}
    </div>
  );
}
