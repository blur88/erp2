import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import {
  insertFixtureRow,
  metric,
  parseInspectionOutput,
  runInspection,
  seedProductRows,
  withFixtureSchema,
} from './utils/inspect-1398-p2-harness';

dotenv.config({
  path: fileURLToPath(new URL('../.env.test', import.meta.url)),
  quiet: true,
});

const scriptPath = fileURLToPath(new URL('../scripts/inspect-1398-p2.sql', import.meta.url));

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

});
