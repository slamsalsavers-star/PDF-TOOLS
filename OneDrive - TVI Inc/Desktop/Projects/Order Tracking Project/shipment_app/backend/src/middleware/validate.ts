import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION',
          message: 'Validation failed',
          fields: result.error.flatten().fieldErrors,
        },
      });
    }
    req.body = result.data;
    next();
  };
}
