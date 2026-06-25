import { query, queryOne } from '../../db/client.js';
import { Errors } from '../../utils/errors.js';

export async function list(tenantId: string) {
  return query(
    `SELECT p.*, u.full_name AS created_by_name
       FROM periods p
  LEFT JOIN users u ON u.id = p.created_by
      WHERE p.tenant_id = $1
   ORDER BY p.start_date DESC`,
    [tenantId]
  );
}

export async function getById(tenantId: string, id: string) {
  const row = await queryOne(
    `SELECT p.*, u.full_name AS created_by_name
       FROM periods p
  LEFT JOIN users u ON u.id = p.created_by
      WHERE p.id = $1 AND p.tenant_id = $2`,
    [id, tenantId]
  );
  if (!row) throw Errors.notFound('Period not found');
  return row;
}

export async function create(tenantId: string, userId: string, data: Record<string, unknown>) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO periods (tenant_id, name, start_date, end_date, status, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [tenantId, data.name, data.start_date, data.end_date, data.status ?? 'open', data.notes ?? null, userId]
  );
  return getById(tenantId, row.id);
}

export async function update(tenantId: string, id: string, data: Record<string, unknown>) {
  await getById(tenantId, id);
  await query(
    `UPDATE periods SET
       name=COALESCE($3,name), start_date=COALESCE($4,start_date),
       end_date=COALESCE($5,end_date), status=COALESCE($6,status),
       notes=COALESCE($7,notes), updated_at=NOW()
     WHERE id=$1 AND tenant_id=$2`,
    [id, tenantId, data.name??null, data.start_date??null, data.end_date??null, data.status??null, data.notes??null]
  );
  return getById(tenantId, id);
}

export async function remove(tenantId: string, id: string) {
  await getById(tenantId, id);
  await query(`DELETE FROM periods WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
}
