import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { BaseQueryDto } from './base-query.dto';

describe('BaseQueryDto sortOrder', () => {
  it('accepts lowercase sortOrder and normalizes to uppercase', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'asc' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.sortOrder).toBe('ASC');
  });

  it('accepts uppercase sortOrder unchanged', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'DESC' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.sortOrder).toBe('DESC');
  });

  it('rejects a non-direction sortOrder value', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'sideways' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'sortOrder')).toBe(true);
  });

  it('leaves sortOrder undefined when omitted', async () => {
    const dto = plainToInstance(BaseQueryDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.sortOrder).toBeUndefined();
  });
});
