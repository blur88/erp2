import { AccountingLookupService } from './accounting-lookup.service';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import { AccountType } from '../entities/account-type.enum';
import { PaymentMethodAccountMapping } from '../entities/payment-method-account-mapping.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';

function fakeManager(
  settings: Partial<AccountingSettings>,
  accounts: ChartOfAccount[],
  mappings: { paymentMethodId: string; accountId: string }[] = [],
  methods: { id: string; name: string }[] = [],
) {
  return {
    getRepository(entity: any) {
      if (entity === AccountingSettings) {
        return { findOne: async () => ({ id: true, ...settings }) };
      }
      if (entity === PaymentMethodAccountMapping) {
        return {
          findOne: async ({ where }: any) =>
            mappings.find((m) => m.paymentMethodId === where.paymentMethodId) ?? null,
        };
      }
      if (entity === PaymentMethodEntity) {
        return {
          findOne: async ({ where }: any) => methods.find((m) => m.id === where.id) ?? null,
        };
      }
      return {
        // Mirrors TypeORM's default: soft-deleted rows are excluded unless
        // withDeleted is passed. This is what makes a soft-deleted mapped
        // account resolve as "missing".
        findOne: async ({ where, withDeleted }: any) => {
          const found = accounts.find((a) => a.id === where.id);
          if (!found) return null;
          if ((found as any).deletedAt && !withDeleted) return null;
          return found;
        },
      };
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

});

describe('resolvePaymentAccount', () => {
  const maybank = { id: 'pm-maybank', name: 'Maybank' };

  it('prefers the mapped account over the channel default', async () => {
    const bank = acc('bank-id', AccountType.ASSET);
    const mapped = acc('maybank-acct', AccountType.ASSET);
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager(
      { bankAccountId: 'bank-id' }, [bank, mapped],
      [{ paymentMethodId: 'pm-maybank', accountId: 'maybank-acct' }], [maybank],
    );
    await expect(svc.resolvePaymentAccount('BANK', 'pm-maybank', mgr)).resolves.toBe(mapped);
  });

  it('falls back to the channel default when the method has no mapping', async () => {
    const bank = acc('bank-id', AccountType.ASSET);
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager({ bankAccountId: 'bank-id' }, [bank], [], [maybank]);
    await expect(svc.resolvePaymentAccount('BANK', 'pm-maybank', mgr)).resolves.toBe(bank);
  });

  it('falls back to the channel default when no paymentMethodId is given', async () => {
    const cash = acc('cash-id', AccountType.ASSET);
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager({ cashAccountId: 'cash-id' }, [cash]);
    await expect(svc.resolvePaymentAccount('CASH', undefined, mgr)).resolves.toBe(cash);
  });

  it('throws when the mapped account is inactive, naming method and account', async () => {
    const bank = acc('bank-id', AccountType.ASSET);
    const mapped = acc('maybank-acct', AccountType.ASSET, {
      isActive: false, code: '1210', name: 'Maybank',
    } as any);
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager(
      { bankAccountId: 'bank-id' }, [bank, mapped],
      [{ paymentMethodId: 'pm-maybank', accountId: 'maybank-acct' }], [maybank],
    );
    await expect(svc.resolvePaymentAccount('BANK', 'pm-maybank', mgr))
      .rejects.toThrow("Payment method 'Maybank' is mapped to account '1210 Maybank', which is inactive");
  });

  it('throws when the mapped account is not postable', async () => {
    const bank = acc('bank-id', AccountType.ASSET);
    const mapped = acc('maybank-acct', AccountType.ASSET, {
      isPostable: false, code: '1210', name: 'Maybank',
    } as any);
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager(
      { bankAccountId: 'bank-id' }, [bank, mapped],
      [{ paymentMethodId: 'pm-maybank', accountId: 'maybank-acct' }], [maybank],
    );
    await expect(svc.resolvePaymentAccount('BANK', 'pm-maybank', mgr))
      .rejects.toThrow('is not postable');
  });

  it('throws with the account UUID when the mapped account is missing', async () => {
    const bank = acc('bank-id', AccountType.ASSET);
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager(
      { bankAccountId: 'bank-id' }, [bank],
      [{ paymentMethodId: 'pm-maybank', accountId: 'gone-acct' }], [maybank],
    );
    await expect(svc.resolvePaymentAccount('BANK', 'pm-maybank', mgr))
      .rejects.toThrow("Payment method 'Maybank' is mapped to account gone-acct (not found or deleted)");
  });

  /*
   * FK RESTRICT only blocks PHYSICAL deletion, so it never fires on a soft
   * delete: a soft-deleted account stays referenced by a live mapping. The
   * protection is TypeORM's default findOne exclusion, which drops the row and
   * sends it down the "missing" branch. This test exists so that adding
   * `withDeleted: true` to that lookup — which would silently start posting to
   * deleted accounts — turns red.
   */
  it('throws when the mapped account is soft-deleted', async () => {
    const bank = acc('bank-id', AccountType.ASSET);
    const mapped = acc('maybank-acct', AccountType.ASSET, {
      deletedAt: new Date(), code: '1210', name: 'Maybank',
    } as any);
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager(
      { bankAccountId: 'bank-id' }, [bank, mapped],
      [{ paymentMethodId: 'pm-maybank', accountId: 'maybank-acct' }], [maybank],
    );
    await expect(svc.resolvePaymentAccount('BANK', 'pm-maybank', mgr))
      .rejects.toThrow('not found or deleted');
  });

  it('throws when the fallback account is itself inactive', async () => {
    const bank = acc('bank-id', AccountType.ASSET, { isActive: false });
    const svc = new AccountingLookupService({} as any, {} as any);
    const mgr = fakeManager({ bankAccountId: 'bank-id' }, [bank], [], [maybank]);
    await expect(svc.resolvePaymentAccount('BANK', 'pm-maybank', mgr)).rejects.toThrow();
  });
});
