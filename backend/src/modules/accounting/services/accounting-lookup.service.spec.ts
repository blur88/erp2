import { AccountingLookupService } from './accounting-lookup.service';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import { AccountType } from '../entities/account-type.enum';

function fakeManager(settings: Partial<AccountingSettings>, accounts: ChartOfAccount[]) {
  return {
    getRepository(entity: any) {
      if (entity === AccountingSettings) {
        return { findOne: async () => ({ id: true, ...settings }) };
      }
      return { findOne: async ({ where }: any) => accounts.find((a) => a.id === where.id) ?? null };
    },
  } as any;
}

function acc(id: string, type: AccountType, opts: Partial<ChartOfAccount> = {}): ChartOfAccount {
  return Object.assign(new ChartOfAccount(), { id, type, isActive: true, isPostable: true }, opts);
}

describe('AccountingLookupService', () => {
  it('resolves a mapped postable active account', async () => {
    const cash = acc('cash-id', AccountType.ASSET);
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager({ cashAccountId: 'cash-id' }, [cash]);
    await expect(svc.resolveAccount('cash', mgr)).resolves.toBe(cash);
  });

  it('throws when mapping is unset', async () => {
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager({ cashAccountId: null }, []);
    await expect(svc.resolveAccount('cash', mgr)).rejects.toThrow();
  });

  it('throws when mapped account is inactive', async () => {
    const cash = acc('cash-id', AccountType.ASSET, { isActive: false });
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager({ cashAccountId: 'cash-id' }, [cash]);
    await expect(svc.resolveAccount('cash', mgr)).rejects.toThrow();
  });

  it('resolves channel account', async () => {
    const bank = acc('bank-id', AccountType.ASSET);
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager({ bankAccountId: 'bank-id' }, [bank]);
    await expect(svc.resolveChannelAccount('BANK', mgr)).resolves.toBe(bank);
  });
});
