import { getMetadataArgsStorage } from 'typeorm';
import { BankReconciliation, BankReconciliationStatus } from '../bank-reconciliation.entity';
import { BankReconciliationLine, BankReconciliationLineKind } from '../bank-reconciliation-line.entity';
import { BankReconciliationSetupMark } from '../bank-reconciliation-setup-mark.entity';
import { BankReconciliationVersion } from '../bank-reconciliation-version.entity';
import { BankReconciliationVersionLine, BankReconciliationVersionLineRole } from '../bank-reconciliation-version-line.entity';

describe('bank reconciliation entities', () => {
  const entityClasses = [
    BankReconciliation,
    BankReconciliationLine,
    BankReconciliationSetupMark,
    BankReconciliationVersion,
    BankReconciliationVersionLine,
  ];

  function indexOf(target: any, name: string) {
    const indices = getMetadataArgsStorage().indices.filter((i) => i.target === target);
    const found = indices.find((i) => i.name === name);
    if (!found) return undefined;
    return {
      name: found.name,
      isUnique: found.unique,
      where: found.where,
      columns: typeof found.columns === 'function' ? undefined : (found.columns as string[]),
    };
  }

  it('uses the bank_statement_reconciliation table prefix and never the legacy names', () => {
    const tables = getMetadataArgsStorage().tables.filter((t) => entityClasses.includes(t.target as any));
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toEqual([
      'bank_statement_reconciliations',
      'bank_statement_reconciliation_lines',
      'bank_statement_reconciliation_setup_marks',
      'bank_statement_reconciliation_versions',
      'bank_statement_reconciliation_version_lines',
    ]);
  });

  it('declares the reservation as an unconditional unique index on journalEntryLineId', () => {
    expect(indexOf(BankReconciliationLine, 'UQ_bsr_line_journal_line')).toMatchObject({
      isUnique: true,
      where: undefined,
      columns: ['journalEntryLineId'],
    });
  });

  it('declares one Draft per account as a partial unique index', () => {
    expect(indexOf(BankReconciliation, 'UQ_bsr_one_draft_per_account')).toMatchObject({
      isUnique: true,
      where: `status = 'DRAFT'`,
    });
  });

  it('gives version lines no unique index on journalEntryLineId alone', () => {
    const indices = getMetadataArgsStorage().indices.filter(
      (i) => i.target === BankReconciliationVersionLine && i.unique,
    );
    const singleJelIndex = indices.find(
      (i) => Array.isArray(i.columns) && i.columns.length === 1 && i.columns[0] === 'journalEntryLineId',
    );
    expect(singleJelIndex).toBeUndefined();
    expect(indexOf(BankReconciliationVersionLine, 'UQ_bsr_version_line')).toMatchObject({
      isUnique: true,
      columns: ['versionId', 'journalEntryLineId'],
    });
  });

  it('has no cascade on version history', () => {
    const relations = getMetadataArgsStorage().relations.filter(
      (r) => r.target === BankReconciliationVersion || r.target === BankReconciliationVersionLine,
    );
    for (const rel of relations) {
      if (rel.relationType === 'many-to-one') {
        const join = rel.options.onDelete;
        expect(join).toBe('RESTRICT');
      }
    }
  });

  it('exports expected status and role enums', () => {
    expect(Object.values(BankReconciliationStatus)).toEqual(['DRAFT', 'COMPLETED']);
    expect(Object.values(BankReconciliationLineKind)).toEqual(['MATCHED', 'OPENING_CLEARED']);
    expect(Object.values(BankReconciliationVersionLineRole)).toEqual([
      'MATCHED',
      'OUTSTANDING',
      'OPENING_CLEARED',
    ]);
  });
});
