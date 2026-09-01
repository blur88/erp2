import {
  FORM_B_LINES, EXPENSE_CATEGORY_LINE, INCOME_CATEGORY_LINE, FORM_VERSION,
} from './form-b.categories';
import { FormBExpenseCategory, FormBIncomeCategory } from '../entities/form-b-category.enum';

describe('form-b.categories', () => {
  it('pins the form version at 2025', () => {
    expect(FORM_VERSION).toBe(2025);
  });

  it('declares N3 through N27 in order with no gaps', () => {
    expect(FORM_B_LINES.map((l) => l.line)).toEqual(
      Array.from({ length: 25 }, (_, i) => `N${i + 3}`),
    );
  });

  it('maps every expense category to a distinct line N15-N24', () => {
    const lines = Object.values(EXPENSE_CATEGORY_LINE);
    expect(lines).toEqual(['N15','N16','N17','N18','N19','N20','N21','N22','N23','N24']);
    expect(new Set(lines).size).toBe(10);
    expect(Object.keys(EXPENSE_CATEGORY_LINE).sort())
      .toEqual(Object.values(FormBExpenseCategory).sort());
  });

  it('maps every income category to a distinct line N9-N13', () => {
    const lines = Object.values(INCOME_CATEGORY_LINE);
    expect(lines).toEqual(['N9','N10','N11','N12','N13']);
    expect(Object.keys(INCOME_CATEGORY_LINE).sort())
      .toEqual(Object.values(FormBIncomeCategory).sort());
  });

  it('carries formulas only on derived lines', () => {
    const byLine = new Map(FORM_B_LINES.map((l) => [l.line, l]));
    expect(byLine.get('N7')!.formula).toBe('N4 + N5 - N6');
    expect(byLine.get('N8')!.formula).toBe('N3 - N7');
    expect(byLine.get('N14')!.formula).toBe('N9 to N13');
    expect(byLine.get('N25')!.formula).toBe('N15 to N24');
    expect(byLine.get('N26')!.formula).toBe('N8 + N14 - N25');
    expect(byLine.get('N3')!.formula).toBeNull();
    expect(byLine.get('N27')!.formula).toBeNull();
  });

  it('marks N27 as filer input, never derived', () => {
    const byLine = new Map(FORM_B_LINES.map((l) => [l.line, l]));
    expect(byLine.get('N27')!.kind).toBe('filerInput');
  });
});
