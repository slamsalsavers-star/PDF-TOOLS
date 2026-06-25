import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import * as svc from './shipments.service.js';
import { ok, created, noContent, paginated } from '../../utils/response.js';
import { getPagination } from '../../utils/pagination.js';

const router = Router();

const schema = z.object({
  order_number:         z.string().min(1),
  reference:            z.string().optional(),
  facility_id:          z.string().uuid().optional().nullable(),
  forwarder_id:         z.string().uuid().optional().nullable(),
  booking_id:           z.string().uuid().optional().nullable(),
  carrier:              z.string().optional(),
  despatch_date:        z.string().optional().nullable(),
  place_of_destination: z.string().optional(),
  country:              z.string().optional(),
  customer:             z.string().optional(),
  consignee:            z.string().optional(),
  transport_mode:       z.string().optional(),
  field:                z.string().optional(),
  folder_link:          z.string().optional(),
  description:          z.string().optional(),
  order_creation_type:  z.string().uuid().optional().nullable(),
  order_type:           z.string().uuid().optional().nullable(),
  status_id:            z.string().uuid().optional(),
});

router.use(requireAuth);

router.get('/', requirePermission('shipments', 'view'), async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const { rows, total } = await svc.list(req.user!.tenantId, offset, limit, req.query.search as string);
  return paginated(res, rows, { total, page, limit });
});

router.get('/:id', requirePermission('shipments', 'view'), async (req, res) => {
  return ok(res, await svc.getById(req.user!.tenantId, req.params.id));
});

router.post('/', requirePermission('shipments', 'create'), validate(schema), async (req, res) => {
  return created(res, await svc.create(req.user!.tenantId, req.user!.sub, req.body));
});

router.put('/:id', requirePermission('shipments', 'edit'), validate(schema.partial()), async (req, res) => {
  return ok(res, await svc.update(req.user!.tenantId, req.params.id, req.body));
});

router.delete('/:id', requirePermission('shipments', 'delete'), async (req, res) => {
  await svc.remove(req.user!.tenantId, req.params.id);
  return noContent(res);
});

router.post('/:id/statuses', requirePermission('shipments', 'edit'),
  validate(z.object({ status_id: z.string().uuid(), notes: z.string().optional() })),
  async (req, res) => {
    return created(res, await svc.addStatus(req.user!.tenantId, req.params.id, req.user!.sub, req.body));
  }
);

router.post('/:id/comments', requirePermission('shipments', 'edit'),
  validate(z.object({ comment: z.string().min(1) })),
  async (req, res) => {
    return created(res, await svc.addComment(req.user!.tenantId, req.params.id, req.user!.sub, req.body.comment));
  }
);

export default router;
