import { jest } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as fs from "fs";
import * as path from "path";
import { DataSource, QueryRunner } from "typeorm";
import { AppModule } from "../src/app.module";
import { RestoreMissingStockConstraints1792517391166 } from "../src/database/migrations/1792517391166-RestoreMissingStockConstraints";
import { configureTestAppValidation } from "./utils/configure-test-app-validation";

const migration = new RestoreMissingStockConstraints1792517391166();
const rules = [
  ["FK_stock_occurrences_legacy_journal", "stock_occurrences"],
  ["CHK_stock_occurrence_reversal_reason_length", "stock_occurrences"],
  [
    "CHK_stock_batch_consumptions_quantity_positive",
    "stock_batch_consumptions",
  ],
  ["FK_purchase_cost_history_occurrence", "purchase_cost_history"],
] as const;
const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let app: INestApplication;
let ds: DataSource;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  configureTestAppValidation(app);
  await app.init();
  ds = app.get(DataSource);
});
afterAll(async () => {
  await app?.close();
});

async function inTxn(fn: (qr: QueryRunner) => Promise<void>): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await fn(qr);
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }
}

async function catalogSnapshot(qr: QueryRunner) {
  const constraints = await qr.query(`
    SELECT t.relname AS table_name, c.conname, c.convalidated,
           pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.connamespace = 'public'::regnamespace AND t.relname IN
      ('stock_occurrences', 'stock_batch_consumptions', 'purchase_cost_history',
       'stock_movements', 'stock_movement_valuation_gaps')
    ORDER BY t.relname, c.conname`);
  // Capture complete rows as well as counts: a rewrite must not pass unnoticed.
  const rows: Record<string, unknown> = {};
  for (const table of [
    "stock_occurrences",
    "stock_batch_consumptions",
    "purchase_cost_history",
    "stock_movements",
  ]) {
    rows[table] = await qr.query(`SELECT count(*)::text AS count,
      COALESCE(jsonb_agg(t ORDER BY id), '[]'::jsonb) AS rows FROM public.${table} t`);
  }
  return { constraints, rows };
}

async function dropFour(qr: QueryRunner): Promise<void> {
  for (const [name, table] of rules) {
    await qr.query(
      `ALTER TABLE public.${table} DROP CONSTRAINT IF EXISTS "${name}"`,
    );
  }
}

function preflightStatements(): string[] {
  const raw = fs.readFileSync(
    path.join(process.cwd(), "scripts/preflight-stock-constraints-1414.sql"),
    "utf8",
  );
  const withoutComments = raw.replace(/^\s*--.*$/gm, "");
  expect(withoutComments.trim()).toMatch(/^BEGIN READ ONLY;/i);
  expect(withoutComments.trim()).toMatch(/ROLLBACK;$/i);
  assertPreflightReadOnly(withoutComments);
  const code = withoutComments
    .replace(/BEGIN READ ONLY;/i, "")
    .replace(/ROLLBACK;/i, "");
  return code
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function assertPreflightReadOnly(sql: string): void {
  const code = sql
    .replace(/^\s*--.*$/gm, "")
    .replace(/BEGIN READ ONLY;/i, "")
    .replace(/ROLLBACK;/i, "");
  // Definitions contain ON DELETE/UPDATE as string data, not executable SQL.
  expect(code.replace(/'(?:[^']|'')*'/g, "''")).not.toMatch(
    /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|GRANT|COPY)\b/i,
  );
}

async function runPreflight(qr: QueryRunner) {
  const statuses: Record<string, string> = {};
  const details: Record<string, string> = {};
  const violations: Record<string, number> = {};
  let verdict = "";
  for (const statement of preflightStatements()) {
    const rows = await qr.query(statement);
    for (const row of rows) {
      if (row.section === "constraint_status") {
        statuses[row.constraint_name] = row.status;
        details[row.constraint_name] = row.detail;
      }
      if (row.section === "rule_violations")
        violations[row.rule] = Number(row.violations);
      if (row.section === "verdict") verdict = row.verdict;
    }
  }
  expect(Object.keys(statuses)).toHaveLength(4);
  expect(Object.keys(violations)).toHaveLength(4);
  return { statuses, details, violations, verdict };
}

