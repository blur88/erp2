import { Client } from "pg";
import { execSync } from "child_process";
import * as path from "path";
import * as dotenv from "dotenv";

export default async function globalSetup() {
  // Load test env vars
  dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } =
    process.env;

  // Connect to default 'postgres' maintenance DB to create erp_db_test
  const client = new Client({
    host: DB_HOST || "localhost",
    port: parseInt(DB_PORT || "5432", 10),
    user: DB_USERNAME || "erp_user",
    password: DB_PASSWORD,
    database: "postgres", // connect to maintenance DB — cannot drop the DB you're connected to
  });

  await client.connect();

  // Drop and recreate to ensure a clean slate on each run
  await client.query(`DROP DATABASE IF EXISTS ${DB_DATABASE}`);
  await client.query(`CREATE DATABASE ${DB_DATABASE} OWNER ${DB_USERNAME}`);
  await client.query(`ALTER DATABASE ${DB_DATABASE} SET timezone = 'America/Los_Angeles'`);

  await client.end();

  // Migrations are the only schema path — no schema:sync fallback. Genesis
  // seeds the chart of accounts, accounting_settings, and document number
  // settings, so seedAccounting() is no longer needed.
  const backendRoot = path.resolve(__dirname, "..");
  execSync("npm run migration:run", {
    cwd: backendRoot,
    stdio: "inherit",
    env: { ...process.env },
  });
}
