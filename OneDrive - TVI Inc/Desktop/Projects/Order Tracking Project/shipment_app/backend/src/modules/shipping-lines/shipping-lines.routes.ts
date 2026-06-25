import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import * as svc from './shipping-lines.service.js';
import { ok, created, noContent } from '../../utils/response.js';

const router = Router();

const schema = z.object({
  name:         z.string().min(1),
  code:         z.string().min(1),
  api_base_url: z.string().optional(),
  api_key:      z.string().optional(),
  api_secret:   z.string().optional(),
  extra_config: z.record(z.unknown()).optional(),
  is_active:    z.boolean().optional(),
  notes:        z.string().optional(),
});

router.use(requireAuth);
router.get('/',      requirePermission('shipping_lines','view'),   async (req,res) => ok(res, await svc.list(req.user!.tenantId)));
router.get('/:id',   requirePermission('shipping_lines','view'),   async (req,res) => ok(res, await svc.getById(req.user!.tenantId, req.params.id)));
router.post('/',     requirePermission('shipping_lines','create'),  validate(schema), async (req,res) => created(res, await svc.create(req.user!.tenantId, req.body)));
router.put('/:id',   requirePermission('shipping_lines','edit'),    validate(schema.partial()), async (req,res) => ok(res, await svc.update(req.user!.tenantId, req.params.id, req.body)));
router.delete('/:id',requirePermission('shipping_lines','delete'), async (req,res) => { await svc.remove(req.user!.tenantId, req.params.id); return noContent(res); });

export default router;
