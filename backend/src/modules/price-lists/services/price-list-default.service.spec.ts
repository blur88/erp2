import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PriceList } from '@/database/entities';
import {
  PriceListDefaultService,
  PRICE_LIST_LOCK_KEY,
} from './price-list-default.service';

const fakeManager = (found: Partial<PriceList> | null) => {
  const calls: string[] = [];
  return {
    calls,
    query: (jest.fn as unknown as any)(async (sql: string) => {
      calls.push(`query:${sql}`);
      return [];
    }),
    findOne: (jest.fn as unknown as any)(async () => {
      calls.push('findOne');
      return found as PriceList | null;
    }),
    update: (jest.fn as unknown as any)(async () => {
      calls.push('update');
      return { affected: 1 };
    }),
    save: (jest.fn as unknown as any)(async (_entity: any, row: any) => {
      calls.push('save');
      return row;
    }),
  } as any;
};

describe('PriceListDefaultService', () => {
  const service = new PriceListDefaultService();

  it('acquires the advisory lock before loading the target', async () => {
    const m = fakeManager({ id: 'a', isActive: true, isDefault: false });
    await service.assignDefault(m, 'a');

    expect(m.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [
      PRICE_LIST_LOCK_KEY,
    ]);
    expect(m.calls[0]).toContain('pg_advisory_xact_lock');
    expect(m.calls.indexOf('findOne')).toBeGreaterThan(0);
  });

  it('throws NotFoundException when the target does not exist', async () => {
    const m = fakeManager(null);
    await expect(service.assignDefault(m, 'missing')).rejects.toThrow(
      NotFoundException,
    );
    expect(m.update).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });

  it('rejects an inactive target without writing', async () => {
    const m = fakeManager({ id: 'a', isActive: false, isDefault: false });
    await expect(service.assignDefault(m, 'a')).rejects.toThrow(
      BadRequestException,
    );
    expect(m.update).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });

  it('returns unchanged and performs no writes when already the default', async () => {
    const existing = { id: 'a', isActive: true, isDefault: true };
    const m = fakeManager(existing);

    const result = await service.assignDefault(m, 'a');

    expect(result).toBe(existing);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });

  it('unsets the incumbent before setting the target', async () => {
    const m = fakeManager({ id: 'a', isActive: true, isDefault: false });
    await service.assignDefault(m, 'a');

    expect(m.calls.indexOf('update')).toBeLessThan(m.calls.indexOf('save'));
  });

  it('scopes the unset to non-deleted rows only', async () => {
    const m = fakeManager({ id: 'a', isActive: true, isDefault: false });
    await service.assignDefault(m, 'a');

    const [, criteria] = m.update.mock.calls[0];
    expect(criteria.isDefault).toBe(true);
    expect(criteria.deletedAt).toBeDefined();
  });

  it('sets isDefault on the saved target', async () => {
    const m = fakeManager({ id: 'a', isActive: true, isDefault: false });
    const result = await service.assignDefault(m, 'a');

    expect(result.isDefault).toBe(true);
  });
});
