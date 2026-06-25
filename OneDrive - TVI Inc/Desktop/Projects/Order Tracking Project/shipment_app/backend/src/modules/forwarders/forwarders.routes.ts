import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import * as svc from './forwarders.service.js';
import { ok, created, noContent } from '../../utils/response.js';

const router = Router();
const schema = z.object({
  name:      z.string().min(1),
  code:      z.string().optional(),
  contact:   z.string().optional(),
  email:     z.string().email().optional().or(z.literal('')),
  phone:     z.string().optional(),
  address:   z.string().optional(),
  notes:     z.string().optional(),
  is_active: z.boolean().optional(),
});

router.use(requireAuth);
router.get('/',      requirePermission('forwarders','view'),   async (req,res) => ok(res, await svc.list(req.user!.tenantId)));
router.get('/:id',   requirePermission('forwarders','view'),   async (req,res) => ok(res, await svc.getById(req.user!.tenantId, req.params.id)));
router.post('/',     requirePermission('forwarders','create'),  validate(schema), async (req,res) => created(res, await svc.create(req.user!.tenantId, req.body)));
router.put('/:id',   requirePermission('forwarders','edit'),    validate(schema.partial()), async (req,res) => ok(res, await svc.update(req.user!.tenantId, req.params.id, req.body)));
router.delete('/:id',requirePermission('forwarders','delete'), async (req,res) => { await svc.remove(req.user!.tenantId, req.params.id); return noContent(res); });

export default router;
