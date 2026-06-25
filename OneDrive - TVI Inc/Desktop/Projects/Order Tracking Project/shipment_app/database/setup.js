/**
 * Database setup — creates DB if needed, runs all migrations in order.
 * Usage: node database/setup.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

// ─── Ensure the database exists ──────────────────────────────────────────────
async function ensureDatabase() {
  const url     = new URL(DATABASE_URL);
  const dbName  = url.pathname.slice(1);
  url.pathname  = '/postgres';

  const client = new Client({ connectionString: url.toString() });
  await client.connect();

  const { rows } = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
  );

  if (rows.length === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✓ Database "${dbName}" created`);
  } else {
    console.log(`✓ Database "${dbName}" exists`);
  }
  await client.end();
}

// ─── Migration tracker ────────────────────────────────────────────────────────
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(client) {
  const { rows } = await client.query('SELECT filename FROM _migrations ORDER BY id');
  return new Set(rows.map(r => r.filename));
}

// ─── Run migrations ───────────────────────────────────────────────────────────
async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  await ensureMigrationsTable(client);
  const applied = await getApplied(client);

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ─ ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(`INSERT INTO _migrations (filename) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      console.log(`  ✓ ${file}`);
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ ${file}: ${err.message}`);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log(`\nMigrations complete. ${ran} new file(s) applied.`);
}

// ─── Seed permissions ─────────────────────────────────────────────────────────
async function seedPermissions() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const modules = [
    'shipments', 'bookings', 'customers', 'forwarders',
    'shipping_lines', 'periods', 'facilities',
    'users', 'roles', 'settings',
  ];
  const actions = ['view', 'create', 'edit', 'delete'];

  for (const module of modules) {
    for (const action of actions) {
      await client.query(`
        INSERT INTO permissions (module, action)
        VALUES ($1, $2)
        ON CONFLICT (module, action) DO NOTHING
      `, [module, action]);
    }
  }

  await client.end();
  console.log('✓ Permissions seeded');
}

async function main() {
  console.log('\n🚀 ShipmentMS — Database Setup\n');
  await ensureDatabase();
  await runMigrations();
  await seedPermissions();
  console.log('\n✅ Setup complete.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
