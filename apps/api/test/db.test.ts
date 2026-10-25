import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDb } from '../src/db/index.js';

describe('createDb', () => {
  it('adds questions.parent_id to a database created before subquestions existed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-db-'));
    const file = path.join(dir, 'old.db');
    const old = new Database(file);
    old.exec(`CREATE TABLE questions (id INTEGER PRIMARY KEY AUTOINCREMENT, questionnaire_id INTEGER NOT NULL,
      position INTEGER NOT NULL, text TEXT NOT NULL, type TEXT NOT NULL, options TEXT, expected_answer TEXT NOT NULL);`);
    old.close();

    createDb(file);

    const check = new Database(file);
    const cols = check.prepare('PRAGMA table_info(questions)').all() as { name: string }[];
    check.close();
    fs.rmSync(dir, { recursive: true, force: true });
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['parent_id', 'category']));
  });
});
