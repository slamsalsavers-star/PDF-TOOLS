import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import * as svc from './periods.service.js';
import { ok, created, noContent } from '../../utils/response.js';

const router = Router();
const schema = z.object({
  name:       z.string().min(1),
  start_date: z.string().min(1),
  end_date:   z.string().min(1),
  status:     z.enum(['open', 'closed']).optional(),
  notes:      z.string().optional(),
});

router.use(requireAuth);
router.get('/',      requirePermission('periods','view'),   async (req,res) => ok(res, await svc.list(req.user!.tenantId)));
router.get('/:id',   requirePermission('periods','view'),   async (req,res) => ok(res, await svc.getById(req.user!.tenantId, req.params.id)));
router.post('/',     requirePermission('periods','create'),  validate(schema), async (req,res) => created(res, await svc.create(req.user!.tenantId, req.user!.sub, req.body)));
router.put('/:id',   requirePermission('periods','edit'),    validate(schema.partial()), async (req,res) => ok(res, await svc.update(req.user!.tenantId, req.params.id, req.body)));
router.delete('/:id',requirePermission('periods','delete'), async (req,res) => { await svc.remove(req.user!.tenantId, req.params.id); return noContent(res); });

export default router;
