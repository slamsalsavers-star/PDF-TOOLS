import bcrypt from 'bcryptjs';
import { query, queryOne } from '../../db/client.js';
import { Errors } from '../../utils/errors.js';

export async function list(tenantId: string, offset: number, limit: number) {
  const [rows, countRows] = await Promise.all([
    query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.last_login_at, u.created_at,
              r.id AS role_id, r.name AS role_name
         FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.tenant_id = $1
     ORDER BY u.full_name
        LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM users WHERE tenant_id = $1`, [tenantId]),
  ]);
  return { rows, total: parseInt(String((countRows[0] as any).total)) };
}

export async function getById(tenantId: string, id: string) {
  const user = await queryOne(
    `SELECT u.id, u.email, u.full_name, u.is_active, u.last_login_at, u.created_at,
            r.id AS role_id, r.name AS role_name
       FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND u.tenant_id = $2`,
    [id, tenantId]
  );
  if (!user) throw Errors.notFound('User not found');
  return user;
}

export async function create(tenantId: string, data: {
  email: string; password: string; full_name: string; role_id?: string;
}) {
  const existing = await queryOne(
    `SELECT id FROM users WHERE tenant_id = $1 AND LOWER(email) = LOWER($2)`,
    [tenantId, data.email]
  );
  if (existing) throw Errors.conflict('Email already in use');

  const hash = await bcrypt.hash(data.password, 12);
  const [row] = await query<{ id: string }>(
    `INSERT INTO users (tenant_id, role_id, email, password_hash, full_name)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [tenantId, data.role_id ?? null, data.email, hash, data.full_name]
  );
  return getById(tenantId, row.id);
}

export async function update(tenantId: string, id: string, data: {
  email?: string; password?: string; full_name?: string; role_id?: string; is_active?: boolean;
}) {
  await getById(tenantId, id);

  if (data.password) {
    data = { ...data, password: await bcrypt.hash(data.password, 12) } as typeof data;
  }

  await query(
    `UPDATE users SET
       email        = COALESCE($3, email),
       password_hash = COALESCE($4, password_hash),
       full_name    = COALESCE($5, full_name),
       role_id      = COALESCE($6, role_id),
       is_active    = COALESCE($7, is_active),
       updated_at   = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, data.email ?? null, (data as any).password ?? null, data.full_name ?? null, data.role_id ?? null, data.is_active ?? null]
  );
  return getById(tenantId, id);
}

export async function remove(tenantId: string, id: string) {
  await getById(tenantId, id);
  await query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}
