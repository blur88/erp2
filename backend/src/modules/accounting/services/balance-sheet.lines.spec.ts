// balance-sheet.lines.spec.ts
import { BALANCE_SHEET_LINES, SETTINGS_KEY_LINE } from './balance-sheet.lines';

describe('BALANCE_SHEET_LINES', () => {
  it('contains N28..N50 in official order', () => {
    const expected = Array.from({ length: 23 }, (_, i) => `N${28 + i}`);
    expect(BALANCE_SHEET_LINES.map((l) => l.line)).toEqual(expected);
  });

  it('marks exactly N32, N40, N41, N45, N50 as totals', () => {
    const totals = BALANCE_SHEET_LINES.filter((l) => l.isTotal).map((l) => l.line);
    expect(totals).toEqual(['N32', 'N40', 'N41', 'N45', 'N50']);
  });

  it('gives every total a formula and every mapped line none', () => {
    for (const l of BALANCE_SHEET_LINES) {
      if (l.isTotal) expect(l.formula).toBeTruthy();
      if (l.kind === 'mapped') expect(l.formula).toBeNull();
    }
  });

  it('routes N48 through derivedProfit, not mapped', () => {
    expect(BALANCE_SHEET_LINES.find((l) => l.line === 'N48')!.kind).toBe('derivedProfit');
  });

  it('maps the eight configured settings keys to their LHDN lines', () => {
    expect(SETTINGS_KEY_LINE).toEqual({
      cashAccountId: 'N37',
      bankAccountId: 'N38',
      inventoryAccountId: 'N34',
      supplierDepositAccountId: 'N39',
      customerDepositAccountId: 'N44',
      ownerCapitalAccountId: 'N46',
      ownerDrawingsAccountId: 'N49',
    });
  });
});
