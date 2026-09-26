import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ACCOUNTING_POSTING_PORT } from '../../../../common/accounting-posting/accounting-posting.port';
import { ProviderSettlementService } from '../provider-settlement.service';
import {
  ProviderSettlement,
  ProviderSettlementStatus,
} from '../../entities/provider-settlement.entity';
import { ProviderSettlementLine } from '../../entities/provider-settlement-line.entity';
import { SalesOrderPayment } from '../../../../database/entities/sales-order-payment.entity';
import { ProviderSettlementDerivationService } from '../provider-settlement-derivation.service';
import { ProviderSettlementEligibilityService } from '../provider-settlement-eligibility.service';
import { AccountingLookupService } from '../../../accounting/services/accounting-lookup.service';
import { PaymentMethodMappingService } from '../../../accounting/services/payment-method-mapping.service';
import { ChartOfAccount } from '../../../accounting/entities/chart-of-account.entity';
import { AuditLogService } from '../../../audit-logs/services';
import { SettingsService } from '../../../settings/settings.service';

type MappingStatus = 'mapped' | 'unmapped' | 'invalid';

interface MakeServiceOptions {
  mappingStatus?: MappingStatus;
  saveError?: { code: string };
  saveErrorConstraint?: string;
  conflictingIds?: string[];
  submittedIds?: string[];
  existingLines?: string[];
  settlement?: Record<string, any>;
  onLock?: () => void;
  onStatusRead?: () => void;
  lines?: Array<{ salesOrderPaymentId: string; amount: string }>;
  eligible?: Array<{ id: string; salesOrderId: string; paymentMethodId: string; amount: string }>;
  linePayments?: Array<{ id: string; salesOrderId: string; paymentMethodId: string; amount: string }>;
  labels?: { methods?: Record<string, string>; orders?: Record<string, string> };
  queryError?: { code: string };
  timezone?: string;
  accounts?: Record<string, any>;
}

function validDto() {
  return {
    bankAccountId: 'bank-1', settlementDate: '2026-09-20', providerReference: 'PRV-1',
    settlementAmount: '98.00',
    rows: [{ salesOrderId: 'so-1', paymentMethodId: 'pm-1', expectedNetAmount: '98.00' }],
  };
}

const r = (salesOrderId: string, paymentMethodId: string, expectedNetAmount: string) =>
  ({ salesOrderId, paymentMethodId, expectedNetAmount });
const line = (salesOrderPaymentId: string, amount: string) => ({ salesOrderPaymentId, amount });
const pay = (id: string, amount: string, salesOrderId = 'so-1') => ({ id, salesOrderId, paymentMethodId: 'pm-1', amount });

