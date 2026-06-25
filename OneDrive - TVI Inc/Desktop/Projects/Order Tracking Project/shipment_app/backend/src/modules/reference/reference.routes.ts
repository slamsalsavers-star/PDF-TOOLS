import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { query } from '../../db/client.js';
import { ok } from '../../utils/response.js';

const router = Router();
router.use(requireAuth);

// Statuses for the current tenant
router.get('/statuses', async (req, res) => {
  const rows = await query(
    `SELECT id, description, color, sort_order FROM statuses
      WHERE tenant_id = $1 AND is_active = TRUE ORDER BY sort_order, description`,
    [req.user!.tenantId]
  );
  return ok(res, rows);
});

// Shipment types
router.get('/shipment-types', async (req, res) => {
  const rows = await query(
    `SELECT id, description FROM shipment_types WHERE tenant_id = $1 AND is_active = TRUE ORDER BY description`,
    [req.user!.tenantId]
  );
  return ok(res, rows);
});

// Shipment creation types
router.get('/creation-types', async (req, res) => {
  const rows = await query(
    `SELECT id, description FROM shipment_creation_types WHERE tenant_id = $1 AND is_active = TRUE ORDER BY description`,
    [req.user!.tenantId]
  );
  return ok(res, rows);
});

// Countries (shared)
router.get('/countries', async (_req, res) => {
  const rows = await query(
    `SELECT id, code, description FROM countries WHERE is_active = TRUE ORDER BY description`
  );
  return ok(res, rows);
});

// Dashboard stats
router.get('/dashboard', async (req, res) => {
  const tid = req.user!.tenantId;
  const [shipments, bookings, customers, periods] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM shipments WHERE tenant_id = $1`, [tid]),
    query(`SELECT COUNT(*) AS total FROM bookings WHERE tenant_id = $1`, [tid]),
    query(`SELECT COUNT(*) AS total FROM customers WHERE tenant_id = $1`, [tid]),
    query(`SELECT COUNT(*) AS total FROM periods WHERE tenant_id = $1 AND status = 'open'`, [tid]),
  ]);

  const recentShipments = await query(
    `SELECT s.id, s.order_number, s.customer, s.despatch_date, s.created_at,
            st.description AS status, st.color AS status_color
       FROM shipments s
  LEFT JOIN LATERAL (
    SELECT status_id FROM shipment_statuses WHERE shipment_id = s.id ORDER BY created_at DESC LIMIT 1
  ) last ON TRUE
  LEFT JOIN statuses st ON st.id = last.status_id
      WHERE s.tenant_id = $1
   ORDER BY s.created_at DESC
      LIMIT 10`,
    [tid]
  );

  return ok(res, {
    counts: {
      shipments:      parseInt(String((shipments[0] as any).total)),
      bookings:       parseInt(String((bookings[0] as any).total)),
      customers:      parseInt(String((customers[0] as any).total)),
      open_periods:   parseInt(String((periods[0] as any).total)),
    },
    recent_shipments: recentShipments,
  });
});

export default router;
