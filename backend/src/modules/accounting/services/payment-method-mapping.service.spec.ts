import { PaymentMethodMappingService } from './payment-method-mapping.service';

function svcWith(opts: {
  methods?: any[];
  accounts?: any[];
  mappings?: any[];
  deleted?: string[];
  captured?: { deletes: string[]; inserts: any[] };
}) {
  const methods = opts.methods ?? [];
  const accounts = opts.accounts ?? [];
  const mappings = opts.mappings ?? [];
  const captured = opts.captured ?? { deletes: [], inserts: [] };

  /*
   * Honors its options argument, like accountRepo below. setMappings issues
   * TWO method reads — an active-only one that authorises assignment, and a
   * `withDeleted: true` one that authorises a clear. A fake that always
   * filtered to active would make the clear-an-inactive-method tests pass
   * whether or not the service actually widened its lookup.
   */
  const methodRepo = {
    find: async (opts?: any) => {
      if (opts?.withDeleted) return methods;
      return methods.filter((m) => m.isActive !== false && !m.deletedAt);
    },
  };
  const accountRepo = {
    // Honors the options argument so the "deleted" case below actually pins
    // `withDeleted: true` on list(): drop it and the soft-deleted account
    // disappears from the fake read, turning the row into 'missing'.
    find: async (opts?: any) => {
      if (opts?.withDeleted) return accounts;
      return accounts.filter((a) => !a.deletedAt);
    },
    findOne: async ({ where, withDeleted }: any) => {
      const a = accounts.find((x) => x.id === where.id);
      if (!a) return null;
      if (a.deletedAt && !withDeleted) return null;
      return a;
    },
  };
  const mappingRepo = {
    find: async () => mappings,
    delete: async (where: any) => { captured.deletes.push(where.paymentMethodId); },
    insert: async (row: any) => { captured.inserts.push(row); return row; },
  };
  /*
   * The transaction manager must serve ALL THREE repositories, because
   * setMappings validates inside the transaction — a manager that only knows
   * the mapping repo would make the validation reads fail.
   *
   * NOTE: `getRepository` hands back the SAME objects as the constructor
   * injection, so this fake does NOT distinguish transaction-manager reads
   * from injected-repo reads and cannot catch a service that bypassed the
   * manager. The real transaction boundary is proven by the e2e rollback case
   * in payment-method-mapping.e2e-spec.ts.
   */
  const dataSource = {
    transaction: async (cb: any) =>
      cb({
        getRepository: (entity: any) => {
          const n = entity?.name ?? '';
          if (n.includes('PaymentMethodAccountMapping')) return mappingRepo;
          if (n.includes('PaymentMethodEntity')) return methodRepo;
          return accountRepo;
        },
      }),
  };
  const svc = new PaymentMethodMappingService(
    mappingRepo as any, methodRepo as any, accountRepo as any, dataSource as any,
  );
  return { svc, captured };
}

const activeAccount = (id: string, code: string, name: string, over: any = {}) =>
  ({ id, code, name, isActive: true, isPostable: true, ...over });
const method = (id: string, code: string, name: string, over: any = {}) =>
  ({ id, code, name, accountingChannel: 'BANK', isActive: true, ...over });

