import { AccountingSourceType, PostingType } from '../../../common/accounting-posting/enums';

/**
 * SQL MIRROR of ProviderSettlementDerivationService.clearingAccountFor() (#1285).
 *
 * The TS derivation is authoritative for save and post. This exists only so the
 * picker can filter BEFORE pagination. Every rule below corresponds to a check
 * there; change both together. test/provider-clearing-derivation-parity.e2e-spec.ts
 * is the drift gate.
 *
 * `source` is a relation exposing id, "salesOrderId", amount. Returns one row
 * ("paymentId", "clearingAccountId") per payment the TS derivation ACCEPTS; a
 * payment it would reject is simply absent.
 *
 * deletedAt filters mirror TypeORM, which hides soft-deleted entries and lines
 * from the derivation's find()/relations.
 */
export function derivedClearingAccountSql(
  source: string,
  bind: (v: unknown) => string,
  depositAccountId: string,
): string {
  const dep = bind(depositAccountId);
  const soType = bind(AccountingSourceType.SALES_ORDER);
  const refundType = bind(PostingType.SALES_REFUND);
  const paymentType = bind(PostingType.SALES_PAYMENT);
  return `
    SELECT m."paymentId",
           (min(l."accountId"::text) FILTER (WHERE l."accountId" <> ${dep}::uuid))::uuid AS "clearingAccountId"
      FROM (
        -- Exactly one active, unreversed entry on the FULL key.
        SELECT src.id AS "paymentId", src.amount < 0 AS refund, abs(src.amount) AS amt,
               min(je.id::text)::uuid AS "entryId"
          FROM ${source} src
          JOIN journal_entry je
            ON je."sourceEventId" = src.id
           AND je."sourceType"::text = ${soType}
           AND je."sourceDocumentId" = src."salesOrderId"
           AND je."postingType"::text = CASE WHEN src.amount < 0 THEN ${refundType} ELSE ${paymentType} END
           AND je."reversalOfEntryId" IS NULL
           AND je."deletedAt" IS NULL
           AND NOT EXISTS (SELECT 1 FROM journal_entry rev
                            WHERE rev."reversalOfEntryId" = je.id AND rev."deletedAt" IS NULL)
         GROUP BY src.id, src.amount
        HAVING count(*) = 1
      ) m
      JOIN journal_entry_line l ON l."entryId" = m."entryId" AND l."deletedAt" IS NULL
     GROUP BY m."paymentId", m.refund, m.amt
    -- Exactly two lines, exactly one on customer deposit, each carrying the full
    -- amount on its own side and zero on the other.
    HAVING count(*) = 2
       AND count(*) FILTER (WHERE l."accountId" = ${dep}::uuid) = 1
       AND bool_and(CASE
             WHEN l."accountId" = ${dep}::uuid THEN
               CASE WHEN m.refund THEN l.debit = m.amt AND l.credit = 0
                    ELSE l.credit = m.amt AND l.debit = 0 END
             ELSE
               CASE WHEN m.refund THEN l.credit = m.amt AND l.debit = 0
                    ELSE l.debit = m.amt AND l.credit = 0 END
           END)`;
}
