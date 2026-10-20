import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: fileURLToPath(new URL('../../.env.test', import.meta.url)),
  quiet: true,
});

export type ResultSet = {
  section: string;
  columns: string[];
  rows: Record<string, string>[];
};

export type FixtureSpec = {
  incomplete?: boolean;
  tables?: readonly string[];
  dropColumns?: Record<string, string[]>;
  omitTables?: readonly string[];
  extraDdl?: string[];
  seed?: (schema: string, db: Client) => Promise<void>;
};

export const PRE_3_25_DROP: Record<string, string[]> = {
  stock_occurrences: ['receiptEvidenceVersion', 'hasValuationGap'],
  stock_movements: ['purchaseOrderItemId'],
  purchase_cost_history: ['purchaseOrderItemId'],
};
export const OMIT_PRE_3_25: readonly string[] = ['stock_movement_valuation_gaps'];
export const PRE_3_25_FIXTURE: FixtureSpec = {
  dropColumns: PRE_3_25_DROP,
  omitTables: OMIT_PRE_3_25,
};

const scriptPath = fileURLToPath(
  new URL('../../scripts/inspect-1398-p2.sql', import.meta.url),
);
const script = readFileSync(scriptPath, 'utf8');
const metadataNames = ['app_version', 'image_id', 'env_label', 'script_sha'] as const;
type MetadataName = (typeof metadataNames)[number];

export function metric(
  sets: ResultSet[],
  section: string,
  name: string,
): string | undefined {
  return sets
    .find((candidate) => candidate.section === section)
    ?.rows.find((row) => row.metric === name)?.value;
}

function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length > 0)) records.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    records.push(row);
  }
  if (records.length === 0) throw new Error('CSV section is missing its header');

  const [columns, ...data] = records;
  const rows = data.map((values) => {
    if (values.length !== columns.length) {
      throw new Error(`CSV row has ${values.length} fields; expected ${columns.length}`);
    }
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  });
  return { columns, rows };
}

export function parseInspectionOutput(stdout: string): ResultSet[] {
  const chunks: Array<{ label: string; csv: string }> = [];
  let current: { label: string; csv: string } | undefined;
  let recordQuoted = false;
  let lineStart = 0;

  for (let i = 0; i <= stdout.length; i += 1) {
    if (!recordQuoted && (i === 0 || stdout[i - 1] === '\n')) {
      const end = stdout.indexOf('\n', i);
      const lineEnd = end === -1 ? stdout.length : end;
      const line = stdout.slice(i, lineEnd).replace(/\r$/, '');
      const section = /^@@inspect-section ([a-z0-9_]+)$/.exec(line);
      if (section || line === '@@inspect-end') {
        if (current) chunks.push(current);
        current = undefined;
        if (line === '@@inspect-end') {
          if (end !== -1 && stdout.slice(end + 1).trim().length > 0) {
            throw new Error('Unexpected output after @@inspect-end');
          }
          if (end === -1) lineStart = stdout.length;
          else lineStart = end + 1;
          break;
        }
        current = { label: section![1], csv: '' };
        i = lineEnd;
        if (end !== -1) i += 1;
        lineStart = i;
        continue;
      }
    }

    const char = stdout[i];
    if (char === '"') {
      if (recordQuoted && stdout[i + 1] === '"') {
        i += 1;
      } else {
        recordQuoted = !recordQuoted;
      }
    }
    if (char === '\n' && !recordQuoted) {
      if (current) current.csv += stdout.slice(lineStart, i + 1);
      lineStart = i + 1;
    }
  }

  if (!stdout.split(/\r?\n/).includes('@@inspect-end')) {
    throw new Error('Inspection output is missing @@inspect-end');
  }
  return chunks.map(({ label, csv }) => {
    const parsed = parseCsv(csv);
    for (const row of parsed.rows) {
      if (row.section !== label) {
        throw new Error(`Row section ${row.section} does not match marker ${label}`);
      }
    }
    return { section: label, ...parsed };
  });
}

