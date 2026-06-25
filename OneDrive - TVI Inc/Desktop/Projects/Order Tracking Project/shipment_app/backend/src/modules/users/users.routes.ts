import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import { index, show, store, update, destroy } from './users.controller.js';

const router = Router();

const createSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(8),
  full_name: z.string().min(1),
  role_id:   z.string().uuid().optional(),
});

const updateSchema = createSchema.partial().extend({
  is_active: z.boolean().optional(),
});

router.use(requireAuth);
router.get('/',     requirePermission('users', 'view'),   index);
router.get('/:id',  requirePermission('users', 'view'),   show);
router.post('/',    requirePermission('users', 'create'),  validate(createSchema), store);
router.put('/:id',  requirePermission('users', 'edit'),    validate(updateSchema), update);
router.delete('/:id', requirePermission('users', 'delete'), destroy);

export default router;
