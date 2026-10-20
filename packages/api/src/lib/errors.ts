import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'LOGIN_REJECTED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DELETED'
  | 'REPLAY'
  | 'NO_BALANCE'
  | 'COOLDOWN'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  LOGIN_REJECTED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DELETED: 409,
  REPLAY: 409,
  NO_BALANCE: 422,
  COOLDOWN: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
  }
}

/** Last middleware: every error becomes `{ error: { code, message } }`. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: `${where}${first?.message ?? 'invalid input'}` } });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'malformed JSON body' } });
    return;
  }
  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'internal error' } });
};
