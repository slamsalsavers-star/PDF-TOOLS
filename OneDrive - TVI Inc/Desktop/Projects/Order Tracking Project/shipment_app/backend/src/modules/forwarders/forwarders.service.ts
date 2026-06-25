import { query, queryOne } from '../../db/client.js';
import { Errors } from '../../utils/errors.js';

export async function list(tenantId: string) {
  return query(
    `SELECT id, name, code, contact, email, phone, is_active, created_at
       FROM forwarders WHERE tenant_id = $1 ORDER BY name`,
    [tenantId]
  );
}

export async function getById(tenantId: string, id: string) {
  const row = await queryOne(`SELECT * FROM forwarders WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  if (!row) throw Errors.notFound('Forwarder not found');
  return row;
}

export async function create(tenantId: string, data: Record<string, unknown>) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO forwarders (tenant_id, name, code, contact, email, phone, address, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [tenantId, data.name, data.code ?? null, data.contact ?? null,
     data.email ?? null, data.phone ?? null, data.address ?? null, data.notes ?? null]
  );
  return getById(tenantId, row.id);
}

export async function update(tenantId: string, id: string, data: Record<string, unknown>) {
  await getById(tenantId, id);
  await query(
    `UPDATE forwarders SET
       name=COALESCE($3,name), code=COALESCE($4,code), contact=COALESCE($5,contact),
       email=COALESCE($6,email), phone=COALESCE($7,phone), address=COALESCE($8,address),
       notes=COALESCE($9,notes), is_active=COALESCE($10,is_active), updated_at=NOW()
     WHERE id=$1 AND tenant_id=$2`,
    [id, tenantId, data.name??null, data.code??null, data.contact??null,
     data.email??null, data.phone??null, data.address??null, data.notes??null, data.is_active??null]
  );
  return getById(tenantId, id);
}

export async function remove(tenantId: string, id: string) {
  await getById(tenantId, id);
  await query(`DELETE FROM forwarders WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
}
