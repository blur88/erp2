import { DataSource } from "typeorm";

/**
 * Issue #1243. The six payment-method -> GL account pairs the migration
 * establishes, and the helpers the matrix suite uses to read postings back.
 *
 * Account assertions read journal_entry_line from the DATABASE, never the API
 * response: the response does not say which account a payment posted to, which
 * is the entire property under test.
 */
export interface MatrixCase {
  methodCode: string;
  accountCode: string;
  accountName: string;
}

export const MATRIX_CASES: ReadonlyArray<MatrixCase> = [
  { methodCode: "CASH", accountCode: "1100", accountName: "Cash" },
  { methodCode: "CIMB", accountCode: "1200", accountName: "CIMB" },
  { methodCode: "MAYBANK", accountCode: "1210", accountName: "Maybank" },
  { methodCode: "SHOPEE", accountCode: "1220", accountName: "Shopee" },
  { methodCode: "TIKTOK", accountCode: "1230", accountName: "TikTok" },
  { methodCode: "ATOME", accountCode: "1240", accountName: "Atome" },
];

export interface JournalLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  postingType: string;
}

/**
 * Money as integer cents, EXACTLY.
 *
 * Never compare NUMERIC(18,4) strings directly: the API returns '97.0000' for
 * a '97.00' input, so string equality is a formatting assertion, not a value
 * one.
 *
 * Throws on any non-zero fraction below one cent rather than rounding it away.
 * Rounding here would hide the exact class of defect this suite exists to
 * catch: a sub-cent residue from a bad split or an unquantized division would
 * silently become a passing assertion. A value like '25.0001' is a finding,
 * not an input to round.
 */
export function cents(v: string | number): number {
  const s = typeof v === "number" ? String(v) : v.trim();
  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m)
    throw new Error(`cents(): ${JSON.stringify(v)} is not a decimal string.`);

  const [, sign, whole, frac = ""] = m;

  // Digits past the second are permitted ONLY when all of them are zero.
  // '25.0000' is 2500; '25.0001' is a precision defect, not a value to round.
  const beyond = frac.slice(2);
  if (/[^0]/.test(beyond)) {
    throw new Error(
      `cents(): ${s} carries a non-zero fraction below one cent. This is a ` +
        `precision defect to investigate, not a value to round.`,
    );
  }

  const value = Number(whole) * 100 + Number(frac.slice(0, 2).padEnd(2, "0"));
  return sign === "-" ? -value : value;
}

/** Every journal line for one sourceRef this suite owns. */
export async function journalLinesFor(
  ds: DataSource,
  sourceRef: string,
): Promise<JournalLine[]> {
  return ds.query(
    `SELECT l."accountId", a.code AS "accountCode", a.name AS "accountName",
            l.debit, l.credit, e."postingType"
       FROM journal_entry_line l
       JOIN journal_entry e ON e.id = l."entryId"
       JOIN chart_of_account a ON a.id = l."accountId"
      WHERE e."sourceRef" = $1
      ORDER BY e."createdAt", l."createdAt"`,
    [sourceRef],
  );
}

/** Total debits equal total credits, to the cent, and the entry is non-empty. */
export function expectBalanced(lines: JournalLine[]): void {
  expect(lines.length).toBeGreaterThan(0);
  const debits = lines.reduce((s, l) => s + cents(l.debit), 0);
  const credits = lines.reduce((s, l) => s + cents(l.credit), 0);
  expect(debits).toBe(credits);
}

export async function accountIdByCode(
  ds: DataSource,
  code: string,
): Promise<string> {
  const rows = await ds.query(
    `SELECT id FROM chart_of_account WHERE code = $1`,
    [code],
  );
  expect(rows).toHaveLength(1);
  return rows[0].id;
}
