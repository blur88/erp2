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

  // Prepare schema on the test DB.
  // Prefer migrations, but fallback to schema sync because this repository's
  // migration set is not bootstrap-safe on an empty database.
  const backendRoot = path.resolve(__dirname, "..");
  try {
    execSync("npm run migration:run", {
      cwd: backendRoot,
      stdio: "inherit",
      env: { ...process.env }, // .env.test vars already loaded above
    });
  } catch (_error) {
    execSync(
      "npm run typeorm -- -d ./src/config/database.config.ts schema:sync",
      {
        cwd: backendRoot,
        stdio: "inherit",
        env: { ...process.env },
      },
    );
  }

  // schema:sync creates the accounting tables but NOT the migration seed, so the
  // preset Chart of Accounts + the singleton accounting_settings row are missing.
  // Every source flow that now posts a journal entry (sales payment/fulfill,
  // purchase pay/receive, stock adjustment) resolves accounts via those settings,
  // so seed them here or those flows throw "Accounting setting 'x' is not configured".
  await seedAccounting({
    host: DB_HOST || "localhost",
    port: parseInt(DB_PORT || "5432", 10),
    user: DB_USERNAME || "erp_user",
    password: DB_PASSWORD,
    database: DB_DATABASE,
  });
}

async function seedAccounting(conn: {
  host: string; port: number; user: string; password?: string; database?: string;
}) {
  const db = new Client(conn);
  await db.connect();
  try {
    const groups: Array<[string, string, string]> = [
      ["1000", "Assets", "Asset"], ["2000", "Liabilities", "Liability"],
      ["3000", "Equity", "Equity"], ["4000", "Income", "Income"],
      ["5000", "Cost of Sales", "Expense"], ["6000", "Expenses", "Expense"],
    ];
    for (const [code, name, type] of groups) {
      await db.query(
        // Pass type as text; Postgres coerces it to the column's enum type, so this
        // does not hardcode the generated enum type name.
        `INSERT INTO "chart_of_account" ("code","name","type","isSystem","isPostable")
         VALUES ($1,$2,$3,true,false)
         ON CONFLICT ("code") DO NOTHING`,
        [code, name, type],
      );
    }
    const children: Array<[string, string, string, string]> = [
      ["1100", "Cash", "Asset", "1000"], ["1200", "Bank", "Asset", "1000"],
      ["1300", "Inventory", "Asset", "1000"], ["1400", "Supplier Deposit", "Asset", "1000"],
      ["2100", "Customer Deposit", "Liability", "2000"],
      ["3100", "Owner Capital", "Equity", "3000"], ["3200", "Opening Balance Equity", "Equity", "3000"],
      ["4100", "Sales Revenue", "Income", "4000"],
      ["5100", "Cost of Goods Sold", "Expense", "5000"],
      ["6990", "Other Expenses", "Expense", "6000"],
    ];
    for (const [code, name, type, parentCode] of children) {
      await db.query(
        `INSERT INTO "chart_of_account" ("code","name","type","parentId","isSystem","isPostable")
         VALUES ($1,$2,$3,
                 (SELECT "id" FROM "chart_of_account" WHERE "code"=$4), true, true)
         ON CONFLICT ("code") DO NOTHING`,
        [code, name, type, parentCode],
      );
    }
    await db.query(
      `INSERT INTO "accounting_settings"
        ("id","cashAccountId","bankAccountId","inventoryAccountId","supplierDepositAccountId",
         "customerDepositAccountId","openingBalanceEquityAccountId","salesRevenueAccountId",
         "cogsAccountId","defaultExpenseAccountId")
       SELECT true,
        (SELECT id FROM chart_of_account WHERE code='1100'),
        (SELECT id FROM chart_of_account WHERE code='1200'),
        (SELECT id FROM chart_of_account WHERE code='1300'),
        (SELECT id FROM chart_of_account WHERE code='1400'),
        (SELECT id FROM chart_of_account WHERE code='2100'),
        (SELECT id FROM chart_of_account WHERE code='3200'),
        (SELECT id FROM chart_of_account WHERE code='4100'),
        (SELECT id FROM chart_of_account WHERE code='5100'),
        (SELECT id FROM chart_of_account WHERE code='6990')
       ON CONFLICT ("id") DO NOTHING`,
    );
    // 'Journal Entries' + 'Vendor Payments'/'Stock Adjustment' doc-number rows
    // may be absent under schema:sync; ensure JE numbering works.
    await db.query(
      `INSERT INTO "document_number_settings" ("documentName","prefix","paddingDigits","nextNumber","lastResetYear")
       VALUES ('Journal Entries','JE',3,1, EXTRACT(YEAR FROM now())::int % 100)
       ON CONFLICT ("documentName") DO NOTHING`,
    );
  } finally {
    await db.end();
  }
}