function expectPreflight(
  result: Awaited<ReturnType<typeof runPreflight>>,
  status: string,
) {
  expect(result.statuses).toEqual(
    Object.fromEntries(rules.map(([name]) => [name, status])),
  );
  expect(result.violations).toEqual(
    Object.fromEntries(rules.map(([name]) => [name, 0])),
  );
  expect(result.verdict).toBe("PROCEED");
}

async function seedViolation(qr: QueryRunner, rule: string): Promise<void> {
  if (rule === rules[0][0] || rule === rules[1][0]) {
    await qr.query(
      `INSERT INTO stock_occurrences
      (id, kind, "documentType", "documentId", "occurredAt", "legacyJournalEntryId")
      VALUES ($1, $2, 'purchase_order', $3, now(), $4)`,
      [
        uuid(141401),
        rule === rules[0][0] ? "receipt" : "receipt_reversal",
        uuid(141402),
        rule === rules[0][0] ? uuid(141499) : null,
      ],
    );
    return;
  }
  await qr.query(
    `INSERT INTO categories (id, name, slug) VALUES ($1, 'Constraint test', 'constraint-test-1414')`,
    [uuid(141410)],
  );
  await qr.query(
    `INSERT INTO products (id, name, "baseCost", "categoryId") VALUES ($1, 'Constraint test', 1, $2)`,
    [uuid(141411), uuid(141410)],
  );
  await qr.query(
    `INSERT INTO purchase_cost_history
    (id, "productId", "unitCost", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate", "occurrenceId")
    VALUES ($1, $2, 1, 1, 1, 1, now(), $3)`,
    [uuid(141412), uuid(141411), rule === rules[3][0] ? uuid(141499) : null],
  );
  if (rule === rules[2][0]) {
    await qr.query(
      `INSERT INTO stock_movements
      (id, "productId", "movementType", quantity, "previousBalance", "newBalance")
      VALUES ($1, $2, 'purchase_receipt', 1, 0, 1)`,
      [uuid(141413), uuid(141411)],
    );
    await qr.query(
      `INSERT INTO stock_batch_consumptions
      (id, "movementId", "batchId", quantity, "unitCost", "valueScale8")
      VALUES ($1, $2, $3, 0, 1, 0)`,
      [uuid(141414), uuid(141413), uuid(141412)],
    );
  }
}

