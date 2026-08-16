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
  const readyRef = 'EQ-26-002';
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
      { sourceSettlementId: 'stl-1', refundDate: '2026-08-16', amount: '100.0000' },
    ],
  };

  const cashMethod = () => ({
    id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true,
    useForPurchases: true, accountingChannel: 'CASH',
  });
  const salesOnlyMethod = () => ({
    id: 'pm-3', code: 'TNG', name: 'TNG', isActive: true,
    useForPurchases: false, accountingChannel: 'CASH',
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
    const pmMap: Record<string, any> = { 'pm-1': cashMethod(), 'pm-3': salesOnlyMethod() };
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
    it('rejects complete when not READY', async () => {
      setDoc({ referenceNumber: draftRef, documentStatus: OwnerEquityDocumentStatus.DRAFT });
      await expect(svc.complete(draftRef)).rejects.toThrow('Only fully settled');
    });
    it('completes from READY and stamps metadata', async () => {
      setDoc({
        referenceNumber: readyRef,
        documentStatus: OwnerEquityDocumentStatus.READY,
        settlementStatus: OwnerEquitySettlementStatus.SETTLED,
        settledAmount: '1000.0000',
        balance: '0.0000',
      });
      const doc = await svc.complete(readyRef, 'u1', 'alice');
      expect(doc.documentStatus).toBe('COMPLETED');
      expect(doc.completedBy).toBe('alice');
      expect(doc.completedAt).toBeInstanceOf(Date);
    });
    it('completes without posting any journal entry', async () => {
      setDoc({
        referenceNumber: readyRef,
        documentStatus: OwnerEquityDocumentStatus.READY,
        settlementStatus: OwnerEquitySettlementStatus.SETTLED,
        settledAmount: '1000.0000',
        balance: '0.0000',
      });
      await svc.complete(readyRef, 'u1', 'alice');
      expect(postingMock.postOwnerCapitalInjection).not.toHaveBeenCalled();
    });
    it('uncompletes to READY, not DRAFT, and clears metadata', async () => {
      setDoc({
        referenceNumber: completedRef,
        documentStatus: OwnerEquityDocumentStatus.COMPLETED,
        settlementStatus: OwnerEquitySettlementStatus.SETTLED,
        settledAmount: '1000.0000',
        balance: '0.0000',
        completedAt: new Date('2026-08-10'),
        completedBy: 'alice',
      });
      const doc = await svc.uncomplete(completedRef);
      expect(doc.documentStatus).toBe('READY');
      expect(doc.completedAt).toBeNull();
      expect(doc.completedBy).toBeNull();
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
    it('rejects refund while COMPLETED, directing to uncomplete first', async () => {
      setDoc({
        referenceNumber: completedRef,
        documentStatus: OwnerEquityDocumentStatus.COMPLETED,
        settlementStatus: OwnerEquitySettlementStatus.SETTLED,
        settledAmount: '1000.0000',
        balance: '0.0000',
      });
      await expect(settle.refund(completedRef, oneRefund)).rejects.toThrow('Uncomplete');
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
});
