import type { Request, Response } from 'express';
import * as svc from './users.service.js';
import { ok, created, noContent, paginated } from '../../utils/response.js';
import { getPagination } from '../../utils/pagination.js';

export async function index(req: Request, res: Response) {
  const { page, limit, offset } = getPagination(req);
  const { rows, total } = await svc.list(req.user!.tenantId, offset, limit);
  return paginated(res, rows, { total, page, limit });
}

export async function show(req: Request, res: Response) {
  const user = await svc.getById(req.user!.tenantId, req.params.id);
  return ok(res, user);
}

export async function store(req: Request, res: Response) {
  const user = await svc.create(req.user!.tenantId, req.body);
  return created(res, user);
}

export async function update(req: Request, res: Response) {
  const user = await svc.update(req.user!.tenantId, req.params.id, req.body);
  return ok(res, user);
}

export async function destroy(req: Request, res: Response) {
  await svc.remove(req.user!.tenantId, req.params.id);
  return noContent(res);
}
