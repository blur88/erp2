import { MigrationInterface, QueryRunner } from 'typeorm';

/** Reinstates the constraints missed when #1414's source migration was already recorded. */
export class RestoreMissingStockConstraints1792517391166 implements MigrationInterface {
  name = 'RestoreMissingStockConstraints1792517391166';

  static readonly EXPECTED: ReadonlyArray<{
    name: string;
    table: string;
    kind: 'f' | 'c';
    definition: string;
    addSql: string;
    violationSql: string;
    sourceColumn?: string;
    targetTable?: string;
    targetColumn?: string;
  }> = [
    {
      name: 'FK_stock_occurrences_legacy_journal',
      table: 'stock_occurrences',
      kind: 'f',
      definition: 'FOREIGN KEY ("legacyJournalEntryId") REFERENCES journal_entry(id) ON DELETE RESTRICT',
      addSql:
        'ALTER TABLE "stock_occurrences" ADD CONSTRAINT "FK_stock_occurrences_legacy_journal" FOREIGN KEY ("legacyJournalEntryId") REFERENCES "journal_entry"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      violationSql: `SELECT count(*)::text AS violations
        FROM public.stock_occurrences o
        LEFT JOIN public.journal_entry j ON j.id = o."legacyJournalEntryId"
        WHERE o."legacyJournalEntryId" IS NOT NULL AND j.id IS NULL`,
      sourceColumn: 'legacyJournalEntryId',
      targetTable: 'journal_entry',
      targetColumn: 'id',
    },
    {
      name: 'CHK_stock_occurrence_reversal_reason_length',
      table: 'stock_occurrences',
      kind: 'c',
      definition:
        "CHECK (((kind <> ALL (ARRAY['receipt_reversal'::stock_occurrences_kind_enum, 'fulfilment_reversal'::stock_occurrences_kind_enum])) OR ((reason IS NOT NULL) AND ((char_length(btrim(reason)) >= 3) AND (char_length(btrim(reason)) <= 500)))))",
      addSql:
        `ALTER TABLE "stock_occurrences" ADD CONSTRAINT "CHK_stock_occurrence_reversal_reason_length" CHECK ("kind" NOT IN ('receipt_reversal', 'fulfilment_reversal') OR ("reason" IS NOT NULL AND char_length(btrim("reason")) BETWEEN 3 AND 500))`,
      violationSql: `SELECT count(*)::text AS violations
        FROM public.stock_occurrences o
        WHERE o.kind::text IN ('receipt_reversal', 'fulfilment_reversal')
          AND (o.reason IS NULL OR char_length(btrim(o.reason)) NOT BETWEEN 3 AND 500)`,
    },
    {
      name: 'CHK_stock_batch_consumptions_quantity_positive',
      table: 'stock_batch_consumptions',
      kind: 'c',
      definition: 'CHECK ((quantity > (0)::numeric))',
      addSql:
        'ALTER TABLE "stock_batch_consumptions" ADD CONSTRAINT "CHK_stock_batch_consumptions_quantity_positive" CHECK ("quantity" > 0)',
      violationSql: `SELECT count(*)::text AS violations
        FROM public.stock_batch_consumptions c
        WHERE c.quantity <= 0 OR c.quantity IS NULL`,
    },
    {
      name: 'FK_purchase_cost_history_occurrence',
      table: 'purchase_cost_history',
      kind: 'f',
      definition: 'FOREIGN KEY ("occurrenceId") REFERENCES stock_occurrences(id) ON DELETE RESTRICT',
      addSql:
        'ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "FK_purchase_cost_history_occurrence" FOREIGN KEY ("occurrenceId") REFERENCES "stock_occurrences"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      violationSql: `SELECT count(*)::text AS violations
        FROM public.purchase_cost_history b
        LEFT JOIN public.stock_occurrences o ON o.id = b."occurrenceId"
        WHERE b."occurrenceId" IS NOT NULL AND o.id IS NULL`,
      sourceColumn: 'occurrenceId',
      targetTable: 'stock_occurrences',
      targetColumn: 'id',
    },
  ];

  private static readonly CLASSIFY_SQL = `
    WITH expected AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS e(
        name text, "table" text, kind text, definition text,
        "sourceColumn" text, "targetTable" text, "targetColumn" text
      )
    ), catalog AS (
      SELECT c.*, t.relname AS table_name, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE c.connamespace = 'public'::regnamespace
    )
    SELECT e.name AS constraint_name, e."table" AS table_name,
      CASE
        WHEN named.total = 1 AND named.matches = 1 THEN 'present'
        WHEN named.total > 0 OR equivalent.found THEN 'conflict'
        ELSE 'absent'
      END AS status,
      CASE
        WHEN named.total = 1 AND named.matches = 1 THEN 'validated expected definition'
        WHEN named.total > 0 THEN 'name exists with wrong table, kind, definition, or validation'
        WHEN equivalent.found THEN 'equivalent constraint exists under another name'
        ELSE 'expected constraint is absent'
      END AS detail
    FROM expected e
    CROSS JOIN LATERAL (
      SELECT count(*) AS total,
        count(*) FILTER (
          WHERE c.table_name = e."table" AND c.contype::text = e.kind
            AND c.convalidated AND c.definition = e.definition
        ) AS matches
      FROM catalog c WHERE c.conname = e.name
    ) named
    CROSS JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM catalog c
        WHERE c.table_name = e."table" AND c.conname <> e.name
          AND c.contype::text = e.kind
          AND (
            (e.kind = 'c' AND c.definition = e.definition)
            OR (e.kind = 'f'
              AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                WHERE a.attrelid = c.conrelid AND a.attname = e."sourceColumn") ]::smallint[]
              AND c.confrelid = to_regclass('public.' || e."targetTable")
              AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                WHERE a.attrelid = c.confrelid AND a.attname = e."targetColumn") ]::smallint[]
            )
          )
      ) AS found
    ) equivalent
    ORDER BY e.name`;

  private async classify(queryRunner: QueryRunner): Promise<
    Array<{
      constraint_name: string;
      table_name: string;
      status: 'present' | 'absent' | 'conflict';
      detail: string;
    }>
  > {
    return queryRunner.query(RestoreMissingStockConstraints1792517391166.CLASSIFY_SQL, [
      JSON.stringify(RestoreMissingStockConstraints1792517391166.EXPECTED),
    ]);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const before = await this.classify(queryRunner);
    const issues = before
      .filter((row) => row.status === 'conflict')
      .map((row) => `${row.constraint_name}: ${row.detail}`);
    for (const expected of RestoreMissingStockConstraints1792517391166.EXPECTED) {
      const [row]: Array<{ violations: string }> = await queryRunner.query(expected.violationSql);
      const violations = BigInt(row.violations);
      if (violations > 0n) issues.push(`${expected.name}: ${violations} violating rows`);
    }
    if (issues.length > 0) {
      throw new Error(`RestoreMissingStockConstraints refused: ${issues.join('; ')}; no changes made`);
    }

    for (const expected of RestoreMissingStockConstraints1792517391166.EXPECTED) {
      if (before.find((row) => row.constraint_name === expected.name)?.status === 'absent') {
        await queryRunner.query(expected.addSql);
      }
    }
    const after = await this.classify(queryRunner);
    if (after.some((row) => row.status !== 'present')) {
      throw new Error('RestoreMissingStockConstraints post-add validation failed; transaction must roll back');
    }
  }

  public async down(): Promise<void> {
    // On a fresh database these constraints belong to 1792258286736. Dropping them here would remove its protections.
  }
}
