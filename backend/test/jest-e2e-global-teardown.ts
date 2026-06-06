import { Client } from "pg";
import * as path from "path";
import * as dotenv from "dotenv";

export default async function globalTeardown() {
  dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } =
    process.env;

  const client = new Client({
    host: DB_HOST || "localhost",
    port: parseInt(DB_PORT || "5432", 10),
    user: DB_USERNAME || "erp_user",
    password: DB_PASSWORD,
    database: "erp_db",
  });

  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${DB_DATABASE}`);
  await client.end();
}
