import { query, queryOne } from '../../db/client.js';
import { Errors } from '../../utils/errors.js';

export async function list(tenantId: string, offset: number, limit: number, search?: string) {
  const where = search ? `AND (c.alias ILIKE $4 OR c.description ILIKE $4)` : '';
  const p = search ? [`%${search}%`] : [];

  const [rows, countRows] = await Promise.all([
    query(
      `SELECT c.id, c.alias, c.description, c.customer_type, c.is_active, c.created_at,
              f.name AS primary_forwarder_name
         FROM customers c
    LEFT JOIN forwarders f ON f.id = c.primary_forwarder_id
        WHERE c.tenant_id = $1 ${where}
     ORDER BY c.alias
        LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset, ...p]
    ),
    query(`SELECT COUNT(*) AS total FROM customers c WHERE c.tenant_id = $1 ${where}`, [tenantId, ...p]),
  ]);
  return { rows, total: parseInt(String((countRows[0] as any).total)) };
}

export async function getById(tenantId: string, id: string) {
  const customer = await queryOne(
    `SELECT c.*, f.name AS primary_forwarder_name
       FROM customers c
  LEFT JOIN forwarders f ON f.id = c.primary_forwarder_id
      WHERE c.id = $1 AND c.tenant_id = $2`,
    [id, tenantId]
  );
  if (!customer) throw Errors.notFound('Customer not found');

  const emails = await query(
    `SELECT * FROM customer_emails WHERE customer_id = $1 AND is_active = TRUE ORDER BY email`,
    [id]
  );

  return { ...customer, emails };
}

export async function create(tenantId: string, data: Record<string, unknown>) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO customers
       (tenant_id, alias, description, customer_type, address, country_id, primary_forwarder_id, special_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [tenantId, data.alias, data.description, data.customer_type ?? null,
     data.address ?? null, data.country_id ?? null, data.primary_forwarder_id ?? null, data.special_notes ?? null]
  );
  return getById(tenantId, row.id);
}

export async function update(tenantId: string, id: string, data: Record<string, unknown>) {
  await getById(tenantId, id);
  await query(
    `UPDATE customers SET
       alias = COALESCE($3, alias), description = COALESCE($4, description),
       customer_type = COALESCE($5, customer_type), address = COALESCE($6, address),
       country_id = COALESCE($7, country_id), primary_forwarder_id = COALESCE($8, primary_forwarder_id),
       special_notes = COALESCE($9, special_notes), is_active = COALESCE($10, is_active),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, data.alias ?? null, data.description ?? null, data.customer_type ?? null,
     data.address ?? null, data.country_id ?? null, data.primary_forwarder_id ?? null,
     data.special_notes ?? null, data.is_active ?? null]
  );
  return getById(tenantId, id);
}

export async function remove(tenantId: string, id: string) {
  await getById(tenantId, id);
  await query(`DELETE FROM customers WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}
