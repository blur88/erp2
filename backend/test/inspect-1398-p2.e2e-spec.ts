import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import {
  insertFixtureRow,
  D1_VIOLATIONS,
  expectD1,
  metric,
  PRE_3_25_FIXTURE,
  parseInspectionOutput,
  runInspection,
  S12_METRICS,
  seedProductRows,
  withFixtureSchema,
} from './utils/inspect-1398-p2-harness';

dotenv.config({
  path: fileURLToPath(new URL('../.env.test', import.meta.url)),
  quiet: true,
});

const scriptPath = fileURLToPath(new URL('../scripts/inspect-1398-p2.sql', import.meta.url));

const inventoryAccountId = '00000000-0000-4000-8000-000000000010';
const receiptProductP = '00000000-0000-4000-8000-0000000000a1';
const receiptProductQ = '00000000-0000-4000-8000-0000000000a2';

async function seedCleanReceipt(schema: string, db: Client, version: number | null = 1) {
  const po = await insertFixtureRow(schema, db, 'purchase_orders', {
    orderNumber: `PO-${Math.random().toString(36).slice(2, 10)}`, orderDate: '2026-01-01',
    supplierId: '00000000-0000-4000-8000-000000000001', status: 'RECEIVED',
  });
  const p = await insertFixtureRow(schema, db, 'purchase_order_items', {
    purchaseOrderId: po.id, productId: receiptProductP, lineNumber: 1, quantity: 2, unitCost: 1,
  });
  const q = await insertFixtureRow(schema, db, 'purchase_order_items', {
    purchaseOrderId: po.id, productId: receiptProductQ, lineNumber: 2, quantity: 3, unitCost: 2,
  });
  const occurrence = await insertFixtureRow(schema, db, 'stock_occurrences', {
    kind: 'receipt', documentType: 'purchase_order', documentId: po.id,
    occurredAt: '2026-01-01T00:00:00Z', receiptEvidenceVersion: version,
  });
  const movementP = await insertFixtureRow(schema, db, 'stock_movements', {
    movementType: 'purchase_receipt', quantity: 2, previousBalance: 0, newBalance: 2,
    productId: receiptProductP, occurrenceId: occurrence.id, purchaseOrderItemId: p.id,
    referenceType: 'purchase_order', referenceId: po.id, unitValue: 1, totalValue: 2,
  });
  const movementQ = await insertFixtureRow(schema, db, 'stock_movements', {
    movementType: 'purchase_receipt', quantity: 3, previousBalance: 0, newBalance: 3,
    productId: receiptProductQ, occurrenceId: occurrence.id, purchaseOrderItemId: q.id,
    referenceType: 'purchase_order', referenceId: po.id, unitValue: 2, totalValue: 6,
  });
  const batchP = await insertFixtureRow(schema, db, 'purchase_cost_history', {
    productId: receiptProductP, purchaseOrderId: po.id, unitCost: 1, landedCost: 1,
    receivedQuantity: 2, remainingQuantity: 2, receivedDate: '2026-01-01T00:00:00Z',
    occurrenceId: occurrence.id, purchaseOrderItemId: p.id,
  });
  const batchQ = await insertFixtureRow(schema, db, 'purchase_cost_history', {
    productId: receiptProductQ, purchaseOrderId: po.id, unitCost: 2, landedCost: 2,
    receivedQuantity: 3, remainingQuantity: 3, receivedDate: '2026-01-01T00:00:00Z',
    occurrenceId: occurrence.id, purchaseOrderItemId: q.id,
  });
  return { po, p, q, occurrence, movementP, movementQ, batchP, batchQ };
}

async function seedInventoryAccount(schema: string, db: Client, rows = 1): Promise<void> {
  await insertFixtureRow(schema, db, 'chart_of_account', {
    id: inventoryAccountId, code: '1300', name: 'Inventory', type: 'Asset', openingBalance: 0,
  });
  for (let i = 0; i < rows; i += 1) {
    await insertFixtureRow(schema, db, 'accounting_settings', {
      id: i === 0, cashAccountId: inventoryAccountId, bankAccountId: inventoryAccountId,
      inventoryAccountId, supplierDepositAccountId: inventoryAccountId,
      customerDepositAccountId: inventoryAccountId, openingBalanceEquityAccountId: inventoryAccountId,
      ownerCapitalAccountId: inventoryAccountId, ownerDrawingsAccountId: inventoryAccountId,
      salesRevenueAccountId: inventoryAccountId, cogsAccountId: inventoryAccountId,
      defaultExpenseAccountId: inventoryAccountId,
    });
  }
}

async function seedBatch(
  schema: string,
  db: Client,
  row: { productId: string; quantity: string | null; unitCost: string; landedCost: string | null; deletedAt?: string },
): Promise<Record<string, string>> {
  return insertFixtureRow(schema, db, 'purchase_cost_history', {
    productId: row.productId, unitCost: row.unitCost, landedCost: row.landedCost,
    receivedQuantity: row.quantity ?? '0', remainingQuantity: row.quantity,
    receivedDate: '2026-01-01', ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
  });
}


