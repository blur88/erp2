import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { QueryPaymentMethodsDto } from './payment-method.dto';

// Query params arrive as strings; "false" must parse to false, not Boolean("false") === true (#1307).
describe.each(['isActive', 'forPurchases'] as const)('QueryPaymentMethodsDto %s', (field) => {
  it("parses 'true' to true", async () => {
    const dto = plainToInstance(QueryPaymentMethodsDto, { [field]: 'true' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto[field]).toBe(true);
  });

  it("parses 'false' to false", async () => {
    const dto = plainToInstance(QueryPaymentMethodsDto, { [field]: 'false' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto[field]).toBe(false);
  });

  it('leaves the field undefined when omitted', async () => {
    const dto = plainToInstance(QueryPaymentMethodsDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto[field]).toBeUndefined();
  });

  it('treats an empty string as omitted', async () => {
    const dto = plainToInstance(QueryPaymentMethodsDto, { [field]: '' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto[field]).toBeUndefined();
  });

  it('rejects an unrecognised value', async () => {
    const dto = plainToInstance(QueryPaymentMethodsDto, { [field]: 'yes' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === field)).toBe(true);
  });
});
