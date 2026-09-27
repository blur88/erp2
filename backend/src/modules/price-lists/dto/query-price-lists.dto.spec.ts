import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { QueryPriceListsDto } from './query-price-lists.dto';

// Query params arrive as strings; "false" must parse to false, not Boolean("false") === true (#1306).
describe.each(['isActive', 'isDefault'] as const)('QueryPriceListsDto %s', (field) => {
  it("parses 'true' to true", async () => {
    const dto = plainToInstance(QueryPriceListsDto, { [field]: 'true' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto[field]).toBe(true);
  });

  it("parses 'false' to false", async () => {
    const dto = plainToInstance(QueryPriceListsDto, { [field]: 'false' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto[field]).toBe(false);
  });

  it('leaves the field undefined when omitted', async () => {
    const dto = plainToInstance(QueryPriceListsDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto[field]).toBeUndefined();
  });

  it('treats an empty string as omitted', async () => {
    const dto = plainToInstance(QueryPriceListsDto, { [field]: '' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto[field]).toBeUndefined();
  });

  it('rejects an unrecognised value', async () => {
    const dto = plainToInstance(QueryPriceListsDto, { [field]: 'yes' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === field)).toBe(true);
  });
});
