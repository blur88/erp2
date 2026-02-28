import { Client } from 'pg';
import { execSync } from 'child_process';
import * as path from 'path';
import * as dotenv from 'dotenv';

export default async function globalSetup() {
  // Load test env vars
  dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;

  // Connect to default 'postgres' maintenance DB to create erp_db_test
  const client = new Client({
    host: DB_HOST || 'localhost',
    port: parseInt(DB_PORT || '5432', 10),
    user: DB_USERNAME || 'erp_user',
    password: DB_PASSWORD,
    database: 'erp_db', // connect to existing DB to issue CREATE DATABASE
  });

  await client.connect();

  // Drop and recreate to ensure a clean slate on each run
  await client.query(`DROP DATABASE IF EXISTS ${DB_DATABASE}`);
  await client.query(`CREATE DATABASE ${DB_DATABASE} OWNER ${DB_USERNAME}`);

  await client.end();

  // Run migrations against the test DB
  const backendRoot = path.resolve(__dirname, '..');
  execSync('npm run migration:run', {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env }, // .env.test vars already loaded above
  });
}
