import { AccountingSettingsService } from './accounting-settings.service';
import { AccountType } from '../entities/account-type.enum';
import { BadRequestException } from '@nestjs/common';

function makeService(accounts: any[]) {
  const settingsRepo = {
    findOne: async () => ({ id: true }),
    save: async (x: any) => x,
    create: (x: any) => x,
  };
  const coaRepo = { findOne: async ({ where }: any) => accounts.find((a) => a.id === where.id) ?? null };
  return new AccountingSettingsService(settingsRepo as any, coaRepo as any);
}

describe('AccountingSettingsService.update', () => {
  it('rejects a cash mapping to a non-Asset account', async () => {
    const svc = makeService([{ id: 'x', type: AccountType.INCOME, isActive: true, isPostable: true }]);
    await expect(svc.update({ cashAccountId: 'x' } as any, 'admin')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects a mapping to an inactive account', async () => {
    const svc = makeService([{ id: 'x', type: AccountType.ASSET, isActive: false, isPostable: true }]);
    await expect(svc.update({ cashAccountId: 'x' } as any, 'admin')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts a valid Asset cash mapping', async () => {
    const svc = makeService([{ id: 'x', type: AccountType.ASSET, isActive: true, isPostable: true }]);
    await expect(svc.update({ cashAccountId: 'x' } as any, 'admin')).resolves.toBeDefined();
  });
});
