import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq, count, desc, inArray } from 'drizzle-orm';
import convert from 'heic-convert';
import type { FastifyPluginAsync } from 'fastify';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES_PER_LEARNING,
  MAX_IMAGE_BYTES,
  isHeicFile,
  createLearningSchema,
} from '@learning/shared';
import { schema } from '../db/index.js';
import type { AppDeps } from '../app.js';
import { HttpError, idParams } from './util.js';
import { generateQuestionnaire } from '../services/questionnaires.js';

const { learnings, images, questionnaires, submissions } = schema;

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const toImageDto = (i: typeof images.$inferSelect) => ({
  id: i.id,
  learningId: i.learningId,
  filename: i.filename,
  mimeType: i.mimeType,
  createdAt: i.createdAt,
});

export const learningRoutes =
  ({ db, claude, uploadsDir }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const getLearning = (id: number) => {
      const l = db.select().from(learnings).where(eq(learnings.id, id)).get();
      if (!l) throw new HttpError(404, 'Nie znaleziono tematu');
      return l;
    };

    app.get('/learnings', async () => {
      const rows = db.select().from(learnings).orderBy(desc(learnings.id)).all();
      const qns = db.select().from(questionnaires).all();
      const subs = db.select().from(submissions).where(eq(submissions.status, 'reviewed')).orderBy(desc(submissions.id)).all();
      const learningOf = new Map(qns.map((q) => [q.id, q.learningId]));
      return rows.map((l) => ({
        ...l,
        questionnaireCount: qns.filter((q) => q.learningId === l.id).length,
        // subs is newest first, so the first match is the latest reviewed submission
        lastSuccessRate: subs.find((s) => learningOf.get(s.questionnaireId) === l.id)?.successRate ?? null,
      }));
    });

    app.post('/learnings', async (req, reply) => {
      const body = createLearningSchema.parse(req.body);
      const row = db.insert(learnings).values(body).returning().get();
      req.log.info({ learningId: row.id }, 'learning created');
      return reply.status(201).send(row);
    });

    app.patch('/learnings/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      getLearning(id);
      const body = createLearningSchema.parse(req.body);
      const row = db.update(learnings).set(body).where(eq(learnings.id, id)).returning().get();
      req.log.info({ learningId: id }, 'learning updated');
      return row;
    });

    app.get('/learnings/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      const learning = getLearning(id);
      const qns = db.select().from(questionnaires).where(eq(questionnaires.learningId, id)).orderBy(desc(questionnaires.id)).all();
      const subs = qns.length
        ? db.select().from(submissions).where(inArray(submissions.questionnaireId, qns.map((q) => q.id))).all()
        : [];
      return {
        ...learning,
        images: db.select().from(images).where(eq(images.learningId, id)).all().map(toImageDto),
        questionnaires: qns.map((q) => ({ id: q.id, status: q.status, error: q.error, createdAt: q.createdAt })),
        submissions: subs
          .sort((a, b) => b.id - a.id)
          .map((s) => ({ id: s.id, questionnaireId: s.questionnaireId, status: s.status, error: s.error, successRate: s.successRate, createdAt: s.createdAt })),
      };
    });

    app.delete('/learnings/:id', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      getLearning(id);
      db.delete(learnings).where(eq(learnings.id, id)).run();
      await fs.rm(path.join(uploadsDir, String(id)), { recursive: true, force: true });
      req.log.info({ learningId: id }, 'learning deleted');
      return reply.status(204).send();
    });

    app.post('/learnings/:id/images', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      getLearning(id);
      const existing = db.select({ n: count() }).from(images).where(eq(images.learningId, id)).get()!.n;
      if (existing >= MAX_IMAGES_PER_LEARNING) {
        throw new HttpError(400, `Co najwyżej ${MAX_IMAGES_PER_LEARNING} obrazów na temat`);
      }
      const file = await req.file();
      if (!file) throw new HttpError(400, 'Nie przesłano pliku');
      const heic = isHeicFile(file.mimetype, file.filename);
      if (!heic && !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
        file.file.resume();
        throw new HttpError(400, 'Dozwolone są tylko obrazy JPEG, PNG, GIF, WebP i HEIC');
      }
      let buffer = await file.toBuffer();
      if (file.file.truncated) throw new HttpError(413, 'Obraz przekracza limit 5 MB');
      let mimeType = file.mimetype;
      if (heic) {
        // Claude and browsers cannot read HEIC, so store a JPEG.
        try {
          buffer = Buffer.from(await convert({ buffer, format: 'JPEG', quality: 0.9 }));
        } catch (err) {
          req.log.warn({ err, filename: file.filename }, 'HEIC conversion failed');
          throw new HttpError(400, 'Nie udało się odczytać obrazu HEIC');
        }
        if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Przekonwertowany obraz przekracza limit 5 MB');
        mimeType = 'image/jpeg';
      }

      const dir = path.join(uploadsDir, String(id));
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, randomUUID() + EXT[mimeType]);
      await fs.writeFile(filePath, buffer);
      const row = db
        .insert(images)
        .values({ learningId: id, filename: file.filename, mimeType, path: filePath })
        .returning()
        .get();
      req.log.info(
        { imageId: row.id, learningId: id, mimeType, bytes: buffer.length, convertedFromHeic: heic },
        'image uploaded',
      );
      return reply.status(201).send(toImageDto(row));
    });

    app.get('/images/:id/file', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const img = db.select().from(images).where(eq(images.id, id)).get();
      if (!img) throw new HttpError(404, 'Nie znaleziono obrazu');
      return reply.type(img.mimeType).send(await fs.readFile(img.path));
    });

    app.delete('/images/:id', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const img = db.select().from(images).where(eq(images.id, id)).get();
      if (!img) throw new HttpError(404, 'Nie znaleziono obrazu');
      db.delete(images).where(eq(images.id, id)).run();
      await fs.rm(img.path, { force: true });
      return reply.status(204).send();
    });

    app.post('/learnings/:id/questionnaires', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      getLearning(id);
      const n = db.select({ n: count() }).from(images).where(eq(images.learningId, id)).get()!.n;
      if (n === 0) throw new HttpError(400, 'Najpierw prześlij co najmniej jeden obraz');
      const q = db.insert(questionnaires).values({ learningId: id, status: 'generating' }).returning().get();
      req.log.info({ questionnaireId: q.id, learningId: id, imageCount: n }, 'questionnaire requested');
      void generateQuestionnaire(db, claude, q.id, req.log);
      return reply.status(202).send({ id: q.id, status: q.status });
    });
  };