describe('PaymentMethodMappingService.list', () => {
  it('reports an unmapped active method', async () => {
    const { svc } = svcWith({ methods: [method('pm-1', 'MB', 'Maybank')] });
    const rows = await svc.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      paymentMethodId: 'pm-1', accountId: null, status: 'unmapped', invalidReason: null,
    });
  });

  it('reports a valid mapping with its account code and name', async () => {
    const { svc } = svcWith({
      methods: [method('pm-1', 'MB', 'Maybank')],
      accounts: [activeAccount('a-1', '1210', 'Maybank')],
      mappings: [{ paymentMethodId: 'pm-1', accountId: 'a-1' }],
    });
    const rows = await svc.list();
    expect(rows[0]).toMatchObject({
      accountId: 'a-1', accountCode: '1210', accountName: 'Maybank',
      status: 'mapped', invalidReason: null,
    });
  });

  /*
   * The account must remain VISIBLE when invalid. A blank select would hide
   * the very misconfiguration the flag points at, and the row would read as
   * merely unmapped.
   */
  it('keeps an inactive mapped account visible and flags it', async () => {
    const { svc } = svcWith({
      methods: [method('pm-1', 'MB', 'Maybank')],
      accounts: [activeAccount('a-1', '1210', 'Maybank', { isActive: false })],
      mappings: [{ paymentMethodId: 'pm-1', accountId: 'a-1' }],
    });
    const rows = await svc.list();
    expect(rows[0]).toMatchObject({
      accountId: 'a-1', accountCode: '1210', status: 'invalid', invalidReason: 'inactive',
    });
  });

  it('flags a non-postable mapped account', async () => {
    const { svc } = svcWith({
      methods: [method('pm-1', 'MB', 'Maybank')],
      accounts: [activeAccount('a-1', '1210', 'Maybank', { isPostable: false })],
      mappings: [{ paymentMethodId: 'pm-1', accountId: 'a-1' }],
    });
    const rows = await svc.list();
    expect(rows[0]).toMatchObject({ status: 'invalid', invalidReason: 'not postable' });
  });

  /*
   * withDeleted on THIS read only — the opposite of the posting path — so a
   * soft-deleted account still displays instead of vanishing into a row that
   * reads as unmapped.
   */
  it('shows a soft-deleted mapped account with reason "deleted"', async () => {
    const { svc } = svcWith({
      methods: [method('pm-1', 'MB', 'Maybank')],
      accounts: [activeAccount('a-1', '1210', 'Maybank', { deletedAt: new Date() })],
      mappings: [{ paymentMethodId: 'pm-1', accountId: 'a-1' }],
    });
    const rows = await svc.list();
    expect(rows[0]).toMatchObject({
      accountId: 'a-1', accountCode: '1210', status: 'invalid', invalidReason: 'deleted',
    });
  });

  it('falls back to a null code and name when the account is gone entirely', async () => {
    const { svc } = svcWith({
      methods: [method('pm-1', 'MB', 'Maybank')],
      accounts: [],
      mappings: [{ paymentMethodId: 'pm-1', accountId: 'gone' }],
    });
    const rows = await svc.list();
    expect(rows[0]).toMatchObject({
      accountId: 'gone', accountCode: null, accountName: null,
      status: 'invalid', invalidReason: 'missing',
    });
  });

  it('omits inactive payment methods', async () => {
    const { svc } = svcWith({
      methods: [method('pm-1', 'MB', 'Maybank'), method('pm-2', 'OLD', 'Old', { isActive: false })],
    });
    const rows = await svc.list();
    expect(rows.map((r) => r.paymentMethodId)).toEqual(['pm-1']);
  });
});

