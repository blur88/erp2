import { ChartOfAccountService } from './chart-of-account.service';
import { AccountType } from '../entities/account-type.enum';
import { BadRequestException, ConflictException } from '@nestjs/common';

function makeService(overrides: any = {}) {
  const accounts: any[] = overrides.accounts ?? [];
  const coaRepo = {
    findOne: async ({ where }: any) =>
      accounts.find((a) => (where.code && a.code === where.code) || (where.id && a.id === where.id)) ?? null,
    find: async () => accounts,
  };
  const settingsRepo = { findOne: async () => overrides.settings ?? { id: true } };
  const posting = { postOpeningBalance: jest.fn(async () => ({ journalEntryId: 'je-1' })) };
  const balance = { getLeafBalances: async () => new Map(), getRollup: () => 0n, naturalBalance: (_t: any, v: bigint) => v };
  const dataSource = {
    transaction: async (cb: any) => cb({
      getRepository: () => ({ create: (x: any) => x, save: async (x: any) => ({ ...x, id: 'new-id' }) }),
    }),
  };
  const svc = new ChartOfAccountService(coaRepo as any, settingsRepo as any, posting as any, balance as any, dataSource as any);
  return { svc, posting };
}

describe('ChartOfAccountService.create', () => {
  it('rejects duplicate code', async () => {
    const { svc } = makeService({ accounts: [{ id: '1', code: '1100', type: AccountType.ASSET }] });
    await expect(svc.create({ code: '1100', name: 'Dup', type: AccountType.ASSET } as any, 'admin'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects parent of a different type', async () => {
    const parent = { id: 'p', code: '2000', type: AccountType.LIABILITY, isActive: true, isPostable: false };
    const { svc } = makeService({ accounts: [parent] });
    await expect(svc.create({ code: '1500', name: 'X', type: AccountType.ASSET, parentId: 'p' } as any, 'admin'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('posts an opening-balance JE when openingBalance != 0', async () => {
    const { svc, posting } = makeService({ accounts: [] });
    await svc.create({ code: '1500', name: 'Petty Cash', type: AccountType.ASSET, openingBalance: '250.0000' } as any, 'admin');
    expect(posting.postOpeningBalance).toHaveBeenCalledTimes(1);
  });

  it('does not post a JE when openingBalance is 0', async () => {
    const { svc, posting } = makeService({ accounts: [] });
    await svc.create({ code: '1500', name: 'Petty Cash', type: AccountType.ASSET, openingBalance: '0' } as any, 'admin');
    expect(posting.postOpeningBalance).not.toHaveBeenCalled();
  });
});

describe('ChartOfAccountService.update', () => {
  it('blocks deactivating an account used in settings', async () => {
    const used = { id: 'cash', code: '1100', type: AccountType.ASSET, isActive: true };
    const { svc } = makeService({ accounts: [used], settings: { id: true, cashAccountId: 'cash' } });
    await expect(svc.update('cash', { isActive: false } as any, 'admin')).rejects.toBeInstanceOf(BadRequestException);
  });
});
