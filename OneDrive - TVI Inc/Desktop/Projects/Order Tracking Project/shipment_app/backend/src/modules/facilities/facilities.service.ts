import { query, queryOne } from '../../db/client.js';
import { Errors } from '../../utils/errors.js';

export async function list(tenantId: string) {
  return query(
    `SELECT f.*, c.description AS city_name
       FROM facilities f
  LEFT JOIN cities c ON c.id = f.city_id
      WHERE f.tenant_id = $1
   ORDER BY f.description`,
    [tenantId]
  );
}

export async function getById(tenantId: string, id: string) {
  const row = await queryOne(
    `SELECT f.*, c.description AS city_name
       FROM facilities f
  LEFT JOIN cities c ON c.id = f.city_id
      WHERE f.id = $1 AND f.tenant_id = $2`,
    [id, tenantId]
  );
  if (!row) throw Errors.notFound('Facility not found');
  return row;
}

export async function create(tenantId: string, data: Record<string, unknown>) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO facilities (tenant_id, description, city_id, address) VALUES ($1,$2,$3,$4) RETURNING id`,
    [tenantId, data.description, data.city_id ?? null, data.address ?? null]
  );
  return getById(tenantId, row.id);
}

export async function update(tenantId: string, id: string, data: Record<string, unknown>) {
  await getById(tenantId, id);
  await query(
    `UPDATE facilities SET description=COALESCE($3,description), city_id=COALESCE($4,city_id),
       address=COALESCE($5,address), is_active=COALESCE($6,is_active), updated_at=NOW()
     WHERE id=$1 AND tenant_id=$2`,
    [id, tenantId, data.description??null, data.city_id??null, data.address??null, data.is_active??null]
  );
  return getById(tenantId, id);
}

export async function remove(tenantId: string, id: string) {
  await getById(tenantId, id);
  await query(`DELETE FROM facilities WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
}
