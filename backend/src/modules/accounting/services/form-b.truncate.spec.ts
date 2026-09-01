import { truncateToRinggit } from './form-b.categories';
import { toMinorUnits, formatScale4 } from '@/common/utils/money';

const t = (v: string) => formatScale4(truncateToRinggit(toMinorUnits(v)));

describe('truncateToRinggit', () => {
  // HASiL FAQ worked example.
  it('drops the sen without rounding (RM125,955.67 -> RM125,955)', () => {
    expect(t('125955.6700')).toBe('125955.0000');
  });

  it('never rounds up, however close to the next ringgit', () => {
    expect(t('1234.9900')).toBe('1234.0000');
    expect(t('1234.0100')).toBe('1234.0000');
    expect(t('0.9999')).toBe('0.0000');
  });

  // Toward zero, not floor: flooring would overstate a loss.
  it('truncates negatives toward zero', () => {
    expect(t('-1234.9900')).toBe('-1234.0000');
    // Truncating -0.99 toward zero IS zero; there is no negative zero here.
    expect(t('-0.9999')).toBe('0.0000');
  });

  it('leaves whole ringgit untouched', () => {
    expect(t('1234.0000')).toBe('1234.0000');
    expect(t('0.0000')).toBe('0.0000');
  });

  it('handles large NUMERIC(18,4) magnitudes', () => {
    expect(t('99999999999999.9900')).toBe('99999999999999.0000');
  });
});
