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
  conflictingIds?: string[];
  submittedIds?: string[];
  existingLines?: string[];
  settlement?: Record<string, any>;
  onLock?: () => void;
  onStatusRead?: () => void;
  lines?: Array<{ salesOrderPaymentId: string; amount: string }>;
  livePayments?: Array<{ id: string; salesOrderId?: string; amount: string }>;
  timezone?: string;
}

function validDto() {
  return {
    providerPaymentMethodId: 'pm-1',
    bankAccountId: 'bank-1',
    settlementDate: '2026-09-20',
    providerReference: 'PRV-1',
    settlementAmount: '98.00',
    paymentIds: ['pay-A'],
  };
}

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
      assertEligible: jest.fn(async (ids: string[]) =>
        ids.map((id) => ({ id, salesOrderId: 'so-1', amount: '98.0000' })),
      ),
    };
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
        if (opts.saveError) throw opts.saveError;
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
    const coaRepo = {
      findOne: jest.fn(async () => ({
        id: 'bank-1',
        code: '1200',
        name: 'Bank',
        isActive: true,
        isPostable: true,
      })),
    };
    const manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === ProviderSettlement) return settlementRepo;
        if (entity === ProviderSettlementLine) return lineRepo;
        if (entity === ChartOfAccount) return coaRepo;
        return {};
      }),
      query: jest.fn(async () => undefined),
    };
    (dataSource.transaction as any).mockImplementation(async (cb: any) =>
      cb(manager),
    );

    mappingService.list.mockResolvedValue([
      { paymentMethodId: 'pm-1', status: opts.mappingStatus ?? 'mapped' },
      { paymentMethodId: 'pm-2', status: opts.mappingStatus ?? 'mapped' },
    ]);

    settingsService.getRegionalSettings.mockResolvedValue({ timezone: opts.timezone ?? 'UTC' });

    // Live revalidation rows: by default mirror the stored line snapshots, so
    // the snapshot check passes and the amount-reconciliation check is what a
    // test exercises. `livePayments` overrides them to simulate drift.
    const liveRows =
      opts.livePayments ??
      (opts.lines
        ? opts.lines.map((l) => ({
            id: l.salesOrderPaymentId,
            salesOrderId: 'so-1',
            amount: l.amount,
          }))
        : null);
    if (liveRows) {
      eligibilityService.assertEligible.mockImplementation(async (ids: string[]) =>
        liveRows.filter((p) => ids.includes(p.id)),
      );
    }

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
      service.create({ ...validDto(), paymentIds: [] } as any, 'u1', 'tester'),
    ).rejects.toThrow(/at least one payment/);
  });

  it('rejects a payment method that is not status "mapped"', async () => {
    const { service } = makeService({ mappingStatus: 'invalid' });
    await expect(service.create(validDto() as any, 'u1', 'tester')).rejects.toThrow(
      /not mapped to a valid account/,
    );
  });

  it('names ONLY the actually-conflicting ids in a 409, not every submitted id', async () => {
    // The form is promised it can drop the unavailable rows and keep the rest.
    // Reporting all submitted ids would force it to clear the whole selection.
    const { service } = makeService({
      saveError: { code: '23505' },
      conflictingIds: ['pay-B'],           // only B is claimed elsewhere
      submittedIds: ['pay-A', 'pay-B', 'pay-C'],
    });
    const err = await service
      .create({ ...validDto(), paymentIds: ['pay-A', 'pay-B', 'pay-C'] } as any, 'u1', 'tester')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    // Nested under `message` — a sibling field would be stripped by the filter.
    const body = err.getResponse() as any;
    expect(body.message.unavailablePaymentIds).toEqual(['pay-B']);
    expect(body.message.text).toMatch(/claimed by another settlement/);
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
    await (service as any)[method]('ps-1', { paymentIds: ['pay-1'] } as any, 'u1', 'tester').catch(() => {});
    expect(calls[0]).toBe('lock');
  });

  it('replaces the selection rather than merging it', async () => {
    const { service, lineRepo } = makeService({ existingLines: ['pay-A', 'pay-B'] });
    await service.update('ps-1', { paymentIds: ['pay-B', 'pay-C'] } as any, 'u1', 'tester');
    expect(lineRepo.delete).toHaveBeenCalledWith({ settlementId: 'ps-1' });
    const written = lineRepo.save.mock.calls[0][0].map((l: any) => l.salesOrderPaymentId);
    expect(written.sort()).toEqual(['pay-B', 'pay-C']);
  });

  it('allows an ordinary edit on a draft whose provider mapping went invalid', async () => {
    // Same principle as post(): only a provider CHANGE re-checks the mapping.
    // Blocking a reference-text fix because the mapping later broke would strand
    // the draft with no way forward but discarding it.
    const { service, mappingService } = makeService({
      settlement: { status: 'DRAFT', providerPaymentMethodId: 'pm-1' },
      mappingStatus: 'invalid',
    });
    await expect(
      service.update('ps-1', { paymentIds: ['pay-1'], providerReference: 'fixed' } as any, 'u1', 'tester'),
    ).resolves.toBeDefined();
    expect(mappingService.list).not.toHaveBeenCalled();
  });

  it('rejects an update that CHANGES the provider to an unmapped method', async () => {
    const { service } = makeService({
      settlement: { status: 'DRAFT', providerPaymentMethodId: 'pm-1' },
      mappingStatus: 'unmapped',
    });
    await expect(
      service.update('ps-1', { paymentIds: ['pay-1'], providerPaymentMethodId: 'pm-2' } as any, 'u1', 'tester'),
    ).rejects.toThrow(/not mapped to a valid account/);
  });

  it('checks a provider-changing update through the TRANSACTION manager, not a second connection', async () => {
    // Passing no manager makes list() read through its injected repositories
    // on the default connection while the update transaction holds one (#1134).
    const { service, mappingService, manager } = makeService({
      settlement: { status: 'DRAFT', providerPaymentMethodId: 'pm-1' },
      mappingStatus: 'mapped',
    });
    await service.update(
      'ps-1',
      { paymentIds: ['pay-1'], providerPaymentMethodId: 'pm-2' } as any,
      'u1',
      'tester',
    );
    expect(mappingService.list).toHaveBeenCalledWith(manager);
  });

  it('HARD-deletes removed lines so the claim is actually released', async () => {
    const { service, lineRepo } = makeService({ existingLines: ['pay-A'] });
    await service.update('ps-1', { paymentIds: ['pay-B'] } as any, 'u1', 'tester');

    // softDelete/softRemove would set deletedAt and leave the claim LIVE,
    // because the partial unique index keys on releasedAt. A line-count
    // assertion passes either way — assert the method actually called.
    expect(lineRepo.delete).toHaveBeenCalled();
    expect(lineRepo.softDelete).not.toHaveBeenCalled();
    expect(lineRepo.softRemove).not.toHaveBeenCalled();
  });

  it('rejects a settlement whose amount does not equal the selected total', async () => {
    const { service } = makeService({
      settlement: { status: 'DRAFT', settlementAmount: '98.0000' },
      lines: [{ salesOrderPaymentId: 'pay-1', amount: '97.0000' }],
    });
    await expect(service.post('ps-1', 'u1', 'tester')).rejects.toThrow(/does not reconcile/);
  });

  it('does not post a journal entry when the amounts disagree', async () => {
    const { service, postingPort } = makeService({
      settlement: { status: 'DRAFT', settlementAmount: '98.0000' },
      lines: [{ salesOrderPaymentId: 'pay-1', amount: '97.0000' }],
    });
    await service.post('ps-1', 'u1', 'tester').catch(() => {});
    // Rejected BEFORE any payment or journal state change.
    expect(postingPort.postProviderSettlement).not.toHaveBeenCalled();
  });

  it('rejects when a line snapshot no longer matches its live payment row', async () => {
    const { service, postingPort } = makeService({
      settlement: { status: 'DRAFT', settlementAmount: '98.0000' },
      lines: [{ salesOrderPaymentId: 'pay-1', amount: '98.0000' }],
      livePayments: [{ id: 'pay-1', amount: '95.0000', salesOrderId: 'so-1' }],
    });
    await expect(service.post('ps-1', 'u1', 'tester')).rejects.toThrow(
      /changed since this draft was saved \(recorded 98.0000, now 95.0000\)/,
    );
    expect(postingPort.postProviderSettlement).not.toHaveBeenCalled();
  });

  it('reconciles a batch mixing a payment and a refund', async () => {
    const { service, postingPort } = makeService({
      settlement: { status: 'DRAFT', settlementAmount: '48.0000' },
      lines: [
        { salesOrderPaymentId: 'pay-1', amount: '98.0000' },
        { salesOrderPaymentId: 'pay-2', amount: '-50.0000' },
      ],
    });
    await service.post('ps-1', 'u1', 'tester');
    expect(postingPort.postProviderSettlement).toHaveBeenCalled();
  });

  it('rejects posting an already-posted settlement', async () => {
    const { service } = makeService({ settlement: { status: 'POSTED' } });
    await expect(service.post('ps-1', 'u1', 'tester')).rejects.toThrow(/Only a draft/);
  });

  it('posts a draft whose payment method became invalid after saving', async () => {
    // Posting reads journal history, NOT the mapping — so a mapping that goes
    // invalid after the draft is saved must not block it. Without this positive
    // test the requirement is unobservable.
    const { service, postingPort, mappingService } = makeService({
      settlement: { status: 'DRAFT', settlementAmount: '98.0000' },
      lines: [{ salesOrderPaymentId: 'pay-1', amount: '98.0000' }],
      mappingStatus: 'invalid',
    });
    await expect(service.post('ps-1', 'u1', 'tester')).resolves.toBeDefined();
    expect(postingPort.postProviderSettlement).toHaveBeenCalled();
    expect(mappingService.list).not.toHaveBeenCalled();
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
