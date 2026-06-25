import type { Request, Response } from 'express';
import * as authService from './auth.service.js';
import { ok } from '../../utils/response.js';

export async function loginHandler(req: Request, res: Response) {
  const { email, password, tenant } = req.body as { email: string; password: string; tenant: string };
  const tokens = await authService.login(email, password, tenant);

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return ok(res, { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
}

export async function refreshHandler(req: Request, res: Response) {
  const rawToken = req.cookies?.refreshToken as string | undefined;
  if (!rawToken) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No refresh token' } });
  }

  const tokens = await authService.refresh(rawToken);

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return ok(res, { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
}

export async function logoutHandler(req: Request, res: Response) {
  const rawToken = req.cookies?.refreshToken as string | undefined;
  if (rawToken) await authService.logout(rawToken);
  res.clearCookie('refreshToken');
  return res.status(204).send();
}

export async function meHandler(req: Request, res: Response) {
  const user = await authService.me(req.user!.sub);
  return ok(res, user);
}
