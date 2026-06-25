import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { loginHandler, refreshHandler, logoutHandler, meHandler } from './auth.controller.js';
import { z } from 'zod';

const router = Router();

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
  tenant:   z.string().min(1),
});

router.post('/login',   validate(loginSchema), loginHandler);
router.post('/refresh', refreshHandler);
router.post('/logout',  logoutHandler);
router.get('/me',       requireAuth, meHandler);

export default router;