export async function runInspection(opts: {
  schema?: string;
  vars?: Partial<Record<MetadataName, string>>;
} = {}): Promise<{ code: number; stdout: string; stderr: string; sets: ResultSet[] }> {
  const vars = opts.vars ?? {
    app_version: 'test-version',
    image_id: 'test-image',
    env_label: 'test',
    script_sha: 'test-sha',
  };
  const args = [
    'run',
    '--rm',
    '-i',
    '--network',
    'host',
    '-e',
    'PGPASSWORD',
    ...(opts.schema ? ['-e', `PGOPTIONS=-c search_path=${opts.schema},pg_catalog`] : []),
    process.env.INSPECT_PSQL_IMAGE || 'postgres:18.3-alpine3.23',
    'psql',
    '-X',
    '-q',
    '--csv',
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    process.env.DB_HOST || 'localhost',
    '-p',
    process.env.DB_PORT || '5432',
    '-U',
    process.env.DB_USERNAME || 'erp_user',
    '-d',
    process.env.DB_DATABASE || 'erp_db_test',
    ...metadataNames.flatMap((name) =>
      vars[name] === undefined ? [] : ['-v', `${name}=${vars[name]}`],
    ),
  ];
  const child = spawnSync('docker', args, {
    input: script,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD },
    maxBuffer: 10 * 1024 * 1024,
  });
  const stdout = child.stdout || '';
  let sets: ResultSet[] = [];
  if (stdout.includes('@@inspect-end')) sets = parseInspectionOutput(stdout);
  return {
    code: child.status ?? 1,
    stdout,
    stderr: child.stderr || child.error?.message || '',
    sets,
  };
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function withFixtureSchema<T>(
  spec: FixtureSpec,
  fn: (schema: string, db: Client) => Promise<T>,
): Promise<T> {
  const schema = `inspect_fx_${randomUUID().replace(/-/g, '')}`;
  const db = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'erp_user',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'erp_db_test',
  });
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA ${quoteIdent(schema)}`);
    await db.query(`SET search_path TO ${quoteIdent(schema)}, pg_catalog`);
    if (spec.incomplete) {
      for (const table of spec.tables ?? []) {
        await db.query(
          `CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)} ` +
            `(LIKE public.${quoteIdent(table)} INCLUDING DEFAULTS)`,
        );
      }
    } else {
      const { rows } = await db.query<{ tablename: string }>(
        `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      for (const { tablename } of rows) {
        await db.query(
          `CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(tablename)} ` +
            `(LIKE public.${quoteIdent(tablename)} INCLUDING DEFAULTS)`,
        );
      }
    }
    for (const [table, columns] of Object.entries(spec.dropColumns ?? {})) {
      for (const column of columns) {
        await db.query(
          `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(table)} DROP COLUMN ${quoteIdent(column)}`,
        );
      }
    }
    for (const table of spec.omitTables ?? []) {
      await db.query(`DROP TABLE IF EXISTS ${quoteIdent(schema)}.${quoteIdent(table)}`);
    }
    for (const ddl of spec.extraDdl ?? []) await db.query(ddl);
    if (spec.seed) await spec.seed(schema, db);
    return await fn(schema, db);
  } finally {
    try {
      await db.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
    } finally {
      await db.end();
    }
  }
}



export type ProductFixtureRow = {
  name: string;
  deletedAt?: string;
  isActive?: boolean;
};

export async function seedProductRows(
  schema: string,
  db: Client,
  rows: ProductFixtureRow[],
): Promise<void> {
  for (const row of rows) {
    await db.query(
      `INSERT INTO ${quoteIdent(schema)}.products (name, "baseCost", "categoryId", "deletedAt", "isActive") ` +
        'VALUES ($1, 0, $2, $3, $4)',
      [row.name, '00000000-0000-4000-8000-000000000001', row.deletedAt ?? null, row.isActive ?? true],
    );
  }
}
