import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { BaseQueryDto } from './base-query.dto';

describe('BaseQueryDto', () => {
  it('accepts uppercase ASC', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'ASC' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.sortOrder).toBe('ASC');
  });

  it('accepts uppercase DESC', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'DESC' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.sortOrder).toBe('DESC');
  });

  it('normalizes lowercase asc to ASC', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'asc' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.sortOrder).toBe('ASC');
  });

  it('normalizes lowercase desc to DESC', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'desc' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.sortOrder).toBe('DESC');
  });

  it('rejects invalid sortOrder values', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'INVALID' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts omitted sortOrder', async () => {
    const dto = plainToInstance(BaseQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
