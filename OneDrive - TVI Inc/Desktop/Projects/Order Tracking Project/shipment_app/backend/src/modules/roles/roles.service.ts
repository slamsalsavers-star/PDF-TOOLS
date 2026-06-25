import { query, queryOne } from '../../db/client.js';
import { Errors } from '../../utils/errors.js';

export async function list(tenantId: string) {
  return query(
    `SELECT r.id, r.name, r.is_system, r.created_at,
            COUNT(rp.permission_id)::int AS permission_count
       FROM roles r
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.tenant_id = $1
   GROUP BY r.id
   ORDER BY r.name`,
    [tenantId]
  );
}

export async function getById(tenantId: string, id: string) {
  const role = await queryOne(
    `SELECT id, name, is_system, created_at FROM roles WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!role) throw Errors.notFound('Role not found');

  const permissions = await query(
    `SELECT p.id, p.module, p.action
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = $1
   ORDER BY p.module, p.action`,
    [id]
  );

  return { ...role, permissions };
}

export async function create(tenantId: string, data: { name: string; permission_ids?: string[] }) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO roles (tenant_id, name) VALUES ($1, $2) RETURNING id`,
    [tenantId, data.name]
  );

  if (data.permission_ids?.length) {
    await syncPermissions(row.id, data.permission_ids);
  }

  return getById(tenantId, row.id);
}

export async function update(tenantId: string, id: string, data: { name?: string; permission_ids?: string[] }) {
  const role = await getById(tenantId, id);
  if ((role as any).is_system && data.name) throw Errors.forbidden('Cannot rename system roles');

  if (data.name) {
    await query(`UPDATE roles SET name = $1 WHERE id = $2 AND tenant_id = $3`, [data.name, id, tenantId]);
  }

  if (data.permission_ids !== undefined) {
    await syncPermissions(id, data.permission_ids);
  }

  return getById(tenantId, id);
}

export async function remove(tenantId: string, id: string) {
  const role = await getById(tenantId, id);
  if ((role as any).is_system) throw Errors.forbidden('Cannot delete system roles');
  await query(`DELETE FROM roles WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}

export async function allPermissions() {
  return query(`SELECT id, module, action FROM permissions ORDER BY module, action`);
}

async function syncPermissions(roleId: string, permissionIds: string[]) {
  await query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
  if (permissionIds.length === 0) return;
  const values = permissionIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await query(
    `INSERT INTO role_permissions (role_id, permission_id) VALUES ${values}`,
    [roleId, ...permissionIds]
  );
}
