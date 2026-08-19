import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ACCOUNTING_POSTING_PORT } from '../../../../common/accounting-posting/accounting-posting.port';
import { OwnerEquityService } from '../owner-equity.service';
import { OwnerEquitySettlementService } from '../owner-equity-settlement.service';
import {
  OwnerEquityDocument,
  OwnerEquityDocumentStatus,
  OwnerEquitySettlementStatus,
  OwnerEquityType,
} from '../../entities/owner-equity-document.entity';
import { OwnerEquitySettlement } from '../../entities/owner-equity-settlement.entity';
import { PaymentMethodEntity } from '../../../../database/entities/payment-method.entity';
import { AuditLogService } from '../../../audit-logs/services';
import { SettingsService } from '../../../settings/settings.service';

describe('OwnerEquity lifecycle', () => {
  let svc: OwnerEquityService;
  let settle: OwnerEquitySettlementService;
  let dataSource: jest.Mocked<DataSource>;
  let postingMock: any;
  let auditLogService: jest.Mocked<AuditLogService>;

  let currentDoc: any;
  let savedRows: any[];
  let txDocRepo: any;
  let txSettleRepo: any;
  let txPmRepo: any;
  let txManager: any;

  const draftRef = 'EQ-26-001';
  const completedRef = 'EQ-26-003';
  const partialRef = 'EQ-26-004';
  const cancelledRef = 'EQ-26-005';
  const stockRef = 'EQ-26-006';
  const ref = 'EQ-26-007';
  const injectionRef = 'EQ-26-008';
  const drawingRef = 'EQ-26-009';

  const oneLine = {
    settlements: [
      { paymentMethodId: 'pm-1', settlementDate: '2026-08-16', amount: '100.0000' },
    ],
  };
  const oneRefund = {
    refunds: [
      { paymentMethodId: 'pm-1', refundDate: '2026-08-16', amount: '100.0000' },
    ],
  };

  const cashMethod = () => ({
    id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true,
    useForPurchases: true, accountingChannel: 'CASH',
  });
  const bankMethod = () => ({
    id: 'pm-2', code: 'BANK', name: 'Bank Transfer', isActive: true,
    useForPurchases: true, accountingChannel: 'BANK',
  });
  const salesOnlyMethod = () => ({
    id: 'pm-3', code: 'TNG', name: 'TNG', isActive: true,
    useForPurchases: false, accountingChannel: 'CASH',
  });
  const retiredMethod = () => ({
    id: 'pm-9', code: 'OLD', name: 'Retired', isActive: false,
    useForPurchases: true, accountingChannel: 'CASH',
  });

  beforeEach(async () => {
    postingMock = {
      postOwnerCapitalInjection: jest.fn().mockResolvedValue({ journalEntryId: 'je-1' }),
      postOwnerCapitalInjectionRefund: jest.fn().mockResolvedValue({ journalEntryId: 'je-2' }),
      postOwnerCashDrawing: jest.fn().mockResolvedValue({ journalEntryId: 'je-3' }),
      postOwnerCashDrawingRefund: jest.fn().mockResolvedValue({ journalEntryId: 'je-4' }),
    };
    dataSource = { transaction: jest.fn() } as any;
    auditLogService = { log: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerEquityService,
        OwnerEquitySettlementService,
        { provide: getRepositoryToken(OwnerEquityDocument), useValue: { findOne: jest.fn() } },
        { provide: SettingsService, useValue: { generateDocumentNumber: jest.fn() } },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
        { provide: ACCOUNTING_POSTING_PORT, useValue: postingMock },
      ],
    }).compile();

    svc = module.get(OwnerEquityService);
    settle = module.get(OwnerEquitySettlementService);

    savedRows = [];
    txDocRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (x: any) => {
        currentDoc = { ...x };
        return currentDoc;
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    txSettleRepo = {
      create: jest.fn((x: any) => ({ ...x })),
      save: jest.fn(async (x: any) => {
        const row = { ...x, id: `stl-${savedRows.length + 1}` };
        savedRows.push(row);
        return row;
      }),
      find: jest.fn(async (opts: any) => {
        if (opts?.where?.sourceSettlementId !== undefined) {
          return savedRows.filter((r) => r.sourceSettlementId === opts.where.sourceSettlementId);
        }
        return savedRows;
      }),
      findOne: jest.fn(async (opts: any) => {
        return savedRows.find((r) => r.id === opts?.where?.id) ?? null;
      }),
    };
    const pmMap: Record<string, any> = {
      'pm-1': cashMethod(), 'pm-2': bankMethod(),
      'pm-3': salesOnlyMethod(), 'pm-9': retiredMethod(),
    };
    txPmRepo = {
      findOne: jest.fn().mockImplementation(async (opts: any) => {
        const method = pmMap[opts.where.id];
        if (!method) return null;
        if (opts.where.isActive !== undefined && method.isActive !== opts.where.isActive) return null;
        if (opts.where.useForPurchases !== undefined && method.useForPurchases !== opts.where.useForPurchases) return null;
        return method;
      }),
    };
    txManager = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === OwnerEquityDocument) return txDocRepo;
        if (entity === OwnerEquitySettlement) return txSettleRepo;
        if (entity === PaymentMethodEntity) return txPmRepo;
        return {};
      }),
    };
    (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(txManager));

    setDoc();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function setDoc(overrides: Record<string, any> = {}) {
    currentDoc = {
      id: 'doc-1',
      referenceNumber: draftRef,
      equityDate: '2026-08-01',
      description: 'Owner equity',
      type: OwnerEquityType.CAPITAL_INJECTION,
      documentStatus: OwnerEquityDocumentStatus.DRAFT,
      settlementStatus: OwnerEquitySettlementStatus.UNSETTLED,
      totalAmount: '1000.0000',
      settledAmount: '0.0000',
      balance: '1000.0000',
      completedAt: null,
      completedBy: null,
      ...overrides,
    };
    txDocRepo.findOne.mockResolvedValue(currentDoc);
    return currentDoc;
  }

  describe('monetary lifecycle guards', () => {
    it('promotes to COMPLETED and stamps metadata when fully settled', async () => {
      setDoc({
        referenceNumber: ref,
        totalAmount: '100.0000',
        balance: '100.0000',
      });
      await settle.settle(ref, oneLine, 'u1', 'alice');

      const patch = txDocRepo.update.mock.calls.at(-1)[1];
      expect(patch.settlementStatus).toBe('SETTLED');
      expect(patch.documentStatus).toBe('COMPLETED');
      expect(patch.completedBy).toBe('alice');
      expect(patch.completedAt).toBeInstanceOf(Date);
    });

    it('stays DRAFT with no metadata on a partial settlement', async () => {
      setDoc({ referenceNumber: ref, totalAmount: '1000.0000' });
      await settle.settle(ref, oneLine, 'u1', 'alice');

      const patch = txDocRepo.update.mock.calls.at(-1)[1];
      expect(patch.settlementStatus).toBe('PARTIAL');
      expect(patch.documentStatus).toBe('DRAFT');
      expect(patch.completedAt).toBeNull();
      expect(patch.completedBy).toBeNull();
    });

    it('completes without posting a settlement-completion journal entry', async () => {
      // Completion itself posts nothing; the money was already journaled by
      // the settle posting, which fires exactly once for the one line.
      setDoc({
        referenceNumber: ref,
        totalAmount: '100.0000',
        balance: '100.0000',
      });
      await settle.settle(ref, oneLine, 'u1', 'alice');
      expect(postingMock.postOwnerCapitalInjection).toHaveBeenCalledTimes(1);
    });

    it('demotes COMPLETED to DRAFT and clears metadata on a full refund', async () => {
      setDoc({
        referenceNumber: ref,
        totalAmount: '100.0000',
        balance: '100.0000',
      });
      await settle.settle(ref, oneLine, 'u1', 'alice');
      setDoc({
        referenceNumber: ref,
        totalAmount: '100.0000',
        settledAmount: '100.0000',
        balance: '0.0000',
        documentStatus: OwnerEquityDocumentStatus.COMPLETED,
        settlementStatus: OwnerEquitySettlementStatus.SETTLED,
        completedAt: new Date('2026-08-10'),
        completedBy: 'alice',
      });

      await settle.refund(ref, oneRefund, 'u1', 'alice');

      const patch = txDocRepo.update.mock.calls.at(-1)[1];
      expect(patch.settlementStatus).toBe('UNSETTLED');
      expect(patch.documentStatus).toBe('DRAFT');
      expect(patch.completedAt).toBeNull();
      expect(patch.completedBy).toBeNull();
    });

    it('demotes COMPLETED to DRAFT and clears metadata on a partial refund', async () => {
      setDoc({
        referenceNumber: ref,
        totalAmount: '100.0000',
        balance: '100.0000',
      });
      await settle.settle(ref, oneLine, 'u1', 'alice');
      setDoc({
        referenceNumber: ref,
        totalAmount: '100.0000',
        settledAmount: '100.0000',
        balance: '0.0000',
        documentStatus: OwnerEquityDocumentStatus.COMPLETED,
        settlementStatus: OwnerEquitySettlementStatus.SETTLED,
        completedAt: new Date('2026-08-10'),
        completedBy: 'alice',
      });

      await settle.refund(ref, {
        refunds: [
          { paymentMethodId: 'pm-1', refundDate: '2026-08-16', amount: '40.0000' },
        ],
      }, 'u1', 'alice');

      const patch = txDocRepo.update.mock.calls.at(-1)[1];
      expect(patch.settlementStatus).toBe('PARTIAL');
      expect(patch.documentStatus).toBe('DRAFT');
      expect(patch.completedAt).toBeNull();
      expect(patch.completedBy).toBeNull();
    });

    it('preserves the original stamp when re-settling an already-complete document', async () => {
      // Not reachable through settle() (it rejects COMPLETED), but the helper
      // must not rewrite who completed a document if any other path recomputes.
      const original = new Date('2026-08-10T00:00:00.000Z');
      expect(
        OwnerEquityService.stampCompletionMetadata(
          OwnerEquityDocumentStatus.COMPLETED,
          { completedAt: original, completedBy: 'alice' },
          'bob',
        ),
      ).toEqual({ completedAt: original, completedBy: 'alice' });
    });

    it('rejects cancel once any settlement exists', async () => {
      setDoc({
        referenceNumber: partialRef,
        documentStatus: OwnerEquityDocumentStatus.DRAFT,
        settlementStatus: OwnerEquitySettlementStatus.PARTIAL,
        settledAmount: '400.0000',
        balance: '600.0000',
      });
      await expect(svc.cancel(partialRef)).rejects.toThrow('Refund all settlements');
    });
    it('uncancels to DRAFT', async () => {
      setDoc({
        referenceNumber: cancelledRef,
        documentStatus: OwnerEquityDocumentStatus.CANCELLED,
        settlementStatus: OwnerEquitySettlementStatus.UNSETTLED,
        settledAmount: '0.0000',
        balance: '1000.0000',
      });
      expect((await svc.uncancel(cancelledRef)).documentStatus).toBe('DRAFT');
    });
  });

  describe('settlement guards', () => {
    it('rejects settlement on a stock drawing', async () => {
      setDoc({
        referenceNumber: stockRef,
        type: OwnerEquityType.STOCK_DRAWING,
        productId: 'prod-1',
        quantity: '2.0000',
        totalAmount: null,
        settledAmount: null,
        balance: null,
        settlementStatus: null,
      });
      await expect(settle.settle(stockRef, oneLine)).rejects.toThrow('Stock drawings have no settlement');
    });
    it('rejects settlement exceeding the remaining balance', async () => {
      setDoc({ referenceNumber: ref });
      await expect(
        settle.settle(ref, {
          settlements: [
            { paymentMethodId: 'pm-1', settlementDate: '2026-08-16', amount: '99999.0000' },
          ],
        }),
      ).rejects.toThrow('exceeds');
    });
    it('rejects settlement while COMPLETED', async () => {
      setDoc({
        referenceNumber: completedRef,
        documentStatus: OwnerEquityDocumentStatus.COMPLETED,
        settlementStatus: OwnerEquitySettlementStatus.SETTLED,
        settledAmount: '1000.0000',
        balance: '0.0000',
      });
      await expect(settle.settle(completedRef, oneLine)).rejects.toThrow('Completed');
    });
    it('ALLOWS refund while COMPLETED — it is the only reversal (#1094)', async () => {
      setDoc({ referenceNumber: ref, totalAmount: '100.0000', balance: '100.0000' });
      await settle.settle(ref, oneLine, 'u1', 'alice');
      setDoc({
        referenceNumber: completedRef,
        documentStatus: OwnerEquityDocumentStatus.COMPLETED,
        settlementStatus: OwnerEquitySettlementStatus.SETTLED,
        totalAmount: '100.0000',
        settledAmount: '100.0000',
        balance: '0.0000',
        completedAt: new Date('2026-08-10'),
        completedBy: 'alice',
      });
      await expect(settle.refund(completedRef, oneRefund, 'u1', 'alice')).resolves.toBeDefined();
      expect(postingMock.postOwnerCapitalInjectionRefund).toHaveBeenCalled();
    });
    it('requires useForPurchases on a cash drawing method', async () => {
      setDoc({
        referenceNumber: drawingRef,
        type: OwnerEquityType.CASH_DRAWING,
        documentStatus: OwnerEquityDocumentStatus.DRAFT,
        settlementStatus: OwnerEquitySettlementStatus.UNSETTLED,
        settledAmount: '0.0000',
        balance: '10000.0000',
      });
      await expect(
        settle.settle(drawingRef, {
          settlements: [
            { paymentMethodId: 'pm-3', settlementDate: '2026-08-16', amount: '100.0000' },
          ],
        }),
      ).rejects.toThrow('not enabled for purchases');
    });
    it('derives direction from type, ignoring any DTO-supplied direction', async () => {
      setDoc({
        referenceNumber: injectionRef,
        type: OwnerEquityType.CAPITAL_INJECTION,
        documentStatus: OwnerEquityDocumentStatus.DRAFT,
        settlementStatus: OwnerEquitySettlementStatus.UNSETTLED,
        settledAmount: '0.0000',
        balance: '500.0000',
      });
      await settle.settle(injectionRef, {
        settlements: [
          { paymentMethodId: 'pm-1', settlementDate: '2026-08-16', amount: '100.0000', direction: 'PAY' } as any,
        ],
      });
      expect(postingMock.postOwnerCapitalInjection).toHaveBeenCalled();
      expect(postingMock.postOwnerCashDrawing).not.toHaveBeenCalled();
    });
  });

  describe('refund guards (#1096)', () => {
    it('allows refunding more through one method than that method ever settled', async () => {
      // Settle 100 via pm-1, then refund 100 via pm-3 — a method that settled nothing.
      await settle.settle(ref, oneLine, 'u1', 'alice');
      savedRows.length && expect(savedRows[0].paymentMethodId).toBe('pm-1');

      await settle.refund(ref, {
        refunds: [{ paymentMethodId: 'pm-3', refundDate: '2026-08-16', amount: '100.0000' }],
      }, 'u1', 'alice');

      const refundRow = savedRows.find((r) => r.amount === '-100.0000');
      expect(refundRow).toMatchObject({
        paymentMethodId: 'pm-3',
        sourceSettlementId: null,
      });
    });

    it('rejects a refund above net settled', async () => {
      await settle.settle(ref, oneLine, 'u1', 'alice');   // settles 100

      await expect(settle.refund(ref, {
        refunds: [{ paymentMethodId: 'pm-1', refundDate: '2026-08-16', amount: '150.0000' }],
      }, 'u1', 'alice')).rejects.toThrow(/exceeds net settled/);
    });

    it('counts legacy linked refunds and new unlinked refunds alike in the cap', async () => {
      await settle.settle(ref, oneLine, 'u1', 'alice');   // savedRows[0] = +100, id stl-1
      // A legacy refund carrying lineage, as pre-#1096 rows do.
      savedRows.push({
        id: 'stl-legacy', equityDocumentId: currentDoc.id, amount: '-60.0000',
        sourceSettlementId: 'stl-1', paymentMethodId: 'pm-1',
      });

      // Net settled is now 40: 50 must fail, 40 must pass.
      await expect(settle.refund(ref, {
        refunds: [{ paymentMethodId: 'pm-3', refundDate: '2026-08-16', amount: '50.0000' }],
      }, 'u1', 'alice')).rejects.toThrow(/exceeds net settled/);

      await expect(settle.refund(ref, {
        refunds: [{ paymentMethodId: 'pm-3', refundDate: '2026-08-16', amount: '40.0000' }],
      }, 'u1', 'alice')).resolves.toBeDefined();
    });

    it('rejects a nonexistent method', async () => {
      await settle.settle(ref, oneLine, 'u1', 'alice');

      // pm-missing is absent from pmMap; txPmRepo.findOne returns null.
      await expect(settle.refund(ref, {
        refunds: [{ paymentMethodId: 'pm-missing', refundDate: '2026-08-16', amount: '50.0000' }],
      }, 'u1', 'alice')).rejects.toThrow(/not found or inactive/);
    });

    it('rejects an inactive method', async () => {
      await settle.settle(ref, oneLine, 'u1', 'alice');

      // pm-9 exists in pmMap but has isActive:false, so the { id, isActive: true }
      // lookup returns null. Distinct from the missing-method case above: this
      // proves the isActive filter is actually applied, not just id resolution.
      await expect(settle.refund(ref, {
        refunds: [{ paymentMethodId: 'pm-9', refundDate: '2026-08-16', amount: '50.0000' }],
      }, 'u1', 'alice')).rejects.toThrow(/not found or inactive/);
    });

    it('accepts an active method that is not enabled for purchases', async () => {
      // pm-3 (salesOnlyMethod) has useForPurchases:false. The refund lookup must
      // NOT filter on it, so this resolves where the settle path would reject.
      await settle.settle(ref, oneLine, 'u1', 'alice');

      await expect(settle.refund(ref, {
        refunds: [{ paymentMethodId: 'pm-3', refundDate: '2026-08-16', amount: '100.0000' }],
      }, 'u1', 'alice')).resolves.toBeDefined();
    });

    it('posts the refund JE on the submitted method channel, not the settled one', async () => {
      // Settle through pm-1 (CASH), refund through pm-2 (BANK). The channels must
      // differ or this proves nothing: inheriting from the source row would also
      // yield CASH. Asserting BANK is what fails if the old behavior survives.
      await settle.settle(ref, oneLine, 'u1', 'alice');

      await settle.refund(ref, {
        refunds: [{ paymentMethodId: 'pm-2', refundDate: '2026-08-16', amount: '100.0000' }],
      }, 'u1', 'alice');

      expect(postingMock.postOwnerCapitalInjectionRefund).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'BANK', amount: '100.0000' }),
        txManager,
      );
    });
  });
});
