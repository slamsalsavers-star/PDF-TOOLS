import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Errors } from '../utils/errors.js';

export interface JwtPayload {
  sub: string;       // user id
  tenantId: string;
  roleId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw Errors.unauthorized();

  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    next();
  } catch {
    throw Errors.unauthorized('Token expired or invalid');
  }
}

export function requirePermission(module: string, action: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw Errors.unauthorized();

    const { query } = await import('../db/client.js');
    const rows = await query(
      `SELECT 1
         FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1
          AND p.module = $2
          AND p.action = $3`,
      [req.user.roleId, module, action]
    );

    if (rows.length === 0) throw Errors.forbidden();
    next();
  };
}
