import { NotFoundException } from '@nestjs/common';
import { repoFor, lockRowForUpdate } from './tx-helpers';

class Dummy {
  id: string;
}

describe('tx-helpers', () => {
  describe('repoFor', () => {
    it('returns the fallback repository when no manager is supplied', () => {
      const fallback = { marker: 'fallback' } as any;
      expect(repoFor(undefined, Dummy, fallback)).toBe(fallback);
    });

    it("returns the manager's repository when a manager is supplied", () => {
      const managerRepo = { marker: 'manager' } as any;
      const manager = { getRepository: jest.fn().mockReturnValue(managerRepo) } as any;
      const fallback = { marker: 'fallback' } as any;

      expect(repoFor(manager, Dummy, fallback)).toBe(managerRepo);
      expect(manager.getRepository).toHaveBeenCalledWith(Dummy);
    });
  });

  describe('lockRowForUpdate', () => {
    it('locks the BARE row FOR UPDATE (no relations join — Postgres rejects FOR UPDATE over an outer join)', async () => {
      const locked = { id: 'x1' };
      const findOne = jest.fn().mockResolvedValue(locked);
      const manager = { getRepository: jest.fn().mockReturnValue({ findOne }) } as any;

      const result = await lockRowForUpdate(manager, Dummy, 'x1', { notFoundMessage: 'Dummy not found' });

      expect(result).toBe(locked);
      expect(findOne).toHaveBeenCalledTimes(1);
      expect(findOne).toHaveBeenCalledWith({
        where: { id: 'x1' },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('locks bare then hydrates relations in a SEPARATE unlocked read on the same manager', async () => {
      const locked = { id: 'x1' };
      const withRelations = { id: 'x1', foo: { id: 'f1' } };
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(locked) // step 1: bare lock
        .mockResolvedValueOnce(withRelations); // step 2: relations
      const manager = { getRepository: jest.fn().mockReturnValue({ findOne }) } as any;

      const result = await lockRowForUpdate(manager, Dummy, 'x1', {
        relations: { foo: true } as any,
        notFoundMessage: 'Dummy not found',
      });

      expect(result).toBe(withRelations);
      // Step 1 takes the lock on the bare row (no relations in the query).
      expect(findOne).toHaveBeenNthCalledWith(1, {
        where: { id: 'x1' },
        lock: { mode: 'pessimistic_write' },
      });
      // Step 2 loads relations without a lock (no FOR UPDATE over the join).
      expect(findOne).toHaveBeenNthCalledWith(2, {
        where: { id: 'x1' },
        relations: { foo: true },
      });
    });

    it('throws NotFoundException with the supplied message when the bare row is absent', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const manager = { getRepository: jest.fn().mockReturnValue({ findOne }) } as any;

      await expect(
        lockRowForUpdate(manager, Dummy, 'missing', { notFoundMessage: 'Dummy not found' }),
      ).rejects.toThrow(new NotFoundException('Dummy not found'));
    });
  });
});
