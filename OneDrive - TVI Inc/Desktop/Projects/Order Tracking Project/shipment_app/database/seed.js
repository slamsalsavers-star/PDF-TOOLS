/**
 * Seeds a demo tenant + admin user.
 * Usage: node database/seed.js
 * Safe to re-run (idempotent via ON CONFLICT DO NOTHING).
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

const TENANT_NAME     = process.env.SEED_TENANT_NAME     || 'Demo Company';
const TENANT_SLUG     = process.env.SEED_TENANT_SLUG     || 'demo';
const ADMIN_EMAIL     = process.env.SEED_ADMIN_EMAIL     || 'admin@demo.com';
const ADMIN_PASSWORD  = process.env.SEED_ADMIN_PASSWORD  || 'Admin1234!';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Tenant
  const { rows: [tenant] } = await client.query(`
    INSERT INTO tenants (name, slug, plan)
    VALUES ($1, $2, 'enterprise')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, [TENANT_NAME, TENANT_SLUG]);

  const tenantId = tenant.id;
  console.log(`✓ Tenant "${TENANT_NAME}" (${tenantId})`);

  // Admin role
  const { rows: [role] } = await client.query(`
    INSERT INTO roles (tenant_id, name, is_system)
    VALUES ($1, 'Administrator', TRUE)
    ON CONFLICT (tenant_id, name) DO UPDATE SET is_system = TRUE
    RETURNING id
  `, [tenantId]);

  // Grant all permissions to admin role
  await client.query(`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT $1, id FROM permissions
    ON CONFLICT DO NOTHING
  `, [role.id]);
  console.log(`✓ Administrator role with all permissions`);

  // Viewer role
  const { rows: [viewerRole] } = await client.query(`
    INSERT INTO roles (tenant_id, name, is_system)
    VALUES ($1, 'Viewer', TRUE)
    ON CONFLICT (tenant_id, name) DO UPDATE SET is_system = TRUE
    RETURNING id
  `, [tenantId]);

  // Viewer gets only view permissions
  await client.query(`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT $1, id FROM permissions WHERE action = 'view'
    ON CONFLICT DO NOTHING
  `, [viewerRole.id]);
  console.log(`✓ Viewer role`);

  // Admin user
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await client.query(`
    INSERT INTO users (tenant_id, role_id, email, password_hash, full_name)
    VALUES ($1, $2, $3, $4, 'System Administrator')
    ON CONFLICT (tenant_id, email) DO NOTHING
  `, [tenantId, role.id, ADMIN_EMAIL, hash]);
  console.log(`✓ Admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  // Default statuses
  const defaultStatuses = [
    { description: 'Open',       color: 'blue',   sort_order: 1 },
    { description: 'In Progress',color: 'yellow', sort_order: 2 },
    { description: 'Closed',     color: 'green',  sort_order: 3 },
    { description: 'Cancelled',  color: 'red',    sort_order: 4 },
    { description: 'Rolled',     color: 'purple', sort_order: 5 },
    { description: 'On Hold',    color: 'orange', sort_order: 6 },
  ];
  for (const s of defaultStatuses) {
    await client.query(`
      INSERT INTO statuses (tenant_id, description, color, sort_order)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, description) DO NOTHING
    `, [tenantId, s.description, s.color, s.sort_order]);
  }
  console.log(`✓ Default statuses`);

  // Default shipment creation types
  for (const desc of ['Manual', 'Import', 'API']) {
    await client.query(`
      INSERT INTO shipment_creation_types (tenant_id, description)
      VALUES ($1, $2)
      ON CONFLICT (tenant_id, description) DO NOTHING
    `, [tenantId, desc]);
  }

  // Default shipment types
  for (const desc of ['FCL', 'LCL', 'Air', 'Road', 'Rail']) {
    await client.query(`
      INSERT INTO shipment_types (tenant_id, description)
      VALUES ($1, $2)
      ON CONFLICT (tenant_id, description) DO NOTHING
    `, [tenantId, desc]);
  }
  console.log(`✓ Default shipment types`);

  await client.end();
  console.log('\n✅ Seed complete.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