describe('inspect 1398 project 2', () => {
  it('psql container reaches the e2e database', () => {
    const output = execFileSync(
      'docker',
      [
        'run', '--rm', '--network', 'host', '-e', 'PGPASSWORD',
        'postgres:18.3-alpine3.23', 'psql', '-X', '-At',
        '-h', process.env.DB_HOST || 'localhost',
        '-p', process.env.DB_PORT || '5432',
        '-U', process.env.DB_USERNAME || 'erp_user',
        '-d', process.env.DB_DATABASE || 'erp_db_test',
        '-c', 'select current_database()',
      ],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD } },
    );
    expect(output.trim()).toBe('erp_db_test');
  });

  it('parser identifies empty sets by marker and reads multiline fields', () => {
    const input =
      '@@inspect-section empty\nsection,metric,value,note\n' +
      '@@inspect-section details\nsection,metric,value,note\n' +
      'details,count,1,"comma, doubled ""quote"" and\nnewline"\n' +
      '@@inspect-end\n';
    const sets = parseInspectionOutput(input);

    expect(sets).toHaveLength(2);
    expect(sets[0]).toEqual({
      section: 'empty',
      columns: ['section', 'metric', 'value', 'note'],
      rows: [],
    });
    expect(sets[1].rows[0].note).toBe('comma, doubled "quote" and\nnewline');
    expect(() => parseInspectionOutput(input.replace('@@inspect-end\n', ''))).toThrow(
      /@@inspect-end/,
    );
  });

  it('script text is read-only', () => {
    const sql = readFileSync(scriptPath, 'utf8');
    const code = sql.replace(/^\s*--.*$/gm, '');

    expect(code).toContain('BEGIN READ ONLY;');
    expect(code).toContain('ROLLBACK;');
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|COPY|GRANT)\b/i);
  });

  it('script never names the public schema', () => {
    const code = readFileSync(scriptPath, 'utf8').replace(/^\s*--.*$/gm, '');
    expect(code).not.toMatch(/'public'|\bpublic\./i);
  });

  it('missing run metadata fails non-zero', async () => {
    for (const name of ['app_version', 'image_id', 'env_label', 'script_sha'] as const) {
      const result = await runInspection({ vars: { [name]: undefined } });
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('missing run metadata');
    }
  });

  it('s01 reports database-derived and operator-supplied metadata', async () => {
    const result = await runInspection();
    const set = result.sets.find((candidate) => candidate.section === 's01_environment');
    const names = [
      'database',
      'migrations_applied',
      'latest_migration',
      'server_version',
      'run_at',
      'app_version',
      'image_id',
      'env_label',
      'script_sha',
    ];
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USERNAME || 'erp_user',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE || 'erp_db_test',
      });
    await client.connect();
    const { rows } = await client.query('SELECT count(*)::text AS count FROM public.migrations');
    await client.end();
    const migrationCount = rows[0].count as string;

    expect(result.code).toBe(0);
    expect(names.every((name) => metric(result.sets, 's01_environment', name) !== undefined)).toBe(
      true,
    );
    expect(metric(result.sets, 's01_environment', 'migrations_applied')).toBe(migrationCount);
    for (const name of ['app_version', 'image_id', 'env_label', 'script_sha']) {
      expect(set?.rows.find((row) => row.metric === name)?.note).toBe('operator-supplied');
    }
  });

  it('the complete empty baseline runs', async () => {
    await withFixtureSchema({}, async (schema) => {
      const result = await runInspection({ schema });
      expect(result.code).toBe(0);
      expect(result.sets.map((set) => set.section)).toContain('s01_environment');
      expect(metric(result.sets, 's01_environment', 'migrations_applied')).toBe('0');
    });
  });

  it('fixture isolation: an omitted table is not read from the real schema', async () => {
    await withFixtureSchema({ incomplete: true, tables: [] }, async (schema) => {
      const result = await runInspection({ schema });
      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(/relation "migrations" does not exist/);
    });
  });

  it('s02 discovery sees only the fixture schema', async () => {
    const real = await runInspection();
    await withFixtureSchema({ omitTables: ['price_list_items'] }, async (schema, db) => {
      const fixture = await runInspection({ schema });
      const { rows } = await db.query(
        "SELECT to_regclass('public.price_list_items') IS NOT NULL AS exists",
      );
      expect(Number(metric(fixture.sets, 's02_soft_deleted_inactive', 'tables_discovered'))).toBe(
        Number(metric(real.sets, 's02_soft_deleted_inactive', 'tables_discovered')) - 1,
      );
      expect(
        fixture.sets
          .find((set) => set.section === 's02_soft_deleted_inactive')
          ?.rows.some((row) => row.metric.startsWith('price_list_items.')),
      ).toBe(false);
      expect(rows[0].exists).toBe(true);
    });
  });

  it('s02 counts soft-deleted and inactive rows', async () => {
    await withFixtureSchema(
      {
        seed: (schema, db) =>
          seedProductRows(schema, db, [
            { name: 'live' },
            { name: 'deleted', deletedAt: '2026-01-01T00:00:00Z' },
            { name: 'inactive', isActive: false },
            { name: 'deleted-inactive', deletedAt: '2026-01-01T00:00:00Z', isActive: false },
          ]),
      },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's02_soft_deleted_inactive', 'products.total')).toBe('4');
        expect(metric(result.sets, 's02_soft_deleted_inactive', 'products.soft_deleted')).toBe('2');
        expect(metric(result.sets, 's02_soft_deleted_inactive', 'products.inactive')).toBe('2');
        expect(
          metric(result.sets, 's02_soft_deleted_inactive', 'products.soft_deleted_and_inactive'),
        ).toBe('1');
        const row = result.sets
          .find((set) => set.section === 's02_soft_deleted_inactive')
          ?.rows.find((item) => item.metric === 'products.total');
        expect(row?.note).toBe('business');
      },
    );
  });

  it('s02 flags an unclassified table', async () => {
    await withFixtureSchema(
      { extraDdl: ['CREATE TABLE zz_new (id uuid, "deletedAt" timestamptz)'] },
      async (schema) => {
        const result = await runInspection({ schema });
        const row = result.sets
          .find((set) => set.section === 's02_soft_deleted_inactive')
          ?.rows.find((item) => item.metric === 'zz_new.total');
        expect(row?.note).toBe('unknown — needs classification');
        expect(metric(result.sets, 's02_soft_deleted_inactive', 'tables_unclassified')).toBe('1');
      },
    );
  });

  it('classification guard: every migrated table is classified', async () => {
    const result = await runInspection();
    expect(metric(result.sets, 's02_soft_deleted_inactive', 'tables_unclassified')).toBe('0');
  });


  it('s03 counts payment statuses and soft-deleted rows', async () => {
    await withFixtureSchema(
      {
        seed: async (schema, db) => {
          for (const row of [
            { status: 'completed' },
            { status: 'completed' },
            { status: 'voided' },
            { status: 'pending', deletedAt: '2026-01-01T00:00:00Z' },
          ]) {
            await insertFixtureRow(schema, db, 'vendor_payments', {
              supplierId: '00000000-0000-4000-8000-000000000001',
              paymentDate: '2026-01-01',
              ...row,
            });
          }
        },
      },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's03_vendor_payments', 'status.completed')).toBe('2');
        expect(metric(result.sets, 's03_vendor_payments', 'status.voided')).toBe('1');
        expect(metric(result.sets, 's03_vendor_payments', 'soft_deleted')).toBe('1');
      },
    );
  });

  it('s04 reports each active costing method and unavailable history', async () => {
    await withFixtureSchema(
      {
        seed: async (schema, db) => {
          await insertFixtureRow(schema, db, 'regional_settings', {
            costingMethod: 'AVERAGE', createdAt: '2026-01-01T00:00:00Z',
          });
          await insertFixtureRow(schema, db, 'regional_settings', {
            costingMethod: 'FIFO', createdAt: '2026-01-02T00:00:00Z',
          });
        },
      },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's04_costing_method', 'active_settings_rows')).toBe('2');
        expect(metric(result.sets, 's04_costing_method', 'costing_method.1')).toBe('AVERAGE');
        expect(metric(result.sets, 's04_costing_method', 'costing_method.2')).toBe('FIFO');
        const history = result.sets
          .find((set) => set.section === 's04_costing_method')
          ?.rows.find((row) => row.metric === 'costing_change_history');
        expect(history?.value).toBe('unavailable');
        expect(history?.note).toBe(
          'unavailable audit evidence: regional settings updates write no audit log',
        );
      },
    );
  });

  it('s04 detects audit rows that mention a costing method change', async () => {
    await withFixtureSchema(
      {
        seed: (schema, db) =>
          insertFixtureRow(schema, db, 'audit_logs', {
            userId: 'test-user', action: 'UPDATE', entityType: 'settings', description: 'settings updated',
            newValues: { costingMethod: 'FIFO' },
          }).then(() => undefined),
      },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(
          metric(result.sets, 's04_costing_method', 'audit_rows_mentioning_costing_method'),
        ).toBe('1');
      },
    );
  });

  it('s07 keeps owner drawing reversal evidence separate from document status', async () => {
    await withFixtureSchema(
      {
        seed: async (schema, db) => {
          const doc = await insertFixtureRow(schema, db, 'owner_equity_documents', {
            referenceNumber: 'OE-1', equityDate: '2026-01-01', type: 'STOCK_DRAWING',
            description: 'stock draw', documentStatus: 'DRAFT',
            productId: '00000000-0000-4000-8000-000000000001', quantity: 1,
          });
          for (const movementType of ['owner_drawing', 'owner_drawing_reversal']) {
            await insertFixtureRow(schema, db, 'stock_movements', {
              movementType, quantity: 1, previousBalance: 1, newBalance: 2,
              productId: '00000000-0000-4000-8000-000000000001',
              referenceType: 'owner_equity', referenceId: doc.id,
            });
          }
          const original = await insertFixtureRow(schema, db, 'journal_entry', {
            journalNo: 'JE-OE-1', entryDate: '2026-01-01', sourceType: 'OWNER_EQUITY',
            postingType: 'OWNER_STOCK_DRAWING', sourceDocumentId: doc.id,
          });
          await insertFixtureRow(schema, db, 'journal_entry', {
            journalNo: 'JE-OE-2', entryDate: '2026-01-01', sourceType: 'OWNER_EQUITY',
            postingType: 'OWNER_STOCK_DRAWING', sourceDocumentId: doc.id, reversalOfEntryId: original.id,
          });
        },
      },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's07_undo_counts', 'completed_owner_stock_drawings')).toBe('0');
        expect(metric(result.sets, 's07_undo_counts', 'owner_drawing_reversal_movements')).toBe('1');
        expect(
          metric(result.sets, 's07_undo_counts', 'owner_stock_drawing_journal_reversals'),
        ).toBe('1');
      },
    );
  });

  it('s03 s04 and s07 expose every pinned metric on an empty baseline', async () => {
    await withFixtureSchema({}, async (schema) => {
      const result = await runInspection({ schema });
      const metrics = new Set(result.sets.flatMap((set) => set.rows.map((row) => row.metric)));
      for (const name of [
        'status.completed', 'status.voided', 'soft_deleted', 'total',
        'settings_rows', 'active_settings_rows', 'audit_rows_mentioning_costing_method', 'costing_change_history',
        'fulfilled_sales_orders', 'received_purchase_orders', 'completed_stock_adjustments',
        'reverted_stock_adjustments', 'completed_owner_stock_drawings', 'owner_drawing_reversal_movements',
        'owner_stock_drawing_journal_reversals',
      ]) {
        expect(metrics.has(name)).toBe(true);
      }
    });
  });


  it('s05 compares live stock with purchase batches and includes soft-deleted products', async () => {
    await withFixtureSchema(
      {
        seed: async (schema, db) => {
          await seedProductRows(schema, db, [
            { name: 'A', stockQuantity: '8' }, { name: 'B', stockQuantity: '0' },
            { name: 'C', stockQuantity: '5' },
            { name: 'D', stockQuantity: '2', deletedAt: '2026-01-01T00:00:00Z' },
          ]);
          const products = await db.query('SELECT id, name FROM products ORDER BY name');
          const byName = Object.fromEntries(products.rows.map((row) => [row.name, row.id]));
          await seedBatch(schema, db, { productId: byName.A, quantity: '6', unitCost: '10', landedCost: '10' });
          await seedBatch(schema, db, { productId: byName.D, quantity: '2', unitCost: '10', landedCost: '10' });
        },
      },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's05_product_batches', 'stock_exceeds_batches')).toBe('1');
        expect(metric(result.sets, 's05_product_batches', 'stock_without_batches')).toBe('1');
        expect(metric(result.sets, 's05_product_batches', 'soft_deleted_products_flagged')).toBe('1');
        expect(metric(result.sets, 's05_product_batches', 'total_batch_value')).toBe('80.0000');
      },
    );
  });

  it('s05 keeps unknown batch costs out of value totals and marks them incomplete', async () => {
    await withFixtureSchema(
      {
        extraDdl: ['ALTER TABLE purchase_cost_history ALTER COLUMN "landedCost" DROP NOT NULL'],
        seed: async (schema, db) => {
          await seedProductRows(schema, db, [{ name: 'Unknown cost', stockQuantity: '10' }]);
          const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
          await seedBatch(schema, db, { productId, quantity: '4', unitCost: '10', landedCost: null });
          await seedBatch(schema, db, { productId, quantity: '6', unitCost: '10', landedCost: '10' });
        },
      },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's05_product_batches', 'unknown_cost_batches')).toBe('1');
        expect(metric(result.sets, 's05_product_batches', 'unknown_cost_quantity')).toBe('4.0000');
        expect(metric(result.sets, 's05_product_batches', 'total_batch_value')).toBe('60.0000');
        expect(metric(result.sets, 's05_product_batches', 'total_batch_value_complete')).toBe('false');
        expect(
          result.sets.find((set) => set.section === 's05_product_batches')?.rows
            .find((row) => row.metric === 'total_batch_value')?.note,
        ).toMatch(/^incomplete:/);
        expect(result.sets.find((set) => set.section === 's05_product_batches_detail')
          ?.rows[0].batch_value_complete).toBe('false');
      },
    );
  });

  it('s05 treats a known zero cost as valued', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedProductRows(schema, db, [{ name: 'Zero cost', stockQuantity: '1' }]);
        const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
        await seedBatch(schema, db, { productId, quantity: '1', unitCost: '0', landedCost: '0' });
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's05_product_batches', 'zero_cost_batches')).toBe('1');
        expect(metric(result.sets, 's05_product_batches', 'unknown_cost_batches')).toBe('0');
        expect(metric(result.sets, 's05_product_batches', 'total_batch_value_complete')).toBe('true');
      },
    );
  });

  it('s05 excludes soft-deleted batches from live totals', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedProductRows(schema, db, [{ name: 'Deleted batch', stockQuantity: '0' }]);
        const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
        await seedBatch(schema, db, {
          productId, quantity: '7', unitCost: '5', landedCost: '5', deletedAt: '2026-01-01T00:00:00Z',
        });
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's05_product_batches', 'soft_deleted_batches')).toBe('1');
        expect(metric(result.sets, 's05_product_batches', 'total_batch_quantity')).toBe('0.0000');
        expect(metric(result.sets, 's05_product_batches', 'total_batch_value')).toBe('0.0000');
      },
    );
  });

  it('s06 compares inventory ledger balance to batch value', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedInventoryAccount(schema, db);
        await seedProductRows(schema, db, [{ name: 'Ledger product', stockQuantity: '8' }]);
        const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
        await seedBatch(schema, db, { productId, quantity: '8', unitCost: '10', landedCost: '10' });
        for (const [number, posting, debit, credit, deletedAt] of [
          ['JE-100', 'SALES_PAYMENT', '100', '0', null],
          ['JE-101', 'SALES_PAYMENT', '0', '15', null],
          ['JE-102', 'SALES_PAYMENT', '999', '0', '2026-01-01T00:00:00Z'],
        ]) {
          const entry = await insertFixtureRow(schema, db, 'journal_entry', {
            journalNo: number, entryDate: '2026-01-01', sourceType: 'SALES_ORDER', postingType: posting,
          });
          await insertFixtureRow(schema, db, 'journal_entry_line', {
            entryId: entry.id, accountId: inventoryAccountId, debit, credit, deletedAt,
          });
        }
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's06_inventory_ledger', 'ledger_balance')).toBe('85.00');
        expect(metric(result.sets, 's06_inventory_ledger', 'difference')).toBe('5.00');
        expect(result.sets.find((set) => set.section === 's06_inventory_ledger')
          ?.rows.find((row) => row.metric === 'difference')?.note).toBe('ledger − batches');
      },
    );
  });

  it('s06 refuses to select an inventory account when settings are not singular', async () => {
    await withFixtureSchema(
      { seed: (schema, db) => seedInventoryAccount(schema, db, 2) },
      async (schema) => {
        const result = await runInspection({ schema });
        const ledger = result.sets.find((set) => set.section === 's06_inventory_ledger');
        expect(metric(result.sets, 's06_inventory_ledger', 'ledger_balance')).toBe('n/a');
        expect(ledger?.rows.find((row) => row.metric === 'ledger_balance')?.note)
          .toBe('accounting_settings is not a single row');
      },
    );
  });

  it('s06 labels the ledger comparison incomplete when batches have unknown costs', async () => {
    await withFixtureSchema(
      { extraDdl: ['ALTER TABLE purchase_cost_history ALTER COLUMN "landedCost" DROP NOT NULL'], seed: async (schema, db) => {
        await seedInventoryAccount(schema, db);
        await seedProductRows(schema, db, [{ name: 'Unknown cost', stockQuantity: '4' }]);
        const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
        await seedBatch(schema, db, { productId, quantity: '4', unitCost: '10', landedCost: null });
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's06_inventory_ledger', 'difference_complete')).toBe('false');
        const note = result.sets.find((set) => set.section === 's06_inventory_ledger')
          ?.rows.find((row) => row.metric === 'difference')?.note;
        expect(note).toContain('ledger − batches');
        expect(note).toContain('incomplete:');
      },
    );
  });

  it('s06 reports opening balance fields and opening journal lines separately', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedInventoryAccount(schema, db);
        const entry = await insertFixtureRow(schema, db, 'journal_entry', {
          journalNo: 'JE-OPEN', entryDate: '2026-01-01', sourceType: 'OPENING_BALANCE', postingType: 'OPENING_BALANCE',
        });
        await insertFixtureRow(schema, db, 'journal_entry_line', {
          entryId: entry.id, accountId: inventoryAccountId, debit: '40', credit: '0',
        });
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's06_inventory_ledger', 'opening_balance_entries')).toBe('1');
        expect(metric(result.sets, 's06_inventory_ledger', 'opening_balance_lines_sum')).toBe('40.00');
        expect(metric(result.sets, 's06_inventory_ledger', 'opening_balance_field')).toBe('0.00');
      },
    );
  });


  it('s05 keeps products with unknown batch quantity and marks value incomplete', async () => {
    await withFixtureSchema(
      { extraDdl: ['ALTER TABLE purchase_cost_history ALTER COLUMN "remainingQuantity" DROP NOT NULL'],
        seed: async (schema, db) => {
          await seedProductRows(schema, db, [{ name: 'Unknown quantity', stockQuantity: '2' }]);
          const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
          await seedBatch(schema, db, { productId, quantity: null, unitCost: '10', landedCost: '10' });
        } },
      async (schema) => {
        const result = await runInspection({ schema });
        const details = result.sets.find((set) => set.section === 's05_product_batches_detail')?.rows ?? [];
        expect(details).toHaveLength(1);
        expect(details[0].batch_value_complete).toBe('false');
        expect(metric(result.sets, 's05_product_batches', 'total_batch_quantity')).toBe('0.0000');
        expect(metric(result.sets, 's05_product_batches', 'total_batch_value_complete')).toBe('false');
        expect(result.sets.find((set) => set.section === 's05_product_batches')?.rows
          .find((row) => row.metric === 'total_batch_value')?.note).toContain('unknown quantity');
      },
    );
  });

  it('s06 leaves a NULL opening balance visibly unknown', async () => {
    await withFixtureSchema(
      { extraDdl: ['ALTER TABLE chart_of_account ALTER COLUMN "openingBalance" DROP NOT NULL'],
        seed: async (schema, db) => {
          await seedInventoryAccount(schema, db);
          await db.query('UPDATE chart_of_account SET "openingBalance" = NULL WHERE id = $1', [inventoryAccountId]);
        } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's06_inventory_ledger', 'opening_balance_field')).toBe('n/a');
        expect(result.sets.find((set) => set.section === 's06_inventory_ledger')?.rows
          .find((row) => row.metric === 'opening_balance_field')?.note).toBe('opening balance field is NULL');
      },
    );
  });


  it('s05 and s06 expose every pinned metric on an empty baseline', async () => {
    await withFixtureSchema({}, async (schema) => {
      const result = await runInspection({ schema });
      const metricsBySection = new Map(
        result.sets.map((set) => [set.section, new Set(set.rows.map((row) => row.metric))]),
      );
      for (const name of [
        'products_with_stock_or_batches', 'stock_exceeds_batches', 'batches_exceed_stock',
        'stock_without_batches', 'soft_deleted_products_flagged', 'zero_cost_batches',
        'unknown_cost_batches', 'unknown_cost_quantity', 'total_batch_quantity',
        'total_batch_value', 'total_batch_value_complete', 'soft_deleted_batches',
        'soft_deleted_batches.quantity', 'soft_deleted_batches.value',
      ]) {
        expect(metricsBySection.get('s05_product_batches')?.has(name)).toBe(true);
      }
      for (const name of [
        'accounting_settings_rows', 'inventory_account_id', 'inventory_account_code', 'ledger_balance',
        'batch_value', 'difference', 'difference_complete', 'opening_balance_field',
        'opening_balance_entries', 'opening_balance_lines_sum', 'inventory_account_has_children',
      ]) {
        expect(metricsBySection.get('s06_inventory_ledger')?.has(name)).toBe(true);
      }
    });
  });


  it('s08 recognizes initial stock as a workflow movement', async () => {
    await withFixtureSchema(
      { seed: (schema, db) => insertFixtureRow(schema, db, 'stock_movements', {
        movementType: 'initial_stock', quantity: 3, previousBalance: 0, newBalance: 3,
        productId: inventoryAccountId, referenceType: 'initial_stock',
      }).then(() => undefined) },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's08_outside_workflows', 'unrecognized_pairs')).toBe('0');
      },
    );
  });

  it('s08 treats reference type comparison as exact', async () => {
    await withFixtureSchema(
      { seed: (schema, db) => insertFixtureRow(schema, db, 'stock_movements', {
        movementType: 'sale', quantity: -1, previousBalance: 1, newBalance: 0,
        productId: inventoryAccountId, referenceType: 'Sales_Order', referenceId: inventoryAccountId,
      }).then(() => undefined) },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's08_outside_workflows', 'unrecognized_pairs')).toBe('1');
      },
    );
  });

  it('s08 reports a standalone reversal under both matching groups', async () => {
    await withFixtureSchema(
      { seed: (schema, db) => insertFixtureRow(schema, db, 'stock_movements', {
        movementType: 'adjustment_increase', quantity: 1, previousBalance: 0, newBalance: 1,
        productId: inventoryAccountId, referenceType: 'stock_movement_reversal', referenceId: inventoryAccountId,
      }).then(() => undefined) },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's08_outside_workflows', 'unrecognized_pairs')).toBe('1');
        expect(metric(result.sets, 's08_outside_workflows', 'standalone_reversals')).toBe('1');
        const details = result.sets.find((set) => set.section === 's08_outside_workflows_detail')?.rows ?? [];
        expect(details.map((row) => row.group).sort()).toEqual(['standalone_reversal', 'unrecognized_pair']);
      },
    );
  });

  it('s08 distinguishes missing references from soft-deleted documents', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await insertFixtureRow(schema, db, 'stock_movements', {
          movementType: 'sale', quantity: -1, previousBalance: 1, newBalance: 0,
          productId: inventoryAccountId, referenceType: 'sales_order',
          referenceId: '00000000-0000-4000-8000-000000000099',
        });
        const order = await insertFixtureRow(schema, db, 'sales_orders', {
          orderNumber: 'SO-DELETED', orderDate: '2026-01-01', customerId: inventoryAccountId,
          deletedAt: '2026-01-01T00:00:00Z',
        });
        await insertFixtureRow(schema, db, 'stock_movements', {
          movementType: 'sale', quantity: -1, previousBalance: 1, newBalance: 0,
          productId: inventoryAccountId, referenceType: 'sales_order', referenceId: order.id,
        });
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's08_outside_workflows', 'missing_references')).toBe('1');
        expect(metric(result.sets, 's08_outside_workflows', 'references_to_soft_deleted_documents')).toBe('1');
        const details = result.sets.find((set) => set.section === 's08_outside_workflows_detail')?.rows ?? [];
        expect(details.some((row) => row.group === 'missing_reference')).toBe(true);
        expect(details.some((row) => row.group === 'soft_deleted_reference')).toBe(true);
      },
    );
  });

  it('s08 exposes every pinned metric on an empty baseline', async () => {
    await withFixtureSchema({}, async (schema) => {
      const result = await runInspection({ schema });
      const rows = result.sets.find((set) => set.section === 's08_outside_workflows')?.rows ?? [];
      for (const name of [
        'unrecognized_pairs', 'standalone_reversals', 'missing_references',
        'references_to_soft_deleted_documents', 'movements_checked', 'soft_deleted_movements',
      ]) {
        expect(rows.some((row) => row.metric === name)).toBe(true);
        expect(rows.find((row) => row.metric === name)?.note)
          .toBe('review candidate, not proof that a workflow was bypassed');
      }
    });
  });


  it('s09 accepts a clean arithmetic and balance chain', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedProductRows(schema, db, [{ name: 'Clean chain', stockQuantity: '3' }]);
        const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
        await insertFixtureRow(schema, db, 'stock_movements', {
          productId, movementType: 'initial_stock', quantity: '5', previousBalance: '0', newBalance: '5',
          createdAt: '2026-01-01T00:00:00Z',
        });
        await insertFixtureRow(schema, db, 'stock_movements', {
          productId, movementType: 'sale', quantity: '-2', previousBalance: '5', newBalance: '3',
          createdAt: '2026-01-02T00:00:00Z',
        });
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        for (const name of ['arithmetic_failures', 'link_breaks', 'links_order_unknown', 'end_mismatches', 'end_order_unknown']) {
          expect(metric(result.sets, 's09_balance_chains', name)).toBe('0');
        }
        expect(metric(result.sets, 's09_balance_chains', 'links_evaluated')).toBe('1');
      },
    );
  });

  it('s09 counts a break between uniquely ordered movements', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedProductRows(schema, db, [{ name: 'Broken link', stockQuantity: '2' }]);
        const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
        await insertFixtureRow(schema, db, 'stock_movements', {
          productId, movementType: 'initial_stock', quantity: '5', previousBalance: '0', newBalance: '5',
          createdAt: '2026-01-01T00:00:00Z',
        });
        await insertFixtureRow(schema, db, 'stock_movements', {
          productId, movementType: 'sale', quantity: '-2', previousBalance: '4', newBalance: '2',
          createdAt: '2026-01-02T00:00:00Z',
        });
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's09_balance_chains', 'link_breaks')).toBe('1');
      },
    );
  });

  it('s09 treats shared timestamps as unknown order, not breaks or end mismatches', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedProductRows(schema, db, [{ name: 'Tied chain', stockQuantity: '10' }]);
        const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
        for (const [quantity, previousBalance, newBalance] of [['5', '0', '5'], ['1', '9', '10']]) {
          await insertFixtureRow(schema, db, 'stock_movements', {
            productId, movementType: 'initial_stock', quantity, previousBalance, newBalance,
            createdAt: '2026-01-01T00:00:00Z',
          });
        }
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's09_balance_chains', 'link_breaks')).toBe('0');
        expect(metric(result.sets, 's09_balance_chains', 'links_order_unknown')).toBe('1');
        expect(metric(result.sets, 's09_balance_chains', 'end_order_unknown')).toBe('1');
        expect(metric(result.sets, 's09_balance_chains', 'end_mismatches')).toBe('0');
      },
    );
  });

  it('s09 checks arithmetic even when timestamp order is shared', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedProductRows(schema, db, [{ name: 'Tied arithmetic', stockQuantity: '10' }]);
        const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
        for (const [quantity, previousBalance, newBalance] of [['5', '0', '5'], ['1', '9', '7']]) {
          await insertFixtureRow(schema, db, 'stock_movements', {
            productId, movementType: 'initial_stock', quantity, previousBalance, newBalance,
            createdAt: '2026-01-01T00:00:00Z',
          });
        }
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's09_balance_chains', 'arithmetic_failures')).toBe('1');
      },
    );
  });

  it('s09 reports an unshared last movement that disagrees with stock', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedProductRows(schema, db, [{ name: 'End mismatch', stockQuantity: '8' }]);
        const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
        await insertFixtureRow(schema, db, 'stock_movements', {
          productId, movementType: 'initial_stock', quantity: '3', previousBalance: '0', newBalance: '3',
          createdAt: '2026-01-01T00:00:00Z',
        });
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's09_balance_chains', 'end_mismatches')).toBe('1');
      },
    );
  });

  it('s09 exposes every pinned metric on an empty baseline', async () => {
    await withFixtureSchema({}, async (schema) => {
      const result = await runInspection({ schema });
      const rows = result.sets.find((set) => set.section === 's09_balance_chains')?.rows ?? [];
      for (const name of [
        'products_checked', 'movements_checked', 'arithmetic_failures', 'link_breaks',
        'links_evaluated', 'links_order_unknown', 'end_mismatches', 'end_order_unknown',
        'soft_deleted_movements',
      ]) expect(rows.some((row) => row.metric === name)).toBe(true);
    });
  });


  it('s09 counts soft-deleted movements without bridging over them', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedProductRows(schema, db, [{ name: 'Deleted movement gap', stockQuantity: '6' }]);
        const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
        await insertFixtureRow(schema, db, 'stock_movements', {
          productId, movementType: 'initial_stock', quantity: '5', previousBalance: '0', newBalance: '5',
          createdAt: '2026-01-01T00:00:00Z',
        });
        await insertFixtureRow(schema, db, 'stock_movements', {
          productId, movementType: 'adjustment_increase', quantity: '90', previousBalance: '5', newBalance: '95',
          createdAt: '2026-01-02T00:00:00Z', deletedAt: '2026-01-03T00:00:00Z',
        });
        await insertFixtureRow(schema, db, 'stock_movements', {
          productId, movementType: 'sale', quantity: '1', previousBalance: '100', newBalance: '6',
          createdAt: '2026-01-04T00:00:00Z',
        });
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's09_balance_chains', 'soft_deleted_movements')).toBe('1');
        expect(metric(result.sets, 's09_balance_chains', 'movements_checked')).toBe('2');
        expect(metric(result.sets, 's09_balance_chains', 'links_evaluated')).toBe('0');
        expect(metric(result.sets, 's09_balance_chains', 'link_breaks')).toBe('0');
      },
    );
  });


  it('s10 reports soft-deleted stock and service products with batches', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await seedProductRows(schema, db, [
          { name: 'Deleted stocked', stockQuantity: '2', deletedAt: '2026-01-01T00:00:00Z' },
          { name: 'Service', type: 'Service', stockQuantity: '0' },
        ]);
        const products = await db.query('SELECT id, name FROM products ORDER BY name');
        const serviceId = products.rows.find((row) => row.name === 'Service').id;
        await seedBatch(schema, db, { productId: serviceId, quantity: '1', unitCost: '10', landedCost: '10' });
      } },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's10_product_anomalies', 'soft_deleted_with_stock')).toBe('1');
        expect(metric(result.sets, 's10_product_anomalies', 'service_with_batches')).toBe('1');
        const row = result.sets.find((set) => set.section === 's10_product_anomalies')
          ?.rows.find((item) => item.metric === 'service_with_batches');
        expect(row?.note).toBe('non-stocked interpreted as type = Service');
      },
    );
  });

  it('s11 recognizes one active administrator but no distinct preparer', async () => {
    await withFixtureSchema(
      { seed: (schema, db) => insertFixtureRow(schema, db, 'users', {
        username: 'admin-one', password: 'hash', role: 'admin', status: 'active',
      }).then(() => undefined) },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's11_users', 'has_active_admin')).toBe('true');
        expect(metric(result.sets, 's11_users', 'has_distinct_preparer')).toBe('false');
      },
    );
  });

  it('s11 accepts two active administrators as distinct accounts', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        for (const username of ['admin-one', 'admin-two']) {
          await insertFixtureRow(schema, db, 'users', { username, password: 'hash', role: 'admin', status: 'active' });
        }
      } },
      async (schema) => {
        expect(metric((await runInspection({ schema })).sets, 's11_users', 'has_distinct_preparer')).toBe('true');
      },
    );
  });

  it('s11 accepts an active inventory staff member alongside an administrator', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await insertFixtureRow(schema, db, 'users', { username: 'admin-one', password: 'hash', role: 'admin', status: 'active' });
        await insertFixtureRow(schema, db, 'users', { username: 'inventory-one', password: 'hash', role: 'inventory_staff', status: 'active' });
      } },
      async (schema) => {
        expect(metric((await runInspection({ schema })).sets, 's11_users', 'has_distinct_preparer')).toBe('true');
      },
    );
  });

  it('s11 excludes a suspended manager from the preparer count', async () => {
    await withFixtureSchema(
      { seed: async (schema, db) => {
        await insertFixtureRow(schema, db, 'users', { username: 'admin-one', password: 'hash', role: 'admin', status: 'active' });
        await insertFixtureRow(schema, db, 'users', { username: 'manager-one', password: 'hash', role: 'manager', status: 'suspended' });
      } },
      async (schema) => {
        expect(metric((await runInspection({ schema })).sets, 's11_users', 'has_distinct_preparer')).toBe('false');
      },
    );
  });

  it('s11 excludes inactive administrators from active role counts', async () => {
    await withFixtureSchema(
      { seed: (schema, db) => insertFixtureRow(schema, db, 'users', {
        username: 'inactive-admin', password: 'hash', role: 'admin', status: 'active', isActive: false,
      }).then(() => undefined) },
      async (schema) => {
        const result = await runInspection({ schema });
        expect(metric(result.sets, 's11_users', 'active.admin')).toBe('0');
        expect(metric(result.sets, 's11_users', 'inactive_users')).toBe('1');
      },
    );
  });

  it('s10 and s11 expose every pinned metric on an empty baseline', async () => {
    await withFixtureSchema({}, async (schema) => {
      const result = await runInspection({ schema });
      const s10 = result.sets.find((set) => set.section === 's10_product_anomalies')?.rows ?? [];
      for (const name of ['soft_deleted_with_stock', 'soft_deleted_with_batches', 'service_with_stock', 'service_with_batches', 'service_with_batch_value']) {
        expect(s10.some((row) => row.metric === name)).toBe(true);
      }
      const s11 = result.sets.find((set) => set.section === 's11_users')?.rows ?? [];
      for (const name of [
        'active.admin', 'active.manager', 'active.sales_staff', 'active.inventory_staff',
        'active.procurement_staff', 'inactive_users', 'has_active_admin', 'has_distinct_preparer',
      ]) expect(s11.some((row) => row.metric === name)).toBe(true);
    });
  });

  it('s12 reports the complete fixed metric set at zero on an empty baseline', async () => {
    await withFixtureSchema({}, async (schema) => {
      const result = await runInspection({ schema });
      const rows = result.sets.find((set) => set.section === 's12_project_records')?.rows ?? [];
      expect(rows.map((row) => row.metric).sort()).toEqual([...S12_METRICS].sort());
      expect(rows.every((row) => row.value === '0')).toBe(true);
    });
  });

  it('s12 counts sales order items by live parent status and soft-deleted parent', async () => {
    await withFixtureSchema({ seed: async (schema, db) => {
      const liveDraft = await insertFixtureRow(schema, db, 'sales_orders', { orderNumber: 'SO-D', orderDate: '2026-01-01', customerId: '00000000-0000-4000-8000-000000000001', status: 'DRAFT' });
      const ready = await insertFixtureRow(schema, db, 'sales_orders', { orderNumber: 'SO-R', orderDate: '2026-01-01', customerId: '00000000-0000-4000-8000-000000000001', status: 'READY' });
      const deleted = await insertFixtureRow(schema, db, 'sales_orders', { orderNumber: 'SO-X', orderDate: '2026-01-01', customerId: '00000000-0000-4000-8000-000000000001', status: 'DRAFT', deletedAt: '2026-01-01' });
      for (const [parent, count] of [[liveDraft, 2], [ready, 3], [deleted, 4]] as const) {
        for (let i = 0; i < count; i += 1) await insertFixtureRow(schema, db, 'sales_order_items', { salesOrderId: parent.id, productId: '00000000-0000-4000-8000-000000000001', lineNumber: i + 1, quantity: 1, unitPrice: 1, unitCost: 1 });
      }
      await insertFixtureRow(schema, db, 'sales_orders', { orderNumber: 'SO-F', orderDate: '2026-01-01', customerId: '00000000-0000-4000-8000-000000000001', status: 'FULFILLED' });
    } }, async (schema) => {
      const result = await runInspection({ schema });
      expect(metric(result.sets, 's12_project_records', 'p6.sales_orders.DRAFT')).toBe('1');
      expect(metric(result.sets, 's12_project_records', 'p6.sales_orders.DRAFT.soft_deleted')).toBe('1');
      expect(metric(result.sets, 's12_project_records', 'p6.sales_order_items.DRAFT')).toBe('2');
      expect(metric(result.sets, 's12_project_records', 'p6.sales_order_items.READY')).toBe('3');
      expect(metric(result.sets, 's12_project_records', 'p6.sales_order_items.DRAFT.soft_deleted_parent')).toBe('4');
    });
  });

  it('s12 separates live, own-soft-deleted and soft-deleted-parent settlement lines', async () => {
    await withFixtureSchema({ seed: async (schema, db) => {
      const live = await insertFixtureRow(schema, db, 'provider_settlements', { referenceNumber: 'PS-L', providerPaymentMethodId: '00000000-0000-4000-8000-000000000001', clearingAccountId: '00000000-0000-4000-8000-000000000001', bankAccountId: '00000000-0000-4000-8000-000000000001', settlementDate: '2026-01-01', settlementAmount: 2, status: 'DRAFT' });
      const deleted = await insertFixtureRow(schema, db, 'provider_settlements', { referenceNumber: 'PS-X', providerPaymentMethodId: '00000000-0000-4000-8000-000000000001', clearingAccountId: '00000000-0000-4000-8000-000000000001', bankAccountId: '00000000-0000-4000-8000-000000000001', settlementDate: '2026-01-01', settlementAmount: 3, status: 'DRAFT', deletedAt: '2026-01-01' });
      await insertFixtureRow(schema, db, 'provider_settlement_lines', { settlementId: live.id, salesOrderPaymentId: '00000000-0000-4000-8000-000000000001', amount: 1 });
      await insertFixtureRow(schema, db, 'provider_settlement_lines', { settlementId: live.id, salesOrderPaymentId: '00000000-0000-4000-8000-000000000002', amount: 1, deletedAt: '2026-01-01' });
      await insertFixtureRow(schema, db, 'provider_settlement_lines', { settlementId: deleted.id, salesOrderPaymentId: '00000000-0000-4000-8000-000000000003', amount: 1 });
    } }, async (schema) => {
      const result = await runInspection({ schema });
      expect(metric(result.sets, 's12_project_records', 'p5.draft_provider_settlement_lines')).toBe('1');
      expect(metric(result.sets, 's12_project_records', 'p5.draft_provider_settlement_lines.soft_deleted_row')).toBe('1');
      expect(metric(result.sets, 's12_project_records', 'p5.draft_provider_settlement_lines.soft_deleted_parent')).toBe('1');
    });
  });

  it('s12 classifies first-time and reopened drafts and their bank reconciliation children', async () => {
    await withFixtureSchema({ seed: async (schema, db) => {
      const bank = '00000000-0000-4000-8000-000000000001';
      const first = await insertFixtureRow(schema, db, 'bank_statement_reconciliations', { reconciliationNo: 'BR-1', bankAccountId: bank, sequenceNo: 1, periodFrom: '2026-01-01', periodTo: '2026-01-31', openingBalance: 0, closingBalance: 0, status: 'DRAFT' });
      const reopened = await insertFixtureRow(schema, db, 'bank_statement_reconciliations', { reconciliationNo: 'BR-2', bankAccountId: bank, sequenceNo: 2, periodFrom: '2026-02-01', periodTo: '2026-02-28', openingBalance: 0, closingBalance: 0, status: 'DRAFT', currentVersionNo: 1 });
      const deleted = await insertFixtureRow(schema, db, 'bank_statement_reconciliations', { reconciliationNo: 'BR-3', bankAccountId: bank, sequenceNo: 3, periodFrom: '2026-03-01', periodTo: '2026-03-31', openingBalance: 0, closingBalance: 0, status: 'DRAFT', deletedAt: '2026-01-01' });
      for (const [parent, count] of [[first, 1], [reopened, 1], [deleted, 3]] as const) {
        for (let i = 0; i < count; i += 1) await insertFixtureRow(schema, db, 'bank_statement_reconciliation_lines', { reconciliationId: parent.id, journalEntryLineId: `00000000-0000-4000-8000-${String(100 + i + count).padStart(12, '0')}`, kind: 'MATCHED', addedBy: 'fixture', addedAt: '2026-01-01T00:00:00Z' });
      }
    } }, async (schema) => {
      const result = await runInspection({ schema });
      expect(metric(result.sets, 's12_project_records', 'p5.draft_bank_reconciliations.first_time')).toBe('1');
      expect(metric(result.sets, 's12_project_records', 'p5.draft_bank_reconciliations.reopened')).toBe('1');
      expect(metric(result.sets, 's12_project_records', 'p5.draft_bank_reconciliations.first_time.soft_deleted')).toBe('1');
      expect(metric(result.sets, 's12_project_records', 'p5.draft_bank_reconciliation_lines.soft_deleted_parent')).toBe('3');
    });
  });

  it('s12 excludes a soft-deleted stock adjustment and its child from live draft counts', async () => {
    await withFixtureSchema({ seed: async (schema, db) => {
      const adjustment = await insertFixtureRow(schema, db, 'stock_adjustments', { adjustmentNumber: 'SA-FX', adjustmentDate: '2026-01-01', status: 'draft', deletedAt: '2026-01-01' });
      await insertFixtureRow(schema, db, 'stock_adjustment_items', { stockAdjustmentId: adjustment.id, productId: '00000000-0000-4000-8000-000000000001', oldQuantity: 1, newQuantity: 2, difference: 1 });
    } }, async (schema) => {
      const result = await runInspection({ schema });
      expect(metric(result.sets, 's12_project_records', 'p5.draft_stock_adjustments')).toBe('0');
      expect(metric(result.sets, 's12_project_records', 'p5.draft_stock_adjustments.soft_deleted')).toBe('1');
      expect(metric(result.sets, 's12_project_records', 'p6.stock_adjustment_items.draft')).toBe('0');
      expect(metric(result.sets, 's12_project_records', 'p6.stock_adjustment_items.draft.soft_deleted_parent')).toBe('1');
    });
  });

  it('s12 detects account mappings whose payment method is soft-deleted', async () => {
    await withFixtureSchema({ seed: async (schema, db) => {
      const method = await insertFixtureRow(schema, db, 'payment_methods', { code: 'FX', name: 'Fixture', deletedAt: '2026-01-01' });
      await insertFixtureRow(schema, db, 'payment_method_account_mappings', { paymentMethodId: method.id, accountId: '00000000-0000-4000-8000-000000000001' });
    } }, async (schema) => {
      const result = await runInspection({ schema });
      expect(metric(result.sets, 's12_project_records', 'p7.account_mappings')).toBe('1');
      expect(metric(result.sets, 's12_project_records', 'p7.mappings_to_soft_deleted_payment_methods')).toBe('1');
    });
  });

  it('d1 is gated before the receipt identity migration', async () => {
    await withFixtureSchema(PRE_3_25_FIXTURE, async (schema) => {
      const result = await runInspection({ schema });
      const rows = result.sets.find((set) => set.section === 'd1_receipt_line_identity')?.rows ?? [];
      expect(rows).toEqual([expect.objectContaining({
        metric: 'status', value: 'not evaluated: migration prerequisite absent',
        note: expect.stringContaining('missing: stock_occurrences.receiptEvidenceVersion, stock_movements.purchaseOrderItemId, purchase_cost_history.purchaseOrderItemId'),
      })]);
      expect(result.sets.find((set) => set.section === 'd1_receipt_line_identity_detail')?.rows).toEqual([]);
    });
  });

  it('d1 exposes the evaluated metrics on a current schema', async () => {
    await withFixtureSchema({}, async (schema) => {
      const result = await runInspection({ schema });
      expect(metric(result.sets, 'd1_receipt_line_identity', 'status')).toBe('evaluated');
      for (const name of [
        'receipts.version_null', 'receipts.version_1', 'receipts.version_other', 'receipts.legacy_no_occurrence',
        ...D1_VIOLATIONS.filter((name) => name !== 'receipts.version_other'),
        'historical.uniqueness_not_evaluated.occurrence', 'historical.uniqueness_not_evaluated.legacy',
      ]) expect(metric(result.sets, 'd1_receipt_line_identity', name)).toBeDefined();
    });
  });

  it('d1 accepts clean version-1 receipt identity evidence', async () => {
    await withFixtureSchema({ seed: async (schema, db) => { await seedCleanReceipt(schema, db); } }, async (schema) => {
      const result = await runInspection({ schema });
      expectD1(result.sets, {});
      expect(metric(result.sets, 'd1_receipt_line_identity', 'receipts.version_1')).toBe('1');
    });
  });

  it('d1 counts null identity rows and detects missing item movement evidence', async () => {
    await withFixtureSchema({ seed: async (schema, db) => {
      const seeded = await seedCleanReceipt(schema, db);
      await db.query(`UPDATE "${schema}".stock_movements SET "purchaseOrderItemId" = NULL WHERE id = $1`, [seeded.movementP.id]);
    } }, async (schema) => {
      const result = await runInspection({ schema });
      expectD1(result.sets, { 'v1.null_identity_rows': '1', 'any.mixed_identity': '1', 'v1.item_not_exactly_one_movement': '1' });
    });
  });

  it('d1 detects duplicate movement and batch identity rows', async () => {
    for (const duplicate of ['movement', 'batch'] as const) {
      await withFixtureSchema({ seed: async (schema, db) => {
        const seeded = await seedCleanReceipt(schema, db);
        if (duplicate === 'movement') await insertFixtureRow(schema, db, 'stock_movements', {
          movementType: 'purchase_receipt', quantity: 2, previousBalance: 0, newBalance: 2,
          productId: receiptProductP, occurrenceId: seeded.occurrence.id, purchaseOrderItemId: seeded.p.id,
          referenceType: 'purchase_order', referenceId: seeded.po.id, unitValue: 1, totalValue: 2,
        });
        else await insertFixtureRow(schema, db, 'purchase_cost_history', {
          productId: receiptProductP, purchaseOrderId: seeded.po.id, unitCost: 1, landedCost: 1,
          receivedQuantity: 2, remainingQuantity: 2, receivedDate: '2026-01-01T00:00:00Z',
          occurrenceId: seeded.occurrence.id, purchaseOrderItemId: seeded.p.id,
        });
      } }, async (schema) => {
        const result = await runInspection({ schema });
        if (duplicate === 'movement') expectD1(result.sets, { 'v1.item_not_exactly_one_movement': '1', 'v1.unequal_counts': '1' });
        else expectD1(result.sets, { 'v1.item_not_exactly_one_batch': '1', 'v1.unequal_counts': '1' });
      });
    }
  });

  it('d1 detects version, product, movement shape and value defects independently', async () => {
    for (const defect of ['version', 'product', 'reference', 'value'] as const) {
      await withFixtureSchema({ seed: async (schema, db) => {
        const seeded = await seedCleanReceipt(schema, db);
        if (defect === 'version') await db.query(`UPDATE "${schema}".stock_occurrences SET "receiptEvidenceVersion" = 2 WHERE id = $1`, [seeded.occurrence.id]);
        if (defect === 'product') await db.query(`UPDATE "${schema}".stock_movements SET "productId" = $2 WHERE id = $1`, [seeded.movementP.id, receiptProductQ]);
        if (defect === 'reference') await db.query(`UPDATE "${schema}".stock_movements SET "referenceId" = $2 WHERE id = $1`, [seeded.movementP.id, '00000000-0000-4000-8000-000000000099']);
        if (defect === 'value') await db.query(`UPDATE "${schema}".stock_movements SET "unitValue" = NULL WHERE id = $1`, [seeded.movementP.id]);
      } }, async (schema) => {
        const result = await runInspection({ schema });
        const expected = defect === 'version' ? { 'receipts.version_other': '1' }
          : defect === 'product' ? { 'v1.product_mismatch': '1' }
          : defect === 'reference' ? { 'v1.movement_shape': '1' }
          : { 'v1.movement_values_null': '1' };
        expectD1(result.sets, expected);
      });
    }
  });

  it('d1 detects missing and cross-PO item identities', async () => {
    for (const defect of ['third_item', 'other_po'] as const) {
      await withFixtureSchema({ seed: async (schema, db) => {
        const seeded = await seedCleanReceipt(schema, db);
        if (defect === 'third_item') {
          await insertFixtureRow(schema, db, 'purchase_order_items', { purchaseOrderId: seeded.po.id, productId: receiptProductQ, lineNumber: 3, quantity: 1, unitCost: 1 });
        }
        if (defect === 'other_po') {
          const otherPo = await insertFixtureRow(schema, db, 'purchase_orders', { orderNumber: 'PO-OTHER', orderDate: '2026-01-01', supplierId: '00000000-0000-4000-8000-000000000001', status: 'DRAFT' });
          const otherItem = await insertFixtureRow(schema, db, 'purchase_order_items', { purchaseOrderId: otherPo.id, productId: receiptProductP, lineNumber: 1, quantity: 2, unitCost: 1 });
          await db.query(`UPDATE "${schema}".stock_movements SET "purchaseOrderItemId" = $2 WHERE id = $1`, [seeded.movementP.id, otherItem.id]);
        }
      } }, async (schema) => {
        const result = await runInspection({ schema });
        if (defect === 'third_item') expectD1(result.sets, {
          'v1.unequal_counts': '1', 'v1.item_not_exactly_one_movement': '1', 'v1.item_not_exactly_one_batch': '1',
        });
        if (defect === 'other_po') expectD1(result.sets, {
          'v1.identity_other_po': '1', 'v1.item_not_exactly_one_movement': '1',
        });
      });
    }
  });

  it('d1 checks reversal linkage, original type and preserved item identity', async () => {
    for (const defect of ['unlinked', 'not_receipt', 'identity_null', 'identity_other'] as const) {
      await withFixtureSchema({ seed: async (schema, db) => {
        const seeded = await seedCleanReceipt(schema, db);
        const original = defect === 'not_receipt' ? await insertFixtureRow(schema, db, 'stock_movements', {
          movementType: 'sale', quantity: -1, previousBalance: 2, newBalance: 1, productId: receiptProductP,
          referenceType: 'sales_order', referenceId: seeded.po.id,
          unitValue: 1, totalValue: 1, purchaseOrderItemId: seeded.p.id,
        }) : seeded.movementP;
        if (defect === 'unlinked') await insertFixtureRow(schema, db, 'stock_movements', {
          movementType: 'purchase_receipt_reversal', quantity: -1, previousBalance: 2, newBalance: 1, productId: receiptProductP,
        });
        else await insertFixtureRow(schema, db, 'stock_movements', {
          movementType: 'purchase_receipt_reversal', quantity: -1, previousBalance: 2, newBalance: 1,
          productId: receiptProductP, occurrenceId: seeded.occurrence.id, reversesMovementId: original.id,
          purchaseOrderItemId: defect === 'identity_other' ? seeded.q.id : defect === 'identity_null' ? null : seeded.p.id,
        });
      } }, async (schema) => {
        const result = await runInspection({ schema });
        const expected = defect === 'unlinked' ? { 'reversal.unlinked': '1' }
          : defect === 'not_receipt' ? { 'reversal.original_not_receipt': '1' }
          : { 'reversal.identity_not_preserved': '1' };
        expectD1(result.sets, expected);
      });
    }
  });

  it('d1 distinguishes historical identity presence and count mismatches', async () => {
    await withFixtureSchema({ seed: async (schema, db) => {
      const clean = await seedCleanReceipt(schema, db, null);
      await db.query(`UPDATE "${schema}".stock_movements SET "purchaseOrderItemId" = NULL WHERE id = $1`, [clean.movementQ.id]);
      await db.query(`UPDATE "${schema}".purchase_cost_history SET "purchaseOrderItemId" = NULL`);
    } }, async (schema) => {
      const result = await runInspection({ schema });
      expectD1(result.sets, { 'historical.identity_present': '1', 'any.mixed_identity': '1' });
      expect(metric(result.sets, 'd1_receipt_line_identity', 'receipts.version_null')).toBe('1');
      expect(metric(result.sets, 'd1_receipt_line_identity', 'historical.uniqueness_not_evaluated.occurrence')).toBe('0');
    });
  });

  it('d1 checks historical occurrence and legacy row counts without claiming uniqueness', async () => {
    await withFixtureSchema({ seed: async (schema, db) => {
      const historical = await seedCleanReceipt(schema, db, null);
      await db.query(`UPDATE "${schema}".stock_movements SET "purchaseOrderItemId" = NULL WHERE "occurrenceId" = $1`, [historical.occurrence.id]);
      await db.query(`UPDATE "${schema}".purchase_cost_history SET "purchaseOrderItemId" = NULL WHERE "occurrenceId" = $1`, [historical.occurrence.id]);
      await insertFixtureRow(schema, db, 'stock_movements', {
        movementType: 'purchase_receipt', quantity: 1, previousBalance: 0, newBalance: 1,
        productId: receiptProductP, occurrenceId: historical.occurrence.id, referenceType: 'purchase_order',
        referenceId: historical.po.id, unitValue: 1, totalValue: 1,
      });
      const legacy = await insertFixtureRow(schema, db, 'purchase_orders', {
        orderNumber: 'PO-LEGACY', orderDate: '2026-01-01', supplierId: '00000000-0000-4000-8000-000000000001', status: 'RECEIVED',
      });
      for (let i = 1; i <= 2; i += 1) await insertFixtureRow(schema, db, 'purchase_order_items', {
        purchaseOrderId: legacy.id, productId: receiptProductP, lineNumber: i, quantity: 1, unitCost: 1,
      });
      await insertFixtureRow(schema, db, 'stock_movements', {
        movementType: 'purchase_receipt', quantity: 1, previousBalance: 0, newBalance: 1,
        productId: receiptProductP, referenceType: 'purchase_order', referenceId: legacy.id, unitValue: 1, totalValue: 1,
      });
      for (let i = 1; i <= 2; i += 1) await insertFixtureRow(schema, db, 'purchase_cost_history', {
        productId: receiptProductP, purchaseOrderId: legacy.id, unitCost: 1, landedCost: 1,
        receivedQuantity: 1, remainingQuantity: 1, receivedDate: '2026-01-01T00:00:00Z',
      });
    } }, async (schema) => {
      const result = await runInspection({ schema });
      expectD1(result.sets, {
        'historical.row_count_mismatch.occurrence': '1', 'historical.row_count_mismatch.legacy': '1',
      });
      expect(metric(result.sets, 'd1_receipt_line_identity', 'receipts.legacy_no_occurrence')).toBe('1');
      expect(metric(result.sets, 'd1_receipt_line_identity', 'historical.uniqueness_not_evaluated.occurrence')).toBe('0');
    });
  });

  it('d1 labels clean historical receipts as uniqueness not evaluated', async () => {
    await withFixtureSchema({ seed: async (schema, db) => {
      const historicalOccurrence = await seedCleanReceipt(schema, db, null);
      await db.query(`UPDATE "${schema}".stock_movements SET "purchaseOrderItemId" = NULL WHERE "occurrenceId" = $1`, [historicalOccurrence.occurrence.id]);
      await db.query(`UPDATE "${schema}".purchase_cost_history SET "purchaseOrderItemId" = NULL WHERE "occurrenceId" = $1`, [historicalOccurrence.occurrence.id]);
      const po = await insertFixtureRow(schema, db, 'purchase_orders', {
        orderNumber: 'PO-LEGACY-CLEAN', orderDate: '2026-01-01', supplierId: '00000000-0000-4000-8000-000000000001', status: 'RECEIVED',
      });
      const item = await insertFixtureRow(schema, db, 'purchase_order_items', {
        purchaseOrderId: po.id, productId: receiptProductP, lineNumber: 1, quantity: 1, unitCost: 1,
      });
      await insertFixtureRow(schema, db, 'stock_movements', {
        movementType: 'purchase_receipt', quantity: 1, previousBalance: 0, newBalance: 1,
        productId: receiptProductP, referenceType: 'purchase_order', referenceId: po.id, unitValue: 1, totalValue: 1,
      });
      await insertFixtureRow(schema, db, 'purchase_cost_history', {
        productId: receiptProductP, purchaseOrderId: po.id, unitCost: 1, landedCost: 1,
        receivedQuantity: 1, remainingQuantity: 1, receivedDate: '2026-01-01T00:00:00Z',
      });
      expect(item.id).toBeDefined();
    } }, async (schema) => {
      const result = await runInspection({ schema });
      expectD1(result.sets, {});
      expect(metric(result.sets, 'd1_receipt_line_identity', 'historical.uniqueness_not_evaluated.occurrence')).toBe('1');
      expect(metric(result.sets, 'd1_receipt_line_identity', 'historical.uniqueness_not_evaluated.legacy')).toBe('1');
      const notes = result.sets.find((set) => set.section === 'd1_receipt_line_identity')?.rows
        .filter((row) => row.metric.startsWith('historical.uniqueness_not_evaluated.'))
        .map((row) => row.note) ?? [];
      expect(notes.every((note) => note === 'uniqueness not evaluated; determined by the application\'s matcher')).toBe(true);
      expect(notes.join(' ')).not.toMatch(/returnable/i);
    });
  });

});
