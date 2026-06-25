import { query, queryOne } from '../../db/client.js';
import { Errors } from '../../utils/errors.js';

export async function list(tenantId: string) {
  return query(
    `SELECT id, name, code, api_base_url, is_active, notes, created_at
       FROM shipping_lines
      WHERE tenant_id = $1
   ORDER BY name`,
    [tenantId]
  );
}

export async function getById(tenantId: string, id: string) {
  const row = await queryOne(
    `SELECT * FROM shipping_lines WHERE id = $1 AND tenant_id = $2`, [id, tenantId]
  );
  if (!row) throw Errors.notFound('Shipping line not found');
  return row;
}

export async function create(tenantId: string, data: Record<string, unknown>) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO shipping_lines (tenant_id, name, code, api_base_url, api_key, api_secret, extra_config, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [tenantId, data.name, data.code, data.api_base_url ?? null, data.api_key ?? null,
     data.api_secret ?? null, JSON.stringify(data.extra_config ?? {}), data.notes ?? null]
  );
  return getById(tenantId, row.id);
}

export async function update(tenantId: string, id: string, data: Record<string, unknown>) {
  await getById(tenantId, id);
  await query(
    `UPDATE shipping_lines SET
       name = COALESCE($3, name), code = COALESCE($4, code),
       api_base_url = COALESCE($5, api_base_url), api_key = COALESCE($6, api_key),
       api_secret = COALESCE($7, api_secret), notes = COALESCE($8, notes),
       is_active = COALESCE($9, is_active), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, data.name ?? null, data.code ?? null, data.api_base_url ?? null,
     data.api_key ?? null, data.api_secret ?? null, data.notes ?? null, data.is_active ?? null]
  );
  return getById(tenantId, id);
}

export async function remove(tenantId: string, id: string) {
  await getById(tenantId, id);
  await query(`DELETE FROM shipping_lines WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}
