import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import * as svc from './bookings.service.js';
import { ok, created, noContent, paginated } from '../../utils/response.js';
import { getPagination } from '../../utils/pagination.js';

const router = Router();

const schema = z.object({
  booking_number:        z.string().min(1),
  reference:             z.string().optional(),
  booking_type:          z.string().optional(),
  booking_received_date: z.string().optional().nullable(),
  cut_off:               z.string().optional().nullable(),
  vessel:                z.string().optional(),
  voyage:                z.string().optional(),
  eta:                   z.string().optional().nullable(),
  rail:                  z.string().optional(),
  shipping_line_id:      z.string().uuid().optional().nullable(),
  description:           z.string().optional(),
});

router.use(requireAuth);

router.get('/', requirePermission('bookings', 'view'), async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const { rows, total } = await svc.list(req.user!.tenantId, offset, limit, req.query.search as string);
  return paginated(res, rows, { total, page, limit });
});

router.get('/:id', requirePermission('bookings', 'view'), async (req, res) => {
  return ok(res, await svc.getById(req.user!.tenantId, req.params.id));
});

router.post('/', requirePermission('bookings', 'create'), validate(schema), async (req, res) => {
  return created(res, await svc.create(req.user!.tenantId, req.body));
});

router.put('/:id', requirePermission('bookings', 'edit'), validate(schema.partial()), async (req, res) => {
  return ok(res, await svc.update(req.user!.tenantId, req.params.id, req.body));
});

router.delete('/:id', requirePermission('bookings', 'delete'), async (req, res) => {
  await svc.remove(req.user!.tenantId, req.params.id);
  return noContent(res);
});

router.post('/lookup', requirePermission('bookings', 'view'),
  validate(z.object({ booking_number: z.string().min(1), shipping_line_id: z.string().uuid() })),
  async (req, res) => {
    return ok(res, await svc.lookup(req.user!.tenantId, req.body.booking_number, req.body.shipping_line_id));
  }
);

export default router;
