import { validate } from 'class-validator';
import { IsMoneyAtLeast } from './is-money-at-least.validator';

class OneCentFloor {
  @IsMoneyAtLeast('0.0100')
  amount: any;
}

class ZeroFloor {
  @IsMoneyAtLeast('0.0000')
  amount: any;
}

const errorsFor = async (cls: new () => any, value: any) => {
  const obj = new cls();
  obj.amount = value;
  return validate(obj);
};

describe('IsMoneyAtLeast', () => {
  it('accepts a value exactly at the 0.01 floor', async () => {
    expect(await errorsFor(OneCentFloor, '0.01')).toHaveLength(0);
  });

  it('accepts a value above the floor', async () => {
    expect(await errorsFor(OneCentFloor, '1000.0000')).toHaveLength(0);
  });

  it('rejects zero against the 0.01 floor', async () => {
    expect(await errorsFor(OneCentFloor, '0')).toHaveLength(1);
  });

  it('rejects 0.0001 against the 0.01 floor', async () => {
    // A bare non-zero check would wrongly admit this.
    expect(await errorsFor(OneCentFloor, '0.0001')).toHaveLength(1);
  });

  it('rejects 0.0099 against the 0.01 floor', async () => {
    expect(await errorsFor(OneCentFloor, '0.0099')).toHaveLength(1);
  });

  it('accepts zero when the floor is zero', async () => {
    expect(await errorsFor(ZeroFloor, '0')).toHaveLength(0);
  });

  // Decorator order is not guaranteed, so this must fail closed rather than
  // letting toMinorUnits throw a 500.
  it('returns a validation error, not a throw, for non-numeric text', async () => {
    await expect(errorsFor(OneCentFloor, 'abc')).resolves.toHaveLength(1);
  });

  it('returns a validation error for exponential notation', async () => {
    await expect(errorsFor(OneCentFloor, '1e3')).resolves.toHaveLength(1);
  });

  it('returns a validation error for more than 4 fractional digits', async () => {
    await expect(errorsFor(OneCentFloor, '1.00001')).resolves.toHaveLength(1);
  });

  it('returns a validation error for a JS number', async () => {
    await expect(errorsFor(OneCentFloor, 1000)).resolves.toHaveLength(1);
  });

  it('returns a validation error for null and undefined', async () => {
    await expect(errorsFor(OneCentFloor, null)).resolves.toHaveLength(1);
    await expect(errorsFor(OneCentFloor, undefined)).resolves.toHaveLength(1);
  });
});
