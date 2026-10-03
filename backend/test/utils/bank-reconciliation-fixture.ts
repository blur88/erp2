import * as crypto from 'crypto';
import { DataSource } from 'typeorm';

export async function seedBankAccount(
  ds: DataSource,
  runId: string,
): Promise<{ id: string; code: string; name: string }> {
  const [parent] = await ds.query(
    `SELECT id FROM chart_of_account WHERE code = '1000' AND "isActive" = true LIMIT 1`,
  );
  const code = `1299-${runId}`.slice(0, 20);
  const name = `Bank Acct ${runId}`;
  const [row] = await ds.query(
    `INSERT INTO chart_of_account (
       code, name, type, "parentId", "isSystem", "isPostable", "isActive", "isBankAccount", "isProviderClearing"
     ) VALUES ($1, $2, 'Asset', $3, false, true, true, true, false)
     RETURNING id, code, name`,
    [code, name, parent?.id ?? null],
  );
  return row;
}

export async function seedContraAccount(
  ds: DataSource,
  runId: string,
): Promise<{ id: string; code: string }> {
  const [parent] = await ds.query(
    `SELECT id FROM chart_of_account WHERE type = 'Expense' AND "isPostable" = false LIMIT 1`,
  );
  const code = `6999-${runId}`.slice(0, 20);
  const name = `Contra Acct ${runId}`;
  const [row] = await ds.query(
    `INSERT INTO chart_of_account (
       code, name, type, "parentId", "isSystem", "isPostable", "isActive", "isBankAccount", "isProviderClearing"
     ) VALUES ($1, $2, 'Expense', $3, false, true, true, false, false)
     RETURNING id, code`,
    [code, name, parent?.id ?? null],
  );
  return row;
}

export async function seedBankJournalLine(
  ds: DataSource,
  o: {
    bankAccountId: string;
    contraAccountId: string;
    entryDate: string;
    moneyIn?: string;
    moneyOut?: string;
    journalNo: string;
    sourceType?: string;
    sourceRef?: string;
    sourceDocumentId?: string;
    description?: string;
    reversalOfEntryId?: string;
  },
): Promise<{ entryId: string; lineId: string }> {
  const [entry] = await ds.query(
    `INSERT INTO journal_entry (
       "journalNo", "entryDate", "sourceType", "sourceRef", "sourceDocumentId", "postingType", description, "reversalOfEntryId", "createdBy"
     ) VALUES ($1, $2, $3, $4, $5, 'EXPENSE_PAYMENT', $6, $7, 'test')
     RETURNING id`,
    [
      o.journalNo,
      o.entryDate,
      o.sourceType ?? 'EXPENSE',
      o.sourceRef ?? null,
      o.sourceDocumentId ?? null,
      o.description ?? null,
      o.reversalOfEntryId ?? null,
    ],
  );

  const bankDebit = o.moneyIn ?? '0.0000';
  const bankCredit = o.moneyOut ?? '0.0000';
  const contraDebit = o.moneyOut ?? '0.0000';
  const contraCredit = o.moneyIn ?? '0.0000';

  const [bankLine] = await ds.query(
    `INSERT INTO journal_entry_line ("entryId", "accountId", debit, credit)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [entry.id, o.bankAccountId, bankDebit, bankCredit],
  );

  await ds.query(
    `INSERT INTO journal_entry_line ("entryId", "accountId", debit, credit)
     VALUES ($1, $2, $3, $4)`,
    [entry.id, o.contraAccountId, contraDebit, contraCredit],
  );

  return { entryId: entry.id, lineId: bankLine.id };
}

export async function insertReconciliationRaw(
  ds: DataSource,
  o: {
    reconciliationNo: string;
    bankAccountId: string;
    sequenceNo?: number;
    periodFrom?: string;
    periodTo?: string;
    openingBalance?: string;
    closingBalance?: string;
    status?: string;
    currentVersionNo?: number | null;
    lockVersion?: number;
  },
): Promise<string> {
  const [row] = await ds.query(
    `INSERT INTO bank_statement_reconciliations (
       "reconciliationNo", "bankAccountId", "sequenceNo", "periodFrom", "periodTo",
       "openingBalance", "closingBalance", status, "currentVersionNo", "lockVersion"
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      o.reconciliationNo,
      o.bankAccountId,
      o.sequenceNo ?? 1,
      o.periodFrom ?? '2026-01-01',
      o.periodTo ?? '2026-01-31',
      o.openingBalance ?? '0.0000',
      o.closingBalance ?? '0.0000',
      o.status ?? 'DRAFT',
      o.currentVersionNo ?? null,
      o.lockVersion ?? 1,
    ],
  );
  return row.id;
}

