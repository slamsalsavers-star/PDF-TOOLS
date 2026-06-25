import { query, queryOne } from '../../db/client.js';
import { Errors } from '../../utils/errors.js';

export async function list(tenantId: string, offset: number, limit: number, search?: string) {
  const where = search ? `AND (b.booking_number ILIKE $4 OR b.reference ILIKE $4 OR b.vessel ILIKE $4)` : '';
  const p = search ? [`%${search}%`] : [];

  const [rows, countRows] = await Promise.all([
    query(
      `SELECT b.*, sl.name AS shipping_line_name
         FROM bookings b
    LEFT JOIN shipping_lines sl ON sl.id = b.shipping_line_id
        WHERE b.tenant_id = $1 ${where}
     ORDER BY b.created_at DESC
        LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset, ...p]
    ),
    query(`SELECT COUNT(*) AS total FROM bookings b WHERE b.tenant_id = $1 ${where}`, [tenantId, ...p]),
  ]);
  return { rows, total: parseInt(String((countRows[0] as any).total)) };
}

export async function getById(tenantId: string, id: string) {
  const b = await queryOne(
    `SELECT b.*, sl.name AS shipping_line_name
       FROM bookings b
  LEFT JOIN shipping_lines sl ON sl.id = b.shipping_line_id
      WHERE b.id = $1 AND b.tenant_id = $2`,
    [id, tenantId]
  );
  if (!b) throw Errors.notFound('Booking not found');
  return b;
}

export async function create(tenantId: string, data: Record<string, unknown>) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO bookings
       (tenant_id, reference, booking_number, booking_type, booking_received_date,
        cut_off, vessel, voyage, eta, rail, shipping_line_id, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      tenantId, data.reference ?? null, data.booking_number, data.booking_type ?? null,
      data.booking_received_date ?? null, data.cut_off ?? null, data.vessel ?? null,
      data.voyage ?? null, data.eta ?? null, data.rail ?? null,
      data.shipping_line_id ?? null, data.description ?? null,
    ]
  );
  return getById(tenantId, row.id);
}

export async function update(tenantId: string, id: string, data: Record<string, unknown>) {
  await getById(tenantId, id);
  await query(
    `UPDATE bookings SET
       reference = COALESCE($3, reference),
       booking_number = COALESCE($4, booking_number),
       booking_type = COALESCE($5, booking_type),
       booking_received_date = COALESCE($6, booking_received_date),
       cut_off = COALESCE($7, cut_off),
       vessel = COALESCE($8, vessel),
       voyage = COALESCE($9, voyage),
       eta = COALESCE($10, eta),
       rail = COALESCE($11, rail),
       shipping_line_id = COALESCE($12, shipping_line_id),
       description = COALESCE($13, description),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, data.reference ?? null, data.booking_number ?? null, data.booking_type ?? null,
     data.booking_received_date ?? null, data.cut_off ?? null, data.vessel ?? null,
     data.voyage ?? null, data.eta ?? null, data.rail ?? null, data.shipping_line_id ?? null, data.description ?? null]
  );
  return getById(tenantId, id);
}

export async function remove(tenantId: string, id: string) {
  await getById(tenantId, id);
  await query(`DELETE FROM bookings WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}

export async function lookup(tenantId: string, bookingNumber: string, shippingLineId: string) {
  const line = await queryOne<any>(
    `SELECT * FROM shipping_lines WHERE id = $1 AND tenant_id = $2`, [shippingLineId, tenantId]
  );
  if (!line) throw Errors.notFound('Shipping line not found');

  const { runScraper } = await import('../shipping-lines/maersk.scraper.js');
  return runScraper(bookingNumber, line);
}