describe("restore missing stock constraints (#1414)", () => {
  it("read-only guard rejects a write token", () => {
    expect(() => assertPreflightReadOnly("BEGIN READ ONLY; DELETE FROM x; ROLLBACK;"))
      .toThrow();
  });
  it("preflight queries execute in a read-only transaction", async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query("BEGIN READ ONLY");
      for (const statement of preflightStatements()) {
        const rows = await qr.query(statement);
        if (statement === "SHOW transaction_read_only") {
          expect(rows[0].transaction_read_only).toBe("on");
        }
      }
    } finally {
      await qr.query("ROLLBACK");
      await qr.release();
    }
  });

  it("fresh database: definitions match EXPECTED", async () => {
    await inTxn(async (qr) => {
      const { constraints } = await catalogSnapshot(qr);
      const expected = RestoreMissingStockConstraints1792517391166.EXPECTED;
      expect(
        constraints.filter((c: { conname: string }) =>
          rules.some(([name]) => name === c.conname),
        ),
      ).toEqual(
        expect.arrayContaining(
          expected.map((e) => ({
            table_name: e.table,
            conname: e.name,
            convalidated: true,
            definition: e.definition,
          })),
        ),
      );
    });
  });
  it("fresh database: up() is a no-op", async () => {
    await inTxn(async (qr) => {
      const before = await catalogSnapshot(qr);
      expectPreflight(await runPreflight(qr), "present");
      await migration.up(qr);
      expect(await catalogSnapshot(qr)).toEqual(before);
    });
  });
  it("all four missing: up() adds and validates them", async () => {
    await inTxn(async (qr) => {
      const before = await catalogSnapshot(qr);
      await dropFour(qr);
      expectPreflight(await runPreflight(qr), "absent");
      await migration.up(qr);
      expect(await catalogSnapshot(qr)).toEqual(before);
      expectPreflight(await runPreflight(qr), "present");
    });
  });
  it.each(rules)(
    "a violating row for %s: up() fails and changes nothing",
    async (rule) => {
      await inTxn(async (qr) => {
        await dropFour(qr);
        await seedViolation(qr, rule);
        const before = await catalogSnapshot(qr);
        const result = await runPreflight(qr);
        expect(result.verdict).toBe("HOLD");
        expect(result.violations).toEqual(
          Object.fromEntries(
            rules.map(([name]) => [name, name === rule ? 1 : 0]),
          ),
        );
        await expect(migration.up(qr)).rejects.toThrow(
          new RegExp(`${rule}.*no changes made`, "s"),
        );
        expect(await catalogSnapshot(qr)).toEqual(before);
      });
    },
  );
  it.each([
    [
      rules[2][0],
      "different definition",
      `ALTER TABLE stock_batch_consumptions ADD CONSTRAINT "${rules[2][0]}" CHECK (quantity >= 0)`,
    ],
    [
      rules[3][0],
      "NOT VALID",
      `ALTER TABLE purchase_cost_history ADD CONSTRAINT "${rules[3][0]}" FOREIGN KEY ("occurrenceId") REFERENCES stock_occurrences(id) ON DELETE RESTRICT NOT VALID`,
    ],
    [
      rules[3][0],
      "alternate FK with CASCADE",
      `ALTER TABLE purchase_cost_history ADD CONSTRAINT "FK_other_occurrence" FOREIGN KEY ("occurrenceId") REFERENCES stock_occurrences(id) ON DELETE CASCADE`,
    ],
    [
      rules[1][0],
      "alternate identical CHECK",
      `ALTER TABLE stock_occurrences ADD CONSTRAINT "CHK_other_reason" CHECK ("kind" NOT IN ('receipt_reversal', 'fulfilment_reversal') OR ("reason" IS NOT NULL AND char_length(btrim("reason")) BETWEEN 3 AND 500))`,
    ],
    [
      rules[2][0],
      "same name on another table",
      `ALTER TABLE stock_movement_valuation_gaps ADD CONSTRAINT "${rules[2][0]}" CHECK (quantity > 0)`,
    ],
  ])(
    "conflict %s (%s) fails and changes nothing",
    async (rule, _label, sql) => {
      await inTxn(async (qr) => {
        await dropFour(qr);
        await qr.query(sql);
        const before = await catalogSnapshot(qr);
        const result = await runPreflight(qr);
        expect(result.statuses[rule]).toBe("conflict");
        expect(result.verdict).toBe("HOLD");
        await expect(migration.up(qr)).rejects.toThrow(/no changes made/);
        expect(await catalogSnapshot(qr)).toEqual(before);
      });
    },
  );
  it("same-column CASCADE FK conflicts even when expected FK also exists", async () => {
    await inTxn(async (qr) => {
      await qr.query(
        `ALTER TABLE purchase_cost_history ADD CONSTRAINT "FK_other_occurrence" FOREIGN KEY ("occurrenceId") REFERENCES stock_occurrences(id) ON DELETE CASCADE`,
      );
      const before = await catalogSnapshot(qr);
      const result = await runPreflight(qr);
      expect(result.statuses[rules[3][0]]).toBe("conflict");
      expect(result.details[rules[3][0]]).toBe(
        "equivalent constraint exists under another name",
      );
      expect(result.verdict).toBe("HOLD");
      await expect(migration.up(qr)).rejects.toThrow(
        /FK_purchase_cost_history_occurrence: equivalent constraint exists under another name/,
      );
      expect(await catalogSnapshot(qr)).toEqual(before);
    });
  });
  it("down() issues no statements", async () => {
    await inTxn(async (qr) => {
      const before = await catalogSnapshot(qr);
      const query = jest.spyOn(qr, "query");
      try {
        // Exercise the MigrationInterface call signature while down ignores qr.
        await (migration as import("typeorm").MigrationInterface).down(qr);
        expect(query).not.toHaveBeenCalled();
      } finally {
        query.mockRestore();
      }
      expect(await catalogSnapshot(qr)).toEqual(before);
      expectPreflight(await runPreflight(qr), "present");
    });
  });
});