describe('ProviderSettlementService — drafts', () => {
  let service: ProviderSettlementService;
  let dataSource: any;
  let settingsService: any;
  let auditLogService: any;
  let derivationService: any;
  let eligibilityService: any;
  let mappingService: any;
  let postingPort: { postProviderSettlement: any; reverseEntry: any };

  beforeEach(async () => {
    // Mirrors owner-equity-lifecycle.spec.ts: a stub DataSource whose
    // transaction() simply invokes its callback with the stubbed EntityManager.
    dataSource = { transaction: jest.fn() };
    settingsService = {
      generateDocumentNumber: jest.fn(async () => 'PS-26-001'),
      getRegionalSettings: jest.fn(async () => ({ timezone: 'UTC' })),
    };
    auditLogService = { log: jest.fn(async () => undefined) };
    derivationService = {
      deriveClearingAccountId: jest.fn(async () => 'clearing-1'),
    };
    eligibilityService = {
      eligiblePaymentsForOrders: jest.fn(async () => [] as any[]),
    };
    // #1288: the service must never read the mapping. It is still provided, and
    // makeService() reports opts.mappingStatus through it, so re-introducing a
    // mapping check turns the unmapped/invalid tests red instead of passing
    // them vacuously.
    mappingService = { list: jest.fn(async () => []) };
    postingPort = {
      postProviderSettlement: jest.fn(async () => ({ journalEntryId: 'je-ps-1' })),
      reverseEntry: jest.fn(async () => ({ journalEntryId: 'je-rev-1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderSettlementService,
        { provide: DataSource, useValue: dataSource },
        { provide: SettingsService, useValue: settingsService },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: ProviderSettlementDerivationService, useValue: derivationService },
        { provide: ProviderSettlementEligibilityService, useValue: eligibilityService },
        { provide: PaymentMethodMappingService, useValue: mappingService },
        { provide: AccountingLookupService, useValue: {} },
        { provide: ACCOUNTING_POSTING_PORT, useValue: postingPort },
      ],
    }).compile();

    service = module.get(ProviderSettlementService);
  });

  function makeService(opts: MakeServiceOptions = {}) {
    const settlement: any = {
      id: 'ps-1',
      referenceNumber: 'PS-26-001',
      providerPaymentMethodId: 'pm-1',
      clearingAccountId: 'clearing-1',
      bankAccountId: 'bank-1',
      settlementDate: '2026-09-20',
      providerReference: null,
      settlementAmount: '98.0000',
      status: ProviderSettlementStatus.DRAFT,
      ...opts.settlement,
    };

    // A GETTER, not a plain field: the lock-ordering test can only distinguish
    // "lock before status" from "lock after status" by observing the reads.
    if (opts.onStatusRead) {
      const record = opts.onStatusRead;
      let status = settlement.status;
      Object.defineProperty(settlement, 'status', {
        configurable: true,
        enumerable: true,
        get: () => {
          record();
          return status;
        },
        set: (value) => {
          status = value;
        },
      });
    }

    const settlementRepo = {
      create: jest.fn((x: any) => ({ ...x })),
      // Record a lock ONLY for a pessimistic-write find: lockRowForUpdate and
      // an unlocked read both go through repo.findOne, so recording every call
      // would let the ordering test pass even if the service never locked.
      findOne: jest.fn(async (findOptions?: any) => {
        if (findOptions?.lock?.mode === 'pessimistic_write') {
          opts.onLock?.();
        }
        return settlement;
      }),
      save: jest.fn(async (s: any) => ({ ...s, id: s.id ?? 'ps-1' })),
      delete: jest.fn(async () => ({ affected: 1 })),
    };
    const lineRepo = {
      create: jest.fn((x: any) => ({ ...x })),
      save: jest.fn(async (rows: any) => {
        if (opts.saveError) {
          throw {
            code: opts.saveError.code,
            constraint: opts.saveErrorConstraint ?? 'IDX_886b6f559ab60cc5167ca3896b',
          };
        }
        return rows;
      }),
      delete: jest.fn(async () => ({ affected: 1 })),
      softDelete: jest.fn(async () => ({ affected: 1 })),
      softRemove: jest.fn(async () => ({ affected: 1 })),
      update: jest.fn(async () => ({ affected: 1 })),
      find: jest.fn(async (findOptions?: any) => {
        // post() reads the draft's LIVE lines (by settlementId, releasedAt IS
        // NULL); the conflict lookup after a 23505 reads OTHER settlements'
        // claims and keys on salesOrderPaymentId.
        if (findOptions?.where?.releasedAt && findOptions.where.salesOrderPaymentId === undefined) {
          return (opts.lines ?? []).map((l) => ({ ...l, releasedAt: null }));
        }
        return (opts.conflictingIds ?? [])
          .filter((id) => !opts.submittedIds || opts.submittedIds.includes(id))
          .map((id) => ({ salesOrderPaymentId: id }));
      }),
    };
    const accounts: Record<string, any> = {
      'bank-1': { id: 'bank-1', code: '1200', name: 'CIMB', isActive: true, isPostable: true, isProviderClearing: false, isBankAccount: true },
      'clearing-1': { id: 'clearing-1', code: '1240', name: 'Atome', isActive: true, isPostable: true, isProviderClearing: true },
      ...opts.accounts,
    };
    const coaRepo = {
      findOne: jest.fn(async (o?: any) => accounts[o?.where?.id] ?? null),
    };

    const eligibleRows = (opts.eligible ?? [
      { id: 'pay-A', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '98.0000' },
    ]).map((row) => ({ paymentDate: '2026-09-01', referenceNumber: null, ...row }));
    eligibilityService.eligiblePaymentsForOrders.mockImplementation(async (ids: string[]) =>
      eligibleRows.filter((row) => ids.includes(row.salesOrderId)),
    );

    const paymentRows = [...eligibleRows, ...(opts.linePayments ?? [])];
    const paymentRepo = {
      find: jest.fn(async (findOptions?: any) => {
        // where.id is TypeORM's In(...) FindOperator; its `.value` is the id array.
        const ids: string[] | undefined = findOptions?.where?.id?.value;
        if (!ids) throw new Error('post must look payments up by line id');
        return paymentRows.filter((row) => ids.includes(row.id));
      }),
    };

    const manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === ProviderSettlement) return settlementRepo;
        if (entity === ProviderSettlementLine) return lineRepo;
        if (entity === SalesOrderPayment) return paymentRepo;
        if (entity === ChartOfAccount) return coaRepo;
        return {};
      }),
      query: jest.fn(async (sql: string, params?: any[]) => {
        if (opts.queryError && /FOR SHARE/.test(sql)) throw opts.queryError;
        if (/FROM payment_methods/.test(sql)) {
          return (params?.[0] ?? []).map((id: string) => ({
            id, name: opts.labels?.methods?.[id] ?? id,
          }));
        }
        if (/"orderNumber"/.test(sql) && /FROM sales_orders/.test(sql)) {
          return (params?.[0] ?? []).map((id: string) => ({
            id, orderNumber: opts.labels?.orders?.[id] ?? id,
          }));
        }
        return [];
      }),
    };
    (dataSource.transaction as any).mockImplementation(async (cb: any) =>
      cb(manager),
    );

    mappingService.list.mockResolvedValue([
      { paymentMethodId: 'pm-1', status: opts.mappingStatus ?? 'mapped' },
      { paymentMethodId: 'pm-2', status: opts.mappingStatus ?? 'mapped' },
    ]);

    settingsService.getRegionalSettings.mockResolvedValue({ timezone: opts.timezone ?? 'UTC' });

    postingPort.postProviderSettlement.mockClear();
    postingPort.reverseEntry.mockClear();

    return { service, manager, settlementRepo, lineRepo, coaRepo, mappingService, postingPort, auditLogService };
  }

  it('addresses the document number to the Provider Settlements row, through the transaction manager', async () => {
    // The mock returns 'PS-26-001' whatever name it is passed, so asserting on
    // the resulting referenceNumber cannot fail if the service asks for the
    // wrong document type. Only the call arguments can (#1273).
    //
    // 'Provider Settlements' is written literally here, independent of both the
    // mock's configuration and settings.service.ts's default list, so expected
    // and actual do not share a source.
    const { service, manager } = makeService();

    // Await a SUCCESSFUL create, so the happy path is what gets asserted —
    // generation can otherwise be reached on a path that later throws.
    await expect(
      service.create(validDto() as any, 'u1', 'tester'),
    ).resolves.toBeDefined();

    expect(settingsService.generateDocumentNumber).toHaveBeenCalledWith(
      'Provider Settlements',
      expect.anything(),
    );

    // Require the exact transaction manager supplied to create(). Identity
    // needs its own assertion because toHaveBeenCalledWith compares arguments
    // structurally, so a structurally identical object would satisfy it.
    //
    // This guards against substituting another manager; the unit stub does
    // not verify connection reuse or rollback behavior.
    expect(settingsService.generateDocumentNumber.mock.calls[0][1]).toBe(manager);
  });

  it('rejects an empty selection at the service, not only the DTO', async () => {
    // An UPDATE that removes the last remaining line passes DTO validation
    // (the array is non-empty until the service applies it), so the service
    // needs its own check.
    const { service } = makeService();
    await expect(
      service.create({ ...validDto(), rows: [] } as any, 'u1', 'tester'),
    ).rejects.toThrow(/at least one row/);
  });

  // #1288: eligibility follows the journal-derived clearing account, so the
  // method's live mapping never decides whether a settlement can be created.
  it.each(['unmapped', 'invalid'] as const)('creates a settlement for a method whose mapping is %s', async (mappingStatus) => {
    const { service } = makeService({ mappingStatus });
    await expect(service.create(validDto() as any, 'u1', 'tester')).resolves.toBeDefined();
  });

  it('names ONLY the actually-conflicting groups in a 409', async () => {
    const { service } = makeService({
      eligible: [
        { id: 'pay-A', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '50.0000' },
        { id: 'pay-B', salesOrderId: 'so-2', paymentMethodId: 'pm-1', amount: '48.0000' },
      ],
      saveError: { code: '23505' },
      conflictingIds: ['pay-B'],
    });
    const err = await service.create({
      ...validDto(),
      rows: [
        { salesOrderId: 'so-1', paymentMethodId: 'pm-1', expectedNetAmount: '50.00' },
        { salesOrderId: 'so-2', paymentMethodId: 'pm-1', expectedNetAmount: '48.00' },
      ],
    } as any, 'u1', 'tester').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err.getResponse() as any).message.staleRows).toEqual([
      { salesOrderId: 'so-2', paymentMethodId: 'pm-1', currentNetAmount: null },
    ]);
  });

  it('rethrows a unique violation on any OTHER constraint', async () => {
    const { service } = makeService({ saveError: { code: '23505' }, saveErrorConstraint: 'UQ_something_else' });
    const err = await service.create(validDto() as any, 'u1', 'tester').catch((e) => e);
    expect(err).not.toBeInstanceOf(ConflictException);
    expect(err.code).toBe('23505');
  });

  it('rolls back to the savepoint so the conflict lookup can run', async () => {
    // A unique violation marks the whole transaction failed; without the
    // ROLLBACK TO SAVEPOINT the follow-up query errors instead of reporting.
    const { service, manager } = makeService({
      saveError: { code: '23505' }, conflictingIds: ['pay-B'],
    });
    await service.create(validDto() as any, 'u1', 'tester').catch(() => {});
    expect(manager.query).toHaveBeenCalledWith('SAVEPOINT ps_lines_insert');
    expect(manager.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT ps_lines_insert');
  });

  it.each(['update', 'discard'])('%s locks the row before reading status', async (method) => {
    // A lock taken AFTER the status read is exactly as broken as no lock, and
    // in a single-threaded test the two are indistinguishable by outcome — so
    // assert the ORDER.
    const calls: string[] = [];
    const { service } = makeService({
      onLock: () => calls.push('lock'),
      onStatusRead: () => calls.push('status'),
    });
    await (service as any)[method]('ps-1', { rows: [r('so-1', 'pm-1', '98.00')] } as any, 'u1', 'tester').catch(() => {});
    expect(calls[0]).toBe('lock');
  });

  it('replaces the selection with the complete eligible set of each group', async () => {
    const { service, lineRepo } = makeService({
      eligible: [
        { id: 'pay-A', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '100.0000' },
        { id: 'ref-A', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '-30.0000' },
      ],
      settlement: { settlementAmount: '70.0000' },
    });
    await service.update('ps-1', { rows: [{ salesOrderId: 'so-1', paymentMethodId: 'pm-1', expectedNetAmount: '70.00' }] } as any, 'u1', 'tester');
    expect(lineRepo.delete).toHaveBeenCalledWith({ settlementId: 'ps-1' });
    expect(lineRepo.save.mock.calls[0][0].map((l: any) => l.salesOrderPaymentId)).toEqual(['pay-A', 'ref-A']);
  });

  it('allows an ordinary edit on a draft whose provider mapping went invalid', async () => {
    // Same principle as post(): the mapping is never read (#1288). Blocking a
    // reference-text fix because the mapping later broke would strand the draft
    // with no way forward but discarding it.
    const { service, mappingService } = makeService({
      settlement: { status: 'DRAFT', providerPaymentMethodId: 'pm-1' },
      mappingStatus: 'invalid',
    });
    await expect(
      service.update('ps-1', { rows: [r('so-1', 'pm-1', '98.00')], providerReference: 'fixed' } as any, 'u1', 'tester'),
    ).resolves.toBeDefined();
    expect(mappingService.list).not.toHaveBeenCalled();
  });

  it.each(['unmapped', 'invalid'] as const)('accepts an update that CHANGES the provider to a method whose mapping is %s', async (mappingStatus) => {
    const { service, settlementRepo } = makeService({
      settlement: { status: 'DRAFT', providerPaymentMethodId: 'pm-1' },
      mappingStatus,
      eligible: [{ id: 'x', salesOrderId: 'so-2', paymentMethodId: 'pm-2', amount: '98.0000' }],
    });
    await expect(
      service.update('ps-1', { rows: [r('so-2', 'pm-2', '98.00')] } as any, 'u1', 'tester'),
    ).resolves.toBeDefined();
    expect(settlementRepo.save.mock.calls.at(-1)[0].providerPaymentMethodId).toBe('pm-2');
  });

  it('HARD-deletes removed lines so the claim is actually released', async () => {
    const { service, lineRepo } = makeService({ existingLines: ['pay-A'] });
    await service.update('ps-1', { rows: [r('so-1', 'pm-1', '98.00')] } as any, 'u1', 'tester');

    // softDelete/softRemove would set deletedAt and leave the claim LIVE,
    // because the partial unique index keys on releasedAt. A line-count
    // assertion passes either way — assert the method actually called.
    expect(lineRepo.delete).toHaveBeenCalled();
    expect(lineRepo.softDelete).not.toHaveBeenCalled();
    expect(lineRepo.softRemove).not.toHaveBeenCalled();
  });

  it('rejects mixed payment methods, naming each method with its order numbers', async () => {
    const { service } = makeService({
      labels: { methods: { 'pm-1': 'TikTok', 'pm-2': 'Atome' }, orders: { 'so-1': 'SO-26-008', 'so-2': 'SO-26-005' } },
    });
    const err = await service.create({ ...validDto(), rows: [r('so-1', 'pm-1', '98.00'), r('so-2', 'pm-2', '1.00')] } as any).catch((e) => e);
    expect(err.message).toMatch(/A settlement can cover one provider payout/);
    expect(err.message).toMatch(/TikTok: SO-26-008/);
    expect(err.message).toMatch(/Atome: SO-26-005/);
    expect(err.message).not.toMatch(/pm-1|so-1/); // never bare ids when labels exist
  });

  it('infers and stores the payment method from the rows', async () => {
    const { service, settlementRepo } = makeService();
    await service.create(validDto() as any, 'u1', 'tester');
    expect(settlementRepo.create.mock.calls[0][0].providerPaymentMethodId).toBe('pm-1');
  });

  it('409s a group whose net changed, reporting the current net', async () => {
    const { service } = makeService();
    const err = await service.create({ ...validDto(), rows: [r('so-1', 'pm-1', '90.00')], settlementAmount: '90.00' } as any).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err.getResponse() as any).message).toEqual({
      text: 'Some rows changed since they were loaded. Review them and save again.',
      staleRows: [{ salesOrderId: 'so-1', paymentMethodId: 'pm-1', currentNetAmount: '98.0000' }],
    });
  });

  it('409s a group that now nets to zero', async () => {
    const { service } = makeService({ eligible: [
      { id: 'p', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '98.0000' },
      { id: 'q', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '-98.0000' },
    ] });
    const err = await service.create(validDto() as any).catch((e) => e);
    expect((err.getResponse() as any).message.staleRows[0].currentNetAmount).toBe('0.0000');
  });

  it('409s a group with no eligible payment as null', async () => {
    const { service } = makeService({ eligible: [] });
    const err = await service.create(validDto() as any).catch((e) => e);
    expect((err.getResponse() as any).message.staleRows[0].currentNetAmount).toBeNull();
  });

  it('rejects a non-positive total even when every row is current', async () => {
    const { service } = makeService({ eligible: [
      { id: 'p', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '-30.0000' },
    ] });
    await expect(service.create({ ...validDto(), rows: [r('so-1', 'pm-1', '-30.00')], settlementAmount: '0.01' } as any))
      .rejects.toThrow(/greater than zero/);
  });

  it('rejects create when the bank amount differs from the selected total, stating the difference', async () => {
    const { service } = makeService();
    await expect(service.create({ ...validDto(), settlementAmount: '97.99' } as any))
      .rejects.toThrow(/97\.99.*98\.00.*difference -0\.01/);
  });

  it('update without settlementAmount checks the stored amount', async () => {
    const { service } = makeService({ settlement: { settlementAmount: '50.0000' } });
    await expect(service.update('ps-1', { rows: validDto().rows } as any))
      .rejects.toThrow(/does not equal the selected total/);
  });

  it('locks the involved sales orders FOR SHARE, ascending, before recomputing', async () => {
    const order: string[] = [];
    const { service, manager } = makeService({ eligible: [
      { id: 'a', salesOrderId: 'so-2', paymentMethodId: 'pm-1', amount: '1.0000' },
      { id: 'b', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '1.0000' },
    ] });
    (manager.query as any).mockImplementation(async (sql: string, params: any[]) => {
      if (/FOR SHARE/.test(sql)) order.push(`lock:${params[0].join(',')}`);
      return [];
    });
    eligibilityService.eligiblePaymentsForOrders.mockImplementationOnce(async () => {
      order.push('recompute');
      return [
        { id: 'a', salesOrderId: 'so-2', paymentMethodId: 'pm-1', amount: '1.0000' },
        { id: 'b', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '1.0000' },
      ];
    });
    await service.create({ ...validDto(), settlementAmount: '2.00', rows: [r('so-2', 'pm-1', '1.00'), r('so-1', 'pm-1', '1.00')] } as any);
    expect(order).toEqual(['lock:so-1,so-2', 'recompute']);
    const lockSql = (manager.query as any).mock.calls.find((c: any[]) => /FOR SHARE/.test(c[0]))[0];
    expect(lockSql).toMatch(/ORDER BY id FOR SHARE/);
  });

  it('inserts claim lines in ascending payment-id order', async () => {
    const { service, lineRepo } = makeService({ eligible: [
      { id: 'pay-Z', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '50.0000' },
      { id: 'pay-A', salesOrderId: 'so-1', paymentMethodId: 'pm-1', amount: '48.0000' },
    ] });
    await service.create(validDto() as any);
    expect(lineRepo.save.mock.calls[0][0].map((l: any) => l.salesOrderPaymentId)).toEqual(['pay-A', 'pay-Z']);
  });

  it('maps a deadlock to a retry 409', async () => {
    const { service } = makeService({ queryError: { code: '40P01' } });
    const err = await service.create(validDto() as any).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toMatch(/concurrent change\. Try again/);
  });

  it('rejects a settlement whose amount does not equal the selected total', async () => {
    const { service } = makeService({
      lines: [line('pay-A', '98.0000')], eligible: [pay('pay-A', '98.0000')],
      settlement: { settlementAmount: '97.0000' },
    });
    await expect(service.post('ps-1', 'u1', 'tester')).rejects.toThrow(/does not equal the selected total/);
  });

  it('does not post a journal entry when the amounts disagree', async () => {
    const { service, postingPort } = makeService({
      lines: [line('pay-A', '98.0000')], eligible: [pay('pay-A', '98.0000')],
      settlement: { settlementAmount: '97.0000' },
    });
    await service.post('ps-1', 'u1', 'tester').catch(() => {});
    // Rejected BEFORE any payment or journal state change.
    expect(postingPort.postProviderSettlement).not.toHaveBeenCalled();
  });

  it('rejects when a line snapshot no longer matches its live payment row', async () => {
    const { service } = makeService({ lines: [line('pay-A', '98.0000')], eligible: [pay('pay-A', '90.0000')] });
    await expect(service.post('ps-1')).rejects.toThrow(/changed since this draft was saved/);
  });

  it('rejects a membership change at an equal net', async () => {
    const { service, postingPort } = makeService({
      lines: [line('pay-A', '98.0000')],
      eligible: [pay('pay-A', '98.0000'), pay('new-P', '10.0000'), pay('new-R', '-10.0000')],
    });
    await expect(service.post('ps-1')).rejects.toThrow(/changed since this draft was saved; edit and re-save/);
    expect(postingPort.postProviderSettlement).not.toHaveBeenCalled();
  });

  it('rejects when a new refund brings a claimed group to zero', async () => {
    const { service } = makeService({
      lines: [line('pay-A', '98.0000')],
      eligible: [pay('pay-A', '98.0000'), pay('ref', '-98.0000')],
    });
    await expect(service.post('ps-1')).rejects.toThrow(/edit and re-save/);
  });

  it('locks every involved sales order FOR SHARE before revalidating', async () => {
    const { service, manager } = makeService({
      lines: [line('a', '1.0000'), line('b', '97.0000')],
      eligible: [pay('a', '1.0000', 'so-2'), pay('b', '97.0000', 'so-1')],
    });
    await service.post('ps-1');
    const lock = (manager.query as any).mock.calls.find((c: any[]) => /FOR SHARE/.test(c[0]));
    expect(lock[1][0]).toEqual(['so-1', 'so-2']);
  });

  it('reconciles a group mixing a payment and a refund', async () => {
    const { service, postingPort } = makeService({
      lines: [line('pay-A', '98.0000'), line('ref-A', '-50.0000')],
      eligible: [pay('pay-A', '98.0000'), pay('ref-A', '-50.0000')],
      settlement: { settlementAmount: '48.0000' },
    });
    await service.post('ps-1');
    expect(postingPort.postProviderSettlement.mock.calls[0][0].amount).toBe('48.00');
  });

  it('rejects posting an already-posted settlement', async () => {
    const { service } = makeService({ settlement: { status: 'POSTED' } });
    await expect(service.post('ps-1', 'u1', 'tester')).rejects.toThrow(/Only a draft/);
  });

  describe('same-account guard', () => {
    const SAME_ACCOUNT =
      'The selected payments already debit the destination bank account and cannot be settled into that same account.';

    it('rejects create when the derived clearing account IS the bank account, before any write', async () => {
      const { service, settlementRepo, lineRepo, manager } = makeService();
      derivationService.deriveClearingAccountId.mockResolvedValue('bank-1');
      await expect(service.create(validDto() as any, 'u1', 'tester')).rejects.toThrow(SAME_ACCOUNT);
      expect(settingsService.generateDocumentNumber).not.toHaveBeenCalled();
      expect(settlementRepo.save).not.toHaveBeenCalled();
      expect(lineRepo.save).not.toHaveBeenCalled();
      expect((manager.query as any).mock.calls.map((c: any[]) => c[0])).not.toContain('SAVEPOINT ps_lines_insert');
    });

    it('rejects update into a flagged clearing account as destination, before deleting or writing claims', async () => {
      const { service, settlementRepo, lineRepo } = makeService();
      derivationService.deriveClearingAccountId.mockResolvedValue('clearing-1');
      await expect(
        service.update('ps-1', { rows: validDto().rows, bankAccountId: 'clearing-1' } as any, 'u1', 'tester'),
      ).rejects.toThrow('The destination account cannot be a provider clearing account');
      expect(lineRepo.delete).not.toHaveBeenCalled();
      expect(lineRepo.save).not.toHaveBeenCalled();
      expect(settlementRepo.save).not.toHaveBeenCalled();
    });

    it('rejects update of rows whose clearing account is the STORED bank account', async () => {
      // No bankAccountId in the PATCH: the stored one is the destination.
      const { service, lineRepo, settlementRepo } = makeService({ settlement: { bankAccountId: 'bank-1' } });
      derivationService.deriveClearingAccountId.mockResolvedValue('bank-1');
      await expect(service.update('ps-1', { rows: validDto().rows } as any)).rejects.toThrow(SAME_ACCOUNT);
      expect(lineRepo.delete).not.toHaveBeenCalled();
      expect(settlementRepo.save).not.toHaveBeenCalled();
    });

    it('rejects posting an existing draft that settles into its own clearing account', async () => {
      // A draft saved before the guard existed: snapshot and re-derivation agree,
      // so only the same-account check can stop it.
      const { service, postingPort, settlementRepo } = makeService({
        settlement: { clearingAccountId: 'bank-1', bankAccountId: 'bank-1' },
        lines: [line('pay-A', '98.0000')],
        eligible: [pay('pay-A', '98.0000')],
      });
      derivationService.deriveClearingAccountId.mockResolvedValue('bank-1');
      await expect(service.post('ps-1', 'u1', 'tester')).rejects.toThrow(SAME_ACCOUNT);
      expect(postingPort.postProviderSettlement).not.toHaveBeenCalled();
      expect(settlementRepo.save).not.toHaveBeenCalled();
    });

    describe('destination bank flag (#1298)', () => {
      const unflagged = { 'rhb-1': { id: 'rhb-1', code: '1250', name: 'RHB', isActive: true, isPostable: true, isProviderClearing: false, isBankAccount: false } };
      const inactive = { 'old-1': { id: 'old-1', code: '1260', name: 'Old Bank', isActive: false, isPostable: true, isProviderClearing: false, isBankAccount: true } };

      it.each(['create', 'update', 'post'] as const)('%s: rejects an unflagged destination', async (op) => {
        const { service, postingPort } = makeService({
          accounts: unflagged,
          settlement: op === 'post' ? { bankAccountId: 'rhb-1' } : {},
          lines: [line('pay-A', '98.0000')], eligible: [pay('pay-A', '98.0000')],
        });
        const run = op === 'create' ? service.create({ ...validDto(), bankAccountId: 'rhb-1' } as any)
          : op === 'update' ? service.update('ps-1', { rows: validDto().rows, bankAccountId: 'rhb-1' } as any)
          : service.post('ps-1', 'u1', 'tester');
        await expect(run).rejects.toThrow('Account 1250 RHB is not a bank account');
        expect(postingPort.postProviderSettlement).not.toHaveBeenCalled();
      });

      it('rejects a flagged but inactive destination', async () => {
        const { service } = makeService({ accounts: inactive });
        await expect(service.create({ ...validDto(), bankAccountId: 'old-1' } as any))
          .rejects.toThrow('Bank account is inactive');
      });
    });
  });

  describe('provider clearing enforcement (#1285)', () => {
    const NOT_PROVIDER =
      'Account 1200 CIMB is not a provider clearing account. Only payments recorded to a provider clearing account can be settled.';
    const FLAGGED_DEST = 'The destination account cannot be a provider clearing account';
    const other = { 'bank-2': { id: 'bank-2', code: '1210', name: 'Maybank', isActive: true, isPostable: true, isProviderClearing: false, isBankAccount: true } };

    it('create: rejects payments that derive to an unflagged account, writing nothing', async () => {
      const { service, settlementRepo, lineRepo } = makeService({ accounts: other });
      derivationService.deriveClearingAccountId.mockResolvedValue('bank-1');
      await expect(service.create({ ...validDto(), bankAccountId: 'bank-2' } as any)).rejects.toThrow(NOT_PROVIDER);
      expect(settlementRepo.save).not.toHaveBeenCalled();
      expect(lineRepo.save).not.toHaveBeenCalled();
    });

    it('create: an unmapped method is still rejected when its payments derive to an unflagged account', async () => {
      const { service, settlementRepo, lineRepo } = makeService({ accounts: other, mappingStatus: 'unmapped' });
      derivationService.deriveClearingAccountId.mockResolvedValue('bank-1');
      await expect(service.create({ ...validDto(), bankAccountId: 'bank-2' } as any)).rejects.toThrow(NOT_PROVIDER);
      expect(settlementRepo.save).not.toHaveBeenCalled();
      expect(lineRepo.save).not.toHaveBeenCalled();
    });

    it('update: checks on EVERY update, including one that keeps the method', async () => {
      const { service, lineRepo, mappingService } = makeService({ accounts: other, settlement: { bankAccountId: 'bank-2' } });
      derivationService.deriveClearingAccountId.mockResolvedValue('bank-1');
      await expect(service.update('ps-1', { rows: validDto().rows } as any)).rejects.toThrow(NOT_PROVIDER);
      expect(lineRepo.delete).not.toHaveBeenCalled();
      expect(mappingService.list).not.toHaveBeenCalled(); // the mapping is never read (#1288)
    });

    it('post: rejects a draft whose derived account is no longer flagged', async () => {
      const { service, postingPort } = makeService({
        accounts: { 'clearing-1': { id: 'clearing-1', code: '1240', name: 'Atome', isActive: true, isPostable: true, isProviderClearing: false } },
        lines: [line('pay-A', '98.0000')], eligible: [pay('pay-A', '98.0000')],
      });
      derivationService.deriveClearingAccountId.mockResolvedValue('clearing-1');
      await expect(service.post('ps-1', 'u1', 'tester')).rejects.toThrow(/Account 1240 Atome is not a provider clearing account/);
      expect(postingPort.postProviderSettlement).not.toHaveBeenCalled();
    });

    it.each(['create', 'update', 'post'] as const)('%s: rejects a flagged destination account', async (op) => {
      const { service } = makeService({
        accounts: { 'shopee-1': { id: 'shopee-1', code: '1220', name: 'Shopee', isActive: true, isPostable: true, isProviderClearing: true } },
        settlement: op === 'post' ? { bankAccountId: 'shopee-1' } : {},
        lines: [line('pay-A', '98.0000')], eligible: [pay('pay-A', '98.0000')],
      });
      const run = op === 'create' ? service.create({ ...validDto(), bankAccountId: 'shopee-1' } as any)
        : op === 'update' ? service.update('ps-1', { rows: validDto().rows, bankAccountId: 'shopee-1' } as any)
        : service.post('ps-1', 'u1', 'tester');
      await expect(run).rejects.toThrow(FLAGGED_DEST);
    });

    it('reverse ignores the flag', async () => {
      const { service, postingPort } = makeService({
        accounts: { 'clearing-1': { id: 'clearing-1', code: '1240', name: 'Atome', isActive: true, isPostable: true, isProviderClearing: false } },
        settlement: { status: 'POSTED', journalEntryId: 'je-1' },
      });
      const result = await service.reverse('ps-1', 'u1', 'tester');
      expect(result.status).toBe('REVERSED');
      expect(postingPort.reverseEntry).toHaveBeenCalled();
    });
  });

  it('posts a draft whose payment method became invalid after saving', async () => {
    // Posting reads journal history, NOT the mapping — so a mapping that goes
    // invalid after the draft is saved must not block it. Without this positive
    // test the requirement is unobservable.
    const { service, postingPort, mappingService } = makeService({
      settlement: { status: 'DRAFT', settlementAmount: '98.0000' },
      lines: [line('pay-A', '98.0000')],
      eligible: [pay('pay-A', '98.0000')],
      mappingStatus: 'invalid',
    });
    await expect(service.post('ps-1', 'u1', 'tester')).resolves.toBeDefined();
    expect(postingPort.postProviderSettlement).toHaveBeenCalled();
    expect(mappingService.list).not.toHaveBeenCalled();
  });

  it('rejects posting when a claimed payment is no longer eligible', async () => {
    const { service } = makeService({
      lines: [line('pay-A', '98.0000')],
      eligible: [],                                   // e.g. its journal entry was reversed
      linePayments: [pay('pay-A', '98.0000')],
    });
    await expect(service.post('ps-1')).rejects.toThrow(/edit and re-save/);
  });

  it('names the order AND the method in the completeness error', async () => {
    const { service } = makeService({
      lines: [line('pay-A', '98.0000')],
      eligible: [pay('pay-A', '98.0000'), pay('ref', '-8.0000')],
      labels: { methods: { 'pm-1': 'TikTok' }, orders: { 'so-1': 'SO-26-008' } },
    });
    await expect(service.post('ps-1')).rejects.toThrow('Sales order SO-26-008 / TikTok changed since this draft was saved; edit and re-save.');
  });

  it('looks up line payments by the line ids only', async () => {
    const { service, manager } = makeService({ lines: [line('pay-A', '98.0000')], eligible: [pay('pay-A', '98.0000')] });
    await service.post('ps-1');
    const repo = manager.getRepository(SalesOrderPayment) as any;
    expect(repo.find.mock.calls[0][0].where.id.value).toEqual(['pay-A']);
  });

  it('reverses: new entry, status REVERSED, all lines released', async () => {
    const { service, postingPort, lineRepo } = makeService({
      settlement: { status: 'POSTED', journalEntryId: 'je-1' },
    });
    const result = await service.reverse('ps-1', 'u1', 'tester');
    expect(postingPort.reverseEntry).toHaveBeenCalledWith(
      expect.objectContaining({ originalEntryId: 'je-1' }),
      expect.anything(),
    );
    expect(result.status).toBe('REVERSED');
    expect(lineRepo.update).toHaveBeenCalledWith(
      { settlementId: 'ps-1' },
      expect.objectContaining({ releasedAt: expect.any(Date) }),
    );
  });

  it('is idempotent on an already-reversed settlement', async () => {
    const { service, postingPort, auditLogService } = makeService({
      settlement: { status: 'REVERSED', reversalJournalEntryId: 'je-rev' },
    });
    const result = await service.reverse('ps-1', 'u1', 'tester');
    expect(result.reversalJournalEntryId).toBe('je-rev');
    // A retried call must not double-post.
    expect(postingPort.reverseEntry).not.toHaveBeenCalled();
    // ...and must not log the reversal a second time.
    expect(auditLogService.log).not.toHaveBeenCalled();
  });

  it('rejects reversing a draft', async () => {
    const { service } = makeService({ settlement: { status: 'DRAFT' } });
    await expect(service.reverse('ps-1', 'u1', 'tester')).rejects.toThrow(/Only a posted/);
  });

  it('dates the reversal by the business timezone, not UTC', async () => {
    // A NON-DEFAULT zone on purpose. 2026-09-20T17:30:00Z is 2026-09-20 in
    // America/New_York (UTC-4, EDT) but ALREADY 2026-09-21 in the DEFAULT zone
    // (Asia/Kuala_Lumpur, UTC+8). Stubbing the default zone would make an
    // implementation that drops the resolved timezone produce the same date,
    // and the test would pass vacuously (#1134).
    jest.useFakeTimers().setSystemTime(new Date('2026-09-20T17:30:00Z'));
    try {
      const { service, postingPort } = makeService({
        settlement: { status: 'POSTED', journalEntryId: 'je-1', settlementDate: '2026-09-01' },
        timezone: 'America/New_York',
      });
      await service.reverse('ps-1', 'u1', 'tester');
      expect(postingPort.reverseEntry).toHaveBeenCalledWith(
        expect.objectContaining({ entryDate: '2026-09-20' }),
        expect.anything(),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not reuse settlementDate as the reversal entry date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-20T17:30:00Z'));
    try {
      const { service, postingPort } = makeService({
        settlement: { status: 'POSTED', journalEntryId: 'je-1', settlementDate: '2026-09-01' },
        timezone: 'America/New_York',
      });
      await service.reverse('ps-1', 'u1', 'tester');
      const call = postingPort.reverseEntry.mock.calls[0][0];
      expect(call.entryDate).toBe('2026-09-20');
      expect(call.entryDate).not.toBe('2026-09-01');
    } finally {
      jest.useRealTimers();
    }
  });
});
