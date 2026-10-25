import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const learnings = sqliteTable('learnings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  createdAt: createdAt(),
});

export const images = sqliteTable('images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  learningId: integer('learning_id').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  path: text('path').notNull(),
  createdAt: createdAt(),
});

export const questionnaires = sqliteTable('questionnaires', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  learningId: integer('learning_id').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['generating', 'ready', 'failed'] }).notNull(),
  error: text('error'),
  // Generation options, kept so a retry or restart reuses them (ADR 0014). Null: Claude's choice.
  requestedCategories: text('requested_categories', { mode: 'json' }).$type<string[] | null>(),
  questionCount: integer('question_count'),
  createdAt: createdAt(),
});

export const questions = sqliteTable('questions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionnaireId: integer('questionnaire_id').notNull().references(() => questionnaires.id, { onDelete: 'cascade' }),
  // Self-reference: set on subquestions. Parent rows are statements only and get no answers.
  parentId: integer('parent_id').references((): AnySQLiteColumn => questions.id, { onDelete: 'cascade' }),
  // Index among siblings (top-level questions, or subquestions of one parent).
  position: integer('position').notNull(),
  // Set on every row of a question tree (subquestions repeat their parent's); null for sets from before categories.
  category: text('category'),
  text: text('text').notNull(),
  type: text('type', { enum: ['open', 'multiple_choice'] }).notNull(),
  options: text('options', { mode: 'json' }).$type<string[] | null>(),
  expectedAnswer: text('expected_answer').notNull(),
});

export const submissions = sqliteTable('submissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionnaireId: integer('questionnaire_id').notNull().references(() => questionnaires.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['reviewing', 'reviewed', 'failed'] }).notNull(),
  error: text('error'),
  successRate: integer('success_rate'),
  summary: text('summary'),
  createdAt: createdAt(),
});

export const answers = sqliteTable('answers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  submissionId: integer('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  questionId: integer('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  answer: text('answer').notNull(),
  verdict: text('verdict', { enum: ['passed', 'failed'] }),
  feedback: text('feedback'),
});
