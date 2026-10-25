import { z } from 'zod';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
// HEIC/HEIF is accepted on upload only; the API converts it to JPEG before storing.
export const HEIC_IMAGE_TYPES = ['image/heic', 'image/heif'] as const;
export const HEIC_EXTENSIONS = ['.heic', '.heif'] as const;
export const UPLOAD_IMAGE_ACCEPT = [...ALLOWED_IMAGE_TYPES, ...HEIC_IMAGE_TYPES, ...HEIC_EXTENSIONS].join(',');
export const isHeicFile = (mimeType: string, filename: string): boolean =>
  (HEIC_IMAGE_TYPES as readonly string[]).includes(mimeType.toLowerCase()) ||
  HEIC_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext));
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_LEARNING = 20;

export const createLearningSchema = z.object({
  title: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(5000),
});
export type CreateLearningInput = z.infer<typeof createLearningSchema>;

export const learningSchema = createLearningSchema.extend({
  id: z.number().int(),
  createdAt: z.string(),
});
export type Learning = z.infer<typeof learningSchema>;

export const imageSchema = z.object({
  id: z.number().int(),
  learningId: z.number().int(),
  filename: z.string(),
  mimeType: z.string(),
  createdAt: z.string(),
});
export type LearningImage = z.infer<typeof imageSchema>;

export const questionTypeSchema = z.enum(['open', 'multiple_choice']);

/** Letter label of the subquestion at a 0-based index: 0 -> "a", 1 -> "b", ... */
export const subquestionLabel = (index: number): string => String.fromCharCode(97 + index);

/** Display number of an answerable question, as shown in the UI: "3" for a plain task, "3b" for a subquestion. */
export const questionLabel = (taskNumber: number, subIndex: number | null): string =>
  subIndex === null ? String(taskNumber) : `${taskNumber}${subquestionLabel(subIndex)}`;

const generatedLeafSchema = z.object({
  text: z.string().min(1),
  type: questionTypeSchema,
  options: z.array(z.string()).optional(),
  expectedAnswer: z.string().min(1),
});

/**
 * Shape Claude must produce when generating a questionnaire. A task is either a plain question
 * (type + expectedAnswer) or a statement with subquestions (each answered separately).
 */
export const generatedQuestionnaireSchema = z.object({
  questions: z
    .array(
      z
        .object({
          text: z.string().min(1),
          type: questionTypeSchema.optional(),
          options: z.array(z.string()).optional(),
          expectedAnswer: z.string().min(1).optional(),
          subquestions: z.array(generatedLeafSchema).optional(),
        })
        .refine(
          (q) => (q.subquestions?.length ? q.type === undefined : q.type !== undefined && q.expectedAnswer !== undefined),
          { message: 'A task needs either type and expectedAnswer, or subquestions' },
        ),
    )
    .min(1),
});
export type GeneratedQuestionnaire = z.infer<typeof generatedQuestionnaireSchema>;

/** Question as exposed to the client (no expected answer). */
export const subquestionSchema = z.object({
  id: z.number().int(),
  position: z.number().int(),
  text: z.string(),
  type: questionTypeSchema,
  options: z.array(z.string()).nullable(),
});
export type Subquestion = z.infer<typeof subquestionSchema>;

/**
 * Top-level task. With no subquestions it is answered itself; otherwise only its subquestions
 * are answered and `text` is the shared statement (its type/options are then meaningless).
 */
export const questionSchema = subquestionSchema.extend({ subquestions: z.array(subquestionSchema) });
export type Question = z.infer<typeof questionSchema>;

export const questionnaireStatusSchema = z.enum(['generating', 'ready', 'failed']);
export const questionnaireSchema = z.object({
  id: z.number().int(),
  learningId: z.number().int(),
  status: questionnaireStatusSchema,
  error: z.string().nullable(),
  createdAt: z.string(),
  questions: z.array(questionSchema),
});
export type Questionnaire = z.infer<typeof questionnaireSchema>;

export const submitAnswersSchema = z.object({
  answers: z
    .array(z.object({ questionId: z.number().int(), answer: z.string().max(5000) }))
    .min(1),
});
export type SubmitAnswersInput = z.infer<typeof submitAnswersSchema>;

/** Shape Claude must produce when reviewing answers. */
export const reviewResultSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.number().int(),
      verdict: z.enum(['passed', 'failed']),
      feedback: z.string(),
    }),
  ),
  summary: z.string(),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const submissionSchema = z.object({
  id: z.number().int(),
  questionnaireId: z.number().int(),
  status: z.enum(['reviewing', 'reviewed', 'failed']),
  error: z.string().nullable(),
  successRate: z.number().nullable(),
  summary: z.string().nullable(),
  createdAt: z.string(),
  answers: z.array(
    z.object({
      questionId: z.number().int(),
      questionText: z.string(),
      /** Statement of the task this answer's subquestion belongs to; null for a plain task. */
      parentText: z.string().nullable(),
      /** 1-based task number. */
      taskNumber: z.number().int(),
      /** Letter of the subquestion within its task; null for a plain task. */
      subLabel: z.string().nullable(),
      answer: z.string(),
      verdict: z.enum(['passed', 'failed']).nullable(),
      feedback: z.string().nullable(),
    }),
  ),
});
export type Submission = z.infer<typeof submissionSchema>;

export const learningDetailSchema = learningSchema.extend({
  images: z.array(imageSchema),
  questionnaires: z.array(z.object({ id: z.number().int(), status: questionnaireStatusSchema, createdAt: z.string() })),
  submissions: z.array(
    z.object({
      id: z.number().int(),
      questionnaireId: z.number().int(),
      status: z.enum(['reviewing', 'reviewed', 'failed']),
      successRate: z.number().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type LearningDetail = z.infer<typeof learningDetailSchema>;
