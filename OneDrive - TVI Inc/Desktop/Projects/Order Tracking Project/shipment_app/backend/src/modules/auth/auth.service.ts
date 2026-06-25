import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, queryOne } from '../../db/client.js';
import { env } from '../../config/env.js';
import { Errors } from '../../utils/errors.js';
import type { JwtPayload } from '../../middleware/auth.js';

export async function login(email: string, password: string, tenantSlug: string) {
  const user = await queryOne<{
    id: string; tenant_id: string; role_id: string; email: string;
    password_hash: string; full_name: string; is_active: boolean; slug: string;
  }>(
    `SELECT u.*, t.slug
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE LOWER(u.email) = LOWER($1)
        AND t.slug = $2
        AND t.is_active = TRUE`,
    [email, tenantSlug]
  );

  if (!user) throw Errors.unauthorized('Invalid credentials');
  if (!user.is_active) throw Errors.forbidden('Account disabled');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw Errors.unauthorized('Invalid credentials');

  await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

  return issueTokens({ sub: user.id, tenantId: user.tenant_id, roleId: user.role_id, email: user.email });
}

export async function refresh(rawToken: string) {
  const hash = hashToken(rawToken);
  const stored = await queryOne<{ user_id: string; expires_at: Date }>(
    `SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1`, [hash]
  );

  if (!stored || new Date(stored.expires_at) < new Date()) {
    throw Errors.unauthorized('Refresh token invalid or expired');
  }

  const user = await queryOne<{ id: string; tenant_id: string; role_id: string; email: string; is_active: boolean }>(
    `SELECT id, tenant_id, role_id, email, is_active FROM users WHERE id = $1`,
    [stored.user_id]
  );

  if (!user || !user.is_active) throw Errors.unauthorized();

  await query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [hash]);
  return issueTokens({ sub: user.id, tenantId: user.tenant_id, roleId: user.role_id, email: user.email });
}

export async function logout(rawToken: string) {
  const hash = hashToken(rawToken);
  await query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [hash]);
}

async function issueTokens(payload: JwtPayload) {
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
  });

  const rawRefresh = crypto.randomBytes(64).toString('hex');
  const hash = hashToken(rawRefresh);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [payload.sub, hash, expiresAt]
  );

  return { accessToken, refreshToken: rawRefresh, expiresIn: env.JWT_ACCESS_EXPIRES };
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function me(userId: string) {
  return queryOne(
    `SELECT u.id, u.email, u.full_name, u.is_active, u.last_login_at,
            u.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
            r.id AS role_id, r.name AS role_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
  LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [userId]
  );
}