export async function insertCompletedReconciliationRaw(
  ds: DataSource,
  o: {
    reconciliationNo: string;
    bankAccountId: string;
    sequenceNo?: number;
    periodFrom?: string;
    periodTo?: string;
    openingBalance?: string;
    closingBalance?: string;
  },
): Promise<{ reconciliationId: string; versionId: string }> {
  const [acct] = await ds.query(
    `SELECT code, name FROM chart_of_account WHERE id = $1`,
    [o.bankAccountId],
  );

  const reconId = await insertReconciliationRaw(ds, {
    reconciliationNo: o.reconciliationNo,
    bankAccountId: o.bankAccountId,
    sequenceNo: o.sequenceNo ?? 1,
    periodFrom: o.periodFrom ?? '2026-01-01',
    periodTo: o.periodTo ?? '2026-01-31',
    openingBalance: o.openingBalance ?? '0.0000',
    closingBalance: o.closingBalance ?? '0.0000',
    status: 'DRAFT',
  });

  const [v] = await ds.query(
    `INSERT INTO bank_statement_reconciliation_versions (
       "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
       "bankAccountId", "bankAccountCode", "bankAccountName",
       "periodFrom", "periodTo", "openingBalance", "closingBalance", "sealedAt", "completedAt", "completedBy"
     ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now(), 'test')
     RETURNING id`,
    [
      reconId,
      o.reconciliationNo,
      o.sequenceNo ?? 1,
      o.bankAccountId,
      acct?.code ?? 'ACCT',
      acct?.name ?? 'Account',
      o.periodFrom ?? '2026-01-01',
      o.periodTo ?? '2026-01-31',
      o.openingBalance ?? '0.0000',
      o.closingBalance ?? '0.0000',
    ],
  );

  await ds.query(
    `UPDATE bank_statement_reconciliations
        SET status = 'COMPLETED', "currentVersionNo" = 1
      WHERE id = $1`,
    [reconId],
  );

  return { reconciliationId: reconId, versionId: v.id };
}

export async function removeSuiteBankReconciliations(
  ds: DataSource,
  reconciliationIds: string[],
): Promise<void> {
  if (!reconciliationIds || reconciliationIds.length === 0) return;

  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    // Disable triggers for cleanup
    await qr.query(`ALTER TABLE bank_statement_reconciliation_lines DISABLE TRIGGER trg_bsr_line_classification`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_setup_marks DISABLE TRIGGER trg_bsr_mark_classification`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_lines DISABLE TRIGGER trg_bsr_line_immutable_ids`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_setup_marks DISABLE TRIGGER trg_bsr_mark_immutable_ids`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_versions DISABLE TRIGGER trg_bsr_version_guard`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_version_lines DISABLE TRIGGER trg_bsr_version_line_guard`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_versions DISABLE TRIGGER trg_bsr_version_sealed_at_commit`);
    await qr.query(`ALTER TABLE bank_statement_reconciliations DISABLE TRIGGER trg_bsr_current_version_sealed`);

    // 1. Reset currentVersionNo = NULL and status = 'DRAFT' on all headers first to clear FK_bsr_current_version
    await qr.query(
      `UPDATE bank_statement_reconciliations
          SET "currentVersionNo" = NULL, status = 'DRAFT'
        WHERE id = ANY($1::uuid[])`,
      [reconciliationIds],
    );

    // 2. Delete version lines
    await qr.query(
      `DELETE FROM bank_statement_reconciliation_version_lines
        WHERE "versionId" IN (
          SELECT id FROM bank_statement_reconciliation_versions WHERE "reconciliationId" = ANY($1::uuid[])
        )`,
      [reconciliationIds],
    );

    // 3. Delete versions
    await qr.query(
      `DELETE FROM bank_statement_reconciliation_versions
        WHERE "reconciliationId" = ANY($1::uuid[])`,
      [reconciliationIds],
    );

    // 4. Delete headers (lines and marks cascade)
    await qr.query(
      `DELETE FROM bank_statement_reconciliations
        WHERE id = ANY($1::uuid[])`,
      [reconciliationIds],
    );

    // Re-enable triggers
    await qr.query(`ALTER TABLE bank_statement_reconciliation_lines ENABLE TRIGGER trg_bsr_line_classification`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_setup_marks ENABLE TRIGGER trg_bsr_mark_classification`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_lines ENABLE TRIGGER trg_bsr_line_immutable_ids`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_setup_marks ENABLE TRIGGER trg_bsr_mark_immutable_ids`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_versions ENABLE TRIGGER trg_bsr_version_guard`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_version_lines ENABLE TRIGGER trg_bsr_version_line_guard`);
    await qr.query(`ALTER TABLE bank_statement_reconciliation_versions ENABLE TRIGGER trg_bsr_version_sealed_at_commit`);
    await qr.query(`ALTER TABLE bank_statement_reconciliations ENABLE TRIGGER trg_bsr_current_version_sealed`);

    await qr.commitTransaction();
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
  }
}

export async function removeSuiteJournalEntries(
  ds: DataSource,
  entryIds: string[],
): Promise<void> {
  if (!entryIds || entryIds.length === 0) return;
  await ds.query(`DELETE FROM journal_entry_line WHERE "entryId" = ANY($1::uuid[])`, [entryIds]);
  await ds.query(`DELETE FROM journal_entry WHERE id = ANY($1::uuid[])`, [entryIds]);
}

export async function removeSuiteAccounts(
  ds: DataSource,
  accountIds: string[],
): Promise<void> {
  if (!accountIds || accountIds.length === 0) return;
  await ds.query(`DELETE FROM chart_of_account WHERE id = ANY($1::uuid[])`, [accountIds]);
}

export async function journalFingerprint(
  ds: DataSource,
  entryIds: string[],
): Promise<string> {
  if (!entryIds || entryIds.length === 0) return '';
  const rows = await ds.query(
    `SELECT e.id AS entry_id, e."journalNo", e."entryDate", e."sourceType", e."postingType",
            e.description, e."reversalOfEntryId",
            l.id AS line_id, l."accountId", l.debit, l.credit
       FROM journal_entry e
       JOIN journal_entry_line l ON l."entryId" = e.id
      WHERE e.id = ANY($1::uuid[])
      ORDER BY e.id, l.id`,
    [entryIds],
  );
  return crypto.createHash('md5').update(JSON.stringify(rows)).digest('hex');
}
