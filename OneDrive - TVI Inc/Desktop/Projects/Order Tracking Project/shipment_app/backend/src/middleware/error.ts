import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  if (err instanceof Error && (err as NodeJS.ErrnoException).code === '23505') {
    return res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'A record with that value already exists.' },
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : String(err),
    },
  });
}
