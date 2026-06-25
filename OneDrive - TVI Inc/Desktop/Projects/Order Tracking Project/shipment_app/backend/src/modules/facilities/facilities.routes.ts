import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import * as svc from './facilities.service.js';
import { ok, created, noContent } from '../../utils/response.js';

const router = Router();
const schema = z.object({
  description: z.string().min(1),
  city_id:     z.string().uuid().optional().nullable(),
  address:     z.string().optional(),
  is_active:   z.boolean().optional(),
});

router.use(requireAuth);
router.get('/',      requirePermission('facilities','view'),   async (req,res) => ok(res, await svc.list(req.user!.tenantId)));
router.get('/:id',   requirePermission('facilities','view'),   async (req,res) => ok(res, await svc.getById(req.user!.tenantId, req.params.id)));
router.post('/',     requirePermission('facilities','create'),  validate(schema), async (req,res) => created(res, await svc.create(req.user!.tenantId, req.body)));
router.put('/:id',   requirePermission('facilities','edit'),    validate(schema.partial()), async (req,res) => ok(res, await svc.update(req.user!.tenantId, req.params.id, req.body)));
router.delete('/:id',requirePermission('facilities','delete'), async (req,res) => { await svc.remove(req.user!.tenantId, req.params.id); return noContent(res); });

export default router;
