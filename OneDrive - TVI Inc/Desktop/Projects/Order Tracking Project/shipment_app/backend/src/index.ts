import { env } from './config/env.js';
import { pool } from './db/client.js';
import app from './app.js';

async function main() {
  // verify DB connection
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  console.log('✓ Database connected');

  app.listen(env.PORT, () => {
    console.log(`✓ API listening on http://localhost:${env.PORT}`);
    console.log(`  Mode: ${env.NODE_ENV}`);
  });
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
