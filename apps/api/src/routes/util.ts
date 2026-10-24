import { z } from 'zod';

export const idParams = z.object({ id: z.coerce.number().int().positive() });

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
