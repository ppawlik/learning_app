import { useRef, useState, type DragEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES_PER_LEARNING,
  MAX_IMAGE_BYTES,
  MAX_QUESTION_COUNT,
  DEFAULT_QUESTION_COUNT,
  UPLOAD_IMAGE_ACCEPT,
  createLearningSchema,
  isHeicFile,
  type CreateLearningInput,
  type CreateQuestionnaireInput,
  type LearningDetail,
} from '@learning/shared';
import { api } from '../../api/client';
import {
  Breadcrumbs,
  Card,
  ConfirmButton,
  ErrorMessage,
  ImagePreview,
  Spinner,
  buttonClass,
  inputClass,
  linkClass,
  secondaryButtonClass,
} from '../../components/ui';
import { setNumber } from '../trail';

const datetime = (iso: string) => new Date(iso).toLocaleString('pl-PL');

export function LearningDetailPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<{ id: number; filename: string } | null>(null);

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
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['learning', id] });
    qc.invalidateQueries({ queryKey: ['learnings'] });
  };

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
  const generate = useMutation({ mutationFn: (input: CreateQuestionnaireInput) => api.generateQuestionnaire(id, input), onSuccess: refresh });
  const retryGeneration = useMutation({ mutationFn: api.retryQuestionnaire, onSuccess: refresh });
  const retryReview = useMutation({ mutationFn: api.retryReview, onSuccess: refresh });
  const removeSet = useMutation({ mutationFn: api.deleteQuestionnaire, onSuccess: refresh });
  const removeSubmission = useMutation({ mutationFn: api.deleteSubmission, onSuccess: refresh });
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
  const actionError = [generate, retryGeneration, retryReview, removeSet, removeSubmission, removeImage, remove].find((m) => m.error)?.error;

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Tematy', to: '/' }, { label: data.title }]} />
      <Card>
        {editing ? (
          <EditForm
            learning={data}
            onDone={() => {
              setEditing(false);
              refresh();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold">{data.title}</h1>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{data.prompt}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button className={linkClass} onClick={() => setEditing(true)}>
                Edytuj
              </button>
              <ConfirmButton label="Usuń" onConfirm={() => remove.mutate()} />
            </div>
          </div>
        )}
      </Card>
      {actionError && <ErrorMessage error={actionError} />}

      <Card>
        <h2 className="mb-3 font-semibold">Obrazy ({data.images.length} z {MAX_IMAGES_PER_LEARNING})</h2>
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
              <button type="button" className="block w-full" aria-label={`Podgląd ${img.filename}`} onClick={() => setPreview(img)}>
                <img src={api.imageUrl(img.id)} alt={img.filename} className="h-32 w-full rounded object-cover" />
              </button>
              <div className="absolute right-1 top-1 flex min-h-10 items-center rounded bg-white/90 px-2">
                <ConfirmButton
                  label={`Usuń ${img.filename}`}
                  ariaLabel={`Usuń ${img.filename}`}
                  className="min-h-10 min-w-10 text-lg"
                  onConfirm={() => removeImage.mutate(img.id)}
                >
                  ×
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
        {preview && <ImagePreview src={api.imageUrl(preview.id)} alt={preview.filename} onClose={() => setPreview(null)} />}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Zestawy pytań</h2>
        </div>
        <GenerateOptions
          detail={data}
          disabled={data.images.length === 0 || generate.isPending}
          onGenerate={(input) => generate.mutate(input)}
        />
        {data.images.length === 0 && <p className="text-sm text-slate-500">Prześlij co najmniej jeden obraz, aby wygenerować zestaw pytań.</p>}
        <ul className="space-y-2">
          {data.questionnaires.map((q) => (
            <SetRow
              key={q.id}
              detail={data}
              q={q}
              onRetryGeneration={() => retryGeneration.mutate(q.id)}
              onRetryReview={(sid) => retryReview.mutate(sid)}
              onDeleteSet={() => removeSet.mutate(q.id)}
              onDeleteSubmission={(sid) => removeSubmission.mutate(sid)}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function GenerateOptions({
  detail,
  disabled,
  onGenerate,
}: {
  detail: LearningDetail;
  disabled: boolean;
  onGenerate: (input: CreateQuestionnaireInput) => void;
}) {
  // null: follow the default (categories failed in the last attempt) until the user changes the selection.
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [count, setCount] = useState(String(DEFAULT_QUESTION_COUNT));
  const selected = chosen ?? detail.defaultCategories;
  const n = Number(count);
  const countValid = Number.isInteger(n) && n >= 1 && n <= MAX_QUESTION_COUNT;
  const toggle = (c: string) => setChosen(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  const noneSelected = detail.categories.length > 0 && selected.length === 0;

  return (
    <div className="mb-4 space-y-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      {detail.categories.length > 0 && (
        <fieldset>
          <legend className="mb-1 font-medium">Kategorie</legend>
          <p className="mb-1 text-xs text-slate-500">Domyślnie zaznaczone są kategorie błędne w ostatnim podejściu.</p>
          <div className="flex flex-wrap gap-x-4">
            {detail.categories.map((c) => (
              <label key={c} className="flex min-h-10 items-center gap-2">
                <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="question-count" className="mb-1 block font-medium">Liczba pytań</label>
          <input
            id="question-count"
            type="number"
            min={1}
            max={MAX_QUESTION_COUNT}
            className={`${inputClass} w-24`}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <button
          className={buttonClass}
          disabled={disabled || !countValid || noneSelected}
          onClick={() => onGenerate({ categories: selected, questionCount: n })}
        >
          Wygeneruj zestaw pytań
        </button>
      </div>
      {!countValid && <p className="text-xs text-red-600">Podaj liczbę pytań od 1 do {MAX_QUESTION_COUNT}.</p>}
      {noneSelected && <p className="text-xs text-red-600">Zaznacz co najmniej jedną kategorię.</p>}
    </div>
  );
}

function SetRow({
  detail,
  q,
  onRetryGeneration,
  onRetryReview,
  onDeleteSet,
  onDeleteSubmission,
}: {
  detail: LearningDetail;
  q: LearningDetail['questionnaires'][number];
  onRetryGeneration: () => void;
  onRetryReview: (submissionId: number) => void;
  onDeleteSet: () => void;
  onDeleteSubmission: (submissionId: number) => void;
}) {
  const subs = detail.submissions.filter((s) => s.questionnaireId === q.id).sort((a, b) => a.id - b.id);
  const rates = subs.filter((s) => s.status === 'reviewed' && s.successRate !== null).map((s) => `${s.successRate}%`);
  return (
    <li className="rounded border border-slate-200 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          Zestaw {setNumber(detail, q.id)} <span className="font-normal text-slate-500">· {datetime(q.createdAt)}</span>
          {q.requestedCategories.length > 0 && (
            <span className="block text-xs font-normal text-slate-500">Kategorie: {q.requestedCategories.join(', ')}</span>
          )}
        </span>
        <span className="flex items-center gap-3">
          {q.status === 'generating' && <span className="text-slate-500">Generowanie…</span>}
          {q.status === 'failed' && <span className="text-red-600">Niepowodzenie</span>}
          {q.status === 'ready' && <Link className={linkClass} to={`/questionnaires/${q.id}`}>Otwórz</Link>}
          {q.status !== 'generating' && <ConfirmButton label="Usuń" ariaLabel={`Usuń zestaw ${setNumber(detail, q.id)}`} onConfirm={onDeleteSet} />}
        </span>
      </div>
      {q.status === 'failed' && (
        <div className="mt-2 space-y-2">
          {q.error && <p className="text-xs text-red-700">{q.error}</p>}
          <button className={secondaryButtonClass} onClick={onRetryGeneration}>Wygeneruj ponownie</button>
        </div>
      )}
      {subs.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2">
          {[...subs].reverse().map((s) => {
            const n = subs.findIndex((x) => x.id === s.id) + 1;
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link className={linkClass} to={`/submissions/${s.id}`}>Podejście {n}</Link>{' '}
                  <span className="text-slate-500">· {datetime(s.createdAt)} </span>
                  {s.status === 'reviewed' ? `· ${s.successRate}% poprawnych` : s.status === 'failed' ? '· ocena nie powiodła się' : '· ocenianie…'}
                </span>
                {s.status !== 'reviewing' && <ConfirmButton label="Usuń" ariaLabel={`Usuń podejście ${n}`} onConfirm={() => onDeleteSubmission(s.id)} />}
                {s.status === 'failed' && (
                  <span className="flex w-full items-center gap-3 text-xs text-red-700">
                    {s.error}
                    <button className={linkClass} onClick={() => onRetryReview(s.id)}>Ponów ocenę</button>
                  </span>
                )}
              </li>
            );
          })}
          {rates.length > 1 && <li className="text-xs font-medium text-green-700">Trend: {rates.join(' → ')}</li>}
        </ul>
      )}
    </li>
  );
}

function EditForm({ learning, onDone, onCancel }: { learning: LearningDetail; onDone: () => void; onCancel: () => void }) {
  const { register, handleSubmit, formState } = useForm<CreateLearningInput>({
    resolver: zodResolver(createLearningSchema),
    defaultValues: { title: learning.title, prompt: learning.prompt },
  });
  const save = useMutation({ mutationFn: (v: CreateLearningInput) => api.updateLearning(learning.id, v), onSuccess: onDone });
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-3">
      <div>
        <label htmlFor="edit-title" className="mb-1 block text-sm">Tytuł</label>
        <input id="edit-title" className={inputClass} aria-describedby="edit-title-error" {...register('title')} />
        {formState.errors.title && <p id="edit-title-error" className="text-xs text-red-600">Tytuł jest wymagany</p>}
      </div>
      <div>
        <label htmlFor="edit-prompt" className="mb-1 block text-sm">Polecenie</label>
        <textarea id="edit-prompt" rows={4} className={inputClass} aria-describedby="edit-prompt-error" {...register('prompt')} />
        {formState.errors.prompt && <p id="edit-prompt-error" className="text-xs text-red-600">Polecenie jest wymagane</p>}
      </div>
      {save.error && <ErrorMessage error={save.error} />}
      <div className="flex gap-2">
        <button className={buttonClass} disabled={save.isPending}>Zapisz</button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>Anuluj</button>
      </div>
    </form>
  );
}
