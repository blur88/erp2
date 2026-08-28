const { Client } = require("pg");
const { execSync } = require("child_process");
const path = require("path");
const dotenv = require("dotenv");

// CJS on purpose: Jest loads globalSetup via require() in its main process.
// The ESM transform (extensionsToTreatAsEsm) must not apply here — a .ts file
// would be compiled CJS by ts-jest yet loaded as ESM by Node, which throws
// "exports is not defined in ES module scope".

module.exports = async function globalSetup() {
  // Load test env vars
  dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } =
    process.env;

  // Connect to default 'postgres' maintenance DB to create erp_db_test
  // Same guard as globalTeardown: DB_DATABASE resolves to the live erp_db if
  // backend/.env wins the dotenv race, and this function drops it outright.
  if (!DB_DATABASE || !DB_DATABASE.endsWith("_test")) {
    throw new Error(
      `Refusing to drop database "${DB_DATABASE}": e2e setup only drops ` +
        `databases whose name ends in "_test". Check backend/.env.test.`,
    );
  }

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
};
