import { toMinorUnits, quantizeToCents, formatMoney } from '../../../common/utils/money';

export type AmountLine = { debit: string; credit: string };

export interface ReconciliationSummaryDto {
  openingBalance: string;
  closingBalance: string;
  moneyIn: string;
  moneyOut: string;
  calculatedClosingBalance: string;
  difference: string;
  openingClearedNet: string | null;
  openingBalanceDifference: string | null;
  unclassifiedCount: number | null;
}

/**
 * Quantizes an individual journal line's debit and credit to cents (scale-4 minor units,
 * divisible by 100). Money In is debit, Money Out is credit (Asset account).
 */
export function lineCents(line: AmountLine): { moneyIn: bigint; moneyOut: bigint } {
  const debitMinor = toMinorUnits(line.debit || '0');
  const creditMinor = toMinorUnits(line.credit || '0');
  return {
    moneyIn: quantizeToCents(debitMinor),
    moneyOut: quantizeToCents(creditMinor),
  };
}

/**
 * Computes reconciliation summary figures with exact whole-cent integer arithmetic (D13).
 * Each matched and openingCleared line's debit and credit is individually quantized to cents
 * before summing.
 */
export function computeSummary(i: {
  openingBalance: string;
  closingBalance: string;
  matched: AmountLine[];
  openingCleared: AmountLine[] | null;
  unclassifiedCount: number | null;
}): ReconciliationSummaryDto {
  const openingCents = quantizeToCents(toMinorUnits(i.openingBalance || '0'));
  const closingCents = quantizeToCents(toMinorUnits(i.closingBalance || '0'));

  let moneyInCents = 0n;
  let moneyOutCents = 0n;

  for (const line of i.matched) {
    const cents = lineCents(line);
    moneyInCents += cents.moneyIn;
    moneyOutCents += cents.moneyOut;
  }

  const calculatedClosingCents = openingCents + moneyInCents - moneyOutCents;
  const differenceCents = closingCents - calculatedClosingCents;

  let openingClearedNet: string | null = null;
  let openingBalanceDifference: string | null = null;

  if (i.openingCleared !== null) {
    let clearedNetCents = 0n;
    for (const line of i.openingCleared) {
      const cents = lineCents(line);
      clearedNetCents += cents.moneyIn - cents.moneyOut;
    }
    openingClearedNet = formatMoney(clearedNetCents);
    openingBalanceDifference = formatMoney(openingCents - clearedNetCents);
  }

  return {
    openingBalance: formatMoney(openingCents),
    closingBalance: formatMoney(closingCents),
    moneyIn: formatMoney(moneyInCents),
    moneyOut: formatMoney(moneyOutCents),
    calculatedClosingBalance: formatMoney(calculatedClosingCents),
    difference: formatMoney(differenceCents),
    openingClearedNet,
    openingBalanceDifference,
    unclassifiedCount: i.unclassifiedCount,
  };
}

/**
 * Determines sequence number, start date, and opening balance for the next period.
 * For sequence 1 (prev is null), periodFrom and openingBalance are null (chosen by user).
 * For subsequent reconciliations, sequenceNo increments, periodFrom is addOneDay(prev.periodTo),
 * and openingBalance matches prev.closingBalance.
 */
export function nextPeriodFrom(prev: {
  sequenceNo: number;
  periodTo: string;
  closingBalance: string;
} | null): {
  sequenceNo: number;
  isFirst: boolean;
  periodFrom: string | null;
  openingBalance: string | null;
} {
  if (!prev) {
    return {
      sequenceNo: 1,
      isFirst: true,
      periodFrom: null,
      openingBalance: null,
    };
  }

  return {
    sequenceNo: prev.sequenceNo + 1,
    isFirst: false,
    periodFrom: addOneDay(prev.periodTo),
    openingBalance: formatMoney(quantizeToCents(toMinorUnits(prev.closingBalance))),
  };
}

/**
 * Adds one day to a 'YYYY-MM-DD' date string using UTC calendar arithmetic without timezone bias.
 */
export function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes ascending sorted sets of added and removed IDs between current and desired collections.
 */
export function diffIds(current: string[], desired: string[]): { add: string[]; remove: string[] } {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);

  const add = Array.from(new Set(desired.filter((id) => !currentSet.has(id)))).sort();
  const remove = Array.from(new Set(current.filter((id) => !desiredSet.has(id)))).sort();

  return { add, remove };
}

/**
 * Evaluates completion gates from summary figures.
 * - closing: difference is exactly 0
 * - opening: null unless sequence 1; true when openingBalanceDifference is 0
 * - classification: null unless sequence 1; true when unclassifiedCount is 0
 */
export function completionGates(s: ReconciliationSummaryDto): {
  closing: boolean;
  opening: boolean | null;
  classification: boolean | null;
} {
  const closing = toMinorUnits(s.difference) === 0n;

  const opening =
    s.openingBalanceDifference === null
      ? null
      : toMinorUnits(s.openingBalanceDifference) === 0n;

  const classification =
    s.unclassifiedCount === null
      ? null
      : s.unclassifiedCount === 0;

  return { closing, opening, classification };
}