describe('PaymentMethodMappingService.setMappings', () => {
  const base = {
    methods: [method('pm-1', 'MB', 'Maybank'), method('pm-2', 'CM', 'CIMB')],
    accounts: [activeAccount('a-1', '1210', 'Maybank')],
  };

  it('rejects an unknown payment method id', async () => {
    const { svc } = svcWith(base);
    await expect(svc.setMappings([{ paymentMethodId: 'nope', accountId: 'a-1' }]))
      .rejects.toThrow('Payment method nope not found or inactive');
  });

  it('rejects an inactive payment method id', async () => {
    const { svc } = svcWith({
      ...base,
      methods: [...base.methods, method('pm-3', 'X', 'Gone', { isActive: false })],
    });
    await expect(svc.setMappings([{ paymentMethodId: 'pm-3', accountId: 'a-1' }]))
      .rejects.toThrow('not found or inactive');
  });

  it('rejects a clear that targets a nonexistent method', async () => {
    const { svc } = svcWith(base);
    // "not found", without "or inactive": a clear IS permitted for an
    // inactive method, so the message must not imply otherwise.
    await expect(svc.setMappings([{ paymentMethodId: 'nope', accountId: null }]))
      .rejects.toThrow('Payment method nope not found');
  });

  /*
   * Payment method removal is a SOFT delete, so ON DELETE CASCADE never fires
   * and a mapping outlives its method. list() shows active methods only, so
   * such a row is invisible — and it resumes posting if the method is later
   * restored. Clearing must therefore stay possible for a method that is
   * inactive or soft-deleted, or the operator has a row they can neither see
   * nor remove.
   */
  it('clears the mapping of an inactive payment method', async () => {
    const { svc, captured } = svcWith({
      ...base,
      methods: [...base.methods, method('pm-3', 'X', 'Gone', { isActive: false })],
      mappings: [{ paymentMethodId: 'pm-3', accountId: 'a-1' }],
    });
    await svc.setMappings([{ paymentMethodId: 'pm-3', accountId: null }]);
    expect(captured.deletes).toEqual(['pm-3']);
    expect(captured.inserts).toHaveLength(0);
  });

  it('clears the mapping of a soft-deleted payment method', async () => {
    const { svc, captured } = svcWith({
      ...base,
      methods: [...base.methods, method('pm-4', 'Y', 'Removed', { deletedAt: new Date() })],
      mappings: [{ paymentMethodId: 'pm-4', accountId: 'a-1' }],
    });
    await svc.setMappings([{ paymentMethodId: 'pm-4', accountId: null }]);
    expect(captured.deletes).toEqual(['pm-4']);
    expect(captured.inserts).toHaveLength(0);
  });

  /*
   * The asymmetry: a clear only ever removes a row, so it cannot create the
   * invisible state. ASSIGNING to an inactive method would, so it stays
   * rejected.
   */
  it('still rejects assigning an account to a soft-deleted method', async () => {
    const { svc, captured } = svcWith({
      ...base,
      methods: [...base.methods, method('pm-4', 'Y', 'Removed', { deletedAt: new Date() })],
    });
    await expect(svc.setMappings([{ paymentMethodId: 'pm-4', accountId: 'a-1' }]))
      .rejects.toThrow('not found or inactive');
    expect(captured.inserts).toHaveLength(0);
    expect(captured.deletes).toHaveLength(0);
  });

  it('rejects a missing account', async () => {
    const { svc } = svcWith(base);
    await expect(svc.setMappings([{ paymentMethodId: 'pm-1', accountId: 'gone' }]))
      .rejects.toThrow('not found');
  });

  it('rejects an inactive account, naming method and account', async () => {
    const { svc } = svcWith({
      ...base, accounts: [activeAccount('a-1', '1210', 'Maybank', { isActive: false })],
    });
    await expect(svc.setMappings([{ paymentMethodId: 'pm-1', accountId: 'a-1' }]))
      .rejects.toThrow("Payment method 'Maybank' is mapped to account '1210 Maybank', which is inactive");
  });

  it('rejects a non-postable account', async () => {
    const { svc } = svcWith({
      ...base, accounts: [activeAccount('a-1', '1210', 'Maybank', { isPostable: false })],
    });
    await expect(svc.setMappings([{ paymentMethodId: 'pm-1', accountId: 'a-1' }]))
      .rejects.toThrow('is not postable');
  });

  it('rejects a soft-deleted account', async () => {
    const { svc } = svcWith({
      ...base, accounts: [activeAccount('a-1', '1210', 'Maybank', { deletedAt: new Date() })],
    });
    await expect(svc.setMappings([{ paymentMethodId: 'pm-1', accountId: 'a-1' }]))
      .rejects.toThrow();
  });

  /*
   * A HARD delete. A soft delete would leave the row in place, and the unique
   * index on paymentMethodId ignores deletedAt — so remapping the same method
   * would fail with a unique violation and nothing on screen to explain it.
   */
  it('clears a mapping with a hard delete', async () => {
    const { svc, captured } = svcWith(base);
    await svc.setMappings([{ paymentMethodId: 'pm-1', accountId: null }]);
    expect(captured.deletes).toEqual(['pm-1']);
    expect(captured.inserts).toHaveLength(0);
  });

  it('writes a mapping for a valid pair', async () => {
    const { svc, captured } = svcWith(base);
    await svc.setMappings([{ paymentMethodId: 'pm-1', accountId: 'a-1' }]);
    expect(captured.inserts).toHaveLength(1);
    expect(captured.inserts[0]).toMatchObject({ paymentMethodId: 'pm-1', accountId: 'a-1' });
  });

  /*
   * "Untouched" means pm-2 is never written, NOT that nothing is deleted:
   * every write is delete-then-insert, so the submitted pm-1 is deleted first.
   * Assert on WHICH ids were touched, never on an empty deletes array.
   */
  it('leaves omitted methods untouched', async () => {
    const { svc, captured } = svcWith(base);
    await svc.setMappings([{ paymentMethodId: 'pm-1', accountId: 'a-1' }]);
    expect(captured.deletes).toEqual(['pm-1']);
    expect(captured.inserts.map((u: any) => u.paymentMethodId)).toEqual(['pm-1']);
    expect(captured.deletes).not.toContain('pm-2');
    expect(captured.inserts.map((u: any) => u.paymentMethodId)).not.toContain('pm-2');
  });

  it('validates every item before writing any', async () => {
    const { svc, captured } = svcWith(base);
    await expect(svc.setMappings([
      { paymentMethodId: 'pm-1', accountId: 'a-1' },
      { paymentMethodId: 'pm-2', accountId: 'gone' },
    ])).rejects.toThrow();
    expect(captured.inserts).toHaveLength(0);
    expect(captured.deletes).toHaveLength(0);
  });
});
