import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, UPLOAD_IMAGE_ACCEPT, isHeicFile } from '@learning/shared';
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
        if (!isHeicFile(f.type, f.name) && !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(f.type)) throw new Error(`${f.name}: nieobsługiwany typ pliku`);
        if (f.size > MAX_IMAGE_BYTES) throw new Error(`${f.name}: większy niż 5 MB`);
        await api.uploadImage(id, f);
      }
    },
    onError: (e) => setUploadError(e instanceof Error ? e.message : 'Nie udało się przesłać pliku'),
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
  if (error || !data) return <ErrorMessage error={error ?? new Error('Nie znaleziono')} />;

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
            onClick={() => window.confirm('Usunąć ten temat?') && remove.mutate()}
          >
            Usuń
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Obrazy</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded border-2 border-dashed p-6 text-center text-sm ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'}`}
        >
          <p className="mb-2 text-slate-500">Przeciągnij i upuść obrazy tutaj (JPEG, PNG, GIF, WebP, HEIC, maks. 5 MB)</p>
          <button type="button" className={buttonClass} onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? 'Przesyłanie…' : 'Wybierz pliki'}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={UPLOAD_IMAGE_ACCEPT}
            aria-label="Prześlij obrazy"
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
                aria-label={`Usuń ${img.filename}`}
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
          <h2 className="font-semibold">Zestawy pytań</h2>
          <button
            className={buttonClass}
            disabled={data.images.length === 0 || generate.isPending}
            onClick={() => generate.mutate()}
          >
            Wygeneruj zestaw pytań
          </button>
        </div>
        {data.images.length === 0 && <p className="text-sm text-slate-500">Prześlij co najmniej jeden obraz, aby wygenerować zestaw pytań.</p>}
        {generate.error && <ErrorMessage error={generate.error} />}
        <ul className="space-y-2">
          {data.questionnaires.map((q) => {
            const subs = data.submissions.filter((s) => s.questionnaireId === q.id);
            return (
              <li key={q.id} className="rounded border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Zestaw pytań #{q.id} · {new Date(q.createdAt).toLocaleString('pl-PL')}</span>
                  {q.status === 'generating' && <span className="text-slate-500">Generowanie…</span>}
                  {q.status === 'failed' && <span className="text-red-600">Niepowodzenie</span>}
                  {q.status === 'ready' && <Link className="text-indigo-600 hover:underline" to={`/questionnaires/${q.id}`}>Otwórz</Link>}
                </div>
                {subs.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t pt-2">
                    {subs.map((s) => (
                      <li key={s.id}>
                        <Link className="text-indigo-600 hover:underline" to={`/submissions/${s.id}`}>
                          Podejście #{s.id}
                        </Link>{' '}
                        {s.status === 'reviewed' ? `· ${s.successRate}% poprawnych` : s.status === 'failed' ? '· ocena nie powiodła się' : '· ocenianie…'}
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
