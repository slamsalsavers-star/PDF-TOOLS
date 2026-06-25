import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import * as svc from './customers.service.js';
import { ok, created, noContent, paginated } from '../../utils/response.js';
import { getPagination } from '../../utils/pagination.js';

const router = Router();

const schema = z.object({
  alias:                z.string().min(1),
  description:          z.string().min(1),
  customer_type:        z.string().optional(),
  address:              z.string().optional(),
  country_id:           z.string().uuid().optional().nullable(),
  primary_forwarder_id: z.string().uuid().optional().nullable(),
  special_notes:        z.string().optional(),
  is_active:            z.boolean().optional(),
});

router.use(requireAuth);
router.get('/',      requirePermission('customers','view'),   async (req,res) => { const { page,limit,offset } = getPagination(req); const { rows,total } = await svc.list(req.user!.tenantId,offset,limit,req.query.search as string); return paginated(res,rows,{total,page,limit}); });
router.get('/:id',   requirePermission('customers','view'),   async (req,res) => ok(res, await svc.getById(req.user!.tenantId, req.params.id)));
router.post('/',     requirePermission('customers','create'),  validate(schema), async (req,res) => created(res, await svc.create(req.user!.tenantId, req.body)));
router.put('/:id',   requirePermission('customers','edit'),    validate(schema.partial()), async (req,res) => ok(res, await svc.update(req.user!.tenantId, req.params.id, req.body)));
router.delete('/:id',requirePermission('customers','delete'), async (req,res) => { await svc.remove(req.user!.tenantId, req.params.id); return noContent(res); });

export default router;
