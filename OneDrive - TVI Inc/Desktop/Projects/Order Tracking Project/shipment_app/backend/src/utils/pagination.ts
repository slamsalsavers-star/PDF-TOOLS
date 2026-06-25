import type { Request } from 'express';

export function getPagination(req: Request) {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? 1)));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 25))));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
