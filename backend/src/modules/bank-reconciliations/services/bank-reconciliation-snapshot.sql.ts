export const INSERT_VERSION_LINES_SQL = `
INSERT INTO bank_statement_reconciliation_version_lines (
  id,
  "createdAt",
  "versionId",
  "journalEntryLineId",
  role,
  "entryDate",
  "journalEntryId",
  "journalNo",
  "sourceType",
  "sourceDocumentId",
  "sourceRef",
  description,
  "moneyIn",
  "moneyOut",
  "addedBy",
  "addedAt",
  "setupMarked",
  "setupMarkedBy",
  "setupMarkedAt"
)
SELECT
  gen_random_uuid(),
  now(),
  $1,
  u."journalEntryLineId",
  u.role::"bank_statement_reconciliation_version_lines_role_enum",
  u."entryDate",
  u."journalEntryId",
  u."journalNo",
  u."sourceType",
  u."sourceDocumentId",
  u."sourceRef",
  u.description,
  u."moneyIn",
  u."moneyOut",
  u."addedBy",
  u."addedAt",
  u."setupMarked",
  u."setupMarkedBy",
  u."setupMarkedAt"
FROM (
  -- Part 1: Working lines in this reconciliation (joined to live journal data)
  SELECT
    jel.id AS "journalEntryLineId",
    rl.kind::text AS role,
    je."entryDate",
    je.id AS "journalEntryId",
    je."journalNo",
    je."sourceType"::text AS "sourceType",
    je."sourceDocumentId",
    je."sourceRef",
    je.description,
    ROUND(jel.debit, 2) AS "moneyIn",
    ROUND(jel.credit, 2) AS "moneyOut",
    rl."addedBy",
    rl."addedAt",
    (sm.id IS NOT NULL) AS "setupMarked",
    sm."markedBy" AS "setupMarkedBy",
    sm."markedAt" AS "setupMarkedAt"
  FROM bank_statement_reconciliation_lines rl
  JOIN journal_entry_line jel ON jel.id = rl."journalEntryLineId"
  JOIN journal_entry je ON je.id = jel."entryId"
  LEFT JOIN bank_statement_reconciliation_setup_marks sm
    ON sm."reconciliationId" = rl."reconciliationId" AND sm."journalEntryLineId" = rl."journalEntryLineId"
  WHERE rl."reconciliationId" = $2
    AND jel."deletedAt" IS NULL
    AND je."deletedAt" IS NULL

  UNION ALL

  -- Part 2: Eligible journal lines with NO row in bank_statement_reconciliation_lines at all
  SELECT
    jel.id AS "journalEntryLineId",
    'OUTSTANDING' AS role,
    je."entryDate",
    je.id AS "journalEntryId",
    je."journalNo",
    je."sourceType"::text AS "sourceType",
    je."sourceDocumentId",
    je."sourceRef",
    je.description,
    ROUND(jel.debit, 2) AS "moneyIn",
    ROUND(jel.credit, 2) AS "moneyOut",
    NULL AS "addedBy",
    NULL AS "addedAt",
    (sm.id IS NOT NULL) AS "setupMarked",
    sm."markedBy" AS "setupMarkedBy",
    sm."markedAt" AS "setupMarkedAt"
  FROM journal_entry_line jel
  JOIN journal_entry je ON je.id = jel."entryId"
  LEFT JOIN bank_statement_reconciliation_setup_marks sm
    ON sm."reconciliationId" = $2 AND sm."journalEntryLineId" = jel.id
  WHERE jel."accountId" = $3
    AND jel."deletedAt" IS NULL
    AND je."deletedAt" IS NULL
    AND je."entryDate" <= $4::date
    AND NOT EXISTS (
      SELECT 1 FROM bank_statement_reconciliation_lines rl
       WHERE rl."journalEntryLineId" = jel.id
    )
) u
ORDER BY u."entryDate" ASC, u."journalNo" ASC, u."journalEntryLineId" ASC
`;
