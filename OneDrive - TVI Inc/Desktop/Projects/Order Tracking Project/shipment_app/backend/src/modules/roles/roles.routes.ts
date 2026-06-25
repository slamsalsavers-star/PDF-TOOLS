import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import { query as dbQuery } from '../../db/client.js';
import * as svc from './roles.service.js';
import { ok, created, noContent } from '../../utils/response.js';

const router = Router();

const schema = z.object({
  name:           z.string().min(1),
  permission_ids: z.array(z.string().uuid()).optional(),
});

router.use(requireAuth);

router.get('/permissions', requirePermission('roles', 'view'), async (_req, res) => {
  return ok(res, await svc.allPermissions());
});

router.get('/',     requirePermission('roles', 'view'),   async (req, res) => ok(res, await svc.list(req.user!.tenantId)));
router.get('/:id',  requirePermission('roles', 'view'),   async (req, res) => ok(res, await svc.getById(req.user!.tenantId, req.params.id)));
router.post('/',    requirePermission('roles', 'create'),  validate(schema), async (req, res) => created(res, await svc.create(req.user!.tenantId, req.body)));
router.put('/:id',  requirePermission('roles', 'edit'),    validate(schema.partial()), async (req, res) => ok(res, await svc.update(req.user!.tenantId, req.params.id, req.body)));
router.delete('/:id', requirePermission('roles', 'delete'), async (req, res) => { await svc.remove(req.user!.tenantId, req.params.id); return noContent(res); });

export default router;
