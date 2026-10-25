import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const DDL = `
CREATE TABLE IF NOT EXISTS learnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, prompt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT, learning_id INTEGER NOT NULL REFERENCES learnings(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, mime_type TEXT NOT NULL, path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS questionnaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT, learning_id INTEGER NOT NULL REFERENCES learnings(id) ON DELETE CASCADE,
  status TEXT NOT NULL, error TEXT, requested_categories TEXT, question_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, questionnaire_id INTEGER NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, category TEXT, text TEXT NOT NULL, type TEXT NOT NULL, options TEXT, expected_answer TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, questionnaire_id INTEGER NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  status TEXT NOT NULL, error TEXT, success_rate INTEGER, summary TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer TEXT NOT NULL, verdict TEXT, feedback TEXT);
`;

export function createDb(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(DDL);
  // No migrations: bring a database created before subquestions existed up to date.
  const cols = sqlite.prepare('PRAGMA table_info(questions)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'parent_id')) {
    sqlite.exec('ALTER TABLE questions ADD COLUMN parent_id INTEGER REFERENCES questions(id) ON DELETE CASCADE');
  }
  if (!cols.some((c) => c.name === 'category')) sqlite.exec('ALTER TABLE questions ADD COLUMN category TEXT');
  const qnCols = sqlite.prepare('PRAGMA table_info(questionnaires)').all() as { name: string }[];
  if (!qnCols.some((c) => c.name === 'requested_categories')) {
    sqlite.exec('ALTER TABLE questionnaires ADD COLUMN requested_categories TEXT');
  }
  if (!qnCols.some((c) => c.name === 'question_count')) sqlite.exec('ALTER TABLE questionnaires ADD COLUMN question_count INTEGER');
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
export { schema };
