import { Client } from "pg";
import * as path from "path";
import * as dotenv from "dotenv";

export default async function globalTeardown() {
  dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } =
    process.env;

  // Never drop a database this run did not create. DB_DATABASE is only the
  // test database when .env.test wins the dotenv race against backend/.env,
  // which sets DB_DATABASE=erp_db — the live database. Refuse anything that is
  // not explicitly a test database rather than trusting env resolution.
  if (!DB_DATABASE || !DB_DATABASE.endsWith("_test")) {
    throw new Error(
      `Refusing to drop database "${DB_DATABASE}": e2e teardown only drops ` +
        `databases whose name ends in "_test". Check backend/.env.test.`,
    );
  }

  const client = new Client({
    host: DB_HOST || "localhost",
    port: parseInt(DB_PORT || "5432", 10),
    user: DB_USERNAME || "erp_user",
    password: DB_PASSWORD,
    // Maintenance DB, mirroring globalSetup: connecting to erp_db held an open
    // session on the live database and cannot drop the DB it is connected to.
    database: "postgres",
  });

  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${DB_DATABASE}`);
  await client.end();
}
