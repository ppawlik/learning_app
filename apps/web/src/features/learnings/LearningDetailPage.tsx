import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@learning/shared';
import { api } from '../../api/client';
import { Card, ErrorMessage, Spinner, buttonClass } from '../../components/ui';

export function LearningDetailPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['learning', id],
    queryFn: () => api.getLearning(id),
    // Keep polling while any questionnaire / submission is still being processed.
    refetchInterval: (q) =>
      q.state.data?.questionnaires.some((x) => x.status === 'generating') ||
      q.state.data?.submissions.some((x) => x.status === 'reviewing')
        ? 2000
        : false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['learning', id] });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      setUploadError(null);
      for (const f of files) {
        if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(f.type)) throw new Error(`${f.name}: unsupported type`);
        if (f.size > MAX_IMAGE_BYTES) throw new Error(`${f.name}: larger than 5 MB`);
        await api.uploadImage(id, f);
      }
    },
    onError: (e) => setUploadError(e instanceof Error ? e.message : 'Upload failed'),
    onSettled: refresh,
  });
  const removeImage = useMutation({ mutationFn: api.deleteImage, onSuccess: refresh });
  const generate = useMutation({ mutationFn: () => api.generateQuestionnaire(id), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => api.deleteLearning(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learnings'] });
      navigate('/');
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorMessage error={error ?? new Error('Not found')} />;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    upload.mutate(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">{data.title}</h1>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{data.prompt}</p>
          </div>
          <button
            className="text-sm text-red-600 hover:underline"
            onClick={() => window.confirm('Delete this learning?') && remove.mutate()}
          >
            Delete
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Images</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded border-2 border-dashed p-6 text-center text-sm ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'}`}
        >
          <p className="mb-2 text-slate-500">Drag and drop images here (JPEG, PNG, GIF, WebP, max 5 MB)</p>
          <button type="button" className={buttonClass} onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? 'Uploading…' : 'Choose files'}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            aria-label="Upload images"
            className="hidden"
            onChange={(e) => {
              upload.mutate(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </div>
        {uploadError && <div className="mt-2"><ErrorMessage error={new Error(uploadError)} /></div>}
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.images.map((img) => (
            <li key={img.id} className="relative">
              <img src={api.imageUrl(img.id)} alt={img.filename} className="h-32 w-full rounded object-cover" />
              <button
                aria-label={`Remove ${img.filename}`}
                className="absolute right-1 top-1 rounded bg-white/90 px-2 text-sm"
                onClick={() => removeImage.mutate(img.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Questionnaires</h2>
          <button
            className={buttonClass}
            disabled={data.images.length === 0 || generate.isPending}
            onClick={() => generate.mutate()}
          >
            Generate questionnaire
          </button>
        </div>
        {data.images.length === 0 && <p className="text-sm text-slate-500">Upload at least one image to generate a questionnaire.</p>}
        {generate.error && <ErrorMessage error={generate.error} />}
        <ul className="space-y-2">
          {data.questionnaires.map((q) => {
            const subs = data.submissions.filter((s) => s.questionnaireId === q.id);
            return (
              <li key={q.id} className="rounded border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Questionnaire #{q.id} · {new Date(q.createdAt).toLocaleString()}</span>
                  {q.status === 'generating' && <span className="text-slate-500">Generating…</span>}
                  {q.status === 'failed' && <span className="text-red-600">Failed</span>}
                  {q.status === 'ready' && <Link className="text-indigo-600 hover:underline" to={`/questionnaires/${q.id}`}>Open</Link>}
                </div>
                {subs.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t pt-2">
                    {subs.map((s) => (
                      <li key={s.id}>
                        <Link className="text-indigo-600 hover:underline" to={`/submissions/${s.id}`}>
                          Submission #{s.id}
                        </Link>{' '}
                        {s.status === 'reviewed' ? `· ${s.successRate}% passed` : s.status === 'failed' ? '· review failed' : '· reviewing…'}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
