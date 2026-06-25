import { query, queryOne } from '../../db/client.js';
import { Errors } from '../../utils/errors.js';

export async function list(tenantId: string, offset: number, limit: number, search?: string) {
  const where = search
    ? `AND (s.order_number ILIKE $4 OR s.reference ILIKE $4 OR s.customer ILIKE $4)`
    : '';
  const searchParam = search ? [`%${search}%`] : [];

  const [rows, countRows] = await Promise.all([
    query(
      `SELECT s.*,
              f.description AS facility_name,
              fwd.name      AS forwarder_name,
              b.booking_number,
              st.description AS current_status,
              st.color       AS status_color
         FROM shipments s
    LEFT JOIN facilities f   ON f.id = s.facility_id
    LEFT JOIN forwarders fwd ON fwd.id = s.forwarder_id
    LEFT JOIN bookings b     ON b.id = s.booking_id
    LEFT JOIN LATERAL (
      SELECT status_id FROM shipment_statuses
       WHERE shipment_id = s.id
       ORDER BY created_at DESC LIMIT 1
    ) last_ss ON TRUE
    LEFT JOIN statuses st ON st.id = last_ss.status_id
        WHERE s.tenant_id = $1 ${where}
     ORDER BY s.created_at DESC
        LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset, ...searchParam]
    ),
    query(
      `SELECT COUNT(*) AS total FROM shipments s WHERE s.tenant_id = $1 ${where}`,
      [tenantId, ...searchParam]
    ),
  ]);

  return { rows, total: parseInt(String((countRows[0] as any).total)) };
}

export async function getById(tenantId: string, id: string) {
  const shipment = await queryOne(
    `SELECT s.*,
            f.description AS facility_name,
            fwd.name      AS forwarder_name,
            b.booking_number, b.vessel, b.voyage, b.eta, b.cut_off
       FROM shipments s
  LEFT JOIN facilities f   ON f.id = s.facility_id
  LEFT JOIN forwarders fwd ON fwd.id = s.forwarder_id
  LEFT JOIN bookings b     ON b.id = s.booking_id
      WHERE s.id = $1 AND s.tenant_id = $2`,
    [id, tenantId]
  );
  if (!shipment) throw Errors.notFound('Shipment not found');

  const statuses = await query(
    `SELECT ss.id, ss.notes, ss.created_at,
            st.description AS status, st.color,
            u.full_name    AS created_by_name
       FROM shipment_statuses ss
       JOIN statuses st ON st.id = ss.status_id
  LEFT JOIN users u ON u.id = ss.created_by
      WHERE ss.shipment_id = $1
   ORDER BY ss.created_at DESC`,
    [id]
  );

  const comments = await query(
    `SELECT sc.id, sc.comment, sc.created_at, u.full_name AS created_by_name
       FROM shipment_comments sc
  LEFT JOIN users u ON u.id = sc.created_by
      WHERE sc.shipment_id = $1
   ORDER BY sc.created_at DESC`,
    [id]
  );

  return { ...shipment, statuses, comments };
}

export async function create(tenantId: string, userId: string, data: Record<string, unknown>) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO shipments
       (tenant_id, order_number, reference, facility_id, forwarder_id, booking_id,
        carrier, despatch_date, place_of_destination, country, customer, consignee,
        transport_mode, field, folder_link, description, order_creation_type, order_type, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id`,
    [
      tenantId, data.order_number, data.reference ?? null, data.facility_id ?? null,
      data.forwarder_id ?? null, data.booking_id ?? null, data.carrier ?? null,
      data.despatch_date ?? null, data.place_of_destination ?? null, data.country ?? null,
      data.customer ?? null, data.consignee ?? null, data.transport_mode ?? null,
      data.field ?? null, data.folder_link ?? null, data.description ?? null,
      data.order_creation_type ?? null, data.order_type ?? null, userId,
    ]
  );

  if (data.status_id) {
    await query(
      `INSERT INTO shipment_statuses (shipment_id, status_id, created_by) VALUES ($1, $2, $3)`,
      [row.id, data.status_id, userId]
    );
  }

  return getById(tenantId, row.id);
}

export async function update(tenantId: string, id: string, data: Record<string, unknown>) {
  await getById(tenantId, id);
  await query(
    `UPDATE shipments SET
       order_number = COALESCE($3, order_number),
       reference    = COALESCE($4, reference),
       facility_id  = COALESCE($5, facility_id),
       forwarder_id = COALESCE($6, forwarder_id),
       booking_id   = COALESCE($7, booking_id),
       carrier      = COALESCE($8, carrier),
       despatch_date = COALESCE($9, despatch_date),
       place_of_destination = COALESCE($10, place_of_destination),
       country      = COALESCE($11, country),
       customer     = COALESCE($12, customer),
       consignee    = COALESCE($13, consignee),
       transport_mode = COALESCE($14, transport_mode),
       field        = COALESCE($15, field),
       folder_link  = COALESCE($16, folder_link),
       description  = COALESCE($17, description),
       order_creation_type = COALESCE($18, order_creation_type),
       order_type   = COALESCE($19, order_type),
       updated_at   = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, ...[
      'order_number','reference','facility_id','forwarder_id','booking_id','carrier',
      'despatch_date','place_of_destination','country','customer','consignee',
      'transport_mode','field','folder_link','description','order_creation_type','order_type',
    ].map(k => data[k] ?? null)]
  );
  return getById(tenantId, id);
}

export async function remove(tenantId: string, id: string) {
  await getById(tenantId, id);
  await query(`DELETE FROM shipments WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}

export async function addStatus(tenantId: string, shipmentId: string, userId: string, data: { status_id: string; notes?: string }) {
  await getById(tenantId, shipmentId);
  const [row] = await query<{ id: string }>(
    `INSERT INTO shipment_statuses (shipment_id, status_id, notes, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
    [shipmentId, data.status_id, data.notes ?? null, userId]
  );
  return row;
}

export async function addComment(tenantId: string, shipmentId: string, userId: string, comment: string) {
  await getById(tenantId, shipmentId);
  const [row] = await query<{ id: string }>(
    `INSERT INTO shipment_comments (shipment_id, comment, created_by) VALUES ($1,$2,$3) RETURNING id`,
    [shipmentId, comment, userId]
  );
  return row;
}
